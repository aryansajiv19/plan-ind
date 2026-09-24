"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import PhotoWall from "@/components/PhotoWall";
import ManageVisit from "@/components/ManageVisit";
import UndoBar from "@/components/UndoBar";
import UnavailableState from "@/components/account/UnavailableState";
import type useBeenCollections from "@/components/account/useBeenCollections";
import type { VisitStats } from "@/components/account/useVisitStats";
import type { VisitPhotoView } from "@/lib/social";
import type { ProfileVisit } from "@/lib/types";

export default function BeenTab({
  personId,
  visits,
  photos,
  visitsUnavailable,
  stats,
  been,
  onStartPlan,
}: {
  personId: string | null;
  visits: ProfileVisit[];
  photos: VisitPhotoView[];
  visitsUnavailable: boolean;
  stats: VisitStats;
  been: ReturnType<typeof useBeenCollections>;
  onStartPlan: () => void;
}) {
  const router = useRouter();
  const {
    collections,
    collectionDeleteArmed,
    setCollectionDeleteArmed,
    collectionPending,
    collectionError,
    collectionUndo,
    setCollectionUndo,
    activeCollection,
    setActiveCollection,
    newCollectionName,
    setNewCollectionName,
    uploadFile,
    uploadPreview,
    setUploadVisitId,
    uploadVisibility,
    setUploadVisibility,
    uploadError,
    uploading,
    effectiveUploadVisitId,
    activeFolder,
    visibleVisits,
    wallItems,
    createCollection,
    addToCollection,
    removeCollection,
    removeFromActiveCollection,
    handleUploadChange,
    submitPhoto,
  } = been;
  return (
    <section className="demo-view" aria-labelledby="been-title">
      <header className="demo-view__header demo-view__header--split">
        <div>
          <p className="home-section-kicker">Your city log</p>
          <h1 id="been-title">{stats.places ? `${stats.places} ${stats.places === 1 ? "place" : "places"}, properly remembered.` : "Your city log starts here."}</h1>
        </div>
        {stats.total > 0 && (
          <div className="demo-account-stats">
            <span><strong>{stats.total}</strong> visits</span>
            <span><strong>{stats.places}</strong> places</span>
            <span><strong>{stats.fromPlans}</strong> from plans</span>
          </div>
        )}
      </header>

      {visitsUnavailable ? (
        <UnavailableState what="visits" />
      ) : visits.length === 0 ? (
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

          {personId && <ManageVisit visits={visits} photos={photos} onChanged={() => router.refresh()} />}

          {collectionUndo && <UndoBar key={collectionUndo.message} message={collectionUndo.message} onUndo={collectionUndo.restore} onDone={() => setCollectionUndo(null)} />}

          {activeFolder && personId && (
            <div className="demo-visit__collection-action manage-visit">
              {collectionDeleteArmed ? (
                <p className="manage-visit__confirm" role="group" aria-label="Confirm delete collection">
                  <span>Delete “{activeFolder.name}”? The visits in it stay in your log.</span>
                  <button type="button" disabled={collectionPending} onClick={() => void removeCollection(activeFolder.id)}>
                    {collectionPending ? "Deleting…" : "Delete collection"}
                  </button>
                  <button type="button" disabled={collectionPending} onClick={() => setCollectionDeleteArmed(false)}>Cancel</button>
                </p>
              ) : (
                <button type="button" className="manage-visit__delete" onClick={() => setCollectionDeleteArmed(true)}>
                  Delete this collection
                </button>
              )}
              {collectionError && <p role="alert" className="manage-visit__error">{collectionError}</p>}
            </div>
          )}

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
