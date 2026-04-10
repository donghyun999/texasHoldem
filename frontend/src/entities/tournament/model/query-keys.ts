// Builds the React Query cache key for one viewer's tournament snapshot.
export function buildTournamentSnapshotKey(code: string, guestId?: string) {
  return ["tournament-snapshot", code.trim().toUpperCase(), guestId?.trim() ?? ""] as const;
}
