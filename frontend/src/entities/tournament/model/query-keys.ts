// Builds the React Query cache key for one viewer's tournament snapshot.
export function buildTournamentSnapshotKey(code: string, guestId?: string) {
  return ["tournament-snapshot", code.trim().toUpperCase(), guestId?.trim() ?? ""] as const;
}

// Builds the React Query cache key for the current session's active-tournament lookup.
export function buildActiveTournamentKey() {
  return ["active-tournament"] as const;
}

// Canonical cache key for the home-screen public waiting-room list.
export const publicTournamentListQueryKey = ["public-tournament-list"] as const;
