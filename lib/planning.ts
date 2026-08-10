/** Shared planning-domain shapes used by the local demo and the Supabase app.
 *  The demo deliberately uses the same lifecycle vocabulary as persisted plans
 *  so it can be moved to an authenticated adapter without a UI rewrite.
 */
export type PlanLifecycleStage = "idea" | "voting" | "confirmed" | "completed";
export type RsvpChoice = "coming" | "maybe" | "no";

export interface PlanningCircle {
  id: string;
  name: string;
  memberIds: string[];
}

export type MoodboardItemKind = "place" | "link" | "photo";

export interface MoodboardItem {
  id: string;
  label: string;
  kind: MoodboardItemKind;
  note: string;
  imageDataUrl?: string;
  sourceUrl?: string;
}

export interface Moodboard {
  id: string;
  name: string;
  theme: string;
  items: MoodboardItem[];
  visibility: "private" | "friends" | "shared";
}

export interface LocalPlan {
  id: string;
  title: string;
  category: string;
  stage: PlanLifecycleStage;
  circleId: string | null;
  selectedPlace: string | null;
  eventTime: string | null;
  rsvp: RsvpChoice;
  reminderAt: string | null;
  memoryNote: string;
  memoryPhotoDataUrl?: string;
}

export const PLANNING_STORAGE_VERSION = 1;

export function readPlanningState<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || !("data" in parsed)) return fallback;
    const envelope = parsed as { version: number; data: T };
    return envelope.version === PLANNING_STORAGE_VERSION ? envelope.data : fallback;
  } catch {
    return fallback;
  }
}

export function writePlanningState<T>(key: string, data: T): void {
  window.localStorage.setItem(key, JSON.stringify({ version: PLANNING_STORAGE_VERSION, data }));
}
