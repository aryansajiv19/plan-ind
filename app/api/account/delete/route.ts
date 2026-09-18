import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";
import { CONTROL_UNAVAILABLE_MESSAGE, consumeQuota, recordSecurityEvent, reportControlUnavailable } from "@/lib/security/controls";

export const runtime = "nodejs";

const BUCKET = "visit-photos";
// Photos live at `<uid>/<visit id>/<file>`. A failed upload can leave a file
// directly under `<uid>/`, which migration 060's own-files select policy is
// what makes listable at all.
const PAGE = 100;
// Nothing stops a deeper path: the upload policy only constrains the first
// segment. A depth cap or an unpaged list would silently miss files, and the
// user could then never delete their account (the RPC counts what is left by
// owner_id OR path prefix, so it would refuse for ever).
const MAX_DEPTH = 8;

async function listOwnPhotos(supabase: SupabaseClient, prefix: string, depth = 0): Promise<string[]> {
  if (depth >= MAX_DEPTH) throw new Error(`visit-photos nested deeper than ${MAX_DEPTH}`);
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      // A folder comes back with no id; only real objects can be removed.
      if (entry.id) paths.push(path);
      else paths.push(...await listOwnPhotos(supabase, path, depth + 1));
    }
    if (!data || data.length < PAGE) return paths;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 1_024);
  } catch (error) {
    return requestError(error, "The request could not be read.");
  }
  // Typed confirmation: this is the one action in the app nothing can undo.
  if (!body || typeof body !== "object" || (body as Record<string, unknown>).confirm !== "DELETE") {
    return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: { user } }, quota] = await Promise.all([
    supabase.auth.getUser(),
    // Reuses the plan-command quota (20/minute) rather than adding a scope to
    // consume_app_quota: one more definer function to re-create for a button
    // that can only succeed once per account.
    consumeQuota(supabase, "plan-command"),
  ]);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (quota === "unavailable") {
    reportControlUnavailable("account-delete");
    return Response.json({ error: CONTROL_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (quota === "limited") {
    await recordSecurityEvent(supabase, { type: "rate_limit", outcome: "blocked", subject: user.id, requestId: request.headers.get("x-vercel-id"), metadata: { scope: "account-delete" } });
    return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  // Ask the database whether it can actually remove the login BEFORE deleting
  // any photo. The photo delete is the only irreversible step, and everything
  // after it rolls back, so this is the ordering that cannot lose a user's
  // photos for nothing.
  const probe = await supabase.rpc("delete_my_account", { p_probe: true });
  if (probe.error || probe.data?.result !== "ready") {
    console.error("Account delete: probe refused", JSON.stringify({ userId: user.id, code: probe.error?.code, result: probe.data?.result }));
    return Response.json({ error: "Your account could not be deleted. Nothing was deleted." }, { status: 500 });
  }

  // Storage first, with the user's own session, and CONFIRMED BY LISTING: a
  // refused storage delete returns 200 [], so the delete's own result proves
  // nothing. If anything is left the RPC refuses too and no data is deleted.
  try {
    const photos = await listOwnPhotos(supabase, user.id);
    for (let i = 0; i < photos.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 100));
      if (error) throw error;
    }
    const left = await listOwnPhotos(supabase, user.id);
    if (left.length > 0) {
      console.error("Account delete: photos remain", JSON.stringify({ userId: user.id, remaining: left.length }));
      return Response.json({ error: "Your photos could not all be removed, so your account was not deleted. Try again." }, { status: 503 });
    }
  } catch (error) {
    console.error("Account delete: storage failed", JSON.stringify({ userId: user.id, message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Your photos could not all be removed, so your account was not deleted. Try again." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("delete_my_account");
  const result: unknown = data?.result;
  if (error || (result !== "deleted" && result !== "storage_remaining")) {
    console.error("Account delete failed", JSON.stringify({ userId: user.id, code: error?.code, result }));
    return Response.json({ error: "Your account could not be deleted." }, { status: 500 });
  }
  if (result === "storage_remaining") {
    return Response.json({ error: "Your photos could not all be removed, so your account was not deleted. Try again." }, { status: 503 });
  }

  // The account is gone; the cookies for it are not. Clearing them locally is
  // all that is left to do -- signOut's server call would 401 against a user
  // that no longer exists, and a failure here must not read as one.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (signOutError) {
    console.error("Account delete: local sign-out failed", JSON.stringify({ message: signOutError instanceof Error ? signOutError.message : "unknown" }));
  }
  return Response.json({ result: "deleted" }, { status: 200 });
}
