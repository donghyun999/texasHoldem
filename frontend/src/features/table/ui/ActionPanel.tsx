import { useEffect, useState } from "react";
import type { TournamentPlayer, TournamentStatus } from "@/entities/tournament/model/types";
import { buildActionPanelViewModel, parseTargetAmount } from "@/features/table/model/action-panel";

type ActionPanelProps = {
  actions: string[];
  chipsToCall: number;
  minimumRaiseTo: number;
  potSize: number;
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

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "<-"],
];

type SizingPreset = {
  label: string;
  value: number;
  enabled: boolean;
};

function getPrimaryAction(actions: string[]) {
  if (actions.includes("CHECK")) {
    return "CHECK";
  }

  if (actions.includes("CALL")) {
    return "CALL";
  }

  return null;
}

function getMaxCommitment(currentPlayer: TournamentPlayer | null) {
  if (!currentPlayer) {
    return 0;
  }

  return currentPlayer.roundContribution + currentPlayer.stack;
}

function clampCommitment(amount: number, currentPlayer: TournamentPlayer | null) {
  const maxCommitment = getMaxCommitment(currentPlayer);
  if (maxCommitment <= 0) {
    return Math.max(1, amount);
  }

  return Math.min(Math.max(1, amount), maxCommitment);
}

function buildSuggestedCommitment({
  currentPlayer,
  minimumRaiseTo,
}: {
  currentPlayer: TournamentPlayer | null;
  minimumRaiseTo: number;
}) {
  return clampCommitment(Math.max(1, minimumRaiseTo), currentPlayer);
}

function buildPresetTargets({
  currentPlayer,
  minimumRaiseTo,
  potSize,
}: {
  currentPlayer: TournamentPlayer | null;
  minimumRaiseTo: number;
  potSize: number;
}): SizingPreset[] {
  const committed = currentPlayer?.roundContribution ?? 0;
  const maxCommitment = getMaxCommitment(currentPlayer);
  const minimumTarget = Math.max(committed + 1, minimumRaiseTo);
  const halfPotTarget = Math.max(1, Math.ceil(Math.max(0, potSize) / 2));
  const potTarget = Math.max(1, potSize);
  const isExactTargetPlayable = (target: number) =>
    target > committed && target >= minimumRaiseTo && target <= maxCommitment;

  return [
    {
      label: "Min",
      value: minimumTarget,
      enabled: isExactTargetPlayable(minimumTarget),
    },
    {
      label: "1/2 Pot",
      value: halfPotTarget,
      enabled: isExactTargetPlayable(halfPotTarget),
    },
    {
      label: "Pot",
      value: potTarget,
      enabled: isExactTargetPlayable(potTarget),
    },
    {
      label: "All in",
      value: maxCommitment,
      enabled: maxCommitment > committed,
    },
  ];
}

function isValidTargetCommitment(amount: number | null, currentPlayer: TournamentPlayer | null, minimumRaiseTo: number) {
  if (amount === null) {
    return false;
  }

  const committed = currentPlayer?.roundContribution ?? 0;
  const maxCommitment = getMaxCommitment(currentPlayer);
  return amount > committed && amount >= minimumRaiseTo && amount <= maxCommitment;
}

function buildCompactStatusLabel({
  currentPlayer,
  tournamentStatus,
  canPublish,
}: Pick<ActionPanelProps, "currentPlayer" | "tournamentStatus" | "canPublish">) {
  if (!currentPlayer) {
    return "Observer";
  }

  if (!currentPlayer.connected) {
    return "Reconnect";
  }

  if (!canPublish) {
    return "Syncing";
  }

  if (currentPlayer.acting) {
    return "Your turn";
  }

  if (tournamentStatus === "WAITING") {
    return currentPlayer.status === "READY" ? "Ready" : "Waiting";
  }

  if (tournamentStatus === "HAND_RESULT") {
    return "Result";
  }

  return "Waiting";
}

function getStatusTone(label: string) {
  switch (label) {
    case "Your turn":
      return "border-amber-300/30 bg-amber-400/12 text-amber-50";
    case "Reconnect":
      return "border-sky-300/25 bg-sky-400/10 text-sky-50";
    case "Ready":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-50";
    case "Result":
      return "border-violet-300/25 bg-violet-400/10 text-violet-50";
    default:
      return "border-white/10 bg-white/5 text-zinc-100";
  }
}

