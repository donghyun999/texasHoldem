import { Client } from "@stomp/stompjs";

export const TOURNAMENT_WS_URL = "ws://localhost:8080/ws";

// Creates the shared STOMP client configuration for tournament subscriptions.
export function createTournamentClient() {
  return new Client({
    brokerURL: TOURNAMENT_WS_URL,
    reconnectDelay: 5000,
    debug: () => undefined,
  });
}
