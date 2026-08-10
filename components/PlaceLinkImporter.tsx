"use client";

import { useEffect, useState } from "react";
import { classifyPlaceLink, type PlaceCollectionKind, type PlaceLinkCandidate } from "@/lib/place-import";

interface SavedLink extends PlaceLinkCandidate {
  id: string;
  collection: PlaceCollectionKind;
}

const STORAGE_KEY = "deal-three:place-links";

export default function PlaceLinkImporter({ demoMode = false }: { demoMode?: boolean }) {
  const [url, setUrl] = useState("");
  const [collection, setCollection] = useState<PlaceCollectionKind>("want_to_try");
  const [saved, setSaved] = useState<SavedLink[]>([]);
  const [savedFilter, setSavedFilter] = useState<PlaceCollectionKind | "all">("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!demoMode) return;
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      try { setSaved(JSON.parse(stored) as SavedLink[]); } catch { /* keep an empty list */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) return;
    void fetch("/api/place-import").then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { saved?: SavedLink[] };
      if (Array.isArray(result.saved)) setSaved(result.saved);
    }).catch(() => undefined);
  }, [demoMode]);

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      let result: { candidate?: PlaceLinkCandidate; error?: string; id?: string; collection?: PlaceCollectionKind };
      if (demoMode) {
        result = { candidate: classifyPlaceLink(url) };
      } else {
        const response = await fetch("/api/place-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, collection }),
        });
        result = await response.json() as typeof result;
        if (!response.ok) throw new Error(result.error ?? "That link could not be added.");
      }
      if (!result.candidate) throw new Error(result.error ?? "That link could not be added.");
      const item: SavedLink = { ...result.candidate, id: result.id ?? crypto.randomUUID(), collection: demoMode ? collection : (result.collection ?? collection) };
      const next = [item, ...saved.filter((entry) => entry.normalizedUrl !== item.normalizedUrl)].slice(0, 8);
      setSaved(next);
      if (demoMode) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setUrl("");
      setMessage(`${item.providerLabel} link saved to ${item.collection === "want_to_try" ? "Want to try" : "Planning"}.`);
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
      {saved.length > 0 && <div className="place-link-importer__saved">
        <div className="place-link-importer__saved-head"><p>Saved links</p><span>{saved.length} total</span></div>
        <div className="place-link-importer__filters" role="group" aria-label="Filter saved links">
          {(["all", "want_to_try", "planning"] as const).map((filter) => (
            <button key={filter} type="button" aria-pressed={savedFilter === filter} onClick={() => setSavedFilter(filter)}>
              {filter === "all" ? "All" : filter === "want_to_try" ? "Want to try" : "Planning"}
            </button>
          ))}
        </div>
        {saved.filter((item) => savedFilter === "all" || item.collection === savedFilter).slice(0, 8).map((item) => <a key={item.id} href={item.normalizedUrl} target="_blank" rel="noreferrer"><strong>{item.providerLabel}</strong><span>{item.collection === "want_to_try" ? "Want to try" : "Planning"}</span></a>)}
      </div>}
    </section>
  );
}