function getPrimaryActionLabel(action: string | null, chipsToCall: number) {
  if (action === "CHECK") {
    return "Check";
  }

  if (action === "CALL") {
    return chipsToCall > 0 ? `Call ${chipsToCall}` : "Call";
  }

  return "Wait";
}

function getSizedActionLabel(action: string | null) {
  if (action === "BET") {
    return "Bet";
  }

  if (action === "RAISE") {
    return "Raise";
  }

  return "Size";
}

function getButtonClass(kind: "fold" | "primary" | "size" | "utility") {
  switch (kind) {
    case "fold":
      return "border-rose-300/25 bg-rose-400/10 text-rose-50 hover:bg-rose-400/20";
    case "primary":
      return "border-sky-300/25 bg-sky-400/10 text-sky-50 hover:bg-sky-400/20";
    case "size":
      return "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-50 hover:bg-fuchsia-400/20";
    default:
      return "border-white/10 bg-white/5 text-white hover:bg-white/10";
  }
}

function buildIdleMessage({
  currentPlayer,
  tournamentStatus,
  canPublish,
  message,
}: Pick<ActionPanelProps, "currentPlayer" | "tournamentStatus" | "canPublish" | "message">) {
  if (!currentPlayer) {
    return "Join a seat to play from this browser.";
  }

  if (!currentPlayer.connected) {
    return "Reconnect this seat to resume play.";
  }

  if (!canPublish) {
    return "Waiting for the live connection.";
  }

  if (tournamentStatus === "WAITING") {
    return currentPlayer.owner ? "Mark players ready, then start the tournament." : "Use ready when you want in.";
  }

  if (tournamentStatus === "HAND_RESULT") {
    return message;
  }

  return "Waiting for the next action.";
}

