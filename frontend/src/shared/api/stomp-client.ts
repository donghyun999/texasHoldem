import { Client } from "@stomp/stompjs";
import { TOURNAMENT_WS_URL } from "@/shared/config/runtime";

// Creates the shared STOMP client configuration for tournament subscriptions.
export function createTournamentClient(guestToken?: string) {
  return new Client({
    brokerURL: TOURNAMENT_WS_URL,
    connectHeaders: guestToken ? { Authorization: `Bearer ${guestToken}` } : {},
    reconnectDelay: 5000,
    debug: () => undefined,
  });
}

// Publishes one JSON command into the tournament websocket app destination.
function publishJson(client: Client, destination: string, body: unknown) {
  client.publish({
    destination,
    body: JSON.stringify(body),
  });
}

// Sends the current player's ready state to the tournament topic pipeline.
export function sendTournamentReady(client: Client, code: string, ready: boolean) {
  publishJson(client, "/app/tournament.ready", { code, ready });
}

// Sends a tournament lifecycle connect or reconnect command for one player.
export function sendTournamentConnection(
  client: Client,
  destination: "/app/tournament.disconnect" | "/app/tournament.reconnect" | "/app/tournament.return-to-play",
  code: string,
) {
  publishJson(client, destination, { code });
}

// Sends the owner's start or next-hand command over the shared websocket transport.
export function sendTournamentStart(client: Client, code: string) {
  publishJson(client, "/app/tournament.start", { code });
}

// Sends one in-hand action with the optional total target amount for bet sizing.
export function sendTournamentAction(
  client: Client,
  code: string,
  action: string,
  amount?: number,
) {
  publishJson(client, "/app/game.action", {
    code,
    action,
    amount: amount ?? null,
  });
}
