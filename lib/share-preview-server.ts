import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { log, serializeError } from "./observability/log";
import { getSupabaseConfig } from "./supabase/config";
import { isPlanId, parseSharePreview } from "./share-preview";
import type { PlanSharePreview } from "./types";

// A crawler waits a few seconds at most; a slow DB must cost the preview,
// never the page.
const TIMEOUT_MS = 2500;

/**
 * The share preview for one plan, or null. NEVER throws: a malformed id, a
 * missing env, an unapplied migration 062 (PGRST202), a timeout or any other
 * error all read as "no preview", and the caller renders the generic card.
 *
 * Keyless on purpose (anon role, no cookies): a link crawler has no session,
 * and reading the viewer's cookies here would make the preview differ by who
 * asked. plan_share_preview is the only thing this client calls.
 */
export const fetchPlanSharePreview = cache(async (id: string): Promise<PlanSharePreview | null> => {
  if (!isPlanId(id)) return null; // bad id: generic metadata, no DB call
  try {
    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase
      .rpc("plan_share_preview", { p_plan_id: id })
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) {
      log("warn", "share_preview.unavailable", { code: error.code ?? null });
      return null;
    }
    return parseSharePreview(data);
  } catch (error) {
    log("warn", "share_preview.failed", { error: serializeError(error) });
    return null;
  }
});
