// What the home screens show. The app's five tabs are shared by the
// signed-in nav, the landing nav (which links each into /demo) and the pages
// that read ?view= on first load.
export const APP_VIEWS = ["plan", "discover", "been", "friends", "profile"] as const;
export type AppView = (typeof APP_VIEWS)[number];

export const VIEW_LABELS: Record<AppView, string> = {
  plan: "Plan",
  discover: "Discover",
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
