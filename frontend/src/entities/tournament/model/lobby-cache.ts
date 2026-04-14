import type { QueryClient } from "@tanstack/react-query";
import { publicTournamentListQueryKey } from "@/entities/tournament/model/query-keys";
import type { PublicTournamentSummary, TournamentSnapshot } from "@/entities/tournament/model/types";

const SINGLE_TABLE_MAX_PLAYERS = 6;

// Keeps the cached public waiting-room list aligned with the latest tournament snapshot.
export function syncPublicTournamentListCache(queryClient: QueryClient, snapshot: TournamentSnapshot) {
  queryClient.setQueryData(publicTournamentListQueryKey, (currentRooms: PublicTournamentSummary[] | undefined) => {
    const rooms = currentRooms ?? [];
    const existingRoom = rooms.find((room) => room.code === snapshot.code);
    const maxPlayers = existingRoom?.maxPlayers ?? SINGLE_TABLE_MAX_PLAYERS;
    const currentPlayers = snapshot.players.length;
    const ownerNickname =
      snapshot.players.find((player) => player.owner)?.nickname ?? existingRoom?.ownerNickname ?? "";
    const shouldAppear =
      snapshot.visibility === "PUBLIC" &&
      snapshot.status === "WAITING" &&
      currentPlayers > 0 &&
      currentPlayers < maxPlayers;

    if (!shouldAppear) {
      return rooms.filter((room) => room.code !== snapshot.code);
    }

    const nextRoom: PublicTournamentSummary = {
      code: snapshot.code,
      visibility: snapshot.visibility,
      status: snapshot.status,
      currentPlayers,
      maxPlayers,
      ownerNickname,
    };

    if (!existingRoom) {
      return [nextRoom, ...rooms];
    }

    return rooms.map((room) => (room.code === snapshot.code ? nextRoom : room));
  });
}
