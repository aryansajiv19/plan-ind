"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import PlaceLinkImporter from "@/components/PlaceLinkImporter";
import DemoPlanningTools from "@/components/DemoPlanningTools";
import { validateImageFile } from "@/lib/upload";

type AccountView = "discover" | "been" | "friends" | "profile";

const PLACES = [
  {
    name: "Ninive",
    area: "Emirates Towers",
    category: "Dinner",
    price: "AED 220 pp",
    rating: "4.8",
    friendNote: "Sara and 3 friends would return",
    image: "/demo/alserkal-dinner.png",
    note: "Garden seating, shared Middle Eastern plates and enough atmosphere without shouting over dinner.",
  },
  {
    name: "Drift Beach",
    area: "One&Only Royal Mirage",
    category: "Beach club",
    price: "AED 350 pp",
    rating: "4.6",
    friendNote: "Maya saved this for Saturday",
    image: "/demo/beach-club.png",
    note: "A calmer pool day with a proper lunch and a clean transition into sunset.",
  },
  {
    name: "Padel Art",
    area: "Al Quoz",
    category: "Sports",
    price: "AED 100 pp",
    rating: "4.7",
    friendNote: "You, Zain and Omar have been",
    image: "/demo/padel-night.png",
    note: "Reliable evening courts, good lighting and enough space to stay after the match.",
  },
  {
    name: "Al Qudra Lakes",
    area: "Seih Al Salam",
    category: "Escape",
    price: "Free",
    rating: "4.9",
    friendNote: "Your group rated sunrise highest",
    image: "/demo/al-qudra-morning.png",
    note: "Best before the city wakes up: bikes, coffee and a quiet loop beside the lakes.",
  },
] as const;

