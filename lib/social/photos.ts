// Visit photos: the private `visit-photos` bucket and the rows pointing at it.

import type { SpotVisibility } from "../types";
import { getSupabase } from "../supabase";
import type { Db } from "./shared";

export const PHOTO_BUCKET = "visit-photos";

/**
 * Remove photo files from storage, and prove they are gone. True only when
 * every path is confirmed absent.
 *
 * `storage.remove` reports what it removed. A path it doesn't report is
 * either already gone (a retry after a half-finished delete -- fine) or was
 * refused by the storage policy, which returns an empty result with NO
 * error. Only a listing tells those apart, so each unreported path is
 * looked up. Must run while the photo row still exists: reading a file is
 * gated on its visit_photos row.
 */
export async function removePhotoFiles(paths: string[], db: Db): Promise<boolean> {
  if (paths.length === 0) return true;
  const { data, error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) return false;
  const reported = new Set((data ?? []).map((object) => object.name));
  for (const path of paths.filter((p) => !reported.has(p))) {
    const slash = path.lastIndexOf("/");
    const folder = path.slice(0, slash);
    const file = path.slice(slash + 1);
    const { data: listed, error: listError } = await db.storage.from(PHOTO_BUCKET).list(folder, { search: file });
    if (listError || (listed ?? []).some((entry) => entry.name === file)) return false;
  }
  return true;
}

/**
 * Delete one photo: the FILE first, then the row. If the file can't be
 * removed, stop and keep the row, so nothing is orphaned and a retry
 * converges (removing an already-removed file is fine). `.select()` on the
 * row delete because a refused delete touches 0 rows with no error.
 */
export async function deleteVisitPhoto(
  photo: { id: string; storage_path: string },
  db: Db = getSupabase(),
): Promise<boolean> {
  if (!(await removePhotoFiles([photo.storage_path], db))) return false;
  const { data, error } = await db.from("visit_photos").delete().eq("id", photo.id).select("id");
  return !error && (data?.length ?? 0) > 0;
}

export interface VisitPhotoView {
  id: string;
  visit_id: string;
  /** Needed to delete the file; the bucket is private, so it never renders. */
  storage_path: string;
  url: string | null;
  caption: string | null;
  visibility: SpotVisibility;
  created_at: string;
}

/**
 * This person's own visit photos with a short-lived signed URL for each —
 * the `visit-photos` bucket is private, so a bare storage_path never renders.
 * `url` is null when signing fails (RLS denied it, or the object is gone);
 * callers show the tile without an image rather than a broken one.
 */
export async function getVisitPhotos(
  personId: string,
  db: Db = getSupabase(),
): Promise<VisitPhotoView[]> {
  const { data, error } = await db
    .from("visit_photos")
    .select("id, visit_id, storage_path, caption, visibility, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as unknown as {
    id: string;
    visit_id: string;
    storage_path: string;
    caption: string | null;
    visibility: SpotVisibility;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const { data: signed } = await db.storage
    .from("visit-photos")
    .createSignedUrls(rows.map((r) => r.storage_path), 3600);
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]),
  );

  return rows.map((r) => ({
    id: r.id,
    visit_id: r.visit_id,
    storage_path: r.storage_path,
    url: urlByPath.get(r.storage_path) ?? null,
    caption: r.caption,
    visibility: r.visibility,
    created_at: r.created_at,
  }));
}

/**
 * Upload one photo for a visit: file goes to the private bucket under the
 * signed-in user's own folder (the only path `upload own visit photos`
 * grants), then the row that makes it visible per `visibility`. The row
 * insert is rolled back with a best-effort delete if it fails, so a photo
 * is never orphaned in storage with nothing pointing at it.
 */
export async function uploadVisitPhoto(
  {
    personId,
    visitId,
    file,
    caption,
    visibility,
  }: {
    personId: string;
    visitId: string;
    file: File;
    caption?: string;
    visibility: SpotVisibility;
  },
  db: Db = getSupabase(),
): Promise<boolean> {
  const { data: auth } = await db.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return false;

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from("visit-photos")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return false;

  const { error } = await db.from("visit_photos").insert({
    visit_id: visitId,
    person_id: personId,
    storage_path: path,
    caption: caption?.trim().slice(0, 160) || null,
    visibility,
  });
  if (error) {
    await db.storage.from("visit-photos").remove([path]);
    return false;
  }
  return true;
}
