// Builds the shared React Query cache key for one tournament snapshot.
export function buildTournamentSnapshotKey(code: string) {
  return ["tournament-snapshot", code.trim().toUpperCase()] as const;
}
