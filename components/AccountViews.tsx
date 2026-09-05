"use client";

// The signed-in account: Discover, Been, Friends and Profile read from
// Supabase. DemoAccountViews is the same four screens filled with fixtures —
// it stays for /home-preview, where nobody is signed in and there is nothing
// real to show. Keeping the fixtures out of here is the point: a signed-in
// person's own history is the one thing that must never be invented.
//
// Every screen has a real empty state. A new account genuinely has no visits
// and no friends, and saying so is more useful than borrowing someone else's.

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import PlaceLinkImporter from "@/components/PlaceLinkImporter";
import PhotoWall, { type WallItem } from "@/components/PhotoWall";
import { categoryLabel, categoryMeta } from "@/lib/categories";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import { validateImageFile } from "@/lib/upload";
import {
  addVisitToCollection,
  createVisitCollection,
  removeVisitFromCollection,
  uploadVisitPhoto,
  type PlannedWith,
  type VisitCollectionView,
  type VisitPhotoView,
} from "@/lib/social";
import type {
  ProfileVisit,
  Spot,
  WrappedSummary,
  WrappedSummaryError,
} from "@/lib/types";

type AccountView = "discover" | "been" | "friends" | "profile";

function priceLabel(spot: Spot): string {
  return spot.min_spend > 0 ? `AED ${spot.min_spend} pp` : spot.price_band;
}

