"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import PlaceLinkImporter from "@/components/PlaceLinkImporter";
import DemoFolders from "@/components/demo/DemoFolders";
import DemoLeaderboard from "@/components/demo/DemoLeaderboard";
import DemoCrewMatch from "@/components/demo/DemoCrewMatch";
import DemoRanking from "@/components/demo/DemoRanking";
import DubaiExploredCard from "@/components/been/DubaiExploredCard";
import { dubaiExplored } from "@/lib/dubai-explored";
import PersonalityCard from "@/components/profile/PersonalityCard";
import { planPersonality } from "@/lib/personality";
import type { Spot } from "@/lib/types";
import DemoMoodboards from "@/components/demo/DemoMoodboards";
import DemoDiscover from "@/components/demo/DemoDiscover";
import { DEFAULT_COLLECTIONS, FRIENDS, STATS, VISITS, dayLabel, demoPersonalityVisits, demoVisitedSpots, firstLetter, type DemoCollection } from "@/components/demo/demoFixtures";
import { friendPlanPrefill, type PlanPrefill } from "@/lib/board-plan";
import { validateImageFile } from "@/lib/upload";
import { initialsOf } from "@/lib/avatar";

type AccountView = "discover" | "saved" | "been" | "friends" | "profile";


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
  spots,
  catalogue,
  onStartPlan,
}: {
  view: AccountView;
  name: string;
  /** The real catalogue: "Your Dubai" totals are real, the sample visits are not. */
  spots: Spot[];
  /** Discover's catalogue, with coordinates for its map; the wall sample otherwise. */
  catalogue?: Spot[];
  /** Opens the composer; a prefill sets it up the way the button said. */
  onStartPlan: (prefill?: PlanPrefill) => void;
}) {
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
        <DemoFolders />
        <DemoMoodboards onPlan={onStartPlan} />
        <PlaceLinkImporter demoMode />
      </section>
    );
  }

  if (view === "discover") return <DemoDiscover spots={catalogue ?? spots} />;

  if (view === "been") {
    return (
      <section className="demo-view" aria-labelledby="been-title">
        <header className="demo-view__header demo-view__header--split">
          <div><h1 id="been-title">{STATS.places} places, properly remembered.</h1></div>
          <div className="demo-account-stats"><span><strong>{STATS.inYear}</strong> in {STATS.year}</span><span><strong>{STATS.average}</strong> average</span><span><strong>{VISITS.length}</strong> photos</span></div>
        </header>

        <DemoRanking />
        <DubaiExploredCard sample explored={dubaiExplored(demoVisitedSpots(spots), spots)} />

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
                    // Filing a visit is an occasional chore, so it waits behind one line.
                    <details className="demo-visit__collect">
                      <summary>Add to collection</summary>
                      <label><span className="sr-only">Collection</span><select value="" onChange={(event) => addVisitToCollection(visit.id, event.target.value)}><option value="">Choose…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
                    </details>
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
          <button type="button" className="demo-primary-action" onClick={() => onStartPlan()}>Start a plan</button>
        </header>

        <div className="demo-friend-layout">
          <div className="demo-friend-list">
            {FRIENDS.map((friend) => (
              <article key={friend.name} className="demo-friend-row">
                <span className="demo-friend-avatar" aria-hidden="true">{initialsOf(friend.name)}</span>
                <div><h2>{friend.name}</h2><p>{friend.note}</p>{friend.last && <small>Last together at {friend.last}</small>}</div>
                <div className="demo-friend-row__numbers"><strong>{friend.outings}</strong><span>outings</span></div>
                <button type="button" onClick={() => onStartPlan(friendPlanPrefill(friend.name, `${friend.name}:${Date.now()}`))}>Plan together</button>
              </article>
            ))}
          </div>
        </div>

        {/* The people come first; the games around them fold away. */}
        <DemoLeaderboard />
        <DemoCrewMatch />
      </section>
    );
  }

  return (
    <section className="demo-view" aria-labelledby="profile-title">
      <header className="demo-profile-head">
        <span className="demo-profile-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div><h1 id="profile-title">{name}</h1><p>Dubai · planning since March 2026</p></div>
      </header>

      <PersonalityCard sample name={name} personality={planPersonality(demoPersonalityVisits(spots))} />

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
