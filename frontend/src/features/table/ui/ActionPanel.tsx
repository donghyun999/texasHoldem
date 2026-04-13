import { useEffect, useState } from "react";
import type { TournamentPlayer, TournamentStatus } from "@/entities/tournament/model/types";
import {
  buildActionPanelViewModel,
  parseTargetAmount,
  toActionLabel,
} from "@/features/table/model/action-panel";

type ActionPanelProps = {
  actions: string[];
  message: string;
  tournamentStatus: TournamentStatus;
  currentPlayer: TournamentPlayer | null;
  canPublish: boolean;
  onAction: (action: string, amount?: number) => void;
  onReadyChange: (ready: boolean) => void;
  onStart: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
};

function getActionButtonClass(action: string) {
  switch (action) {
    case "FOLD":
      return "border-rose-300/25 bg-rose-400/10 text-rose-50 hover:bg-rose-400/20";
    case "CHECK":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/20";
    case "CALL":
      return "border-sky-300/25 bg-sky-400/10 text-sky-50 hover:bg-sky-400/20";
    case "ALL_IN":
      return "border-amber-300/30 bg-amber-400/12 text-amber-50 hover:bg-amber-400/22";
    case "BET":
    case "RAISE":
      return "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-50 hover:bg-fuchsia-400/20";
    default:
      return "border-white/10 bg-white/5 text-white hover:bg-white/10";
  }
}

function getActionHelp(action: string) {
  switch (action) {
    case "FOLD":
      return "Give up this hand";
    case "CHECK":
      return "Pass with no bet";
    case "CALL":
      return "Match the current bet";
    case "ALL_IN":
      return "Commit every chip";
    case "BET":
      return "Open the betting";
    case "RAISE":
      return "Increase the total bet";
    default:
      return "Send action";
  }
}