const VISITS = [
  { id: "ninive", place: PLACES[0], date: "02 Aug 2026", score: "4.8", people: ["S", "M", "Z"], note: "The garden table was the right call. Stayed for another round and nobody wanted to leave." },
  { id: "padel-art", place: PLACES[2], date: "27 Jul 2026", score: "4.6", people: ["O", "Z"], note: "Booked ninety minutes, played for two hours. Tuesday evenings are quieter." },
  { id: "drift-beach", place: PLACES[1], date: "19 Jul 2026", score: "4.5", people: ["M", "L", "S"], note: "Go early for the calm pool, stay through sunset, skip the loud late session." },
  { id: "al-qudra", place: PLACES[3], date: "06 Jul 2026", score: "4.9", people: ["O", "N", "Z"], note: "Left at 5:10, reached before sunrise. Coffee and bikes made the morning." },
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

const FRIENDS = [
  { initials: "SA", name: "Sara Ahmed", shared: 14, match: 92, last: "Ninive", note: "Dinner · arts · low-key nights" },
  { initials: "ZM", name: "Zain Malik", shared: 11, match: 88, last: "Padel Art", note: "Padel · games · late food" },
  { initials: "MK", name: "Maya Khan", shared: 9, match: 84, last: "Drift Beach", note: "Beach clubs · brunch · wellness" },
  { initials: "OA", name: "Omar Ali", shared: 8, match: 81, last: "Al Qudra Lakes", note: "Outdoors · sports · coffee" },
  { initials: "LN", name: "Leila Noor", shared: 6, match: 76, last: "Cinema Akil", note: "Cinema · live music · dessert" },
] as const;

const CITY_AREAS = [
  { name: "Jumeirah", share: 31, visits: 10 },
  { name: "Al Quoz", share: 25, visits: 8 },
  { name: "Marina and JBR", share: 19, visits: 6 },
  { name: "Downtown and DIFC", share: 16, visits: 5 },
  { name: "Elsewhere", share: 9, visits: 3 },
] as const;

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
  onStartPlan: () => void;
}) {
  const [placeFilter, setPlaceFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadVisitId, setUploadVisitId] = useState<string>(VISITS[0].id);
  const [privacy, setPrivacy] = useState("Friends");
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

  if (view === "discover") {
    return (
      <section className="demo-view" aria-labelledby="discover-title">
        <header className="demo-view__header">
          <div><p className="home-section-kicker">Discover Dubai</p><h1 id="discover-title">Places worth considering.</h1></div>
          <p>Real context from your circle, alongside the details that decide whether a place works tonight.</p>
        </header>

        <PlaceLinkImporter demoMode />

        <DemoPlanningTools view="discover" onStartPlan={onStartPlan} />

        <div className="demo-discover-tools">
          <label><span>Search places</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Area, place or category" /></label>
          <div className="demo-filter-tabs" aria-label="Filter places">
            {["All", "Dinner", "Beach club", "Sports", "Escape"].map((filter) => (
              <button key={filter} type="button" onClick={() => setPlaceFilter(filter)} aria-pressed={placeFilter === filter}>{filter}</button>
            ))}
          </div>
        </div>

        {visiblePlaces.length ? (
          <div className="demo-place-grid">
            {visiblePlaces.map((place) => (
              <article key={place.name} className="demo-place-card">
                <div className="demo-place-card__image"><Image src={place.image} alt={`Community visit at ${place.name}`} fill sizes="(max-width: 700px) 100vw, 50vw" /></div>
                <div className="demo-place-card__body">
                  <div className="demo-place-card__meta"><span>{place.category}</span><span>{place.rating} / 5</span></div>
                  <h2>{place.name}</h2><p className="demo-place-card__area">{place.area} · {place.price}</p>
                  <p>{place.note}</p><p className="demo-place-card__context">{place.friendNote}</p>
                  <button type="button" onClick={onStartPlan}>Start a vote with this place</button>
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
          <div><p className="home-section-kicker">Your city log</p><h1 id="been-title">32 places, properly remembered.</h1></div>
          <div className="demo-account-stats"><span><strong>18</strong> this year</span><span><strong>6</strong> weekend streak</span><span><strong>4.7</strong> average</span><span><strong>86</strong> photos</span></div>
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
            <div><input id="collection-name" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createCollection(); } }} placeholder="Tokyo food list, date nights…" maxLength={40} /><button type="button" onClick={createCollection} disabled={!newCollectionName.trim()}>Create</button></div>
          </div>
        </div>

        <div className="demo-visit-grid">
          {visibleVisits.map((visit, index) => (
            <article key={visit.place.name} className={`demo-visit ${index === 0 ? "demo-visit--featured" : ""}`}>
              <div className="demo-visit__image"><Image src={visit.place.image} alt={`Photo from ${visit.place.name}`} fill sizes="(max-width: 700px) 100vw, 50vw" /></div>
              <div className="demo-visit__content">
                <div className="demo-visit__top"><span>{visit.date}</span><strong>{visit.score} / 5</strong></div>
                <h2>{visit.place.name}</h2><p className="demo-place-card__area">{visit.place.area}</p><p>{visit.note}</p>
                <div className="demo-visit__people"><FaceStack people={visit.people} /><span>Went with {visit.people.length} friends</span></div>
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
        <DemoPlanningTools view="been" onStartPlan={onStartPlan} />
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

        <div className="demo-friend-layout">
          <div className="demo-friend-list">
            {FRIENDS.map((friend) => (
              <article key={friend.name} className="demo-friend-row">
                <span className="demo-friend-avatar" aria-hidden="true">{friend.initials}</span>
                <div><h2>{friend.name}</h2><p>{friend.note}</p><small>Last together · {friend.last}</small></div>
                <div className="demo-friend-row__numbers"><strong>{friend.match}%</strong><span>taste match</span><small>{friend.shared} shared visits</small></div>
                <button type="button" onClick={onStartPlan}>Plan together</button>
              </article>
            ))}
          </div>
          <aside className="demo-shared-card">
            <p className="home-section-kicker">Your regular four</p><FaceStack people={["S", "Z", "M", "O"]} />
            <h2>Friday crew</h2><p>26 plans · 19 places · usually choose late dinners and sport.</p>
            <div><span>Next suggestion</span><strong>Dinner near Al Quoz, then padel</strong></div>
          </aside>
        </div>
        <DemoPlanningTools view="friends" onStartPlan={onStartPlan} />
      </section>
    );
  }

  return (
    <section className="demo-view" aria-labelledby="profile-title">
      <header className="demo-profile-head">
        <span className="demo-profile-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
        <div><p className="home-section-kicker">Demo account</p><h1 id="profile-title">{name}</h1><p>Dubai · planning since March 2026</p></div>
      </header>

      <div className="demo-profile-stats"><span><strong>32</strong> places</span><span><strong>47</strong> plans</span><span><strong>18</strong> friends</span><span><strong>86</strong> photos</span></div>

      <section className="demo-city-pattern" aria-labelledby="city-pattern-title">
        <div className="demo-city-pattern__lead">
          <p className="home-section-kicker">Your Dubai</p>
          <h2 id="city-pattern-title">Jumeirah is 31% of your city.</h2>
          <p>You have gone out six weekends in a row. Your current best is nine.</p>
          <div><span><strong>6</strong> current streak</span><span><strong>9</strong> personal best</span></div>
        </div>
        <div className="demo-area-list">
          {CITY_AREAS.map((area) => (
            <div key={area.name}>
              <div><span>{area.name}</span><strong>{area.share}%</strong></div>
              <progress value={area.share} max="100" aria-label={`${area.name}, ${area.share}% of visits`} />
              <small>{area.visits} places</small>
            </div>
          ))}
        </div>
      </section>

      <div className="demo-profile-grid">
        <section><p className="home-section-kicker">Taste profile</p><h2>What you usually choose</h2><div className="demo-taste-list"><span>Late dinner</span><span>Beach clubs</span><span>Padel</span><span>Arts & culture</span><span>Quiet cafes</span></div><p>Usually AED 150–350 · Dubai Marina, Al Quoz and Jumeirah · prefers groups of 3–6.</p></section>
        <section><p className="home-section-kicker">Photo privacy</p><h2>Who sees your visit photos?</h2><div className="demo-privacy-options">{["Only me", "Friends", "Community"].map((option) => <button key={option} type="button" onClick={() => setPrivacy(option)} aria-pressed={privacy === option}>{option}<small>{option === "Friends" ? "Recommended" : option === "Only me" ? "Private archive" : "Helps everyone"}</small></button>)}</div></section>
      </div>

      <DemoPlanningTools view="profile" onStartPlan={onStartPlan} />

      <section className="demo-photo-strip"><div><p className="home-section-kicker">Recent photos</p><h2>Your July in Dubai</h2></div>{PLACES.map((place) => <span key={place.name}><Image src={place.image} alt={`From ${place.name}`} fill sizes="160px" /></span>)}</section>
    </section>
  );
}
