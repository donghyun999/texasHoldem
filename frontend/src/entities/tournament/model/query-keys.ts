// Builds the React Query cache key for one viewer's tournament snapshot.
export function buildTournamentSnapshotKey(code: string, guestId?: string) {
  return ["tournament-snapshot", code.trim().toUpperCase(), guestId?.trim() ?? ""] as const;
}

// Builds the React Query cache key for the current guest's active-tournament lookup.
export function buildActiveTournamentKey(guestId: string) {
  return ["active-tournament", guestId.trim()] as const;
}

// Canonical cache key for the home-screen public waiting-room list.
export const publicTournamentListQueryKey = ["public-tournament-list"] as const;
