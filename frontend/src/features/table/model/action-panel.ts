import type { TournamentPlayer, TournamentStatus } from "@/entities/tournament/model/types";

type ActionPanelStateInput = {
  actions: string[];
  currentPlayer: TournamentPlayer | null;
  tournamentStatus: TournamentStatus;
  canPublish: boolean;
};

export type ActionPanelViewModel = {
  sizeAction: string | null;
  directActions: string[];
  isReady: boolean;
  canToggleReady: boolean;
  canStart: boolean;
  canAct: boolean;
  showDisconnect: boolean;
  showReconnect: boolean;
  showReturnToPlay: boolean;
  canSubmitSizedAction: boolean;
  controlHint: string;
};

const ACTIONS_REQUIRING_AMOUNT = new Set(["BET", "RAISE"]);

// Converts one server action key into a stable UI label.
export function toActionLabel(action: string) {
  return action.replaceAll("_", " ");
}

// Checks whether a server action requires a target contribution amount.
export function requiresAmount(action: string) {
  return ACTIONS_REQUIRING_AMOUNT.has(action);
}

// Normalizes the sized-action input into a valid positive contribution target.
export function parseTargetAmount(value: string) {
  const parsedAmount = Number.parseInt(value, 10);
  return Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : null;
}

// Builds the local-player hint from the latest snapshot state.
function describeControlState(
  currentPlayer: TournamentPlayer | null,
  tournamentStatus: TournamentStatus,
  actions: string[],
) {
  if (!currentPlayer) {
    return "Current guest is not seated in this tournament.";
  }

  if (!currentPlayer.connected) {
    return "Reconnect to restore seat ownership and receive live updates.";
  }

  if (currentPlayer.afk) {
    return "You are AFK. Your turns will auto-check or auto-fold until you return to play.";
  }

  if (tournamentStatus === "WAITING") {
    return currentPlayer.status === "READY"
      ? "You are ready. The owner can start once at least two players are ready."
      : "Mark ready when you want to be included in the next tournament start.";
  }

  if (tournamentStatus === "HAND_RESULT") {
    return "The hand is settled. The table will advance automatically after the short result window.";
  }

  if (currentPlayer.acting) {
    return actions.length > 0
      ? "It is your turn. Use the actions below to submit the next move."
      : "It is your turn, but the server has not exposed any actions yet.";
  }

  return "Waiting for the next server-side state change.";
}

// Derives all action-panel interaction flags from the tournament snapshot.
export function buildActionPanelViewModel({
  actions,
  currentPlayer,
  tournamentStatus,
  canPublish,
}: ActionPanelStateInput): ActionPanelViewModel {
  const sizeAction = actions.find(requiresAmount) ?? null;
  const directActions = actions.filter((action) => !requiresAmount(action));
  const isWaiting = tournamentStatus === "WAITING";
  const isReady = currentPlayer?.status === "READY";
  const canToggleReady =
    !!currentPlayer &&
    currentPlayer.connected &&
    !currentPlayer.afk &&
    isWaiting &&
    (currentPlayer.status === "SEATED" || currentPlayer.status === "READY");
  const canStart = !!currentPlayer && currentPlayer.connected && !currentPlayer.afk && currentPlayer.owner && isWaiting;
  const canAct = !!currentPlayer && currentPlayer.connected && !currentPlayer.afk && currentPlayer.acting;

  return {
    sizeAction,
    directActions,
    isReady,
    canToggleReady,
    canStart,
    canAct,
    showDisconnect: !!currentPlayer?.connected && isWaiting,
    showReconnect: !!currentPlayer && !currentPlayer.connected,
    showReturnToPlay: !!currentPlayer?.connected && !!currentPlayer?.afk,
    canSubmitSizedAction: canPublish && canAct,
    controlHint: describeControlState(currentPlayer, tournamentStatus, actions),
  };
}
