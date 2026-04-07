import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Client, IMessage } from "@stomp/stompjs";
import { useQueryClient } from "@tanstack/react-query";
import { buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import type { TournamentEvent, TournamentSnapshot } from "@/entities/tournament/model/types";
import { disconnectTournamentPlayer } from "@/shared/api/http";
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

// Subscribes to one tournament topic and keeps the latest snapshot hot in memory.
export function useTournamentRealtimeSnapshot(code: string, guestId: string, seedSnapshot?: TournamentSnapshot) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(seedSnapshot ?? null);
  const [realtimeState, setRealtimeState] = useState<TournamentRealtimeState>("IDLE");
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);
  const lifecycleRef = useRef({ code: "", guestId: "", connected: false });
  const normalizedCode = code.trim().toUpperCase();
  const currentPlayer = findCurrentPlayer(snapshot, guestId);

  // Keeps the latest disconnect payload ready for unload and route-exit cleanup.
  useEffect(() => {
    lifecycleRef.current = {
      code: normalizedCode,
      guestId,
      connected: !!currentPlayer?.connected,
    };
  }, [currentPlayer?.connected, guestId, normalizedCode]);

  // Clears stale state when the route switches to a different tournament code.
  useEffect(() => {
    setSnapshot(seedSnapshot ?? null);
    setLastEventType(null);
  }, [normalizedCode, seedSnapshot]);

  // Applies each subscribed broker event to local state and the shared query cache.
  const handleTournamentMessage = useEffectEvent((message: IMessage) => {
    const event = parseTournamentEvent(message);
    if (!event) {
      setRealtimeState("ERROR");
      return;
    }

    setSnapshot(event.snapshot);
    setLastEventType(event.eventType);
    queryClient.setQueryData(buildTournamentSnapshotKey(code), event.snapshot);
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
  }, [handleTournamentMessage, normalizedCode]);

  // Restores the player's seat connectivity when the browser rejoins the tournament topic.
  useEffect(() => {
    if (realtimeState !== "CONNECTED" || !currentPlayer || currentPlayer.connected) {
      return;
    }

    publishWhenConnected((client, code, currentGuestId) => {
      sendTournamentConnection(client, "/app/tournament.reconnect", code, currentGuestId);
    });
  }, [currentPlayer, publishWhenConnected, realtimeState]);

  // Falls back to the REST endpoint so unload and route exit still mark the player offline.
  useEffect(() => {
    const handlePageHide = () => {
      const { code: currentCode, guestId: currentGuestId, connected } = lifecycleRef.current;
      if (!currentCode || !currentGuestId || !connected) {
        return;
      }

      void disconnectTournamentPlayer(currentCode, currentGuestId, { keepalive: true });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      handlePageHide();
    };
  }, []);

  const syncState =
    realtimeState === "CONNECTED"
      ? lastEventType
        ? `LIVE WS ${lastEventType}`
        : "LIVE WS"
      : snapshot
        ? "LIVE SNAPSHOT"
        : realtimeState === "CONNECTING" || realtimeState === "RECONNECTING"
          ? "SYNCING"
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
    sendDisconnect: () =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        sendTournamentConnection(client, "/app/tournament.disconnect", currentCode, currentGuestId);
      }),
    sendReconnect: () =>
      publishWhenConnected((client, currentCode, currentGuestId) => {
        sendTournamentConnection(client, "/app/tournament.reconnect", currentCode, currentGuestId);
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
