"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import PlaceLinkImporter from "@/components/PlaceLinkImporter";
import DemoMoodboards from "@/components/demo/DemoMoodboards";
import { friendPlanPrefill, originForArea, type PlanPrefill } from "@/lib/board-plan";
import { validateImageFile } from "@/lib/upload";
import { categoryLabel, categoryMeta } from "@/lib/categories";
import { initialsOf } from "@/lib/avatar";
import { friendStats, visitStats } from "@/components/demo/demoStats";

type AccountView = "discover" | "saved" | "been" | "friends" | "profile";

const PLACES = [
  {
    name: "Ninive",
    area: "Emirates Towers",
    category: "Dinner",
    key: "dinner",
    group: "food",
    district: "Downtown and DIFC",
    // Catalogue truth (070): AED 250 minimum spend, 18+.
    price: "AED 250 pp",
    rating: "4.8",
    friendNote: "Sara and 3 friends would return",
    image: "/demo/alserkal-dinner.webp",
    note: "Garden seating, shared Middle Eastern plates and enough atmosphere without shouting over dinner.",
  },
  {
    name: "Drift Beach",
    area: "One&Only Royal Mirage",
    category: "Beach club",
    key: "beach_club",
    group: "water",
    district: "Al Sufouh",
    price: "AED 350 pp",
    rating: "4.6",
    friendNote: "Maya saved this for Saturday",
    image: "/demo/beach-club.webp",
    note: "A calmer pool day with a proper lunch and a clean transition into sunset.",
  },
  {
    name: "Padel Art",
    area: "Al Quoz",
    category: "Sports",
    key: "padel",
    group: "active",
    district: "Al Quoz",
    price: "AED 100 pp",
    rating: "4.7",
    friendNote: "You, Zain and Omar have been",
    image: "/demo/padel-night.webp",
    note: "Reliable evening courts, good lighting and enough space to stay after the match.",
  },
  {
    name: "Al Qudra Lakes",
    area: "Seih Al Salam",
    category: "Escape",
    key: "outdoors",
    group: "leisure",
    district: "Outside the city",
    // The catalogue's spend (the wall shows the same); entry itself is free.
    price: "AED 20 pp",
    rating: "4.9",
    friendNote: "Your group rated sunrise highest",
    image: "/demo/al-qudra-morning.webp",
    note: "Best before the city wakes up: bikes, coffee and a quiet loop beside the lakes.",
  },
] as const;

const VISITS = [
  { id: "ninive", place: PLACES[0], date: "2026-08-02", score: 4.8, with: ["sara", "maya", "zain"], note: "The garden table was the right call. Stayed for another round and nobody wanted to leave." },
  { id: "padel-art", place: PLACES[2], date: "2026-07-27", score: 4.6, with: ["omar", "zain"], note: "Booked ninety minutes, played for two hours. Tuesday evenings are quieter." },
  { id: "drift-beach", place: PLACES[1], date: "2026-07-19", score: 4.5, with: ["maya", "leila", "sara"], note: "Go early for the calm pool, stay through sunset, skip the loud late session." },
  { id: "al-qudra", place: PLACES[3], date: "2026-07-06", score: 4.9, with: ["omar", "leila", "zain"], note: "Left at 5:10, reached before sunrise. Coffee and bikes made the morning." },
] as const;

interface DemoCollection {
  id: string;
  name: string;
  visitIds: string[];
}

const DEFAULT_COLLECTIONS: DemoCollection[] = [
  { id: "late-dinners", name: "Late dinners", visitIds: ["ninive"] },
  { id: "active-dubai", name: "Sport and outdoors", visitIds: ["padel-art", "al-qudra"] },
  { id: "weekends", name: "Weekend reset", visitIds: ["drift-beach", "al-qudra"] },
];

const FRIEND_ROWS = [
  { id: "sara", name: "Sara Ahmed", note: "Dinner · arts · low-key nights" },
  { id: "zain", name: "Zain Malik", note: "Padel · games · late food" },
  { id: "maya", name: "Maya Khan", note: "Beach clubs · brunch · wellness" },
  { id: "omar", name: "Omar Ali", note: "Outdoors · sports · coffee" },
  { id: "leila", name: "Leila Noor", note: "Cinema · live music · dessert" },
] as const;

