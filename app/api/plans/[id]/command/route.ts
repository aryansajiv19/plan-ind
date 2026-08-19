import { createClient } from "@/lib/supabase/server";
import {
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";
import { recordSecurityEvent } from "@/lib/security/controls";

export const runtime = "nodejs";

const COMMANDS = new Set(["advance", "decide", "patch"]);
const PATCH_FIELDS = new Set(["event_time", "booking_owner", "booked"]);
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
  if (!UUID.test(id) || !/^[0-9a-f]{64}$/.test(hostToken) || !COMMANDS.has(command)
      || Object.keys(patch).some((key) => !PATCH_FIELDS.has(key))) {
    return Response.json({ error: "Invalid plan command." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Plan access required." }, { status: 401 });
  const { data, error } = await supabase.rpc("execute_plan_command", {
    p_plan_id: id,
    p_host_token: hostToken,
    p_command: command,
    p_patch: patch,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : 409;
    console.error("Plan command rejected", JSON.stringify({ planId: id, code: error.code }));
    await recordSecurityEvent(supabase, { type: "plan_command", outcome: "blocked", subject: user.id, metadata: { command, code: error.code } });
    return Response.json({ error: status === 403 ? "Host authorization required." : "That plan change could not be applied." }, { status });
  }
  await recordSecurityEvent(supabase, { type: "plan_command", outcome: "success", subject: user.id, metadata: { command } });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
