import { ImageResponse } from "next/og";
import { ogFonts } from "../../../_og/card";
import { STORY, STORY_SIZE, StoryFrame, storyPhoto } from "../../../_og/story";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/auth";
import { eventLabel, isPlanId } from "@/lib/share-preview";

// The decided plan as an Instagram story (1080x1920). Members only: every read
// goes through the viewer's own session, so RLS (plan_access) answers exactly
// as the plan page does, and a non-member gets the same 404 as a bad id.
const PRIVATE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const notFound = () => new Response("Not found", { status: 404, headers: PRIVATE });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPlanId(id)) return notFound();
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (user === "unavailable") return new Response("Try again in a moment", { status: 503, headers: PRIVATE });
  if (user === "signed-out") return new Response("Sign in first", { status: 401, headers: PRIVATE });

  const { data: plan } = await supabase.from("plans").select("title, status, event_time, winner_spot_id").eq("id", id).maybeSingle();
  if (!plan || plan.status !== "decided" || !plan.winner_spot_id) return notFound();
  const [{ data: spot }, { data: votes }] = await Promise.all([
    supabase.from("spots").select("name, area, photo_url, photo_attribution").eq("id", plan.winner_spot_id).maybeSingle(),
    supabase.from("votes").select("seat_key").eq("plan_id", id),
  ]);
  if (!spot) return notFound();

  const photo = await storyPhoto(spot.photo_url);
  const voters = new Set((votes ?? []).map((v) => v.seat_key).filter(Boolean)).size;
  const when = eventLabel(plan.event_time);
  const n = spot.name.length;
  const nameSize = n <= 14 ? 150 : n <= 22 ? 124 : n <= 34 ? 100 : 84;

  return new ImageResponse(
    <StoryFrame photo={photo} kicker="Decided" credit={photo ? spot.photo_attribution : null}>
      <div style={{ display: "flex", fontFamily: "Cormorant", fontWeight: 500, fontSize: nameSize, lineHeight: 1, letterSpacing: -2 }}>{spot.name}</div>
      <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: STORY.muted }}>{[spot.area, when].filter(Boolean).join(" · ")}</div>
      <div style={{ display: "flex", fontFamily: "Cormorant", fontStyle: "italic", fontWeight: 600, fontSize: 60, color: STORY.sand }}>
        {voters >= 2 ? `Decided by ${voters} friends` : plan.title}
      </div>
    </StoryFrame>,
    { ...STORY_SIZE, fonts: await ogFonts(), headers: PRIVATE },
  );
}
