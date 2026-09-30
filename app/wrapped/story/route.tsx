import { ImageResponse } from "next/og";
import { ogFonts } from "../../_og/card";
import { STORY, STORY_SIZE, StoryFrame } from "../../_og/story";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/auth";
import { getWrappedSummary } from "@/lib/social/wrapped";
import { categoryLabel } from "@/lib/categories";

// Wrapped as an Instagram story: this month's recap (lib/social/wrapped, the
// same read the Profile tab shows), for the signed-in account only. A failed
// read is a 503, never a card of zeros.
const PRIVATE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };

export async function GET() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (user === "unavailable") return new Response("Try again in a moment", { status: 503, headers: PRIVATE });
  if (user === "signed-out") return new Response("Sign in first", { status: 401, headers: PRIVATE });
  const { data: me } = await supabase.from("people").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!me) return new Response("No profile yet", { status: 404, headers: PRIVATE });
  const { data: summary } = await getWrappedSummary(user.id, me.id, supabase);
  if (!summary) return new Response("Try again in a moment", { status: 503, headers: PRIVATE });

  const stats: [string, string][] = [
    [String(summary.activityCount), summary.activityCount === 1 ? "place" : "places"],
    [String(summary.planCount), summary.planCount === 1 ? "plan hosted" : "plans hosted"],
  ];
  const lines = [
    summary.topArea && `Mostly in ${summary.topArea}`,
    summary.topCategory && `Top pick: ${categoryLabel(summary.topCategory)}`,
    summary.bestRatedPlace && `Best rated: ${summary.bestRatedPlace.name}`,
  ].filter((line): line is string => Boolean(line));

  return new ImageResponse(
    <StoryFrame photo={null} kicker={`Wrapped · ${summary.periodLabel}`}>
      <div style={{ display: "flex", gap: 72 }}>
        {stats.map(([value, label]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 700, fontSize: 160, lineHeight: 1.1 }}>{value}</div>
            <div style={{ display: "flex", fontSize: 36, color: STORY.muted }}>{label}</div>
          </div>
        ))}
      </div>
      {lines.map((line) => (
        <div key={line} style={{ display: "flex", fontFamily: "Jakarta", fontWeight: 700, fontSize: 56, color: STORY.sand }}>{line}</div>
      ))}
    </StoryFrame>,
    { ...STORY_SIZE, fonts: await ogFonts(), headers: PRIVATE },
  );
}
