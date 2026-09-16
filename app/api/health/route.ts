import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Readiness for uptime monitors and load balancers: 200 only when the app can
// actually read the database through PostgREST, 503 otherwise. One indexed
// read of one curated spot id, bounded by a timeout so a hung database fails
// the check instead of hanging it. The response carries no error detail;
// the reason goes to the server log.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("spots")
      .select("id")
      .eq("source", "curated")
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    // An empty catalogue is a broken deploy, not a healthy one.
    if (error || !data?.length) {
      console.error("Health check failed", JSON.stringify({ code: error ? error.code || error.message : "no_curated_spots" }));
      return Response.json({ status: "unavailable" }, { status: 503, headers });
    }
    return Response.json({ status: "ok" }, { headers });
  } catch (error) {
    console.error("Health check failed", JSON.stringify({ code: error instanceof Error ? error.name : "unknown" }));
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
