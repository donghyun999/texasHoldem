import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Client, IMessage } from "@stomp/stompjs";
import { useQueryClient } from "@tanstack/react-query";
import type { TournamentEvent, TournamentSnapshot } from "@/entities/tournament/model/types";
import { disconnectTournamentPlayer, getTournamentSnapshot } from "@/shared/api/http";
import {
  createTournamentClient,
  sendTournamentAction,
  sendTournamentConnection,
  sendTournamentReady,
  sendTournamentStart,
} from "@/shared/api/stomp-client";
import {
  buildWaitingLeaveSnapshot,
  findCurrentPlayer,
  mergeSnapshotForViewer,
  parseTournamentEvent,
  resolveSnapshotViewerGuestId,
  syncActiveTournamentSessionCache,
  syncTournamentSnapshotCaches,
} from "@/entities/tournament/model/tournament-realtime-sync";

type TournamentRealtimeState = "IDLE" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

function buildViewerSnapshotKey(snapshot: TournamentSnapshot) {
  return [
    snapshot.code,
    snapshot.handNumber,
    snapshot.stateVersion,
    snapshot.snapshotAudience,
    snapshot.viewerGuestId ?? "",
    snapshot.viewerHoleCardsIncluded ? "1" : "0",
    snapshot.chipsToCall,
    snapshot.selfHoleCards.join(","),
  ].join("|");
}

function needsViewerHydration(snapshot: TournamentSnapshot | null, guestId: string) {
  if (!snapshot) {
    return false;
  }

  const resolvedViewerGuestId = resolveSnapshotViewerGuestId(snapshot, guestId);
  if (!resolvedViewerGuestId) {
    return false;
  }

  if (snapshot.snapshotAudience === "VIEWER" || snapshot.selfHoleCards.length > 0) {
    return false;
  }

  if (snapshot.status === "WAITING" || snapshot.status === "FINISHED") {
    return false;
  }

  return snapshot.players.some((player) => player.guestId === resolvedViewerGuestId);
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
  const snapshotRef = useRef<TournamentSnapshot | null>(seedSnapshot ?? null);
  const lastSyncedSnapshotKeyRef = useRef("");
  const lastHydratedSnapshotKeyRef = useRef("");
  const normalizedCode = code.trim().toUpperCase();
  const currentPlayer = findCurrentPlayer(snapshot, guestId);
  const resolvedViewerGuestId = resolveSnapshotViewerGuestId(snapshot, guestId);

  const commitSnapshot = (nextSnapshot: TournamentSnapshot, syncOptions?: { syncActiveSession?: boolean }) => {
    const nextSnapshotKey = buildViewerSnapshotKey(nextSnapshot);
    if (lastSyncedSnapshotKeyRef.current === nextSnapshotKey) {
      return false;
    }

    snapshotRef.current = nextSnapshot;
    lastSyncedSnapshotKeyRef.current = nextSnapshotKey;
    setSnapshot(nextSnapshot);
    syncTournamentSnapshotCaches(queryClient, guestId, nextSnapshot, syncOptions);
    return true;
  };

  // Keeps the latest disconnect payload ready for unload and route-exit cleanup.
  useEffect(() => {
    lifecycleRef.current = {
      code: normalizedCode,
      guestId: resolvedViewerGuestId,
      connected: !!currentPlayer?.connected,
      status: snapshot?.status ?? "",
    };
  }, [currentPlayer?.connected, normalizedCode, resolvedViewerGuestId, snapshot?.status]);

  // Clears stale viewer state when either the tournament or current guest changes.
  useEffect(() => {
    snapshotRef.current = seedSnapshot ?? null;
    lastSyncedSnapshotKeyRef.current = seedSnapshot ? buildViewerSnapshotKey(seedSnapshot) : "";
    lastHydratedSnapshotKeyRef.current = "";
    setSnapshot(seedSnapshot ?? null);
    setLastEventType(null);
    manualReconnectRequiredRef.current = false;
  }, [normalizedCode, guestId]);

  // Seeds the local snapshot once the initial REST fetch resolves for the current tournament.
  useEffect(() => {
    if (!seedSnapshot) {
      return;
    }

    if (!snapshotRef.current) {
      commitSnapshot(seedSnapshot);
    }
  }, [seedSnapshot]);

  // Applies one tournament event from either WebSocket or REST fallback into local caches.
  function applyTournamentEvent(event: TournamentEvent) {
    const mergedSnapshot = mergeSnapshotForViewer(snapshotRef.current, event.snapshot);
    if (!mergedSnapshot) {
      return;
    }

    if (commitSnapshot(mergedSnapshot)) {
      setLastEventType(event.eventType);
    }
  }

  // Refreshes the current guest's personalized snapshot view when hole cards or reconnect state may change.
  const hydrateViewerSnapshot = useEffectEvent(() => {
    if (!normalizedCode || !resolvedViewerGuestId) {
      return;
    }

    const currentSnapshotKey = snapshotRef.current ? buildViewerSnapshotKey(snapshotRef.current) : "";
    if (currentSnapshotKey && currentSnapshotKey === lastHydratedSnapshotKeyRef.current) {
      return;
    }

    void getTournamentSnapshot(normalizedCode, resolvedViewerGuestId)
      .then((viewerSnapshot) => {
        lastHydratedSnapshotKeyRef.current = currentSnapshotKey;
        const mergedSnapshot = mergeSnapshotForViewer(snapshotRef.current, viewerSnapshot);
        if (!mergedSnapshot) {
          return;
        }

        commitSnapshot(mergedSnapshot);
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

    if (event.eventType === "playerReconnected" || event.eventType === "playerReturned") {
      hydrateViewerSnapshot();
    }
  });

  // Restores the viewer-specific snapshot after hand/status transitions that arrive as public broker snapshots.
  useEffect(() => {
    if (!needsViewerHydration(snapshot, guestId)) {
      return;
    }

    hydrateViewerSnapshot();
  }, [
    guestId,
    hydrateViewerSnapshot,
    snapshot?.code,
    snapshot?.handNumber,
    snapshot?.snapshotAudience,
    snapshot?.stateVersion,
    snapshot?.status,
    snapshot?.selfHoleCards,
    snapshot?.viewerHoleCardsIncluded,
  ]);

  // Publishes one command only when the websocket transport is ready.
  const publishWhenConnected = useEffectEvent((publisher: (client: Client, code: string, guestId: string) => void) => {
    const client = clientRef.current;
    if (!client?.connected || !normalizedCode || !resolvedViewerGuestId) {
      return false;
    }

    publisher(client, normalizedCode, resolvedViewerGuestId);
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
        : "LIVE SNAPSHOT";

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
      if (client?.connected && normalizedCode && resolvedViewerGuestId) {
        manualReconnectRequiredRef.current = true;
        sendTournamentConnection(client, "/app/tournament.disconnect", normalizedCode, resolvedViewerGuestId);
        return;
      }

      if (!normalizedCode || !resolvedViewerGuestId) {
        return;
      }

      manualReconnectRequiredRef.current = true;
      if (snapshot?.status === "WAITING") {
        const optimisticSnapshot = buildWaitingLeaveSnapshot(snapshot, resolvedViewerGuestId);
        commitSnapshot(optimisticSnapshot, { syncActiveSession: false });
        setLastEventType("playerDisconnected");
        syncActiveTournamentSessionCache(queryClient, resolvedViewerGuestId, null);
      }

      void disconnectTournamentPlayer(normalizedCode, resolvedViewerGuestId)
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
