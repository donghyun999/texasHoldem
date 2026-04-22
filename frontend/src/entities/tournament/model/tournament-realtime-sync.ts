import type { IMessage } from "@stomp/stompjs";
import type { QueryClient } from "@tanstack/react-query";
import { syncPublicTournamentListCache } from "@/entities/tournament/model/lobby-cache";
import { buildActiveTournamentKey, buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import { describeSelfHandLabel } from "@/entities/tournament/model/self-hand-label";
import type { ActiveTournamentSession, TournamentEvent, TournamentSnapshot } from "@/entities/tournament/model/types";

function areSameActiveTournamentSession(
  left: ActiveTournamentSession | null | undefined,
  right: ActiveTournamentSession | null,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.guestId === right.guestId &&
    left.tournamentCode === right.tournamentCode &&
    left.roomName === right.roomName &&
    left.status === right.status
  );
}

// Parses one broker payload into the shared tournament event contract.
export function parseTournamentEvent(message: IMessage) {
  try {
    return JSON.parse(message.body) as TournamentEvent;
  } catch {
    return null;
  }
}

export function resolveSnapshotViewerGuestId(snapshot: TournamentSnapshot | null, guestId: string) {
  if (!snapshot) {
    return guestId.trim();
  }

  const seatedGuestIds = new Set(snapshot.players.map((player) => player.guestId));
  const viewerGuestId = snapshot.viewerGuestId?.trim() ?? "";
  if (viewerGuestId && seatedGuestIds.has(viewerGuestId)) {
    return viewerGuestId;
  }

  const localGuestId = guestId.trim();
  if (localGuestId && seatedGuestIds.has(localGuestId)) {
    return localGuestId;
  }

  return viewerGuestId || localGuestId;
}

// Finds the local browser player in the latest tournament snapshot.
export function findCurrentPlayer(snapshot: TournamentSnapshot | null, guestId: string) {
  if (!snapshot) {
    return null;
  }

  const resolvedViewerGuestId = resolveSnapshotViewerGuestId(snapshot, guestId);
  return snapshot.players.find((player) => player.guestId === resolvedViewerGuestId) ?? null;
}

// Mirrors the waiting-room leave result locally while the REST fallback completes.
export function buildWaitingLeaveSnapshot(snapshot: TournamentSnapshot, guestId: string) {
  const leavingGuestId = resolveSnapshotViewerGuestId(snapshot, guestId);
  const leavingPlayer = snapshot.players.find((player) => player.guestId === leavingGuestId);
  if (!leavingPlayer) {
    return snapshot;
  }

  return {
    ...snapshot,
    players: snapshot.players.filter((player) => player.guestId !== leavingGuestId),
    tableMessage: `${leavingPlayer.nickname} left the waiting room.`,
  };
}

// Rejects older snapshots that arrive after a newer REST or websocket update.
export function isStaleSnapshot(currentSnapshot: TournamentSnapshot | null, nextSnapshot: TournamentSnapshot) {
  if (!currentSnapshot || currentSnapshot.code !== nextSnapshot.code) {
    return false;
  }

  if (nextSnapshot.handNumber < currentSnapshot.handNumber) {
    return true;
  }

  return (
    nextSnapshot.handNumber === currentSnapshot.handNumber &&
    nextSnapshot.stateVersion > 0 &&
    currentSnapshot.stateVersion > 0 &&
    nextSnapshot.stateVersion < currentSnapshot.stateVersion
  );
}

function buildCurrentBet(snapshot: TournamentSnapshot) {
  return snapshot.players.reduce((largestContribution, player) => Math.max(largestContribution, player.roundContribution), 0);
}

function buildViewerChipsToCall(snapshot: TournamentSnapshot, viewerGuestId: string | null | undefined) {
  if (!viewerGuestId) {
    return 0;
  }

  const viewerPlayer = snapshot.players.find((player) => player.guestId === viewerGuestId);
  if (!viewerPlayer) {
    return 0;
  }

  return Math.max(0, buildCurrentBet(snapshot) - viewerPlayer.roundContribution);
}

