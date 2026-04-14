import { useEffect, useState } from "react";
import type { TournamentPauseReason, TournamentPlayer, TournamentStatus } from "@/entities/tournament/model/types";
import { buildActionPanelViewModel } from "@/features/table/model/action-panel";
import {
  formatAmountDisplay,
  formatAmountInputValue,
  parseAmountInputValue,
  type StackDisplayMode,
} from "@/features/table/model/stack-display";

type ActionPanelProps = {
  actions: string[];
  chipsToCall: number;
  minimumRaiseTo: number;
  potSize: number;
  bigBlind: number;
  message: string;
  tournamentStatus: TournamentStatus;
  currentPlayer: TournamentPlayer | null;
  paused: boolean;
  pauseReason: TournamentPauseReason | null;
  actionDeadlineAtEpochMilli: number;
  actionTimeoutSeconds: number;
  stackDisplayMode: StackDisplayMode;
  canPublish: boolean;
  onAction: (action: string, amount?: number) => void;
  onReadyChange: (ready: boolean) => void;
  onStart: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onReturnToPlay: () => void;
};

type SizingPreset = {
  label: string;
  value: number;
  enabled: boolean;
};

function getKeypadRows(stackDisplayMode: StackDisplayMode) {
  if (stackDisplayMode === "bb") {
    return [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["C", "0", "."],
      ["<-"],
    ];
  }

  return [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["C", "0", "<-"],
  ];
}

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
  const committed = currentPlayer?.roundContribution ?? 0;
  return clampCommitment(Math.max(committed + 1, minimumRaiseTo), currentPlayer);
}

