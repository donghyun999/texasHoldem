import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Client, IMessage } from "@stomp/stompjs";
import { useQueryClient } from "@tanstack/react-query";
import { syncPublicTournamentListCache } from "@/entities/tournament/model/lobby-cache";
import { buildActiveTournamentKey, buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import type { ActiveTournamentSession, TournamentEvent, TournamentSnapshot } from "@/entities/tournament/model/types";
import { disconnectTournamentPlayer, getTournamentSnapshot } from "@/shared/api/http";
import {
  createTournamentClient,
  sendTournamentAction,
  sendTournamentConnection,
  sendTournamentReady,
  sendTournamentStart,
} from "@/shared/api/stomp-client";

type TournamentRealtimeState = "IDLE" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

// Parses one broker message into the shared tournament event contract.
function parseTournamentEvent(message: IMessage) {
  try {
    return JSON.parse(message.body) as TournamentEvent;
  } catch {
    return null;
  }
}

// Finds the local browser player in the latest tournament snapshot.
function findCurrentPlayer(snapshot: TournamentSnapshot | null, guestId: string) {
  if (!snapshot) {
    return null;
  }

  return snapshot.players.find((player) => player.guestId === guestId) ?? null;
}

// Mirrors the waiting-room leave result locally while the REST fallback completes.
function buildWaitingLeaveSnapshot(snapshot: TournamentSnapshot, guestId: string) {
  const leavingPlayer = snapshot.players.find((player) => player.guestId === guestId);
  if (!leavingPlayer) {
    return snapshot;
  }

  return {
    ...snapshot,
    players: snapshot.players.filter((player) => player.guestId !== guestId),
    tableMessage: `${leavingPlayer.nickname} left the waiting room.`,
  };
}

// Rejects older snapshots that arrive after a newer REST or websocket update.
function isStaleSnapshot(currentSnapshot: TournamentSnapshot | null, nextSnapshot: TournamentSnapshot) {
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

// Preserves the viewer's own hole cards only across shared websocket snapshots for the same hand.
function mergeSnapshotForViewer(
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
    snapshotAudience: "VIEWER",
    viewerGuestId: currentSnapshot.viewerGuestId,
    viewerHoleCardsIncluded: currentSnapshot.viewerHoleCardsIncluded,
    chipsToCall: currentSnapshot.chipsToCall,
    selfHoleCards: currentSnapshot.selfHoleCards,
  };
}

// Subscribes to one tournament topic and keeps the latest snapshot hot in memory.
export function useTournamentRealtimeSnapshot(code: string, guestId: string, seedSnapshot?: TournamentSnapshot) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(seedSnapshot ?? null);
  const [realtimeState, setRealtimeState] = useState<TournamentRealtimeState>("IDLE");
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const lifecycleRef = useRef({ code: "", guestId: "", connected: false, status: "" });
  const routeExitDisconnectReadyRef = useRef(false);
  const documentExitRef = useRef(false);
  const manualReconnectRequiredRef = useRef(false);
  const normalizedCode = code.trim().toUpperCase();
  const currentPlayer = findCurrentPlayer(snapshot, guestId);

  // Keeps the latest disconnect payload ready for unload and route-exit cleanup.
  useEffect(() => {
    lifecycleRef.current = {
      code: normalizedCode,
      guestId,
      connected: !!currentPlayer?.connected,
      status: snapshot?.status ?? "",
    };
  }, [currentPlayer?.connected, guestId, normalizedCode, snapshot?.status]);

  // Clears stale viewer state when either the tournament or current guest changes.
  useEffect(() => {
    setSnapshot(seedSnapshot ?? null);
    setLastEventType(null);
    manualReconnectRequiredRef.current = false;
  }, [normalizedCode, guestId]);

  // Seeds the local snapshot once the initial REST fetch resolves for the current tournament.
  useEffect(() => {
    if (!seedSnapshot) {
      return;
    }

    setSnapshot((currentSnapshot) => currentSnapshot ?? seedSnapshot);
  }, [seedSnapshot]);

  // Keeps shared snapshot, active-tournament, and public-room caches aligned even on initial REST-only entry.
  useEffect(() => {
    if (!snapshot) {
      return;
    }

    queryClient.setQueryData(buildTournamentSnapshotKey(code, guestId), snapshot);
    syncActiveTournamentCache(snapshot);
    syncPublicTournamentListCache(queryClient, snapshot);
  }, [code, guestId, queryClient, snapshot]);

  // Keeps the active-tournament cache aligned with live snapshot ownership for the current guest.
  function syncActiveTournamentCache(nextSnapshot: TournamentSnapshot | null) {
    if (!guestId.trim()) {
      return;
    }

    const localPlayer = findCurrentPlayer(nextSnapshot, guestId);
    const activeTournament: ActiveTournamentSession | null =
      nextSnapshot && localPlayer && nextSnapshot.status !== "FINISHED"
        ? {
            guestId,
            tournamentCode: nextSnapshot.code,
            roomName: nextSnapshot.roomName,
            status: nextSnapshot.status,
          }
        : null;

    queryClient.setQueryData(buildActiveTournamentKey(guestId), activeTournament);
  }

  // Applies one tournament event from either WebSocket or REST fallback into local caches.
  function applyTournamentEvent(event: TournamentEvent) {
    const mergedSnapshot = mergeSnapshotForViewer(snapshot, event.snapshot);
    if (!mergedSnapshot) {
      return;
    }

    setSnapshot(mergedSnapshot);
    setLastEventType(event.eventType);
    queryClient.setQueryData(buildTournamentSnapshotKey(code, guestId), mergedSnapshot);
    syncActiveTournamentCache(mergedSnapshot);
    syncPublicTournamentListCache(queryClient, mergedSnapshot);
  }

  // Refreshes the current guest's personalized snapshot view when hole cards or reconnect state may change.
  const hydrateViewerSnapshot = useEffectEvent(() => {
    if (!normalizedCode || !guestId.trim()) {
      return;
    }

    void getTournamentSnapshot(normalizedCode, guestId)
      .then((viewerSnapshot) => {
        const mergedSnapshot = mergeSnapshotForViewer(snapshot, viewerSnapshot);
        if (!mergedSnapshot) {
          return;
        }

        setSnapshot(mergedSnapshot);
        queryClient.setQueryData(buildTournamentSnapshotKey(code, guestId), mergedSnapshot);
        syncActiveTournamentCache(mergedSnapshot);
        syncPublicTournamentListCache(queryClient, mergedSnapshot);
      })
      .catch(() => {
        // Keep the current live snapshot when the viewer-specific refresh fails.
      });
  });

  // Applies each subscribed broker event to local state and the shared query cache.
  const handleTournamentMessage = useEffectEvent((message: IMessage) => {
    const event = parseTournamentEvent(message);
    if (!event) {
      setRealtimeState("ERROR");
      return;
    }

    applyTournamentEvent(event);

    if (
      event.eventType === "actionApplied" ||
      event.eventType === "handStarted" ||
      event.eventType === "tournamentSnapshot" ||
      event.eventType === "playerReconnected" ||
      event.eventType === "playerReturned"
    ) {
      hydrateViewerSnapshot();
    }
  });

  // Publishes one command only when the websocket transport is ready.
  const publishWhenConnected = useEffectEvent((publisher: (client: Client, code: string, guestId: string) => void) => {
    const client = clientRef.current;
    if (!client?.connected || !normalizedCode || !guestId) {
      return false;
    }

    publisher(client, normalizedCode, guestId);
    return true;
  });

  // Owns the lifecycle of the STOMP client for one tournament code.
  useEffect(() => {
    if (!normalizedCode) {
      setRealtimeState("IDLE");
      return;
    }

    const client = createTournamentClient();
    clientRef.current = client;
    setRealtimeState("CONNECTING");
    setLastEventType(null);

    client.onConnect = () => {
      setRealtimeState("CONNECTED");
      client.subscribe(`/topic/tournament.${normalizedCode}`, handleTournamentMessage);
    };
    client.onStompError = () => {
      setRealtimeState("ERROR");
    };
    client.onWebSocketError = () => {
      setRealtimeState("ERROR");
    };
    client.onWebSocketClose = () => {
      setRealtimeState((currentState) =>
        currentState === "CONNECTED" ? "RECONNECTING" : currentState === "IDLE" ? "IDLE" : "CONNECTING",
      );
    };

    client.activate();

    return () => {
      clientRef.current = null;
      setRealtimeState("IDLE");
      void client.deactivate();
    };
  }, [normalizedCode]);

  // Restores the player's seat connectivity when the browser rejoins the tournament topic.
  useEffect(() => {
    if (
      realtimeState !== "CONNECTED" ||
      !currentPlayer ||
      currentPlayer.connected ||
      manualReconnectRequiredRef.current
    ) {
      return;
    }

    publishWhenConnected((client, code, currentGuestId) => {
      sendTournamentConnection(client, "/app/tournament.reconnect", code, currentGuestId);
    });
  }, [currentPlayer, realtimeState]);

  function sendRouteExitDisconnect() {
    if (manualReconnectRequiredRef.current) {
      return;
    }

    const { code: currentCode, guestId: currentGuestId, connected, status } = lifecycleRef.current;
    if (!currentCode || !currentGuestId || !connected || (status !== "WAITING" && status !== "FINISHED")) {
      return;
    }

    void disconnectTournamentPlayer(currentCode, currentGuestId, { keepalive: true });
  }

  // Keeps waiting-room and finished-table route exits aligned with server leave semantics without folding in-hand refreshes.
  useEffect(() => {
    const handlePageHide = () => {
      documentExitRef.current = true;
    };

    window.addEventListener("pagehide", handlePageHide);
    const routeExitTimer = window.setTimeout(() => {
      routeExitDisconnectReadyRef.current = true;
    }, 0);

    return () => {
      window.clearTimeout(routeExitTimer);
      window.removeEventListener("pagehide", handlePageHide);
      if (routeExitDisconnectReadyRef.current && !documentExitRef.current) {
        sendRouteExitDisconnect();
      }
    };
  }, []);

  const syncState =
    realtimeState === "CONNECTED"
      ? lastEventType
        ? `LIVE WS ${lastEventType}`
        : "LIVE WS"
      : realtimeState === "CONNECTING" || realtimeState === "RECONNECTING"
        ? "SYNCING"
        : snapshot
          ? "LIVE SNAPSHOT"
          : "DEMO FALLBACK";

  return {
    currentPlayer,
    snapshot,
    realtimeState,
    syncState,
    canPublish: realtimeState === "CONNECTED",
    sendReady: (ready: boolean) =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        sendTournamentReady(client, currentCode, currentGuestId, ready);
      }),
    sendDisconnect: () => {
      const client = clientRef.current;
      if (client?.connected && normalizedCode && guestId) {
        manualReconnectRequiredRef.current = true;
        sendTournamentConnection(client, "/app/tournament.disconnect", normalizedCode, guestId);
        return;
      }

      if (!normalizedCode || !guestId) {
        return;
      }

      manualReconnectRequiredRef.current = true;

      if (snapshot?.status === "WAITING") {
        const optimisticSnapshot = buildWaitingLeaveSnapshot(snapshot, guestId);
        setSnapshot(optimisticSnapshot);
        setLastEventType("playerDisconnected");
        queryClient.setQueryData(buildTournamentSnapshotKey(code, guestId), optimisticSnapshot);
        syncActiveTournamentCache(null);
        syncPublicTournamentListCache(queryClient, optimisticSnapshot);
      }

      void disconnectTournamentPlayer(normalizedCode, guestId)
        .then((event) => {
          applyTournamentEvent(event);
        })
        .catch(() => {
          setRealtimeState("ERROR");
        });
    },
    sendReconnect: () =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        manualReconnectRequiredRef.current = false;
        sendTournamentConnection(client, "/app/tournament.reconnect", currentCode, currentGuestId);
      }),
    sendReturnToPlay: () =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        sendTournamentConnection(client, "/app/tournament.return-to-play", currentCode, currentGuestId);
      }),
    sendStart: () =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        sendTournamentStart(client, currentCode, currentGuestId);
      }),
    sendAction: (action: string, amount?: number) =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        sendTournamentAction(client, currentCode, currentGuestId, action, amount);
      }),
  };
}
