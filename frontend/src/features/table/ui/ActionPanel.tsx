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

        {showDisconnect ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={!canPublish}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disconnect
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