// Renders a compact table-bottom action bar with an overlay sizer for bet and raise actions.
export function ActionPanel({
  actions,
  chipsToCall,
  minimumRaiseTo,
  potSize,
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
  const [isSizingOpen, setIsSizingOpen] = useState(false);
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
  } = buildActionPanelViewModel({
    actions,
    currentPlayer,
    tournamentStatus,
    canPublish,
  });
  const primaryAction = getPrimaryAction(directActions);
  const canFold = directActions.includes("FOLD");
  const allInAction = directActions.includes("ALL_IN") ? "ALL_IN" : null;
  const compactStatusLabel = buildCompactStatusLabel({ currentPlayer, tournamentStatus, canPublish });
  const committed = currentPlayer?.roundContribution ?? 0;
  const presetTargets = buildPresetTargets({ currentPlayer, minimumRaiseTo, potSize });
  const parsedTargetAmount = parseTargetAmount(targetAmount);
  const hasValidTargetAmount = isValidTargetCommitment(parsedTargetAmount, currentPlayer, minimumRaiseTo);
  const shouldShowCallAmount = primaryAction === "CALL" && chipsToCall > 0;
  const shouldShowInHandControls = tournamentStatus === "IN_HAND" && (canAct || !!allInAction || !!sizeAction || !!primaryAction);
  const shouldShowUtilityControls =
    tournamentStatus !== "IN_HAND" && (canToggleReady || canStart || showDisconnect || showReconnect);
  const idleMessage = buildIdleMessage({ currentPlayer, tournamentStatus, canPublish, message });

  useEffect(() => {
    if (!sizeAction) {
      setIsSizingOpen(false);
      setTargetAmount("");
    }
  }, [sizeAction]);

  const openSizer = () => {
    if (!sizeAction) {
      return;
    }

    setTargetAmount((current) =>
      current || String(buildSuggestedCommitment({ currentPlayer, minimumRaiseTo })),
    );
    setIsSizingOpen(true);
  };

  const handleCalculatorKey = (key: string) => {
    if (key === "C") {
      setTargetAmount("");
      return;
    }

    if (key === "<-") {
      setTargetAmount((current) => current.slice(0, -1));
      return;
    }

    setTargetAmount((current) => {
      const next = `${current}${key}`.replace(/^0+(?=\d)/, "");
      return next;
    });
  };

  const submitSizedAction = () => {
    if (!sizeAction || parsedTargetAmount === null || !hasValidTargetAmount) {
      return;
    }

    onAction(sizeAction, parsedTargetAmount);
    setIsSizingOpen(false);
  };

  return (
    <>
      <div className="relative rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(6,10,9,0.95),_rgba(5,8,7,0.92))] p-3 shadow-2xl shadow-black/35 backdrop-blur-md sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getStatusTone(compactStatusLabel)}`}
            >
              {compactStatusLabel}
            </span>
            {currentPlayer ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-100">
                {currentPlayer.stack} behind
              </span>
            ) : null}
            {shouldShowCallAmount ? (
              <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-medium text-sky-50">
                To call {chipsToCall}
              </span>
            ) : null}
            {shouldShowInHandControls && potSize > 0 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-200">
                Pot {potSize}
              </span>
            ) : null}
          </div>

          {shouldShowInHandControls && allInAction ? (
            <button
              type="button"
              onClick={() => onAction(allInAction)}
              disabled={!canPublish || !canAct}
              className="rounded-full border border-amber-300/30 bg-amber-400/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-50 transition hover:bg-amber-400/22 disabled:cursor-not-allowed disabled:opacity-50"
            >
              All in
            </button>
          ) : null}
        </div>

        {shouldShowInHandControls ? (
          <div className="relative mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onAction("FOLD")}
              disabled={!canPublish || !canAct || !canFold}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${getButtonClass("fold")}`}
            >
              Fold
            </button>
            <button
              type="button"
              onClick={() => {
                if (primaryAction) {
                  onAction(primaryAction);
                }
              }}
              disabled={!canPublish || !canAct || !primaryAction}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${getButtonClass("primary")}`}
            >
              {getPrimaryActionLabel(primaryAction, chipsToCall)}
            </button>
            <button
              type="button"
              onClick={
                sizeAction
                  ? () => {
                      if (isSizingOpen) {
                        setIsSizingOpen(false);
                        return;
                      }

                      openSizer();
                    }
                  : allInAction
                    ? () => onAction(allInAction)
                    : undefined
              }
              disabled={!canPublish || !canAct || (!sizeAction && !allInAction)}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${getButtonClass("size")}`}
            >
              {sizeAction ? getSizedActionLabel(sizeAction) : allInAction ? "All in" : "Wait"}
            </button>

            {isSizingOpen && sizeAction ? (
              <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-50 w-[31.5%] min-w-[118px] max-w-[150px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(10,14,12,0.98),_rgba(6,9,8,0.98))] shadow-2xl shadow-black/45">
                <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {getSizedActionLabel(sizeAction)}
                    </p>
                    <p className="mt-1 truncate text-base font-black text-white">{targetAmount || "0"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSizingOpen(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/10"
                  >
                    X
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1 border-b border-white/10 px-2 py-2">
                  {presetTargets.slice(0, 4).map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setTargetAmount(String(preset.value))}
                      disabled={!preset.enabled}
                      className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1.5 text-center text-[9px] font-medium text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <span className="block truncate">{preset.label}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-white">{preset.value}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1 p-2">
                  {KEYPAD_ROWS.flat().map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCalculatorKey(key)}
                      className="min-h-8 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      {key}
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/10 px-2 py-2">
                  <button
                    type="button"
                    onClick={submitSizedAction}
                    disabled={!canSubmitSizedAction || !hasValidTargetAmount}
                    className={`min-h-9 w-full rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass("size")}`}
                  >
                    Send {parsedTargetAmount ?? ""}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : shouldShowUtilityControls ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {canToggleReady ? (
              <button
                type="button"
                onClick={() => onReadyChange(!isReady)}
                disabled={!canPublish}
                className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass("utility")}`}
              >
                {isReady ? "Cancel Ready" : "Mark Ready"}
              </button>
            ) : null}
            {canStart ? (
              <button
                type="button"
                onClick={onStart}
                disabled={!canPublish}
                className="min-h-11 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Tournament
              </button>
            ) : null}
            {showDisconnect ? (
              <button
                type="button"
                onClick={onDisconnect}
                className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass("utility")}`}
              >
                {tournamentStatus === "WAITING" ? "Leave Waiting Room" : "Disconnect"}
              </button>
            ) : null}
            {showReconnect ? (
              <button
                type="button"
                onClick={onReconnect}
                disabled={!canPublish}
                className="min-h-11 rounded-xl border border-sky-300/30 bg-sky-400/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reconnect
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 px-1 text-xs text-zinc-300">{idleMessage}</p>
        )}
      </div>

    </>
  );
}
