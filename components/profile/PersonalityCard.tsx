"use client";

import { useState } from "react";
import type { Personality } from "@/lib/personality";

// Plan Personality: the headline trait big, the rest as evidence rows, and a
// share that sends it as text (the native sheet on a phone, the clipboard on
// a desktop). Locked, it says how many outings are left instead of guessing.
export default function PersonalityCard({ name, personality }: { name: string; personality: Personality; sample?: boolean }) {
  const [shared, setShared] = useState<"idle" | "copied" | "failed">("idle");

  if (!personality.unlocked) {
    return (
      <section className="personality personality--locked" aria-labelledby="personality-title">
        <h2 id="personality-title">Your Plan Personality</h2>
        <p>
          Unlocks after {personality.needed} more {personality.needed === 1 ? "outing" : "outings"}. Log where you went, or rate a plan once the night is over.
        </p>
        <div className="personality__dots" aria-hidden="true">
          {Array.from({ length: personality.visits + personality.needed }, (_, i) => (
            <span key={i} data-done={i < personality.visits || undefined} />
          ))}
        </div>
      </section>
    );
  }

  const { headline, traits } = personality;
  const first = name.split(/\s+/)[0] || "My";
  const text = [
    `${first}'s Dubai Plan Personality: ${headline.title}`,
    ...traits.map((t) => `${t.title}: ${t.evidence}`),
    "Made with Planind",
  ].join("\n");

  async function share() {
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setShared("copied");
    } catch (error) {
      // A dismissed share sheet is not a failure.
      setShared(error instanceof DOMException && error.name === "AbortError" ? "idle" : "failed");
    }
  }

  return (
    <section className="personality" aria-labelledby="personality-title">
      <div className="personality__head">
        <h2 id="personality-title">Your Plan Personality</h2>
        <button type="button" className="personality__share" onClick={share}>
          {shared === "copied" ? "Copied" : "Share"}
        </button>
      </div>
      <div className="personality__headline">
        <div>
          <p className="personality__kicker">Mostly</p>
          <p className="personality__title">{headline.title}</p>
          <p>{headline.evidence}</p>
        </div>
      </div>
      {traits.length > 1 && (
        <ul className="personality__traits">
          {traits.slice(1).map((t) => (
            <li key={t.key}>
              <strong>{t.title}</strong>
              <span>{t.evidence}</span>
            </li>
          ))}
        </ul>
      )}
      {shared === "failed" && <p role="alert" className="personality__error">Couldn&rsquo;t share from this browser.</p>}
    </section>
  );
}
