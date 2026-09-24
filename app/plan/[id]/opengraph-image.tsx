import { ImageResponse } from "next/og";
import { NIGHT, OG_SIZE, OgFrame, ogFonts } from "../../_og/card";
import { fetchPlanSharePreview } from "@/lib/share-preview-server";
import { shareCopy } from "@/lib/share-preview";

// The card a pasted plan link unfurls as in WhatsApp. Built only from
// plan_share_preview (migration 062); with no preview (bad id, unknown or
// deleted plan, migration unapplied, DB down) it renders the generic plan
// card, so this route always answers 200 image/png and never throws on data.
export const alt = "A Dubai plan to vote on, on Deal three";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const copy = shareCopy(await fetchPlanSharePreview(id));
  const n = copy.title.length;
  const titleSize = n <= 16 ? 116 : n <= 22 ? 100 : n <= 34 ? 84 : 72;

  return new ImageResponse(
    (
      <OgFrame
        kicker={copy.host ?? "A plan on Deal three"}
        footer={copy.closes ?? "Tap to vote. The app calls it."}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Cormorant",
              fontWeight: 500,
              fontSize: titleSize,
              lineHeight: 1.02,
              letterSpacing: -1.5,
              maxWidth: 1040,
            }}
          >
            {copy.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", width: 44, height: 4, background: NIGHT.punch }} />
            <div style={{ display: "flex", fontFamily: "Cormorant", fontStyle: "italic", fontWeight: 600, fontSize: 52 }}>
              {copy.state}
            </div>
          </div>
        </div>
      </OgFrame>
    ),
    {
      ...size,
      fonts: await ogFonts(),
      // Not next/og's year-long immutable default: a plan is renamed, decided
      // or deleted, and a cached card would outlive it.
      headers: { "cache-control": "public, max-age=300", "x-robots-tag": "noindex" },
    },
  );
}
