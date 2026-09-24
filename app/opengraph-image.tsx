import { ImageResponse } from "next/og";
import { NIGHT, OG_SIZE, OgFrame, ogFonts } from "./_og/card";

// The site-wide share card: the front door's own headline on the night
// ground. Static (no params, no request data), so Next renders it once at
// build and serves the cached PNG.
export const alt = "Deal three: Dubai plans, without the group chat.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        kicker="Dubai hangout decider"
        footer="Deal three spots. Vote. Let the app call it."
      >
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Cormorant", fontSize: 112, lineHeight: 1, letterSpacing: -2 }}>
          <span style={{ fontWeight: 500 }}>Dubai plans,</span>
          <div style={{ display: "flex" }}>
            <span style={{ fontWeight: 500 }}>without the&nbsp;</span>
            <span style={{ fontStyle: "italic", fontWeight: 600, borderBottom: `5px solid ${NIGHT.punch}` }}>group chat.</span>
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
