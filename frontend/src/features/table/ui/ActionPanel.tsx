import { useEffect, useState } from "react";
import type { TournamentPlayer, TournamentStatus } from "@/entities/tournament/model/types";

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

// Converts server action keys into stable button labels.
function toActionLabel(action: string) {
  return action.replaceAll("_", " ");
}

// Detects which actions need an explicit target contribution amount.
function requiresAmount(action: string) {
  return action === "BET" || action === "RAISE";
}

// Builds a short local-player hint from the latest snapshot view.
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
  const sizeAction = actions.find(requiresAmount) ?? null;
  const directActions = actions.filter((action) => !requiresAmount(action));
  const isWaiting = tournamentStatus === "WAITING";
  const isReady = currentPlayer?.status === "READY";
  const canToggleReady =
    !!currentPlayer &&
    currentPlayer.connected &&
    isWaiting &&
    (currentPlayer.status === "SEATED" || currentPlayer.status === "READY");
  const canStart = !!currentPlayer && currentPlayer.connected && currentPlayer.owner && isWaiting;
  const canAct = !!currentPlayer && currentPlayer.connected && currentPlayer.acting;
  const controlHint = describeControlState(currentPlayer, tournamentStatus, actions);
  const parsedTargetAmount = Number.parseInt(targetAmount, 10);
  const hasValidTargetAmount = Number.isFinite(parsedTargetAmount) && parsedTargetAmount > 0;

  // Clears stale bet sizing whenever the server rotates the action set.
  useEffect(() => {
    if (!sizeAction) {
      setTargetAmount("");
    }
  }, [sizeAction]);

  return (
    <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-black/20 p-6 md:grid-cols-[1fr_auto]">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Action Controls</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Live tournament commands</h3>
        <p className="mt-3 text-zinc-300">{controlHint}</p>
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
      <div className="flex min-w-[280px] flex-col gap-3">
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

        {currentPlayer?.connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={!canPublish}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : currentPlayer ? (
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
                if (hasValidTargetAmount) {
                  onAction(sizeAction, parsedTargetAmount);
                }
              }}
              disabled={!canPublish || !canAct || !hasValidTargetAmount}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {toActionLabel(action)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
