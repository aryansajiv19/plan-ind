/**
 * Instagram-story share cards (1080x1920), for the decided plan and Wrapped.
 * Private folder: nothing here is a route. Fonts are the OG cards' (Cormorant
 * + Hanken, from public/fonts); the palette is the night tokens, copied
 * because Satori cannot read CSS variables.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const STORY_SIZE = { width: 1080, height: 1920 };

export const STORY = {
  ground: "#07090d",
  sand: "#ce9963",
  ink: "#efe7dc",
  muted: "#a39d95",
};

const RENDERABLE = /\.(jpe?g|png)$/i; // Satori decodes PNG/JPEG, not WebP (verified)
const OWN_FILE = /^\/venues\/[A-Za-z0-9-]+\.(jpe?g|png|webp)$/i;

/**
 * The venue's own photo as a data URL, or null. Own photos only: a
 * self-hosted file under public/venues, or our Supabase bucket. Never a Google
 * photo (their terms keep those off our server). A self-hosted WebP (the 079
 * set) is read from its JPEG twin beside it (1080 px long edge, <=150 KB-ish);
 * without a twin the card is typographic.
 */
export async function storyPhoto(photoUrl: string | null): Promise<string | null> {
  if (!photoUrl) return null;
  try {
    if (photoUrl.startsWith("/")) {
      if (!OWN_FILE.test(photoUrl)) return null;
      const file = photoUrl.replace(/\.webp$/i, ".jpg");
      const data = await readFile(join(process.cwd(), "public", file));
      return `data:image/${/png$/i.test(file) ? "png" : "jpeg"};base64,${data.toString("base64")}`;
    }
    const url = new URL(photoUrl);
    if (url.origin !== new URL(getSupabaseConfig().url).origin || !RENDERABLE.test(url.pathname)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !/^image\/(jpeg|png)$/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null; // a missing or slow photo costs the photo, never the card
  }
}

function Mark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 88, height: 88, borderRadius: 20, background: STORY.sand, color: STORY.ground, fontFamily: "Hanken", fontWeight: 700, fontSize: 30 }}>
        <span>D/</span><span style={{ fontSize: 26, marginTop: 2 }}>03</span>
      </div>
      <div style={{ display: "flex", fontFamily: "Hanken", fontWeight: 700, fontSize: 36, color: STORY.ink }}>Deal three</div>
    </div>
  );
}

/** Photo (or a sand wash) over the top, the content at the bottom, the mark and a credit in the footer, clear of Instagram's bottom ~250 px (the reply bar). */
export function StoryFrame({ photo, kicker, children, credit }: { photo: string | null; kicker: string; children: ReactNode; credit?: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: STORY.ground, color: STORY.ink, fontFamily: "Hanken", position: "relative" }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
        <img src={photo} alt="" width={1080} height={1200} style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1200, objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1200, display: "flex", backgroundImage: `radial-gradient(circle at 30% 20%, ${STORY.sand}55, ${STORY.ground} 70%)` }} />
      )}
      <div style={{ position: "absolute", top: 600, left: 0, width: 1080, height: 620, display: "flex", backgroundImage: `linear-gradient(to bottom, ${STORY.ground}00, ${STORY.ground})` }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flexGrow: 1, padding: "0 88px", gap: 28, position: "relative" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase", color: STORY.sand }}>{kicker}</div>
        {children}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "56px 88px 250px", position: "relative" }}>
        <div style={{ display: "flex", width: "100%", height: 3, background: STORY.sand }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mark />
          {credit && <div style={{ display: "flex", maxWidth: 520, fontSize: 22, color: STORY.muted, textAlign: "right" }}>Photo: {credit}</div>}
        </div>
      </div>
    </div>
  );
}
