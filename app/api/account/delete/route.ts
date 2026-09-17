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
// Photos live at `<uid>/<visit id>/<file>`, so one level of recursion covers
// the folder. A failed upload can leave a file directly under `<uid>/`, which
// migration 060's own-files select policy is what makes listable at all.
const DEPTH = 2;

async function listOwnPhotos(supabase: SupabaseClient, prefix: string, depth: number): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    // A folder comes back with no id; only real objects can be removed.
    if (entry.id) paths.push(path);
    else if (depth > 1) paths.push(...await listOwnPhotos(supabase, path, depth - 1));
  }
  return paths;
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

  // Storage first, with the user's own session, and CONFIRMED BY LISTING: a
  // refused storage delete returns 200 [], so the delete's own result proves
  // nothing. If anything is left the RPC refuses too and no data is deleted.
  try {
    const photos = await listOwnPhotos(supabase, user.id, DEPTH);
    for (let i = 0; i < photos.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(photos.slice(i, i + 100));
      if (error) throw error;
    }
    const left = await listOwnPhotos(supabase, user.id, DEPTH);
    if (left.length > 0) {
      console.error("Account delete: photos remain", JSON.stringify({ userId: user.id, remaining: left.length }));
      return Response.json({ error: "Your photos could not be removed. Nothing was deleted." }, { status: 503 });
    }
  } catch (error) {
    console.error("Account delete: storage failed", JSON.stringify({ userId: user.id, message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Your photos could not be removed. Nothing was deleted." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("delete_my_account");
  const result: unknown = data?.result;
  if (error || (result !== "deleted" && result !== "storage_remaining")) {
    console.error("Account delete failed", JSON.stringify({ userId: user.id, code: error?.code, result }));
    return Response.json({ error: "Your account could not be deleted." }, { status: 500 });
  }
  if (result === "storage_remaining") {
    return Response.json({ error: "Your photos could not be removed. Nothing was deleted." }, { status: 503 });
  }

  // The account is gone; the cookies for it are not. Clearing them locally is
  // all that is left to do -- signOut's server call would 401 against a user
  // that no longer exists.
  await supabase.auth.signOut({ scope: "local" });
  return Response.json({ result: "deleted" }, { status: 200 });
}
