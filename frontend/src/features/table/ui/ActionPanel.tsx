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

function getPanelPriorityState({
  tournamentStatus,
  currentPlayer,
  canPublish,
}: Pick<ActionPanelProps, "tournamentStatus" | "currentPlayer" | "canPublish">) {
  if (!currentPlayer) {
    return {
      label: "Observer",
      description: "This browser is not seated at the table.",
      tone: "border-white/10 bg-white/5 text-zinc-100",
    };
  }

  if (!currentPlayer.connected) {
    return {
      label: "Reconnect",
      description: "Reconnect to recover the seat and resume live control.",
      tone: "border-sky-300/25 bg-sky-400/10 text-sky-50",
    };
  }

  if (!canPublish) {
    return {
      label: "Syncing",
      description: "Action publishing is waiting for the live connection.",
      tone: "border-white/10 bg-white/5 text-zinc-100",
    };
  }

  if (currentPlayer.acting) {
    return {
      label: "Your turn",
      description: "Choose the next action before play moves on.",
      tone: "border-amber-300/30 bg-amber-400/12 text-amber-50",
    };
  }

  if (tournamentStatus === "WAITING" && currentPlayer.owner) {
    return {
      label: "Owner",
      description: "Start when enough players are ready.",
      tone: "border-violet-300/25 bg-violet-400/10 text-violet-50",
    };
  }

  if (tournamentStatus === "HAND_RESULT") {
    return {
      label: "Result",
      description: "The next hand will begin automatically shortly.",
      tone: "border-emerald-300/25 bg-emerald-400/10 text-emerald-50",
    };
  }

  return {
    label: "Waiting",
    description: "Stand by for the next state change at the table.",
    tone: "border-white/10 bg-white/5 text-zinc-100",
  };
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

  // Clears stale bet sizing whenever the server rotates the action set.
  useEffect(() => {
    if (!sizeAction) {
      setTargetAmount("");
    }
  }, [sizeAction]);

  return (
    <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-black/20 p-4 sm:p-6 md:grid-cols-[1fr_auto]">
      <div>
        <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] sm:text-xs ${priorityState.tone}`}>
          {priorityState.label}
        </div>
        <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Action Controls</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Live tournament commands</h3>
        <p className="mt-3 text-zinc-300">{priorityState.description}</p>
        <p className="mt-2 text-sm text-zinc-400">{controlHint}</p>
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">{message}</p>
        {currentPlayer ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-zinc-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              {currentPlayer.nickname}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              {currentPlayer.connected ? "ONLINE" : "OFFLINE"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              {currentPlayer.owner ? "OWNER" : "PLAYER"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              {canPublish ? "WS READY" : "WS OFFLINE"}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3 md:min-w-[280px]">
        {canToggleReady ? (
          <button
            type="button"
            onClick={() => onReadyChange(!isReady)}
            disabled={!canPublish}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReady ? "Cancel Ready" : "Mark Ready"}
          </button>
        ) : null}

        {canStart ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canPublish}
            className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Tournament
          </button>
        ) : null}

        {showDisconnect ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disconnectLabel}
          </button>
        ) : showReconnect ? (
          <button
            type="button"
            onClick={onReconnect}
            disabled={!canPublish}
            className="rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reconnect
          </button>
        ) : null}

        {sizeAction ? (
          <div className="grid gap-2 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <label htmlFor="action-amount" className="text-xs uppercase tracking-[0.22em] text-zinc-400">
              {toActionLabel(sizeAction)} target
            </label>
            <input
              id="action-amount"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={targetAmount}
              onChange={(event) => setTargetAmount(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/40"
              placeholder="Enter total contribution"
            />
            <button
              type="button"
              onClick={() => {
                if (sizeAction && hasValidTargetAmount) {
                  onAction(sizeAction, parsedTargetAmount);
                }
              }}
              disabled={!canSubmitSizedAction || !hasValidTargetAmount}
              className={`rounded-full border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getActionButtonClass(sizeAction)}`}
            >
              Send {toActionLabel(sizeAction)}
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {directActions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              disabled={!canPublish || !canAct}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getActionButtonClass(action)}`}
            >
              {toActionLabel(action)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
