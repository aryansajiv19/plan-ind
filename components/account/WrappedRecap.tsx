"use client";

import { useEffect, useRef, useState } from "react";
import type { WrappedSummary, WrappedSummaryError } from "@/lib/types";

export default function WrappedRecap({
  name,
  summary,
  unavailable,
}: {
  name: string;
  summary: WrappedSummary | null;
  unavailable: WrappedSummaryError | null;
}) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const openButton = useRef<HTMLButtonElement | null>(null);
  const recapCard = useRef<HTMLDivElement | null>(null);
  const sharingInFlight = useRef(false);
  const statusTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
  }, []);

  function announce(message: string) {
    setShareStatus(message);
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setShareStatus(""), 2400);
  }

  async function copySummary(text: string) {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    announce("Wrapped copied to your clipboard.");
  }

  async function shareWrapped() {
    if (!summary || sharingInFlight.current) return;
    const details = [
      `${summary.planCount} ${summary.planCount === 1 ? "plan" : "plans"}`,
      `${summary.activityCount} ${summary.activityCount === 1 ? "outing" : "outings"}`,
      summary.topArea ? `${summary.topArea} was my most visited area` : null,
      summary.topGroup ? `${summary.topGroup} was my most active group` : null,
      summary.topCategory ? `${summary.topCategory} was my most visited category` : null,
    ].filter((detail): detail is string => detail !== null);
    const text = `My Planind Wrapped for ${summary.periodLabel}: ${details.join(", ")}.`;

    sharingInFlight.current = true;
    setSharing(true);
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: "My Planind Wrapped", text });
          announce("Wrapped shared.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setShareStatus("");
            return;
          }
        }
      }

      try {
        await copySummary(text);
      } catch {
        announce("Couldn’t share your Wrapped. Please try again.");
      }
    } finally {
      sharingInFlight.current = false;
      setSharing(false);
    }
  }

  function openRecap() {
    setOpen(true);
    window.requestAnimationFrame(() => recapCard.current?.focus());
  }

  function closeRecap() {
    setOpen(false);
    window.requestAnimationFrame(() => openButton.current?.focus());
  }

  const isEmpty = summary?.planCount === 0 && summary.activityCount === 0;

  return (
    <section className="demo-wrapped" aria-labelledby="wrapped-title">
      <div>
        <p className="home-section-kicker">Your month in plans</p>
        <h2 id="wrapped-title">Planind Wrapped</h2>
        <p>A small recap of the places, people and decisions that shaped your month.</p>
      </div>

      {unavailable || !summary ? (
        <div className="demo-collection-empty" role="status">
          <strong>Your Wrapped is unavailable right now.</strong>
          <p>We couldn’t load the full month, so we haven’t filled any gaps with estimates. Try again later.</p>
        </div>
      ) : isEmpty ? (
        <div className="demo-collection-empty">
          <strong>Nothing to wrap yet.</strong>
          <p>Your {summary.periodLabel} recap will appear after you make a plan or log an outing.</p>
        </div>
      ) : (
        <>
          <button
            ref={openButton}
            type="button"
            className="demo-primary-action"
            aria-expanded={open}
            aria-controls="wrapped-recap"
            hidden={open}
            onClick={openRecap}
          >
            See my Wrapped
          </button>
          <div
            ref={recapCard}
            className="demo-wrapped__card"
            id="wrapped-recap"
            hidden={!open}
            tabIndex={-1}
          >
            <div className="demo-wrapped__eyebrow">{summary.periodLabel} · {name}</div>
            <strong>{summary.planCount}</strong>
            <span>{summary.planCount === 1 ? "plan made" : "plans made"} this month</span>
            <div className="demo-wrapped__stats">
              <div>
                <b>{summary.activityCount}</b>
                <small>{summary.activityCount === 1 ? "Outing logged" : "Outings logged"}</small>
              </div>
              {summary.topArea && <div><b>{summary.topArea}</b><small>Your most visited area</small></div>}
              {summary.topGroup && <div><b>{summary.topGroup}</b><small>Your most active group</small></div>}
              {summary.topCategory && <div><b>{summary.topCategory}</b><small>Your most visited category</small></div>}
              {summary.bestRatedPlace && (
                <div>
                  <b>{summary.bestRatedPlace.name}</b>
                  <small>
                    Highest group-rated place · {summary.bestRatedPlace.average.toFixed(1)} group rating average from {summary.bestRatedPlace.ratingCount} {summary.bestRatedPlace.ratingCount === 1 ? "rating" : "ratings"}
                  </small>
                </div>
              )}
            </div>
            <div className="demo-wrapped__actions">
              <button type="button" disabled={sharing} onClick={() => void shareWrapped()}>{sharing ? "Sharing…" : "Share Wrapped"}</button>
              <button type="button" aria-expanded="true" aria-controls="wrapped-recap" onClick={closeRecap}>Close</button>
            </div>
            <p className="demo-wrapped__status" role="status" aria-live="polite">{shareStatus}</p>
          </div>
        </>
      )}
    </section>
  );
}