function buildPresetTargets({
  currentPlayer,
  minimumRaiseTo,
  potSize,
  bigBlind,
}: {
  currentPlayer: TournamentPlayer | null;
  minimumRaiseTo: number;
  potSize: number;
  bigBlind: number;
}): SizingPreset[] {
  const committed = currentPlayer?.roundContribution ?? 0;
  const maxCommitment = getMaxCommitment(currentPlayer);
  const twoBigBlindTarget = Math.max(1, bigBlind * 2);
  const threeBigBlindTarget = Math.max(1, bigBlind * 3);
  const halfPotTarget = Math.max(1, Math.ceil(Math.max(0, potSize) / 2));
  const twoThirdPotTarget = Math.max(1, Math.ceil((Math.max(0, potSize) * 2) / 3));
  const potTarget = Math.max(1, potSize);
  const isExactTargetPlayable = (target: number) =>
    target > committed && target >= minimumRaiseTo && target <= maxCommitment;

  return [
    {
      label: "2 BB",
      value: twoBigBlindTarget,
      enabled: isExactTargetPlayable(twoBigBlindTarget),
    },
    {
      label: "3 BB",
      value: threeBigBlindTarget,
      enabled: isExactTargetPlayable(threeBigBlindTarget),
    },
    {
      label: "1/2 Pot",
      value: halfPotTarget,
      enabled: isExactTargetPlayable(halfPotTarget),
    },
    {
      label: "2/3 Pot",
      value: twoThirdPotTarget,
      enabled: isExactTargetPlayable(twoThirdPotTarget),
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

function getPrimaryActionLabel({
  action,
  chipsToCall,
  bigBlind,
  stackDisplayMode,
}: {
  action: string | null;
  chipsToCall: number;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
}) {
  if (action === "CHECK") {
    return "Check";
  }

  if (action === "CALL") {
    return chipsToCall > 0
      ? `Call ${formatAmountDisplay({ amount: chipsToCall, bigBlind, mode: stackDisplayMode })}`
      : "Call";
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

function buildSizeButtonCaption({
  sizeAction,
  minimumRaiseTo,
  currentPlayer,
  bigBlind,
  stackDisplayMode,
}: {
  sizeAction: string | null;
  minimumRaiseTo: number;
  currentPlayer: TournamentPlayer | null;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
}) {
  if (!sizeAction || !currentPlayer) {
    return null;
  }

  const maxCommitment = getMaxCommitment(currentPlayer);
  if (sizeAction === "BET" || sizeAction === "RAISE") {
    return `Min ${formatAmountDisplay({
      amount: Math.max(currentPlayer.roundContribution + 1, minimumRaiseTo),
      bigBlind,
      mode: stackDisplayMode,
    })}`;
  }

  return maxCommitment > 0
    ? `Max ${formatAmountDisplay({ amount: maxCommitment, bigBlind, mode: stackDisplayMode })}`
    : null;
}

function buildSizedSubmitLabel({
  action,
  amount,
  bigBlind,
  stackDisplayMode,
}: {
  action: string | null;
  amount: number | null;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
}) {
  if (!action) {
    return "Confirm";
  }

  if (amount === null) {
    return `Set ${getSizedActionLabel(action)}`;
  }

  return `${getSizedActionLabel(action)} to ${formatAmountDisplay({
    amount,
    bigBlind,
    mode: stackDisplayMode,
  })}`;
}

function buildTargetHelperMessage({
  action,
  amount,
  rawAmount,
  currentPlayer,
  minimumRaiseTo,
  bigBlind,
  stackDisplayMode,
}: {
  action: string | null;
  amount: number | null;
  rawAmount: string;
  currentPlayer: TournamentPlayer | null;
  minimumRaiseTo: number;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
}) {
  if (!action || !currentPlayer) {
    return { text: "Tap a preset or enter a total amount.", tone: "text-zinc-400" };
  }

  const committed = currentPlayer.roundContribution;
  const maxCommitment = getMaxCommitment(currentPlayer);
  if (!rawAmount) {
    return {
      text: `Enter ${formatAmountDisplay({
        amount: minimumRaiseTo,
        bigBlind,
        mode: stackDisplayMode,
      })}-${formatAmountDisplay({
        amount: maxCommitment,
        bigBlind,
        mode: stackDisplayMode,
      })}.`,
      tone: "text-zinc-400",
    };
  }

  if (amount === null) {
    return {
      text: stackDisplayMode === "bb" ? "Use numbers with up to 1 decimal place." : "Digits only.",
      tone: "text-rose-200",
    };
  }

  if (amount <= committed) {
    return {
      text: `Must be above ${formatAmountDisplay({ amount: committed, bigBlind, mode: stackDisplayMode })}.`,
      tone: "text-rose-200",
    };
  }

  if (amount < minimumRaiseTo) {
    return {
      text: `Minimum is ${formatAmountDisplay({ amount: minimumRaiseTo, bigBlind, mode: stackDisplayMode })}.`,
      tone: "text-rose-200",
    };
  }

  if (amount > maxCommitment) {
    return {
      text: `Maximum is ${formatAmountDisplay({ amount: maxCommitment, bigBlind, mode: stackDisplayMode })}.`,
      tone: "text-rose-200",
    };
  }

  return {
    text: `${getSizedActionLabel(action)} to ${formatAmountDisplay({
      amount,
      bigBlind,
      mode: stackDisplayMode,
    })}`,
    tone: "text-emerald-200/80",
  };
}

function buildSizingDisplayAmount({
  rawAmount,
  parsedTargetAmount,
  bigBlind,
  stackDisplayMode,
}: {
  rawAmount: string;
  parsedTargetAmount: number | null;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
}) {
  if (!rawAmount) {
    return stackDisplayMode === "bb" ? "0 BB" : "0";
  }

  if (parsedTargetAmount === null) {
    return stackDisplayMode === "bb" ? `${rawAmount} BB` : rawAmount;
  }

  return formatAmountDisplay({
    amount: parsedTargetAmount,
    bigBlind,
    mode: stackDisplayMode,
  });
}

function buildSliderCommitment({
  parsedTargetAmount,
  currentPlayer,
  minimumRaiseTo,
}: {
  parsedTargetAmount: number | null;
  currentPlayer: TournamentPlayer | null;
  minimumRaiseTo: number;
}) {
  if (!currentPlayer) {
    return null;
  }

  const minCommitment = Math.max(currentPlayer.roundContribution + 1, minimumRaiseTo);
  const maxCommitment = getMaxCommitment(currentPlayer);
  if (maxCommitment < minCommitment) {
    return null;
  }

  if (parsedTargetAmount === null) {
    return buildSuggestedCommitment({ currentPlayer, minimumRaiseTo });
  }

  return Math.min(Math.max(parsedTargetAmount, minCommitment), maxCommitment);
}

function buildSliderDeltaLabel({
  sliderCommitment,
  currentPlayer,
  bigBlind,
  stackDisplayMode,
}: {
  sliderCommitment: number | null;
  currentPlayer: TournamentPlayer | null;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
}) {
  if (sliderCommitment === null || !currentPlayer) {
    return null;
  }

  const delta = Math.max(0, sliderCommitment - currentPlayer.roundContribution);
  if (delta <= 0) {
    return null;
  }

  return `+${formatAmountDisplay({ amount: delta, bigBlind, mode: stackDisplayMode })}`;
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

function formatActionTimerLabel(secondsRemaining: number) {
  return secondsRemaining >= 10 ? `${Math.ceil(secondsRemaining)}s left` : `${secondsRemaining.toFixed(1)}s left`;
}

function buildIdleMessage({
  currentPlayer,
  tournamentStatus,
  paused,
  pauseReason,
  canPublish,
  message,
}: Pick<ActionPanelProps, "currentPlayer" | "tournamentStatus" | "paused" | "pauseReason" | "canPublish" | "message">) {
  if (!currentPlayer) {
    return "Join a seat to play from this browser.";
  }

  if (!currentPlayer.connected) {
    return "Reconnect this seat to resume play.";
  }

  if (currentPlayer.afk) {
    return "Return to play to stop automatic check or fold actions on your turns.";
  }

  if (paused) {
    return pauseReason === "ALL_PLAYERS_AFK"
      ? "All active players are AFK. The hand will resume when the current actor returns to play."
      : "The hand is paused.";
  }

  if (!canPublish) {
    return "Waiting for the live connection.";
  }

  if (tournamentStatus === "WAITING") {
    return currentPlayer.owner ? "Get everyone ready, then start the game." : "Tap Ready when you're set.";
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
  bigBlind,
  message,
  tournamentStatus,
  currentPlayer,
  paused,
  pauseReason,
  actionDeadlineAtEpochMilli,
  actionTimeoutSeconds,
  stackDisplayMode,
  canPublish,
  onAction,
  onReadyChange,
  onStart,
  onDisconnect,
  onReconnect,
  onReturnToPlay,
}: ActionPanelProps) {
  const [targetAmount, setTargetAmount] = useState("");
  const [isSizingOpen, setIsSizingOpen] = useState(false);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const keypadRows = getKeypadRows(stackDisplayMode);
  const {
    sizeAction,
    directActions,
    isReady,
    canToggleReady,
    canStart,
    canAct,
    showDisconnect,
    showReconnect,
    showReturnToPlay,
    canSubmitSizedAction,
  } = buildActionPanelViewModel({
    actions,
    currentPlayer,
    tournamentStatus,
    paused,
    canPublish,
  });
  const primaryAction = getPrimaryAction(directActions);
  const canFold = directActions.includes("FOLD");
  const allInAction = directActions.includes("ALL_IN") ? "ALL_IN" : null;
  const committed = currentPlayer?.roundContribution ?? 0;
  const presetTargets = buildPresetTargets({ currentPlayer, minimumRaiseTo, potSize, bigBlind });
  const parsedTargetAmount = parseAmountInputValue({
    value: targetAmount,
    bigBlind,
    mode: stackDisplayMode,
  });
  const hasValidTargetAmount = isValidTargetCommitment(parsedTargetAmount, currentPlayer, minimumRaiseTo);
  const shouldShowCallAmount = primaryAction === "CALL" && chipsToCall > 0;
  const shouldShowInHandControls =
    tournamentStatus === "IN_HAND" &&
    !paused &&
    !currentPlayer?.afk &&
    (canAct || !!allInAction || !!sizeAction || !!primaryAction);
  const shouldShowUtilityControls =
    showReturnToPlay || (tournamentStatus !== "IN_HAND" && (canToggleReady || canStart || showDisconnect || showReconnect));
  const idleMessage = buildIdleMessage({ currentPlayer, tournamentStatus, paused, pauseReason, canPublish, message });
  const shouldShowActionTimer =
    tournamentStatus === "IN_HAND" &&
    !paused &&
    actionDeadlineAtEpochMilli > 0 &&
    actionTimeoutSeconds > 0 &&
    !!currentPlayer?.acting &&
    !currentPlayer.afk;
  const totalActionWindowMs = actionTimeoutSeconds * 1_000;
  const remainingActionMs = shouldShowActionTimer ? Math.max(0, actionDeadlineAtEpochMilli - timerNow) : 0;
  const timerProgress = shouldShowActionTimer ? Math.min(1, remainingActionMs / totalActionWindowMs) : 0;
  const secondsRemaining = remainingActionMs / 1_000;
  const actionTimerLabel = currentPlayer?.acting ? "Your turn timer" : "Action timer";
  const maxCommitment = getMaxCommitment(currentPlayer);
  const minimumTarget = Math.max(committed + 1, minimumRaiseTo);
  const sizeButtonCaption = buildSizeButtonCaption({
    sizeAction,
    minimumRaiseTo,
    currentPlayer,
    bigBlind,
    stackDisplayMode,
  });
  const targetHelper = buildTargetHelperMessage({
    action: sizeAction,
    amount: parsedTargetAmount,
    rawAmount: targetAmount,
    currentPlayer,
    minimumRaiseTo,
    bigBlind,
    stackDisplayMode,
  });
  const sizingDisplayAmount = buildSizingDisplayAmount({
    rawAmount: targetAmount,
    parsedTargetAmount,
    bigBlind,
    stackDisplayMode,
  });
  const sliderCommitment = buildSliderCommitment({
    parsedTargetAmount,
    currentPlayer,
    minimumRaiseTo,
  });
  const sliderDeltaLabel = buildSliderDeltaLabel({
    sliderCommitment,
    currentPlayer,
    bigBlind,
    stackDisplayMode,
  });

  useEffect(() => {
    if (!sizeAction) {
      setIsSizingOpen(false);
      setTargetAmount("");
    }
  }, [sizeAction]);

  useEffect(() => {
    setIsSizingOpen(false);
    setTargetAmount("");
  }, [stackDisplayMode]);

  useEffect(() => {
    if (!shouldShowActionTimer) {
      setTimerNow(Date.now());
      return;
    }

    setTimerNow(Date.now());
    const timerId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 200);

    return () => {
      window.clearInterval(timerId);
    };
  }, [shouldShowActionTimer, actionDeadlineAtEpochMilli]);

  const actionTimerTone =
    timerProgress <= 0.25
      ? "bg-rose-400"
      : timerProgress <= 0.5
        ? "bg-amber-300"
        : "bg-emerald-300";

  const openSizer = () => {
    if (!sizeAction) {
      return;
    }

    setTargetAmount((current) =>
      current ||
      formatAmountInputValue({
        amount: buildSuggestedCommitment({ currentPlayer, minimumRaiseTo }),
        bigBlind,
        mode: stackDisplayMode,
      }),
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

    if (key === "." && stackDisplayMode === "bb") {
      setTargetAmount((current) => {
        if (current.includes(".")) {
          return current;
        }

        return current ? `${current}.` : "0.";
      });
      return;
    }

    setTargetAmount((current) => {
      const next = `${current}${key}`;
      if (stackDisplayMode === "bb") {
        const normalizedNext = next.replace(/^0+(?=\d)/, "");
        return /^\d+(\.\d?)?$/.test(normalizedNext) || normalizedNext === "" ? normalizedNext : current;
      }

      return next.replace(/^0+(?=\d)/, "");
    });
  };

  const handlePresetSelect = (value: number) => {
    setTargetAmount(
      formatAmountInputValue({
        amount: value,
        bigBlind,
        mode: stackDisplayMode,
      }),
    );
  };

  const handleSliderChange = (value: number) => {
    setTargetAmount(
      formatAmountInputValue({
        amount: value,
        bigBlind,
        mode: stackDisplayMode,
      }),
    );
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
      <div className="relative rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(6,10,9,0.95),_rgba(5,8,7,0.92))] p-2.5 shadow-2xl shadow-black/35 backdrop-blur-md sm:p-3">
        {paused ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">Hand paused</span>
              <span className="text-xs font-semibold text-amber-50">All players AFK</span>
            </div>
            <p className="mt-1.5 text-xs text-amber-50/80">
              {pauseReason === "ALL_PLAYERS_AFK"
                ? "Return to Play to resume once the current actor is back."
                : "Waiting for play to resume."}
            </p>
          </div>
        ) : null}

        {shouldShowActionTimer ? (
          <div className={`${paused ? "mt-2" : ""} rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                {actionTimerLabel}
              </span>
              <span className="text-[11px] font-semibold text-white">{formatActionTimerLabel(secondsRemaining)}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${actionTimerTone}`}
                style={{ width: `${Math.max(0, Math.min(100, timerProgress * 100))}%` }}
              />
            </div>
          </div>
        ) : null}

        {shouldShowInHandControls ? (
          <div className="relative mt-2.5 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onAction("FOLD")}
              disabled={!canPublish || !canAct || !canFold}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${getButtonClass("fold")}`}
            >
              <span>Fold</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (primaryAction) {
                  onAction(primaryAction);
                }
              }}
              disabled={!canPublish || !canAct || !primaryAction}
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${getButtonClass("primary")}`}
            >
              <span>{getPrimaryActionLabel({ action: primaryAction, chipsToCall, bigBlind, stackDisplayMode })}</span>
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
              className={`flex min-h-12 flex-col items-center justify-center rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${getButtonClass("size")}`}
            >
              <span>{sizeAction ? getSizedActionLabel(sizeAction) : allInAction ? "All in" : "Wait"}</span>
              {sizeAction && sizeButtonCaption ? (
                <span className="mt-0.5 text-[10px] font-medium text-fuchsia-100/75">{sizeButtonCaption}</span>
              ) : allInAction && currentPlayer ? (
                <span className="mt-0.5 text-[10px] font-medium text-fuchsia-100/75">
                  To {formatAmountDisplay({ amount: maxCommitment, bigBlind, mode: stackDisplayMode })}
                </span>
              ) : null}
            </button>

            {isSizingOpen && sizeAction ? (
              <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-50 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(10,14,12,0.98),_rgba(6,9,8,0.98))] shadow-2xl shadow-black/45 sm:left-auto sm:right-0 sm:w-[20rem]">
                <div className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2.5 sm:px-2.5 sm:py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      {getSizedActionLabel(sizeAction)} amount
                    </p>
                    <p className="mt-1 truncate text-[1.4rem] font-black leading-none text-white sm:text-2xl">
                      {sizingDisplayAmount}
                    </p>
                    <p className={`mt-1 text-[10px] leading-tight ${targetHelper.tone}`}>{targetHelper.text}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">
                      {stackDisplayMode === "bb" ? "Enter BB total" : "Enter chip total"}
                    </p>
                    {stackDisplayMode === "bb" && parsedTargetAmount !== null ? (
                      <p className="mt-0.5 text-[10px] leading-tight text-zinc-500">{parsedTargetAmount} chips total</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSizingOpen(false)}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-200 transition hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] gap-0">
                  <div>
                    <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-1.5 text-[10px] text-zinc-200 sm:px-2.5 sm:py-1.5">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                        Pot {formatAmountDisplay({ amount: potSize, bigBlind, mode: stackDisplayMode })}
                      </span>
                      <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-50">
                        To{" "}
                        {sliderCommitment
                          ? formatAmountDisplay({ amount: sliderCommitment, bigBlind, mode: stackDisplayMode })
                          : "--"}
                      </span>
                      {sliderDeltaLabel ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{sliderDeltaLabel}</span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 border-b border-white/10 px-3 py-2 sm:px-2.5 sm:py-2">
                      {presetTargets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handlePresetSelect(preset.value)}
                          disabled={!preset.enabled}
                          className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-1 py-1.5 text-center text-[10px] font-medium text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-9"
                        >
                          <span className="block truncate">{preset.label}</span>
                          <span className="mt-0.5 block text-[11px] font-semibold leading-none text-white sm:text-[13px]">
                            {formatAmountDisplay({ amount: preset.value, bigBlind, mode: stackDisplayMode })}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-2.5 sm:p-2">
                      {keypadRows.flat().map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleCalculatorKey(key)}
                          className={`min-h-10 rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-base font-semibold text-white transition hover:bg-white/10 sm:min-h-9 sm:text-sm ${
                            stackDisplayMode === "bb" && key === "<-" ? "col-span-3" : ""
                          }`}
                        >
                          {key}
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-white/10 px-3 py-2.5 sm:px-2.5 sm:py-2">
                      <button
                        type="button"
                        onClick={submitSizedAction}
                        disabled={!canSubmitSizedAction || !hasValidTargetAmount}
                        className={`min-h-11 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass("size")}`}
                      >
                        {buildSizedSubmitLabel({ action: sizeAction, amount: parsedTargetAmount, bigBlind, stackDisplayMode })}
                      </button>
                    </div>
                  </div>

                  <div className="border-l border-white/10 bg-[linear-gradient(180deg,_rgba(17,24,39,0.44),_rgba(5,8,7,0.14))] px-2 py-2">
                    <div className="flex h-full flex-col items-center justify-between gap-2">
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Max</p>
                        <p className="mt-1 text-[10px] font-semibold text-zinc-100">
                          {formatAmountDisplay({ amount: maxCommitment, bigBlind, mode: stackDisplayMode })}
                        </p>
                      </div>
                      <div className="flex min-h-[11.5rem] items-center justify-center">
                        <input
                          type="range"
                          min={minimumTarget}
                          max={Math.max(minimumTarget, maxCommitment)}
                          step={1}
                          value={sliderCommitment ?? minimumTarget}
                          onChange={(event) => handleSliderChange(Number(event.target.value))}
                          disabled={sliderCommitment === null}
                          className="action-panel-vertical-slider"
                          aria-label={`${getSizedActionLabel(sizeAction)} slider`}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Min</p>
                        <p className="mt-1 text-[10px] font-semibold text-zinc-100">
                          {formatAmountDisplay({ amount: minimumTarget, bigBlind, mode: stackDisplayMode })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : shouldShowUtilityControls ? (
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {canToggleReady ? (
              <button
                type="button"
                onClick={() => onReadyChange(!isReady)}
                disabled={!canPublish}
                className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass("utility")}`}
              >
                {isReady ? "Cancel Ready" : "Ready Up"}
              </button>
            ) : null}
            {canStart ? (
              <button
                type="button"
                onClick={onStart}
                disabled={!canPublish}
                className="min-h-10 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Game
              </button>
            ) : null}
            {showDisconnect ? (
              <button
                type="button"
                onClick={onDisconnect}
                className={`min-h-10 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${getButtonClass("utility")}`}
              >
                {tournamentStatus === "WAITING" ? "Leave Table" : "Disconnect"}
              </button>
            ) : null}
            {showReconnect ? (
              <button
                type="button"
                onClick={onReconnect}
                disabled={!canPublish}
                className="min-h-10 rounded-xl border border-sky-300/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reconnect
              </button>
            ) : null}
            {showReturnToPlay ? (
              <button
                type="button"
                onClick={onReturnToPlay}
                disabled={!canPublish}
                className="min-h-10 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Return to Play
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
