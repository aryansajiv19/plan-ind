"use client";

import { useEffect, useState } from "react";
import type { PlaceCollectionKind, PlaceLinkCandidate } from "@/lib/place-import";

interface SavedLink extends PlaceLinkCandidate {
  id: string;
  collection: PlaceCollectionKind;
}

const STORAGE_KEY = "deal-three:place-links";

export default function PlaceLinkImporter() {
  const [url, setUrl] = useState("");
  const [collection, setCollection] = useState<PlaceCollectionKind>("want_to_try");
  const [saved, setSaved] = useState<SavedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      try { setSaved(JSON.parse(stored) as SavedLink[]); } catch { /* keep an empty list */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/place-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await response.json() as { candidate?: PlaceLinkCandidate; error?: string };
      if (!response.ok || !result.candidate) throw new Error(result.error ?? "That link could not be added.");
      const item: SavedLink = { ...result.candidate, id: crypto.randomUUID(), collection };
      const next = [item, ...saved.filter((entry) => entry.normalizedUrl !== item.normalizedUrl)].slice(0, 8);
      setSaved(next);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setUrl("");
      setMessage(`${item.providerLabel} link saved to ${collection === "want_to_try" ? "Want to try" : "Planning"}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "That link could not be added.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="place-link-importer" aria-labelledby="place-link-title">
      <div className="place-link-importer__intro">
        <p className="home-section-kicker">Found something online?</p>
        <h2 id="place-link-title">Save the link. Find the place.</h2>
        <p>Paste a post from Instagram, TikTok, Facebook, Reddit or another website.</p>
      </div>
      <form onSubmit={addLink}>
        <label htmlFor="place-link">Post or website link</label>
        <div className="place-link-importer__field"><input id="place-link" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.instagram.com/reel/…" required /><button type="submit" disabled={loading || !url.trim()}>{loading ? "Checking…" : "Save link"}</button></div>
        <fieldset><legend>Save to</legend><div>{(["want_to_try", "planning"] as const).map((kind) => <button key={kind} type="button" aria-pressed={collection === kind} onClick={() => setCollection(kind)}>{kind === "want_to_try" ? "Want to try" : "Planning"}</button>)}</div></fieldset>
        {message && <p className="place-link-importer__message" role="status">{message}</p>}
        {error && <p className="place-link-importer__error" role="alert">{error}</p>}
      </form>
      {saved.length > 0 && <div className="place-link-importer__saved"><p>Recently saved</p>{saved.slice(0, 3).map((item) => <a key={item.id} href={item.normalizedUrl} target="_blank" rel="noreferrer"><strong>{item.providerLabel}</strong><span>{item.collection === "want_to_try" ? "Want to try" : "Planning"}</span></a>)}</div>}
    </section>
  );
}
