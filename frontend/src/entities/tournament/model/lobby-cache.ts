import type { QueryClient } from "@tanstack/react-query";
import { publicTournamentListQueryKey } from "@/entities/tournament/model/query-keys";
import type { PublicTournamentSummary, TournamentSnapshot } from "@/entities/tournament/model/types";
import { TOURNAMENT_MAX_SEATS } from "@/features/table/model/tournament-table-layout";

const SINGLE_TABLE_MAX_PLAYERS = TOURNAMENT_MAX_SEATS;

function areSamePublicRoom(left: PublicTournamentSummary | undefined, right: PublicTournamentSummary) {
  if (!left) {
    return false;
  }

  return (
    left.code === right.code &&
    left.roomName === right.roomName &&
    left.visibility === right.visibility &&
    left.status === right.status &&
    left.currentPlayers === right.currentPlayers &&
    left.maxPlayers === right.maxPlayers &&
    left.ownerNickname === right.ownerNickname
  );
}

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
      snapshot.status === "WAITING" && currentPlayers > 0 && currentPlayers < maxPlayers;

    if (!shouldAppear) {
      if (!existingRoom) {
        return rooms;
      }

      return rooms.filter((room) => room.code !== snapshot.code);
    }

    const nextRoom: PublicTournamentSummary = {
      code: snapshot.code,
      roomName: snapshot.roomName,
      visibility: snapshot.visibility,
      status: snapshot.status,
      currentPlayers,
      maxPlayers,
      ownerNickname,
    };

    if (!existingRoom) {
      return [nextRoom, ...rooms];
    }

    if (areSamePublicRoom(existingRoom, nextRoom)) {
      return rooms;
    }

    return rooms.map((room) => (room.code === snapshot.code ? nextRoom : room));
  });
}