function getActionButtonLabel(action: string) {
  if (action === "ALL_IN") {
    return "All in";
  }

  return toActionLabel(action).toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function getPanelPriorityState({
  tournamentStatus,
  currentPlayer,
  canPublish,
}: Pick<ActionPanelProps, "tournamentStatus" | "currentPlayer" | "canPublish">) {
  if (!currentPlayer) {
    return {
      label: "Observer",
      description: "Join with this guest to control a seat.",
      tone: "border-white/10 bg-white/5 text-zinc-100",
    };
  }

  if (!currentPlayer.connected) {
    return {
      label: "Reconnect",
      description: "Recover this seat before taking more actions.",
      tone: "border-sky-300/25 bg-sky-400/10 text-sky-50",
    };
  }

  if (!canPublish) {
    return {
      label: "Syncing",
      description: "Waiting for the live connection.",
      tone: "border-white/10 bg-white/5 text-zinc-100",
    };
  }

  if (currentPlayer.acting) {
    return {
      label: "Your turn",
      description: "Choose one move for this hand.",
      tone: "border-amber-300/30 bg-amber-400/12 text-amber-50",
    };
  }

  if (tournamentStatus === "WAITING" && currentPlayer.owner) {
    return {
      label: "Owner",
      description: "Start once enough players are ready.",
      tone: "border-violet-300/25 bg-violet-400/10 text-violet-50",
    };
  }

  if (tournamentStatus === "HAND_RESULT") {
    return {
      label: "Result",
      description: "The next hand starts automatically.",
      tone: "border-emerald-300/25 bg-emerald-400/10 text-emerald-50",
    };
  }

  return {
    label: "Waiting",
    description: "Waiting for the next table state.",
    tone: "border-white/10 bg-white/5 text-zinc-100",
  };
}

function buildNoActionReason({
  currentPlayer,
  canPublish,
  canAct,
}: {
  currentPlayer: TournamentPlayer | null;
  canPublish: boolean;
  canAct: boolean;
}) {
  if (!currentPlayer) {
    return "This guest is not seated.";
  }

  if (!currentPlayer.connected) {
    return "Reconnect this seat first.";
  }

  if (!canPublish) {
    return "Waiting for the live connection.";
  }

  if (!canAct) {
    return "Another player is acting.";
  }

  return "No legal moves are available yet.";
}

function getPlayerRole(currentPlayer: TournamentPlayer | null) {
  if (!currentPlayer) {
    return "Observer";
  }

  return currentPlayer.owner ? "Owner" : "Player";
}

function getPlayerConnectionLabel(currentPlayer: TournamentPlayer | null, canPublish: boolean) {
  if (!currentPlayer) {
    return "Not seated";
  }

  const seatState = currentPlayer.connected ? "Online" : "Offline";
  const transportState = canPublish ? "Live" : "Waiting";
  return `${seatState} | ${transportState}`;
}

// Renders websocket-backed tournament controls for the current browser player.
export function ActionPanel({
  actions,
  message,
  tournamentStatus,
  currentPlayer,
  canPublish,
  onAction,
  onReadyChange,
  onStart,
  onDisconnect,
  onReconnect,
}: ActionPanelProps) {
  const [targetAmount, setTargetAmount] = useState("");
  const {
    sizeAction,
    directActions,
    isReady,
    canToggleReady,
    canStart,
    canAct,
    showDisconnect,
    showReconnect,
    canSubmitSizedAction,
    controlHint,
  } = buildActionPanelViewModel({
    actions,
    currentPlayer,
    tournamentStatus,
    canPublish,
  });
  const parsedTargetAmount = parseTargetAmount(targetAmount);
  const hasValidTargetAmount = parsedTargetAmount !== null;
  const disconnectLabel = tournamentStatus === "WAITING" ? "Leave Waiting Room" : "Disconnect";
  const priorityState = getPanelPriorityState({ tournamentStatus, currentPlayer, canPublish });
  const noActionReason = buildNoActionReason({ currentPlayer, canPublish, canAct });
  const summaryChips = currentPlayer
    ? [
        `Seat ${currentPlayer.seatIndex + 1}`,
        `${currentPlayer.stack} chips`,
        currentPlayer.status.replaceAll("_", " "),
        getPlayerRole(currentPlayer),
      ]
    : ["Not seated"];
  const connectionLabel = getPlayerConnectionLabel(currentPlayer, canPublish);

  // Clears stale bet sizing whenever the server rotates the action set.
  useEffect(() => {
    if (!sizeAction) {
      setTargetAmount("");
    }
  }, [sizeAction]);

  return (
    <div className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex rounded-lg border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] sm:text-xs ${priorityState.tone}`}
          >
            {priorityState.label}
          </div>
          {currentPlayer?.acting ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/20 bg-amber-100/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100 sm:text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-200" />
              </span>
              Act now
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-zinc-500">Action Controls</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-white sm:text-2xl">Table action</h3>
            <p className="mt-2 text-sm text-zinc-300">{priorityState.description}</p>
          </div>
          {currentPlayer ? (
            <div className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right text-[11px] text-zinc-300 sm:block">
              <p className="font-semibold text-white">{currentPlayer.nickname}</p>
              <p className="mt-1">{connectionLabel}</p>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-zinc-400">{controlHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {summaryChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-100"
            >
              {chip}
            </span>
          ))}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-300">
            {connectionLabel}
          </span>
        </div>
        <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200">{message}</p>
        {currentPlayer ? (
          <div className="mt-4 grid gap-2 text-xs text-zinc-300 sm:grid-cols-3">
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">You</span>
              <span className="mt-1 block font-medium text-white">{currentPlayer.nickname}</span>
            </span>
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">Seat</span>
              <span className="mt-1 block font-medium text-white">Seat {currentPlayer.seatIndex + 1}</span>
            </span>
            <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">Connection</span>
              <span className="mt-1 block font-medium text-white">{connectionLabel}</span>
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {(canToggleReady || canStart || showDisconnect || showReconnect) ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {canToggleReady ? (
              <button
                type="button"
                onClick={() => onReadyChange(!isReady)}
                disabled={!canPublish}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isReady ? "Cancel Ready" : "Mark Ready"}
              </button>
            ) : null}

            {canStart ? (
              <button
                type="button"
                onClick={onStart}
                disabled={!canPublish}
                className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Tournament
              </button>
            ) : null}

            {showDisconnect ? (
              <button
                type="button"
                onClick={onDisconnect}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disconnectLabel}
              </button>
            ) : null}

            {showReconnect ? (
              <button
                type="button"
                onClick={onReconnect}
                disabled={!canPublish}
                className="rounded-lg border border-sky-300/30 bg-sky-400/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reconnect
              </button>
            ) : null}
          </div>
        ) : null}

        {sizeAction ? (
          <div className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <label htmlFor="action-amount" className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
              {getActionButtonLabel(sizeAction)} total
            </label>
            <input
              id="action-amount"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={targetAmount}
              onChange={(event) => setTargetAmount(event.target.value)}
              className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-300/40"
              placeholder="Total chips after action"
            />
            <p className="text-[11px] leading-5 text-zinc-400">
              {getActionHelp(sizeAction)}. Enter the final committed total.
            </p>
            <button
              type="button"
              onClick={() => {
                if (sizeAction && hasValidTargetAmount) {
                  onAction(sizeAction, parsedTargetAmount);
                }
              }}
              disabled={!canSubmitSizedAction || !hasValidTargetAmount}
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getActionButtonClass(sizeAction)}`}
            >
              Send {getActionButtonLabel(sizeAction)}
            </button>
          </div>
        ) : null}

        {directActions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {directActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => onAction(action)}
                disabled={!canPublish || !canAct}
                className={`min-h-14 rounded-lg border px-3 py-2.5 text-left transition sm:min-h-18 disabled:cursor-not-allowed disabled:opacity-50 ${getActionButtonClass(action)}`}
              >
                <span className="block text-sm font-semibold">{getActionButtonLabel(action)}</span>
                <span className="mt-1 hidden text-xs opacity-75 sm:block">{getActionHelp(action)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
            {noActionReason}
          </div>
        )}
      </div>
    </div>
  );
}
