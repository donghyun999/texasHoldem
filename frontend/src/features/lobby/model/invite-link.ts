import type { TournamentVisibility } from "@/entities/tournament/model/types";

export function buildTournamentInviteUrl(code: string, visibility: TournamentVisibility, password?: string | null) {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedPassword = password?.trim() ?? "";
  const inviteUrl =
    typeof window === "undefined"
      ? new URL(`http://localhost/tournaments/${normalizedCode}`)
      : new URL(`/tournaments/${normalizedCode}`, window.location.origin);

  inviteUrl.searchParams.set("join", "1");
  if (visibility === "PRIVATE" && normalizedPassword) {
    inviteUrl.searchParams.set("password", normalizedPassword);
  }

  return inviteUrl.toString();
}