function buildViewerMinimumRaiseTo(currentSnapshot: TournamentSnapshot, nextSnapshot: TournamentSnapshot) {
  const bigBlind = Math.max(0, nextSnapshot.currentLevel.bigBlind);
  const previousCurrentBet = buildCurrentBet(currentSnapshot);
  const nextCurrentBet = buildCurrentBet(nextSnapshot);
  if (nextCurrentBet <= 0) {
    return bigBlind;
  }

  const previousRaiseIncrement =
    previousCurrentBet > 0
      ? Math.max(bigBlind, currentSnapshot.minimumRaiseTo - previousCurrentBet)
      : Math.max(bigBlind, currentSnapshot.minimumRaiseTo || bigBlind);
  if (nextCurrentBet <= previousCurrentBet) {
    return nextCurrentBet + previousRaiseIncrement;
  }

  const observedIncrease = nextCurrentBet - previousCurrentBet;
  const raisingPlayer = nextSnapshot.players.find((player) => {
    if (player.roundContribution !== nextCurrentBet) {
      return false;
    }

    const previousPlayer = currentSnapshot.players.find((candidate) => candidate.guestId === player.guestId);
    return (previousPlayer?.roundContribution ?? 0) < player.roundContribution;
  });
  const isShortAllInRaise =
    !!raisingPlayer && raisingPlayer.status === "ALL_IN" && observedIncrease < previousRaiseIncrement;
  const raiseIncrement = isShortAllInRaise ? previousRaiseIncrement : Math.max(previousRaiseIncrement, observedIncrease);
  return nextCurrentBet + raiseIncrement;
}

// Preserves the viewer's own hole cards only across shared websocket snapshots for the same hand.
export function mergeSnapshotForViewer(
  currentSnapshot: TournamentSnapshot | null,
  nextSnapshot: TournamentSnapshot,
): TournamentSnapshot | null {
  if (isStaleSnapshot(currentSnapshot, nextSnapshot)) {
    return null;
  }

  if (nextSnapshot.selfHoleCards.length > 0) {
    return nextSnapshot;
  }

  if (nextSnapshot.snapshotAudience === "VIEWER") {
    return nextSnapshot;
  }

  if (!currentSnapshot || currentSnapshot.selfHoleCards.length === 0) {
    return nextSnapshot;
  }

  if (nextSnapshot.status === "WAITING") {
    return {
      ...nextSnapshot,
      chipsToCall: 0,
      selfHandLabel: null,
      selfHoleCards: [],
    };
  }

  if (currentSnapshot.handNumber <= 0 || nextSnapshot.handNumber <= 0) {
    return nextSnapshot;
  }

  if (currentSnapshot.handNumber !== nextSnapshot.handNumber) {
    return nextSnapshot;
  }

  return {
    ...nextSnapshot,
    chipsToCall: buildViewerChipsToCall(nextSnapshot, currentSnapshot.viewerGuestId),
    minimumRaiseTo: buildViewerMinimumRaiseTo(currentSnapshot, nextSnapshot),
    snapshotAudience: "VIEWER",
    viewerGuestId: currentSnapshot.viewerGuestId,
    viewerHoleCardsIncluded: currentSnapshot.viewerHoleCardsIncluded,
    selfHandLabel: describeSelfHandLabel(nextSnapshot.boardCards, currentSnapshot.selfHoleCards),
    selfHoleCards: currentSnapshot.selfHoleCards,
  };
}

// Keeps the active-tournament cache aligned with the latest snapshot for one guest.
export function syncActiveTournamentSessionCache(
  queryClient: QueryClient,
  guestId: string,
  snapshot: TournamentSnapshot | null,
) {
  const resolvedViewerGuestId = resolveSnapshotViewerGuestId(snapshot, guestId);
  if (!resolvedViewerGuestId) {
    return;
  }

  const localPlayer = findCurrentPlayer(snapshot, resolvedViewerGuestId);
  const activeTournament: ActiveTournamentSession | null =
    snapshot && localPlayer && snapshot.status !== "FINISHED"
      ? {
          guestId: resolvedViewerGuestId,
          tournamentCode: snapshot.code,
          roomName: snapshot.roomName,
          status: snapshot.status,
        }
      : null;

  const currentActiveTournament = queryClient.getQueryData<ActiveTournamentSession | null>(buildActiveTournamentKey());
  if (areSameActiveTournamentSession(currentActiveTournament, activeTournament)) {
    return;
  }

  queryClient.setQueryData(buildActiveTournamentKey(), activeTournament);
}

type TournamentSnapshotCacheOptions = {
  syncActiveSession?: boolean;
};

// Keeps all tournament-related caches in step with one live snapshot.
export function syncTournamentSnapshotCaches(
  queryClient: QueryClient,
  guestId: string,
  snapshot: TournamentSnapshot,
  options: TournamentSnapshotCacheOptions = {},
) {
  queryClient.setQueryData(buildTournamentSnapshotKey(snapshot.code, guestId), snapshot);
  if (options.syncActiveSession !== false) {
    syncActiveTournamentSessionCache(queryClient, guestId, snapshot);
  }
  syncPublicTournamentListCache(queryClient, snapshot);
}
