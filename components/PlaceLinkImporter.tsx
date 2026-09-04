"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { classifyPlaceLink, type PlaceCollectionKind, type PlaceLinkCandidate } from "@/lib/place-import";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { categoryMeta } from "@/lib/categories";

/** GET /api/place-import's resolvedSpot shape — trusted (from our own
 * curated `spots` table, never the raw scraped page content). */
interface ResolvedSpot {
  id: string;
  name: string;
  area: string;
  category: string;
  photoUrl: string | null;
}

/** Same trust note: candidate names come from matched spots rows, not
 * from the untrusted extracted_data this endpoint deliberately omits. */
interface Candidate {
  spotId: string;
  name: string;
}

interface SavedLink extends PlaceLinkCandidate {
  id: string;
  collection: PlaceCollectionKind;
  status?: string;
  resolvedSpot?: ResolvedSpot | null;
  candidates?: Candidate[] | null;
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

  const refetchSaved = useCallback(async () => {
    if (demoMode) return;
    try {
      const response = await fetch("/api/place-import");
      if (!response.ok) return;
      const result = await response.json() as { saved?: SavedLink[] };
      if (Array.isArray(result.saved)) setSaved(result.saved);
    } catch { /* keep whatever is already shown */ }
  }, [demoMode]);

  useEffect(() => {
    // Inlined rather than calling refetchSaved (react-hooks/set-state-in-effect
    // flags a named function reference here, though not this same fetch/.then
    // chain written inline — see the trap list in components/CLAUDE.md).
    // refetchSaved itself is for addLink's non-effect call site below.
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
        const response = await secureJsonFetch("/api/place-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, collection }),
        });
        result = await response.json() as typeof result;
        if (!response.ok) throw new Error(result.error ?? "That link could not be added.");
      }
      if (!result.candidate) throw new Error(result.error ?? "That link could not be added.");
      const item: SavedLink = { ...result.candidate, id: result.id ?? crypto.randomUUID(), collection: demoMode ? collection : (result.collection ?? collection) };
      if (demoMode) {
        const next = [item, ...saved.filter((entry) => entry.normalizedUrl !== item.normalizedUrl)].slice(0, 8);
        setSaved(next);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        // The server already resolved this link synchronously before
        // responding (app/api/place-import/route.ts), but the POST body
        // doesn't carry the outcome — only GET does. Re-fetch rather than
        // append a bare candidate that would sit unresolved-looking until
        // the next page load.
        await refetchSaved();
      }
      setUrl("");
      setMessage(`${item.providerLabel} link saved to ${item.collection === "want_to_try" ? "Want to try" : "Planning"}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "That link could not be added.");
    } finally {
      setLoading(false);
    }
  }

  function renderResult(item: SavedLink) {
    const collectionLabel = item.collection === "want_to_try" ? "Want to try" : "Planning";
    if (item.resolvedSpot) {
      const cat = categoryMeta(item.resolvedSpot.category);
      return (
        <Link href={`/place/${item.resolvedSpot.id}`} className="place-link-importer__result place-link-importer__result--resolved">
          <span className="place-link-importer__result-cat">{cat.code}</span>
          <span>
            <strong>{item.resolvedSpot.name}</strong>
            <small>{item.resolvedSpot.area} · {collectionLabel}</small>
          </span>
        </Link>
      );
    }
    if (item.status === "needs_input" && item.candidates && item.candidates.length > 0) {
      return (
        <div className="place-link-importer__result place-link-importer__result--candidates">
          <span>
            <strong>Not sure which place</strong>
            <small>
              Might be: {item.candidates.map((c, i) => (
                <span key={c.spotId}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/place/${c.spotId}`}>{c.name}</Link>
                </span>
              ))}
            </small>
          </span>
        </div>
      );
    }
    if (item.status === "needs_input" || item.status === "failed") {
      return (
        <div className="place-link-importer__result place-link-importer__result--failed">
          <span>
            <strong>{item.providerLabel}</strong>
            <small>Couldn&rsquo;t identify the place from this link · {collectionLabel}</small>
          </span>
        </div>
      );
    }
    if (item.status === "pending") {
      return (
        <div className="place-link-importer__result place-link-importer__result--pending">
          <span>
            <strong>{item.providerLabel}</strong>
            <small>Checking… · {collectionLabel}</small>
          </span>
        </div>
      );
    }
    // No status at all: the demo-mode local-only path, which never resolves
    // anything server-side. Falls back to the original link-only display.
    return (
      <a href={item.normalizedUrl} target="_blank" rel="noreferrer" className="place-link-importer__result">
        <strong>{item.providerLabel}</strong>
        <span className="place-link-importer__result-label">{collectionLabel}</span>
      </a>
    );
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
        {saved.filter((item) => savedFilter === "all" || item.collection === savedFilter).slice(0, 8).map((item) => (
          <div key={item.id}>{renderResult(item)}</div>
        ))}
      </div>}
    </section>
  );
}
