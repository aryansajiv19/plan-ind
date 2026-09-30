import { ImageResponse } from "next/og";
import { NIGHT, OG_SIZE, OgFrame, ogFonts } from "./_og/card";

// The site-wide share card: the front door's own headline on the night
// ground. Static (no params, no request data), so Next renders it once at
// build and serves the cached PNG.
export const alt = "Planind: Dubai plans, without the group chat.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <OgFrame
        kicker="Dubai hangout decider"
        footer="Nine places, three rounds. Let the app call it."
      >
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Jakarta", fontWeight: 700, fontSize: 92, lineHeight: 1.05, letterSpacing: -2 }}>
          <span style={{ fontWeight: 700 }}>Dubai plans,</span>
          <div style={{ display: "flex" }}>
            <span style={{ fontWeight: 700 }}>without the&nbsp;</span>
            <span style={{ fontWeight: 700, borderBottom: `5px solid ${NIGHT.punch}` }}>group chat.</span>
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
