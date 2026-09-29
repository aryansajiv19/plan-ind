// What the home screens show. Every view reads from ?view=; the tab row
// (signed-in nav, landing nav, the phone's bottom bar) shows all but
// Profile, which opens from the avatar (owner, 2026-09-29: "Saved" gathers
// folders, boards and saved links that used to crowd Discover).
export const APP_VIEWS = ["plan", "discover", "saved", "been", "friends", "profile"] as const;
export type AppView = (typeof APP_VIEWS)[number];
export const TAB_VIEWS: readonly AppView[] = APP_VIEWS.filter((view) => view !== "profile");

export const VIEW_LABELS: Record<AppView, string> = {
  plan: "Plan",
  discover: "Discover",
  saved: "Saved",
  been: "Been",
  friends: "Friends",
  profile: "Profile",
};

export function viewFromParam(value: string | null | undefined): AppView {
  return APP_VIEWS.includes(value as AppView) ? (value as AppView) : "plan";
}

/** Tiles on the "Dubai, right now" wall (landing and /demo). */
export const WALL_SIZE = 18;
/** P28: the cached curated pool the landing picks its wall from, per request. */
export const WALL_POOL = 80;
