"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { WallItem } from "@/components/PhotoWall";
import { validateImageFile } from "@/lib/upload";
import {
  addVisitToCollection,
  createVisitCollection,
  deleteVisitCollection,
  removeVisitFromCollection,
  uploadVisitPhoto,
  type VisitCollectionView,
  type VisitPhotoView,
} from "@/lib/social";
import type { ProfileVisit } from "@/lib/types";

// Called from AccountViews, not BeenTab, so collections and a half-finished
// upload survive a tab switch (see the collections comment below).
export default function useBeenCollections({
  personId,
  visits,
  photos,
  initialCollections,
}: {
  personId: string | null;
  visits: ProfileVisit[];
  photos: VisitPhotoView[];
  initialCollections: VisitCollectionView[];
}) {
  const router = useRouter();

  // Collections mutate locally on a successful write rather than refetching —
  // same pattern DemoAccountViews used for its localStorage-backed version,
  // now backed by real `visit_collections`/`visit_collection_items` rows.
  // AccountViews stays mounted across a tab switch (the same instance
  // renders all four views), so `initialCollections` is effectively fixed
  // for the component's lifetime — no need to re-sync it from an effect.
  const [collections, setCollections] = useState(initialCollections);
  const [collectionDeleteArmed, setCollectionDeleteArmed] = useState(false);
  const [collectionPending, setCollectionPending] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [collectionUndo, setCollectionUndo] = useState<{ message: string; restore: () => Promise<boolean> } | null>(null);
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

  // Nothing leaves the screen until the server confirms the row went.
  async function removeCollection(collectionId: string) {
    setCollectionPending(true);
    setCollectionError(null);
    const ok = await deleteVisitCollection(collectionId);
    setCollectionPending(false);
    setCollectionDeleteArmed(false);
    if (!ok) { setCollectionError("Couldn’t delete that collection. Try again."); return; }
    setCollections((current) => current.filter((c) => c.id !== collectionId));
    setActiveCollection("all");
  }

  async function removeFromActiveCollection(visitId: string) {
    if (!activeFolder) return;
    const folder = activeFolder;
    const ok = await removeVisitFromCollection(folder.id, visitId);
    if (!ok) { setCollectionError(`Couldn’t remove that visit from ${folder.name}. Try again.`); return; }
    setCollectionError(null);
    setCollections((current) => current.map((c) => c.id === folder.id
      ? { ...c, visitIds: c.visitIds.filter((id) => id !== visitId) }
      : c));
    const place = visits.find((v) => v.id === visitId)?.spot?.name ?? "That visit";
    setCollectionUndo({
      message: `${place} removed from ${folder.name}.`,
      restore: async () => {
        const restored = await addVisitToCollection(folder.id, visitId);
        if (restored) {
          setCollections((current) => current.map((c) => c.id === folder.id
            ? { ...c, visitIds: Array.from(new Set([...c.visitIds, visitId])) }
            : c));
        }
        return restored;
      },
    });
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

  return {
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
  };
}
