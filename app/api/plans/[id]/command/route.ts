import { createClient } from "@/lib/supabase/server";
import {
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";
import { CONTROL_UNAVAILABLE_MESSAGE, consumeQuota, recordSecurityEvent, reportControlUnavailable } from "@/lib/security/controls";

export const runtime = "nodejs";

const COMMANDS = new Set(["advance", "decide", "patch", "delete", "edit"]);
// delete_plan (047) and edit_plan (055) return their refusals instead of
// raising them, so a no-op can never read as a success. Unchanged edit
// (nothing_to_change) is a success: saving an untouched form is not an error.
const RESULT_COMMANDS: Record<string, { rpc: string; status: Record<string, number>; failure: string }> = {
  delete: { rpc: "delete_plan", failure: "That plan could not be deleted.", status: { deleted: 200, not_found: 404, not_host: 403, already_decided: 409 } },
  edit: { rpc: "edit_plan", failure: "That plan could not be edited.", status: { edited: 200, nothing_to_change: 200, not_found: 404, not_host: 403, voting_started: 409, invalid_title: 422, invalid_deadline: 422 } },
};
const PATCH_FIELDS = new Set(["event_time", "booking_owner", "booked"]);
// A full instant with an explicit offset. Date.parse is looser than Postgres
// ("2026" or "UTC+4" parse in JS but fail or shift in timestamptz), so the
// route only forwards what both read the same way.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 8_192);
  } catch (error) {
    return requestError(error, "The command could not be read.");
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Send a valid command." }, { status: 400 });
  const raw = body as Record<string, unknown>;
  const hostToken = typeof raw.hostToken === "string" ? raw.hostToken : "";
  const command = typeof raw.command === "string" ? raw.command : "";
  const patch = raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch) ? raw.patch as Record<string, unknown> : {};
  // edit: optional title and ISO deadline; the RPC owns the real rules.
  const title = raw.title === undefined ? null : raw.title;
  const deadline = raw.deadline === undefined ? null : raw.deadline;
  const badEdit = command === "edit" && (
    (title !== null && (typeof title !== "string" || title.length > 200))
    || (deadline !== null && (typeof deadline !== "string" || !ISO_INSTANT.test(deadline))));
  if (!UUID.test(id) || !/^[0-9a-f]{64}$/.test(hostToken) || !COMMANDS.has(command) || badEdit
      || Object.keys(patch).some((key) => !PATCH_FIELDS.has(key))) {
    return Response.json({ error: "Invalid plan command." }, { status: 400 });
  }
  const supabase = await createClient();
  // Independent I/O, run together -- see app/api/spots/deal/route.ts's
  // identical comment for why this is safe.
  const [{ data: { user } }, quota] = await Promise.all([
    supabase.auth.getUser(),
    consumeQuota(supabase, "plan-command"),
  ]);
  // /api/plans refuses to create a plan for an anonymous user, so no
  // legitimate host command can ever come from one -- and the quota below is
  // keyed on auth.uid(), which an anonymous sign-in can mint fresh at will.
  // Without this, that quota doesn't actually bound a leaked-host-token
  // attacker the way its own comment claims.
  if (!user || user.is_anonymous) return Response.json({ error: "Plan access required." }, { status: 401 });
  // Migration 030 -- was the only app/api/** route with no rate limit at
  // all. The RPC's own row lock serializes concurrent commands per plan but
  // doesn't cap volume; a valid (or leaked) host token could otherwise
  // hammer this unbounded.
  if (quota === "unavailable") {
    reportControlUnavailable("plan-command");
    return Response.json({ error: CONTROL_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (quota === "limited") {
    await recordSecurityEvent(supabase, { type: "rate_limit", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { scope: "plan-command" } });
    return Response.json({ error: "Too many plan changes. Try again in a minute." }, { status: 429 });
  }
  const resultCommand = RESULT_COMMANDS[command];
  if (resultCommand) {
    const args = command === "edit"
      ? { p_plan_id: id, p_host_token: hostToken, p_title: title, p_deadline: deadline }
      : { p_plan_id: id, p_host_token: hostToken };
    const { data, error } = await supabase.rpc(resultCommand.rpc, args);
    const result: unknown = data?.result;
    const status = typeof result === "string" ? resultCommand.status[result] : undefined;
    if (error || !status) {
      console.error("Plan command failed", JSON.stringify({ planId: id, command, code: error?.code, result }));
      return Response.json({ error: resultCommand.failure }, { status: 500 });
    }
    if (status !== 200) {
      await recordSecurityEvent(supabase, { type: "plan_command", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { command, result: result as string } });
    }
    return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await supabase.rpc("execute_plan_command", {
    p_plan_id: id,
    p_host_token: hostToken,
    p_command: command,
    p_patch: patch,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : 409;
    console.error("Plan command rejected", JSON.stringify({ planId: id, code: error.code }));
    await recordSecurityEvent(supabase, { type: "plan_command", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { command, code: error.code } });
    return Response.json({ error: status === 403 ? "Host authorization required." : "That plan change could not be applied." }, { status });
  }
  await recordSecurityEvent(supabase, { type: "plan_command", outcome: "success", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { command } });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
