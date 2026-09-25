// The social layer's data access: profiles, friends, visits, companions.
// Everything here runs in the browser with the current Supabase session
// (see lib/supabase.ts). Public reads remain available, while social writes
// are owner-scoped by RLS. There is no service-role key in this project and
// there must not be one.
//
// The contract the UI codes against lives in lib/types.ts:
//   PersonCard, CompanionView, ProfileVisit, Visit, Friendship.
// Call these functions rather than hand-writing select strings — the embed
// syntax and the FK disambiguation hints are fiddly and belong in one place.
//
// One setup rule: `visits.person_id` and `friendships.*` are foreign keys to
// `people`, so the authenticated profile must exist before logging a visit
// or adding a friend. /home creates it on first view (lib/own-profile.ts) and
// AuthProfileBridge caches the result locally.
//
// This file is the public surface only; the code lives in lib/social/ by
// responsibility. Import from here, not from the modules.

export { chosenEmoji, emptyRead } from "./social/shared";
export type { ListRead } from "./social/shared";
export { getPerson, getFriends, removeFriend, getPlannedWith } from "./social/people";
export type { PlannedWith } from "./social/people";
export { createFriendInvite, previewFriendInvite, redeemFriendInvite } from "./social/invites";
export type { CreateInviteResult, InvitePreview, RedeemResult } from "./social/invites";
export { logVisit, updateVisit, deleteVisit, untagCompanion, retagCompanion } from "./social/visits";
export type { CompanionInput, LogVisitInput } from "./social/visits";
export { getProfileVisits } from "./social/visit-feed";
export { deleteVisitPhoto, getVisitPhotos, uploadVisitPhoto } from "./social/photos";
export type { VisitPhotoView } from "./social/photos";
export {
  getVisitCollections,
  createVisitCollection,
  addVisitToCollection,
  removeVisitFromCollection,
  deleteVisitCollection,
} from "./social/collections";
export type { VisitCollectionView } from "./social/collections";
export { getWrappedSummary } from "./social/wrapped";
export {
  getMoodboards,
  getBoardSpots,
  createMoodboard,
  renameMoodboard,
  deleteMoodboard,
  addMoodboardItem,
  removeMoodboardItem,
  restoreMoodboardItem,
  boardItemRow,
  placeSourcePath,
  spotIdFromItem,
  safeExternalUrl,
} from "./social/moodboards";
export type { BoardSpot, BoardWrite, MoodboardView, NewBoardItem } from "./social/moodboards";

export { aggregateWrappedSummary, dubaiMonthWindow } from "./wrapped";
export type {
  WrappedMonthWindow,
  WrappedRatingRow,
  WrappedVisitRow,
} from "./wrapped";