function WrappedRecap({
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

/** A place card. Curated spots often have no photo yet, so the typographic
 *  category code stands in rather than a stock image. */
function PlaceCard({ spot, onStartPlan }: { spot: Spot; onStartPlan: () => void }) {
  const meta = categoryMeta(spot.category);
  return (
    <article
      className={`demo-place-card ${spot.photo_url ? "" : "demo-place-card--flat"}`}
    >
      {spot.photo_url ? (
        <div className="demo-place-card__image">
          <Image src={spot.photo_url} alt={`${spot.name}, ${spot.area}`} fill sizes="(max-width: 700px) 100vw, 50vw" unoptimized />
        </div>
      ) : (
        <div className="demo-place-card__code" aria-hidden="true">{meta.code}</div>
      )}
      <div className="demo-place-card__body">
        <div className="demo-place-card__meta">
          <span>{spot.cuisine || categoryLabel(spot.category)}</span>
          <span>Open till {spot.open_till}</span>
        </div>
        <h2>{spot.name}</h2>
        <p className="demo-place-card__area">{spot.area} · {priceLabel(spot)}</p>
        {spot.description && <p>{spot.description}</p>}
        {spot.vibe && <p className="demo-place-card__context">{spot.vibe}</p>}
        <button type="button" onClick={onStartPlan}>Start a vote with this place</button>
      </div>
    </article>
  );
}

export default function AccountViews({
  view,
  name,
  personId,
  spots,
  visits,
  plannedWith,
  wrappedSummary,
  wrappedUnavailable,
  collections: initialCollections,
  photos,
  onStartPlan,
}: {
  view: AccountView;
  name: string;
  personId: string | null;
  spots: Spot[];
  visits: ProfileVisit[];
  plannedWith: PlannedWith[];
  wrappedSummary: WrappedSummary | null;
  wrappedUnavailable: WrappedSummaryError | null;
  collections: VisitCollectionView[];
  photos: VisitPhotoView[];
  onStartPlan: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [placeFilter, setPlaceFilter] = useState("All");

  // Collections mutate locally on a successful write rather than refetching —
  // same pattern DemoAccountViews used for its localStorage-backed version,
  // now backed by real `visit_collections`/`visit_collection_items` rows.
  // AccountViews stays mounted across a tab switch (the same instance
  // renders all four views), so `initialCollections` is effectively fixed
  // for the component's lifetime — no need to re-sync it from an effect.
  const [collections, setCollections] = useState(initialCollections);
  const [activeCollection, setActiveCollection] = useState("all");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadVisitId, setUploadVisitId] = useState<string>("");
  const [uploadVisibility, setUploadVisibility] = useState<"private" | "friends" | "community">("friends");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Derived, not synced from an effect: falls back to the first visit until
  // the picker is touched, then tracks whatever was chosen.
  const effectiveUploadVisitId = uploadVisitId || visits[0]?.id || "";

  useEffect(() => () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
  }, [uploadPreview]);

  const activeFolder = collections.find((c) => c.id === activeCollection);
  const visibleVisits = activeFolder
    ? visits.filter((visit) => activeFolder.visitIds.includes(visit.id))
    : visits;
  const photosByVisit = useMemo(() => {
    const map = new Map<string, VisitPhotoView>();
    for (const photo of photos) if (!map.has(photo.visit_id)) map.set(photo.visit_id, photo);
    return map;
  }, [photos]);
  const wallItems: WallItem[] = visibleVisits.map((visit) => ({
    id: visit.id,
    kind: "visit",
    visit,
    photoUrl: photosByVisit.get(visit.id)?.url ?? null,
  }));

  async function createCollection() {
    if (!personId) return;
    const created = await createVisitCollection(personId, newCollectionName);
    if (!created) return;
    setCollections((current) => [...current, created]);
    setActiveCollection(created.id);
    setNewCollectionName("");
  }

  async function addToCollection(visitId: string, collectionId: string) {
    if (!collectionId) return;
    const ok = await addVisitToCollection(collectionId, visitId);
    if (!ok) return;
    setCollections((current) => current.map((c) => c.id === collectionId
      ? { ...c, visitIds: Array.from(new Set([...c.visitIds, visitId])) }
      : c));
  }

  async function removeFromActiveCollection(visitId: string) {
    if (!activeFolder) return;
    const ok = await removeVisitFromCollection(activeFolder.id, visitId);
    if (!ok) return;
    setCollections((current) => current.map((c) => c.id === activeFolder.id
      ? { ...c, visitIds: c.visitIds.filter((id) => id !== visitId) }
      : c));
  }

  async function handleUploadChange(file: File | undefined) {
    if (!file) return;
    const error = await validateImageFile(file);
    setUploadError(error);
    if (error) return;
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
  }

  async function submitPhoto() {
    if (!personId || !uploadFile || !effectiveUploadVisitId) return;
    setUploading(true);
    try {
      const ok = await uploadVisitPhoto({
        personId,
        visitId: effectiveUploadVisitId,
        file: uploadFile,
        visibility: uploadVisibility,
      });
      setUploadError(ok ? null : "Couldn’t upload that photo. Try again.");
      if (ok) {
        if (uploadPreview) URL.revokeObjectURL(uploadPreview);
        setUploadFile(null);
        setUploadPreview(null);
        // A signed URL for the new photo only exists once the server signs
        // it, so re-run the Server Component instead of faking a preview
        // into the wall.
        router.refresh();
      }
    } finally {
      setUploading(false);
    }
  }

  const categories = useMemo(() => {
    const found = new Set(spots.map((spot) => spot.category));
    return ["All", ...[...found].sort()];
  }, [spots]);

  const visiblePlaces = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return spots.filter((spot) => {
      const matchesFilter = placeFilter === "All" || spot.category === placeFilter;
      const matchesQuery = !clean
        || `${spot.name} ${spot.area} ${spot.category} ${spot.cuisine}`.toLowerCase().includes(clean);
      return matchesFilter && matchesQuery;
    });
  }, [spots, placeFilter, query]);

  // Profile figures are counted from the visit log, never stored separately —
  // a stat that can disagree with the thing it counts is worse than no stat.
  const stats = useMemo(() => {
    const rows = visits;
    const areas = new Map<string, number>();
    for (const visit of rows) {
      const area = visit.spot?.area;
      if (area) areas.set(area, (areas.get(area) ?? 0) + 1);
    }
    const ranked = [...areas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = rows.length;
    return {
      total,
      places: new Set(rows.map((visit) => visit.spot_id)).size,
      fromPlans: rows.filter((visit) => visit.plan_id).length,
      areas: ranked.map(([area, count]) => ({
        name: area,
        visits: count,
        share: total ? Math.round((count / total) * 100) : 0,
      })),
    };
  }, [visits]);

  if (view === "discover") {
    return (
      <section className="demo-view" aria-labelledby="discover-title">
        <header className="demo-view__header">
          <div><p className="home-section-kicker">Discover Dubai</p><h1 id="discover-title">Places worth considering.</h1></div>
          <p>The catalogue a plan deals from. Search it, then start a vote on anything that fits tonight.</p>
        </header>

        <PlaceLinkImporter />

        <div className="demo-discover-tools">
          <label><span>Search places</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Area, place or category" /></label>
          <div className="demo-filter-tabs" aria-label="Filter places">
            {categories.slice(0, 8).map((filter) => (
              <button key={filter} type="button" onClick={() => setPlaceFilter(filter)} aria-pressed={placeFilter === filter}>{categoryLabel(filter)}</button>
            ))}
          </div>
        </div>

        {visiblePlaces.length ? (
          <div className="demo-place-grid">
            {visiblePlaces.map((spot) => <PlaceCard key={spot.id} spot={spot} onStartPlan={onStartPlan} />)}
          </div>
        ) : (
          <p className="demo-empty">
            {spots.length === 0
              ? "The catalogue is empty. Seed some places in Supabase to start planning."
              : "No places match that search."}
          </p>
        )}
      </section>
    );
  }

  if (view === "been") {
    return (
      <section className="demo-view" aria-labelledby="been-title">
        <header className="demo-view__header demo-view__header--split">
          <div>
            <p className="home-section-kicker">Your city log</p>
            <h1 id="been-title">{stats.places ? `${stats.places} places, properly remembered.` : "Your city log starts here."}</h1>
          </div>
          {stats.total > 0 && (
            <div className="demo-account-stats">
              <span><strong>{stats.total}</strong> visits</span>
              <span><strong>{stats.places}</strong> places</span>
              <span><strong>{stats.fromPlans}</strong> from plans</span>
            </div>
          )}
        </header>

        {visits.length === 0 ? (
          <div className="demo-collection-empty">
            <strong>No visits logged yet.</strong>
            <p>Rate a place after a plan is decided and it lands here, with whoever came along.</p>
            <button type="button" onClick={onStartPlan}>Start a plan</button>
          </div>
        ) : (
          <>
            <div className="demo-collection-bar">
              <div className="demo-collection-tabs" role="tablist" aria-label="Visit collections">
                <button type="button" role="tab" aria-selected={activeCollection === "all"} onClick={() => setActiveCollection("all")}>
                  All places <span>{visits.length}</span>
                </button>
                {collections.map((collection) => (
                  <button key={collection.id} type="button" role="tab" aria-selected={activeCollection === collection.id} onClick={() => setActiveCollection(collection.id)}>
                    {collection.name} <span>{collection.visitIds.length}</span>
                  </button>
                ))}
              </div>
              {personId && (
                <div className="demo-collection-create">
                  <label htmlFor="collection-name">New collection</label>
                  <div>
                    <input
                      id="collection-name"
                      value={newCollectionName}
                      onChange={(event) => setNewCollectionName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") { event.preventDefault(); void createCollection(); }
                      }}
                      placeholder="Tokyo food list, date nights…"
                      maxLength={40}
                    />
                    <button type="button" onClick={() => void createCollection()} disabled={!newCollectionName.trim()}>Create</button>
                  </div>
                </div>
              )}
            </div>

            <PhotoWall
              items={wallItems}
              emptyMessage={`${activeFolder?.name ?? "This collection"} is ready. Open All places and add visits to build it.`}
            />

            {activeFolder && personId && visibleVisits.length > 0 && (
              <div className="demo-visit__collection-action">
                <label>
                  <span>Remove a visit from {activeFolder.name}</span>
                  <select value="" onChange={(event) => { if (event.target.value) void removeFromActiveCollection(event.target.value); }}>
                    <option value="">Choose…</option>
                    {visibleVisits.map((visit) => (
                      <option key={visit.id} value={visit.id}>{visit.spot?.name ?? "Removed place"}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {!activeFolder && personId && collections.length > 0 && (
              <div className="demo-visit__collection-action">
                <label>
                  <span>Add {visits[0]?.spot?.name ? "a visit" : "one"} to a collection</span>
                  <select
                    value=""
                    onChange={(event) => {
                      const [visitId, collectionId] = event.target.value.split("::");
                      if (visitId && collectionId) void addToCollection(visitId, collectionId);
                    }}
                  >
                    <option value="">Choose a visit and collection…</option>
                    {visits.flatMap((visit) => collections.map((collection) => (
                      <option key={`${visit.id}::${collection.id}`} value={`${visit.id}::${collection.id}`}>
                        {visit.spot?.name ?? "Removed place"} → {collection.name}
                      </option>
                    )))}
                  </select>
                </label>
              </div>
            )}

            {personId && (
              <div className="demo-photo-composer">
                <label className="demo-photo-upload">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void handleUploadChange(event.target.files?.[0])}
                  />
                  {uploadPreview ? (
                    <>
                      <span className="demo-photo-upload__preview">
                        <Image src={uploadPreview} alt="New visit upload preview" fill unoptimized />
                      </span>
                      <strong>Photo ready for {visits.find((v) => v.id === effectiveUploadVisitId)?.spot?.name ?? "your visit"}</strong>
                      <small>Tap the image to choose another</small>
                    </>
                  ) : (
                    <>
                      <strong>Add a photo from a visit</strong>
                      <small>Choose an image from this device</small>
                    </>
                  )}
                </label>
                {uploadError && <p role="alert" className="auth-error">{uploadError}</p>}
                <label className="demo-photo-target">
                  <span>Attach to</span>
                  <select value={effectiveUploadVisitId} onChange={(event) => setUploadVisitId(event.target.value)}>
                    {visits.map((visit) => (
                      <option key={visit.id} value={visit.id}>{visit.spot?.name ?? "Removed place"}</option>
                    ))}
                  </select>
                </label>
                <label className="demo-photo-target">
                  <span>Who sees it</span>
                  <select value={uploadVisibility} onChange={(event) => setUploadVisibility(event.target.value as typeof uploadVisibility)}>
                    <option value="private">Only me</option>
                    <option value="friends">Friends</option>
                    <option value="community">Community</option>
                  </select>
                </label>
                {uploadFile && (
                  <button type="button" onClick={() => void submitPhoto()} disabled={uploading}>
                    {uploading ? "Uploading…" : "Save photo"}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  if (view === "friends") {
    return (
      <section className="demo-view" aria-labelledby="friends-title">
        <header className="demo-view__header demo-view__header--split">
          <div><p className="home-section-kicker">Your planning circle</p><h1 id="friends-title">The people you actually go out with.</h1></div>
          <button type="button" className="demo-primary-action" onClick={onStartPlan}>Start a group plan</button>
        </header>

        {plannedWith.length === 0 ? (
          <div className="demo-collection-empty">
            <strong>Nobody here yet.</strong>
            <p>Everyone who comes along on a plan lands here once you rate it. Start one and share the link.</p>
            <button type="button" onClick={onStartPlan}>Start a plan</button>
          </div>
        ) : (
          <div className="demo-friend-layout">
            <div className="demo-friend-list">
              {plannedWith.map((friend) => (
                <article key={friend.name} className="demo-friend-row">
                  <span className="demo-friend-avatar" aria-hidden="true" style={avatarStyle(friend.name)}>
                    {initialsOf(friend.name)}
                  </span>
                  <div>
                    <h2>{friend.name}</h2>
                    {!friend.person && <p>Came along · no account yet</p>}
                  </div>
                  <div className="demo-friend-row__numbers">
                    <strong>{friend.shared}</strong>
                    <span>{friend.shared === 1 ? "outing" : "outings"}</span>
                  </div>
                  <button type="button" onClick={onStartPlan}>Plan together</button>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="demo-view" aria-labelledby="profile-title">
      <header className="demo-profile-head">
        <span className="demo-profile-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div><p className="home-section-kicker">Your account</p><h1 id="profile-title">{name}</h1><p>Dubai</p></div>
      </header>

      <div className="demo-profile-stats">
        <span><strong>{stats.places}</strong> places</span>
        <span><strong>{stats.total}</strong> visits</span>
        <span><strong>{plannedWith.length}</strong> people</span>
      </div>

      {stats.areas.length > 0 ? (
        <section className="demo-city-pattern" aria-labelledby="city-pattern-title">
          <div className="demo-city-pattern__lead">
            <p className="home-section-kicker">Your Dubai</p>
            <h2 id="city-pattern-title">{stats.areas[0].name} is {stats.areas[0].share}% of your city.</h2>
            <p>Counted from the {stats.total} {stats.total === 1 ? "visit" : "visits"} in your log.</p>
          </div>
          <div className="demo-area-list">
            {stats.areas.slice(0, 5).map((area) => (
              <div key={area.name}>
                <div><span>{area.name}</span><strong>{area.share}%</strong></div>
                <progress value={area.share} max="100" aria-label={`${area.name}, ${area.share}% of visits`} />
                <small>{area.visits} {area.visits === 1 ? "visit" : "visits"}</small>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="demo-empty">Your city pattern appears once you have logged a visit or two.</p>
      )}
      <WrappedRecap
        name={name}
        summary={wrappedSummary}
        unavailable={wrappedUnavailable}
      />
      <nav className="legal-links" aria-label="Legal">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </section>
  );
}