// Every number on Been, Friends and Profile comes from the visits above.
const STAT_VISITS = VISITS.map((visit) => ({ id: visit.id, placeName: visit.place.name, date: visit.date, score: visit.score, district: visit.place.district, with: visit.with }));
const STATS = visitStats(STAT_VISITS);
const FRIENDS = FRIEND_ROWS.map((friend) => ({ ...friend, ...friendStats(STAT_VISITS, friend.id) }))
  .sort((a, b) => b.outings - a.outings);
const firstLetter = (id: string) => FRIEND_ROWS.find((friend) => friend.id === id)?.name.slice(0, 1) ?? "?";
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function FaceStack({ people }: { people: readonly string[] }) {
  return (
    <span className="demo-face-stack" aria-label={`${people.length} friends joined`}>
      {people.map((person, index) => <span key={`${person}-${index}`} aria-hidden="true">{person}</span>)}
    </span>
  );
}

export default function DemoAccountViews({
  view,
  name,
  onStartPlan,
}: {
  view: AccountView;
  name: string;
  /** Opens the composer; a prefill sets it up the way the button said. */
  onStartPlan: (prefill?: PlanPrefill) => void;
}) {
  const [placeFilter, setPlaceFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadVisitId, setUploadVisitId] = useState<string>(VISITS[0].id);
  const [collections, setCollections] = useState<DemoCollection[]>(DEFAULT_COLLECTIONS);
  const [activeCollection, setActiveCollection] = useState("all");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionsReady, setCollectionsReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("deal-three:demo-collections");
      if (saved) {
        try { setCollections(JSON.parse(saved) as DemoCollection[]); } catch { /* keep the curated defaults */ }
      }
      setCollectionsReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (collectionsReady) window.localStorage.setItem("deal-three:demo-collections", JSON.stringify(collections));
  }, [collections, collectionsReady]);

  useEffect(() => () => {
    if (uploadedPhoto) URL.revokeObjectURL(uploadedPhoto);
  }, [uploadedPhoto]);

  const visiblePlaces = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return PLACES.filter((place) => {
      const matchesFilter = placeFilter === "All" || place.category === placeFilter;
      const matchesQuery = !cleanQuery || `${place.name} ${place.area} ${place.category}`.toLowerCase().includes(cleanQuery);
      return matchesFilter && matchesQuery;
    });
  }, [placeFilter, query]);

  const activeFolder = collections.find((collection) => collection.id === activeCollection);
  const visibleVisits = activeFolder
    ? VISITS.filter((visit) => activeFolder.visitIds.includes(visit.id))
    : VISITS;

  function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "collection"}-${Date.now()}`;
    const next = { id, name: name.slice(0, 40), visitIds: [] };
    setCollections((current) => [...current, next]);
    setActiveCollection(id);
    setNewCollectionName("");
  }

  function addVisitToCollection(visitId: string, collectionId: string) {
    if (!collectionId) return;
    setCollections((current) => current.map((collection) => collection.id === collectionId
      ? { ...collection, visitIds: Array.from(new Set([...collection.visitIds, visitId])) }
      : collection));
  }

  function removeVisitFromActiveCollection(visitId: string) {
    if (!activeFolder) return;
    setCollections((current) => current.map((collection) => collection.id === activeFolder.id
      ? { ...collection, visitIds: collection.visitIds.filter((id) => id !== visitId) }
      : collection));
  }

  if (view === "saved") {
    return (
      <section className="demo-view saved-view" aria-labelledby="saved-title">
        <header className="demo-view__header">
          <div><h1 id="saved-title">Saved.</h1></div>
          <p>Your folders, boards and saved links. Keep a place now, plan it later.</p>
        </header>
        <DemoMoodboards onPlan={onStartPlan} />
        <PlaceLinkImporter demoMode />
      </section>
    );
  }

  if (view === "discover") {
    return (
      <section className="demo-view" aria-labelledby="discover-title">
        <header className="demo-view__header">
          <div><h1 id="discover-title">Places worth considering.</h1></div>
          <p>Real context from your circle, alongside the details that decide whether a place works tonight.</p>
        </header>

        <div className="demo-discover-tools">
          <label><span>Search places</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Area, place or category" /></label>
          <div className="demo-filter-tabs" aria-label="Filter places">
            {["All", "Dinner", "Beach club", "Sports", "Escape"].map((filter) => (
              <button key={filter} type="button" onClick={() => setPlaceFilter(filter)} aria-pressed={placeFilter === filter}>{categoryLabel(filter)}</button>
            ))}
          </div>
        </div>

        {visiblePlaces.length ? (
          <div className="demo-place-grid">
            {visiblePlaces.map((place) => (
              <article key={place.name} className="demo-place-card">
                <div className="demo-place-card__band" data-photo>
                  <Image src={place.image} alt={`Community visit at ${place.name}`} fill sizes="(max-width: 700px) 100vw, 20rem" />
                  <div className="demo-place-card__over">
                    <span className="demo-place-card__chip" aria-hidden="true">{categoryMeta(place.key).code}</span>
                    <div><h2>{place.name}</h2><p className="demo-place-card__area">{place.area} · {place.price}</p></div>
                  </div>
                </div>
                <div className="demo-place-card__body">
                  <div className="demo-place-card__meta"><span>{categoryLabel(place.category)}</span><span>{place.rating} / 5</span></div>
                  <p>{place.note}</p><p className="demo-place-card__context">{place.friendNote}</p>
                  {/* The preview deal can't hold a sample place, so it promises what it does. */}
                  <button type="button" onClick={() => onStartPlan({ key: `${place.name}:${Date.now()}`, boardName: place.name, category: place.key, origin: originForArea(place.area) ?? "anywhere", title: `Somewhere like ${place.name}?`, source: "like" })}>Plan something like this</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="demo-empty">No places match that search.</p>}
      </section>
    );
  }

  if (view === "been") {
    return (
      <section className="demo-view" aria-labelledby="been-title">
        <header className="demo-view__header demo-view__header--split">
          <div><h1 id="been-title">{STATS.places} places, properly remembered.</h1></div>
          <div className="demo-account-stats"><span><strong>{STATS.inYear}</strong> in {STATS.year}</span><span><strong>{STATS.average}</strong> average</span><span><strong>{VISITS.length}</strong> photos</span></div>
        </header>

        <div className="demo-collection-bar">
          <div className="demo-collection-tabs" role="tablist" aria-label="Visit collections">
            <button type="button" role="tab" aria-selected={activeCollection === "all"} onClick={() => setActiveCollection("all")}>All places <span>{VISITS.length}</span></button>
            {collections.map((collection) => (
              <button key={collection.id} type="button" role="tab" aria-selected={activeCollection === collection.id} onClick={() => setActiveCollection(collection.id)}>{collection.name} <span>{collection.visitIds.length}</span></button>
            ))}
          </div>
          <div className="demo-collection-create">
            <label htmlFor="collection-name">New collection</label>
            <div><input id="collection-name" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createCollection(); } }} placeholder="JBR brunch list, date nights…" maxLength={40} /><button type="button" onClick={createCollection} disabled={!newCollectionName.trim()}>Create</button></div>
          </div>
        </div>

        <div className="demo-visit-grid">
          {visibleVisits.map((visit, index) => (
            <article key={visit.place.name} className={`demo-visit ${index === 0 ? "demo-visit--featured" : ""}`}>
              <div className="demo-visit__image"><Image src={visit.place.image} alt={`Photo from ${visit.place.name}`} fill sizes="(max-width: 700px) 100vw, 50vw" /></div>
              <div className="demo-visit__content">
                <div className="demo-visit__top"><span>{dayLabel(visit.date)}</span><strong>{visit.score} / 5</strong></div>
                <h2>{visit.place.name}</h2><p className="demo-place-card__area">{visit.place.area}</p><p>{visit.note}</p>
                <div className="demo-visit__people"><FaceStack people={visit.with.map(firstLetter)} /><span>Went with {visit.with.length} friends</span></div>
                <div className="demo-visit__collection-action">
                  {activeFolder ? (
                    <button type="button" onClick={() => removeVisitFromActiveCollection(visit.id)}>Remove from {activeFolder.name}</button>
                  ) : (
                    <label><span>Add to collection</span><select value="" onChange={(event) => addVisitToCollection(visit.id, event.target.value)}><option value="">Choose…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
                  )}
                </div>
              </div>
            </article>
          ))}

          {visibleVisits.length === 0 && <div className="demo-collection-empty"><strong>{activeFolder?.name} is ready.</strong><p>Open All places and add visits to build this collection.</p><button type="button" onClick={() => setActiveCollection("all")}>Browse all places</button></div>}

          <div className="demo-photo-composer">
            <label className="demo-photo-upload">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void validateImageFile(file).then((error) => {
                    setUploadError(error);
                    if (error) return;
                    if (uploadedPhoto) URL.revokeObjectURL(uploadedPhoto);
                    setUploadedPhoto(URL.createObjectURL(file));
                  });
                }
              }} />
              {uploadedPhoto ? (
                <><span className="demo-photo-upload__preview"><Image src={uploadedPhoto} alt="New visit upload preview" fill unoptimized /></span><strong>Photo ready for {VISITS.find((visit) => visit.id === uploadVisitId)?.place.name}</strong><small>Tap the image to choose another</small></>
              ) : <><strong>Add photos from a visit</strong><small>Choose an image from this device</small></>}
            </label>
            {uploadError && <p role="alert" className="auth-error">{uploadError}</p>}
            <label className="demo-photo-target"><span>Attach to</span><select value={uploadVisitId} onChange={(event) => setUploadVisitId(event.target.value)}>{VISITS.map((visit) => <option key={visit.id} value={visit.id}>{visit.place.name}</option>)}</select></label>
          </div>
        </div>
      </section>
    );
  }

  if (view === "friends") {
    return (
      <section className="demo-view" aria-labelledby="friends-title">
        <header className="demo-view__header demo-view__header--split">
          <div><h1 id="friends-title">The people you actually go out with.</h1></div>
          <button type="button" className="demo-primary-action" onClick={() => onStartPlan()}>Start a group plan</button>
        </header>

        <div className="demo-friend-layout">
          <div className="demo-friend-list">
            {FRIENDS.map((friend) => (
              <article key={friend.name} className="demo-friend-row">
                <span className="demo-friend-avatar" aria-hidden="true">{initialsOf(friend.name)}</span>
                <div><h2>{friend.name}</h2><p>{friend.note}</p>{friend.last && <small>Last together · {friend.last}</small>}</div>
                <div className="demo-friend-row__numbers"><strong>{friend.outings}</strong><span>outings</span></div>
                <button type="button" onClick={() => onStartPlan(friendPlanPrefill(friend.name, `${friend.name}:${Date.now()}`))}>Plan together</button>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="demo-view" aria-labelledby="profile-title">
      <header className="demo-profile-head">
        <span className="demo-profile-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div><h1 id="profile-title">{name}</h1><p>Dubai · planning since March 2026</p></div>
      </header>

      <div className="demo-profile-stats"><span><strong>{STATS.places}</strong> places</span><span><strong>{FRIENDS.length}</strong> friends</span><span><strong>{VISITS.length}</strong> photos</span></div>

      <section className="demo-city-pattern" aria-labelledby="city-pattern-title">
        <div className="demo-city-pattern__lead">
          <h2 id="city-pattern-title">
            {STATS.topArea ? `${STATS.topArea.name} is ${STATS.topArea.share}% of your city.` : `Spread across ${STATS.areas.length} areas, no favourite yet.`}
          </h2>
          <p>Most recently {VISITS[0].place.name}, {dayLabel(VISITS[0].date)}. Rated {STATS.average} on average.</p>
        </div>
        <div className="demo-area-list">
          {STATS.areas.map((area) => (
            <div key={area.name}>
              <div><span>{area.name}</span><strong>{area.share}%</strong></div>
              <progress value={area.share} max="100" aria-label={`${area.name}, ${area.share}% of visits`} />
              <small>{area.count} {area.count === 1 ? "place" : "places"}</small>
            </div>
          ))}
        </div>
      </section>


      <section className="demo-photo-strip"><div><h2>Your {STATS.period} in Dubai</h2></div>{VISITS.map((visit) => <span key={visit.id}><Image src={visit.place.image} alt={`From ${visit.place.name}`} fill sizes="160px" /></span>)}</section>
    </section>
  );
}
