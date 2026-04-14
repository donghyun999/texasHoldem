import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";
import { formatAmountDisplay, type StackDisplayMode } from "@/features/table/model/stack-display";
import { PlayerSeat } from "@/features/player/ui/PlayerSeat";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type TournamentTableProps = {
  snapshot: TournamentSnapshot;
  currentGuestId?: string;
  stackDisplayMode: StackDisplayMode;
  onStackDisplayModeChange: (mode: StackDisplayMode) => void;
  actionBar?: ReactNode;
};

type FlyingChipMotion = {
  id: string;
  amount: number;
  bigBlind: number;
  expiresAt: number;
  startLeft: string;
  startTop: string;
  endLeft: string;
  endTop: string;
  startOffsetX: number;
  startOffsetY: number;
  endOffsetX: number;
  endOffsetY: number;
  lift: number;
  delayMs: number;
};

type PreviousBetState = {
  code: string;
  handNumber: number;
  stateVersion: number;
  contributionByGuest: Map<string, number>;
  statusByGuest: Map<string, TournamentPlayer["status"]>;
  guestIdBySeat: Map<number, string>;
  actingSeat: number | null;
  boardCards: string[];
  totalPot: number;
  maximumContribution: number;
  winnerGuestIds: string[];
  totalContribution: number;
  mainPot: number;
  status: TournamentSnapshot["status"];
};

type SeatActionFlash = {
  id: string;
  guestId: string;
  label: string;
  tone: "neutral" | "aggressive" | "danger" | "success";
};

type SeatPulse = {
  id: string;
  guestId: string;
};

const TOTAL_SEATS = 6;
const HERO_TABLE_POSITION_INDEX = 4;
const SEAT_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: "24%", top: "18%" },
  1: { left: "50%", top: "11.5%" },
  2: { left: "76%", top: "18%" },
  3: { left: "91%", top: "47%" },
  4: { left: "50%", top: "73.8%" },
  5: { left: "9%", top: "47%" },
};
const BET_MARKER_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: "38.5%", top: "28.5%" },
  1: { left: "50%", top: "23.2%" },
  2: { left: "61.5%", top: "28.5%" },
  3: { left: "67.5%", top: "42.5%" },
  4: { left: "50%", top: "55.5%" },
  5: { left: "32.5%", top: "42.5%" },
};
const POT_COLLECTION_POSITION = { left: "50%", top: "41.8%" };
const BET_CHIP_ANIMATION_MS = 680;
const BET_CHIP_CLEANUP_BUFFER_MS = 80;
const POT_CHIP_ANIMATION_MS = 620;
const POT_CHIP_CLEANUP_BUFFER_MS = 80;
const POT_COLLECTION_SETTLE_BUFFER_MS = 40;
const MAX_ANIMATABLE_STATE_GAP = 1;
const DEAL_PULSE_DURATION_MS = 620;
const DEAL_PULSE_BASE_DELAY_MS = 40;
const DEAL_PULSE_STAGGER_MS = 72;
const ACTION_FLASH_DURATION_MS = 860;
const ACTOR_FOCUS_DELAY_WITH_ACTION_MS = 180;
const ACTOR_FOCUS_DELAY_WITH_CHIP_FLIGHT_MS = 220;
const ACTOR_FOCUS_DELAY_WITH_BOARD_REVEAL_MS = 140;
const POT_PULSE_LANDING_OFFSET_MS = 420;

function buildSeatMap(players: TournamentPlayer[]) {
  const seats: Array<TournamentPlayer | undefined> = new Array(TOTAL_SEATS).fill(undefined);

  for (const player of players) {
    seats[player.seatIndex] = player;
  }

  return seats;
}

function isAnimatableChipTransition(previousBetState: PreviousBetState, snapshot: TournamentSnapshot) {
  return (
    previousBetState.code === snapshot.code &&
    previousBetState.handNumber === snapshot.handNumber &&
    snapshot.stateVersion > previousBetState.stateVersion &&
    snapshot.stateVersion - previousBetState.stateVersion <= MAX_ANIMATABLE_STATE_GAP
  );
}

function buildWinnerGuestIds(snapshot: TournamentSnapshot) {
  if ((snapshot.status !== "HAND_RESULT" && snapshot.status !== "FINISHED") || snapshot.showdownPots.length === 0) {
    return [];
  }

  const payoutByGuest = new Map<string, number>();
  for (const pot of snapshot.showdownPots) {
    for (const payout of pot.payouts) {
      payoutByGuest.set(payout.guestId, (payoutByGuest.get(payout.guestId) ?? 0) + payout.amount);
    }
  }

  const bestAmount = Math.max(0, ...payoutByGuest.values());
  if (bestAmount <= 0) {
    return [];
  }

  return [...payoutByGuest.entries()]
    .filter(([, amount]) => amount === bestAmount)
    .map(([guestId]) => guestId);
}

function haveSameGuestIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((guestId, index) => guestId === rightSorted[index]);
}

function buildPreviousActorFlash(previousBetState: PreviousBetState, snapshot: TournamentSnapshot) {
  if (previousBetState.actingSeat === null) {
    return null;
  }

  const previousActorGuestId = previousBetState.guestIdBySeat.get(previousBetState.actingSeat);
  if (!previousActorGuestId) {
    return null;
  }

  const currentPlayer = snapshot.players.find((player) => player.guestId === previousActorGuestId);
  if (!currentPlayer) {
    return null;
  }

  const previousContribution = previousBetState.contributionByGuest.get(previousActorGuestId) ?? 0;
  const contributionDelta = currentPlayer.roundContribution - previousContribution;
  const previousStatus = previousBetState.statusByGuest.get(previousActorGuestId) ?? currentPlayer.status;
  const becameAllIn = currentPlayer.status === "ALL_IN" && previousStatus !== "ALL_IN";

  if (currentPlayer.status === "FOLDED" && previousStatus !== "FOLDED") {
    return {
      guestId: previousActorGuestId,
      label: "Fold",
      tone: "danger" as const,
    };
  }

  if (becameAllIn && contributionDelta <= 0) {
    return {
      guestId: previousActorGuestId,
      label: "All in",
      tone: "aggressive" as const,
    };
  }

  if (contributionDelta > 0) {
    if (currentPlayer.roundContribution > previousBetState.maximumContribution) {
      return {
        guestId: previousActorGuestId,
        label: becameAllIn ? "All in" : previousBetState.maximumContribution > 0 ? "Raise" : "Bet",
        tone: "aggressive" as const,
      };
    }

    return {
      guestId: previousActorGuestId,
      label:
        becameAllIn && currentPlayer.roundContribution < previousBetState.maximumContribution ? "All in" : "Call",
      tone:
        becameAllIn && currentPlayer.roundContribution < previousBetState.maximumContribution
          ? ("aggressive" as const)
          : ("neutral" as const),
    };
  }

  if (becameAllIn) {
    return {
      guestId: previousActorGuestId,
      label: "All in",
      tone: "aggressive" as const,
    };
  }

  if (snapshot.actingSeat !== previousBetState.actingSeat || snapshot.stateVersion > previousBetState.stateVersion) {
    return {
      guestId: previousActorGuestId,
      label: "Check",
      tone: "neutral" as const,
    };
  }

  return null;
}

function buildDealingOrder(players: TournamentPlayer[], dealerSeat: number | null) {
  const eligiblePlayers = players.filter((player) => player.participating && player.status !== "BUSTED_OUT");
  if (eligiblePlayers.length === 0) {
    return [];
  }

  if (dealerSeat === null) {
    return [...eligiblePlayers].sort((left, right) => left.seatIndex - right.seatIndex);
  }

  return [...eligiblePlayers].sort((left, right) => {
    const leftOffset = normalizeSeatIndex(left.seatIndex - dealerSeat);
    const rightOffset = normalizeSeatIndex(right.seatIndex - dealerSeat);
    return leftOffset - rightOffset;
  });
}

function normalizeSeatIndex(index: number) {
  return (index + TOTAL_SEATS) % TOTAL_SEATS;
}

function buildDisplayedSeatIndexes(players: TournamentPlayer[], currentGuestId?: string) {
  const currentPlayerSeat = players.find((player) => player.guestId === currentGuestId)?.seatIndex;
  const rotationOffset =
    currentPlayerSeat === undefined ? 0 : normalizeSeatIndex(currentPlayerSeat - HERO_TABLE_POSITION_INDEX);

  return Array.from({ length: TOTAL_SEATS }, (_, tablePositionIndex) =>
    normalizeSeatIndex(tablePositionIndex + rotationOffset),
  );
}

function getStreetLabel(boardCards: string[]) {
  switch (boardCards.length) {
    case 0:
      return "Preflop";
    case 3:
      return "Flop";
    case 4:
      return "Turn";
    case 5:
      return "River";
    default:
      return "Table";
  }
}

function buildResultSummary(snapshot: TournamentSnapshot) {
  if ((snapshot.status !== "HAND_RESULT" && snapshot.status !== "FINISHED") || snapshot.showdownPots.length === 0) {
    return null;
  }

  const payoutTotals = new Map<string, { nickname: string; amount: number }>();
  for (const pot of snapshot.showdownPots) {
    for (const payout of pot.payouts) {
      const current = payoutTotals.get(payout.guestId);
      payoutTotals.set(payout.guestId, {
        nickname: payout.nickname,
        amount: (current?.amount ?? 0) + payout.amount,
      });
    }
  }

  const orderedPayouts = [...payoutTotals.entries()]
    .map(([guestId, value]) => ({ guestId, nickname: value.nickname, amount: value.amount }))
    .sort((left, right) => right.amount - left.amount);
  if (orderedPayouts.length === 0) {
    return null;
  }

  const bestAmount = orderedPayouts[0].amount;
  const bestWinners = orderedPayouts.filter((entry) => entry.amount === bestAmount);
  if (bestWinners.length > 1) {
    const winnerNames = bestWinners.map((winner) => winner.nickname);
    const detail =
      winnerNames.length > 2
        ? `${winnerNames.slice(0, 2).join(", ")} +${winnerNames.length - 2}`
        : winnerNames.join(", ");

    return {
      headline: "Split Pot",
      detail,
      amountLabel: `+${bestAmount}`,
    };
  }

  const winner = bestWinners[0];
  const showdownHand = snapshot.showdownHands.find((hand) => hand.guestId === winner.guestId);
  return {
    headline: winner.nickname,
    detail: showdownHand?.handLabel ?? "Won the hand",
    amountLabel: `+${winner.amount}`,
  };
}

function buildSidePotSummary(snapshot: TournamentSnapshot) {
  return snapshot.sidePots.map((pot, index) => ({
    id: pot.id,
    label: `Side ${index + 1}`,
    amount: pot.amount,
  }));
}

function formatLevelCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isBlindClockActive(status: TournamentSnapshot["status"]) {
  return status !== "WAITING" && status !== "FINISHED";
}

function buildDisplayedLevelSeconds(snapshot: TournamentSnapshot) {
  if (!isBlindClockActive(snapshot.status)) {
    return Math.max(0, snapshot.currentLevel.durationSeconds);
  }

  if (snapshot.levelEndsAtEpochSecond > 0) {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, snapshot.levelEndsAtEpochSecond - now);
  }

  return Math.max(0, snapshot.secondsUntilNextLevel);
}

function getLevelProgressPercent(secondsRemaining: number, durationSeconds: number) {
  if (durationSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (secondsRemaining / durationSeconds) * 100));
}

function getLevelTimerState(secondsRemaining: number, durationSeconds: number) {
  if (secondsRemaining <= 15) {
    return {
      timerClass: "text-rose-100",
      barClass: "bg-[linear-gradient(90deg,_rgba(251,113,133,0.98),_rgba(239,68,68,0.72))]",
    };
  }

  if (secondsRemaining <= 60) {
    return {
      timerClass: "text-amber-100",
      barClass: "bg-[linear-gradient(90deg,_rgba(250,204,21,0.95),_rgba(249,115,22,0.7))]",
    };
  }

  return {
    timerClass: "text-zinc-300",
    barClass: "bg-[linear-gradient(90deg,_rgba(45,212,191,0.92),_rgba(56,189,248,0.7))]",
  };
}

function getPausedLevelTimerState() {
  return {
    timerClass: "text-amber-100",
    barClass: "bg-[linear-gradient(90deg,_rgba(245,158,11,0.7),_rgba(161,98,7,0.78))]",
  };
}

function buildBetMarkers(snapshot: TournamentSnapshot, displayedSeatIndexes: number[]) {
  return Array.from({ length: TOTAL_SEATS }, (_, tablePositionIndex) => {
    const actualSeatIndex = displayedSeatIndexes[tablePositionIndex];
    const player = snapshot.players.find((candidate) => candidate.seatIndex === actualSeatIndex);
    if (!player || player.roundContribution <= 0 || snapshot.status !== "IN_HAND") {
      return null;
    }

    return {
      player,
      tablePositionIndex,
      amount: player.roundContribution,
    };
  }).filter((entry): entry is { player: TournamentPlayer; tablePositionIndex: number; amount: number } => entry !== null);
}

type ChipPalette = {
  outerClass: string;
  innerClass: string;
  stripeStyle: string;
  glowClass: string;
};

function getChipPalette(colorTier: "white" | "red" | "black"): ChipPalette {
  if (colorTier === "black") {
    return {
      outerClass:
        "bg-[radial-gradient(circle_at_50%_40%,_#fde68a,_#ca8a04_34%,_#111827_78%)] border-black/90",
      innerClass:
        "bg-[radial-gradient(circle_at_50%_40%,_#fef3c7,_#d97706_45%,_#1f2937)] border-black",
      stripeStyle:
        "linear-gradient(90deg, #111827 0 10%, #fde68a 10% 22%, #111827 22% 32%, #fef3c7 32% 44%, #111827 44% 56%, #fde68a 56% 68%, #111827 68% 78%, #fef3c7 78% 90%, #111827 90% 100%)",
      glowClass: "shadow-[0_0_14px_rgba(245,158,11,0.22)]",
    };
  }

  if (colorTier === "red") {
    return {
      outerClass:
        "bg-[radial-gradient(circle_at_50%_40%,_#ffe4e6,_#e11d48_34%,_#4c0519_78%)] border-rose-950/90",
      innerClass:
        "bg-[radial-gradient(circle_at_50%_40%,_#fff1f2,_#f43f5e_48%,_#881337)] border-rose-950",
      stripeStyle:
        "linear-gradient(90deg, #4c0519 0 10%, #ffe4e6 10% 22%, #4c0519 22% 32%, #fda4af 32% 44%, #4c0519 44% 56%, #ffe4e6 56% 68%, #4c0519 68% 78%, #fda4af 78% 90%, #4c0519 90% 100%)",
      glowClass: "shadow-[0_0_10px_rgba(244,63,94,0.16)]",
    };
  }

  return {
    outerClass:
      "bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f3f3f3_55%,_#d6d6d6)] border-black/85",
    innerClass:
      "bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f7f7f7_48%,_#d2d2d2)] border-black",
    stripeStyle:
      "linear-gradient(90deg, #111 0 10%, #fff 10% 22%, #111 22% 32%, #fff 32% 44%, #111 44% 56%, #fff 56% 68%, #111 68% 78%, #fff 78% 90%, #111 90% 100%)",
    glowClass: "",
  };
}

function getChipVisualTier(amount: number, bigBlind: number) {
  const normalizedBlind = Math.max(1, bigBlind);

  if (amount > normalizedBlind * 16) {
    return {
      colorTier: "black" as const,
      chipCount: 2,
    };
  }

  if (amount > normalizedBlind * 8) {
    return {
      colorTier: "black" as const,
      chipCount: 1,
    };
  }

  if (amount > normalizedBlind * 4) {
    return {
      colorTier: "red" as const,
      chipCount: 2,
    };
  }

  if (amount > normalizedBlind * 2) {
    return {
      colorTier: "red" as const,
      chipCount: 1,
    };
  }

  if (amount > normalizedBlind) {
    return {
      colorTier: "white" as const,
      chipCount: 2,
    };
  }

  return {
    colorTier: "white" as const,
    chipCount: 1,
  };
}

function PokerChipStack({
  amount,
  acting,
  bigBlind,
  hero,
}: {
  amount: number;
  acting: boolean;
  bigBlind: number;
  hero: boolean;
}) {
  const visualTier = getChipVisualTier(amount, bigBlind);
  const palette = getChipPalette(visualTier.colorTier);
  const chipCount = visualTier.chipCount;
  const chipWidthClass = hero ? "w-4 sm:w-4.5" : "w-3.5 sm:w-4";
  const chipHeightClass = hero ? "h-2.5 sm:h-3" : "h-2.5 sm:h-2.5";
  const containerHeight = hero ? 11 + (chipCount - 1) * 2.5 : 10 + (chipCount - 1) * 2.5;

  return (
    <div
      className={`relative ${hero ? "w-5.5 sm:w-6" : "w-4.5 sm:w-5"} ${palette.glowClass}`}
      style={{ height: `${containerHeight}px` }}
    >
      {Array.from({ length: chipCount }, (_, index) => {
        const bottomOffset = index * 2.2;
        const lateralOffset = chipCount > 1 ? (index % 2 === 0 ? -0.35 : 0.35) * index : 0;

        return (
          <div
            key={`chip-${index}`}
            className="absolute left-1/2"
            style={{
              bottom: `${bottomOffset}px`,
              transform: `translateX(calc(-50% + ${lateralOffset}px))`,
              zIndex: index + 1,
            }}
          >
            <span
              className={`absolute left-1/2 bottom-0 -translate-x-1/2 rounded-full border ${chipHeightClass} ${chipWidthClass} ${palette.outerClass}`}
            />
            <span
              className={`absolute left-1/2 bottom-[1px] -translate-x-1/2 rounded-full border ${
                acting ? "ring-1 ring-amber-200/45" : ""
              } ${chipHeightClass} ${chipWidthClass} ${palette.innerClass}`}
            />
            <span
              className={`absolute left-1/2 bottom-[1px] -translate-x-1/2 rounded-full border border-black/90 ${chipHeightClass} ${chipWidthClass}`}
              style={{
                clipPath: "inset(0 round 999px)",
                background: palette.stripeStyle,
                opacity: 0.95,
                maskImage: "radial-gradient(circle at center, transparent 0 34%, black 35%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function buildFlyingChipBurstCount(amount: number, bigBlind: number) {
  const normalizedBlind = Math.max(1, bigBlind);

  if (amount > normalizedBlind * 8) {
    return 3;
  }

  if (amount > normalizedBlind * 2) {
    return 2;
  }

  return 1;
}

function FlyingChipToken({ amount, bigBlind }: { amount: number; bigBlind: number }) {
  const palette = getChipPalette(getChipVisualTier(amount, bigBlind).colorTier);

  return (
    <div className={`relative h-3 w-4.5 sm:h-3.5 sm:w-5 ${palette.glowClass}`}>
      <span
        className={`absolute left-1/2 bottom-0 h-3 w-4.5 -translate-x-1/2 rounded-full border sm:h-3.5 sm:w-5 ${palette.outerClass}`}
      />
      <span
        className={`absolute left-1/2 bottom-[1px] h-3 w-4.5 -translate-x-1/2 rounded-full border sm:h-3.5 sm:w-5 ${palette.innerClass}`}
      />
      <span
        className="absolute left-1/2 bottom-[1px] h-3 w-4.5 -translate-x-1/2 rounded-full border border-black/90 sm:h-3.5 sm:w-5"
        style={{
          clipPath: "inset(0 round 999px)",
          background: palette.stripeStyle,
          opacity: 0.95,
          maskImage: "radial-gradient(circle at center, transparent 0 34%, black 35%)",
        }}
      />
    </div>
  );
}

function BetMarker({
  amount,
  acting,
  bigBlind,
  stackDisplayMode,
  tablePositionIndex,
}: {
  amount: number;
  acting: boolean;
  bigBlind: number;
  stackDisplayMode: StackDisplayMode;
  tablePositionIndex: number;
}) {
  const isHeroMarker = tablePositionIndex === HERO_TABLE_POSITION_INDEX;
  const amountLabel = formatAmountDisplay({
    amount,
    bigBlind,
    mode: stackDisplayMode,
    includeUnit: stackDisplayMode === "bb",
  });

  return (
    <div className="pointer-events-none flex items-center gap-1">
      <PokerChipStack amount={amount} acting={acting} bigBlind={bigBlind} hero={isHeroMarker} />
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold leading-none text-white shadow-md shadow-black/30 sm:text-[9px] ${
          acting ? "border-amber-200/35 bg-black/60 text-amber-50" : "border-white/10 bg-black/50"
        }`}
      >
        {amountLabel}
      </span>
    </div>
  );
}

export function TournamentTable({
  snapshot,
  currentGuestId,
  stackDisplayMode,
  onStackDisplayModeChange,
  actionBar,
}: TournamentTableProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => buildDisplayedLevelSeconds(snapshot));
  const [actionTimerNow, setActionTimerNow] = useState(() => Date.now());
  const [flyingBetChips, setFlyingBetChips] = useState<FlyingChipMotion[]>([]);
  const [flyingPotChips, setFlyingPotChips] = useState<FlyingChipMotion[]>([]);
  const [potPulseId, setPotPulseId] = useState<string | null>(null);
  const [revealedBoardCards, setRevealedBoardCards] = useState<string[]>([]);
  const [seatActionFlashes, setSeatActionFlashes] = useState<SeatActionFlash[]>([]);
  const [dealPulses, setDealPulses] = useState<SeatPulse[]>([]);
  const [foldPulses, setFoldPulses] = useState<SeatPulse[]>([]);
  const [actorFocusPulses, setActorFocusPulses] = useState<SeatPulse[]>([]);
  const [winnerPulses, setWinnerPulses] = useState<SeatPulse[]>([]);
  const previousBetStateRef = useRef<PreviousBetState | null>(null);
  const flyingChipIdRef = useRef(0);
  const uiEffectIdRef = useRef(0);
  const flyingBetChipsRef = useRef<FlyingChipMotion[]>([]);
  const betChipTimeoutIdsRef = useRef<number[]>([]);
  const potChipTimeoutIdsRef = useRef<number[]>([]);
  const potCollectionTimeoutIdsRef = useRef<number[]>([]);
  const uiEffectTimeoutIdsRef = useRef<number[]>([]);
  const seats = buildSeatMap(snapshot.players);
  const displayedSeatIndexes = buildDisplayedSeatIndexes(snapshot.players, currentGuestId);
  const showdownHoleCardsByGuestId = new Map(
    snapshot.showdownHands.map((hand) => [hand.guestId, hand.holeCards] as const),
  );
  const actingPlayer = snapshot.players.find((player) => player.seatIndex === snapshot.actingSeat) ?? null;
  const streetLabel = getStreetLabel(snapshot.boardCards);
  const resultSummary = buildResultSummary(snapshot);
  const totalPot = snapshot.mainPot + snapshot.sidePots.reduce((total, pot) => total + pot.amount, 0);
  const winnerGuestIds = buildWinnerGuestIds(snapshot);
  const winnerGuestIdsKey = winnerGuestIds.join("|");
  const winnerGuestIdSet = new Set(winnerGuestIds);
  const boardSlots = Array.from({ length: 5 }, (_, index) => snapshot.boardCards[index] ?? null);
  const showBoardSlots = snapshot.status !== "WAITING" || snapshot.boardCards.length > 0;
  const betMarkers = buildBetMarkers(snapshot, displayedSeatIndexes);
  const sidePotSummary = buildSidePotSummary(snapshot);
  const revealedBoardCardSet = new Set(revealedBoardCards);
  const seatActionFlashByGuestId = new Map(seatActionFlashes.map((entry) => [entry.guestId, entry] as const));
  const dealPulseByGuestId = new Map(dealPulses.map((entry) => [entry.guestId, entry.id] as const));
  const foldPulseByGuestId = new Map(foldPulses.map((entry) => [entry.guestId, entry.id] as const));
  const actorFocusPulseByGuestId = new Map(actorFocusPulses.map((entry) => [entry.guestId, entry.id] as const));
  const winnerPulseByGuestId = new Map(winnerPulses.map((entry) => [entry.guestId, entry.id] as const));
  const blindClockActive = isBlindClockActive(snapshot.status);
  const showOpponentActionTimer =
    snapshot.status === "IN_HAND" &&
    !snapshot.paused &&
    snapshot.actionDeadlineAtEpochMilli > 0 &&
    snapshot.actionTimeoutSeconds > 0;
  const totalActionWindowMs = snapshot.actionTimeoutSeconds * 1_000;
  const remainingActionMs = showOpponentActionTimer ? Math.max(0, snapshot.actionDeadlineAtEpochMilli - actionTimerNow) : 0;
  const opponentActionTimerProgress =
    showOpponentActionTimer && totalActionWindowMs > 0 ? Math.min(1, remainingActionMs / totalActionWindowMs) : 0;
  const levelProgressPercent = getLevelProgressPercent(secondsRemaining, snapshot.currentLevel.durationSeconds);
  const levelTimerState = snapshot.paused
    ? getPausedLevelTimerState()
    : getLevelTimerState(secondsRemaining, snapshot.currentLevel.durationSeconds);
  const totalPotLabel = formatAmountDisplay({
    amount: totalPot,
    bigBlind: snapshot.currentLevel.bigBlind,
    mode: stackDisplayMode,
    includeUnit: stackDisplayMode === "bb",
  });
  const mainPotLabel = formatAmountDisplay({
    amount: snapshot.mainPot,
    bigBlind: snapshot.currentLevel.bigBlind,
    mode: stackDisplayMode,
    includeUnit: stackDisplayMode === "bb",
  });
  const centerStatusLabel = resultSummary
    ? "Hand settled"
    : snapshot.paused
      ? "Hand paused"
      : actingPlayer
        ? `${actingPlayer.nickname} acting`
        : snapshot.status.replaceAll("_", " ");

  const createUiEffectId = (prefix: string) => {
    const id = `${prefix}-${snapshot.handNumber}-${snapshot.stateVersion}-${uiEffectIdRef.current}`;
    uiEffectIdRef.current += 1;
    return id;
  };

  const replaceFlyingBetChips = (
    updater: FlyingChipMotion[] | ((current: FlyingChipMotion[]) => FlyingChipMotion[]),
  ) => {
    setFlyingBetChips((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      flyingBetChipsRef.current = next;
      return next;
    });
  };

  const replaceFlyingPotChips = (
    updater: FlyingChipMotion[] | ((current: FlyingChipMotion[]) => FlyingChipMotion[]),
  ) => {
    setFlyingPotChips((current) => (typeof updater === "function" ? updater(current) : updater));
  };

  const clearTrackedTimeouts = (timeoutIdsRef: { current: number[] }) => {
    for (const timeoutId of timeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    timeoutIdsRef.current = [];
  };

  const scheduleTrackedTimeout = (
    timeoutIdsRef: { current: number[] },
    callback: () => void,
    delayMs: number,
  ) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((entry) => entry !== timeoutId);
      callback();
    }, delayMs);

    timeoutIdsRef.current.push(timeoutId);
    return timeoutId;
  };

  const triggerPotPulse = (delayMs = 0) => {
    scheduleTrackedTimeout(uiEffectTimeoutIdsRef, () => {
      const pulseId = createUiEffectId("pot-pulse");
      setPotPulseId(pulseId);
      scheduleTrackedTimeout(uiEffectTimeoutIdsRef, () => {
        setPotPulseId((current) => (current === pulseId ? null : current));
      }, 420);
    }, delayMs);
  };

  const triggerBoardReveal = (cardIds: string[]) => {
    if (cardIds.length === 0) {
      return;
    }

    setRevealedBoardCards((current) => [...new Set([...current, ...cardIds])]);
    scheduleTrackedTimeout(uiEffectTimeoutIdsRef, () => {
      setRevealedBoardCards((current) => current.filter((cardId) => !cardIds.includes(cardId)));
    }, 760);
  };

  const queueSeatActionFlash = (guestId: string, label: SeatActionFlash["label"], tone: SeatActionFlash["tone"]) => {
    const flashId = createUiEffectId(`seat-action-${guestId}`);
    const nextFlash = { id: flashId, guestId, label, tone };
    setSeatActionFlashes((current) => [...current.filter((entry) => entry.guestId !== guestId), nextFlash]);
    scheduleTrackedTimeout(uiEffectTimeoutIdsRef, () => {
      setSeatActionFlashes((current) => current.filter((entry) => entry.id !== flashId));
    }, ACTION_FLASH_DURATION_MS);
  };

  const queueSeatPulse = (
    guestId: string,
    prefix: string,
    setter: Dispatch<SetStateAction<SeatPulse[]>>,
    durationMs: number,
    delayMs = 0,
  ) => {
    scheduleTrackedTimeout(uiEffectTimeoutIdsRef, () => {
      const pulseId = createUiEffectId(`${prefix}-${guestId}`);
      const nextPulse = { id: pulseId, guestId };
      setter((current) => [...current.filter((entry) => entry.guestId !== guestId), nextPulse]);
      scheduleTrackedTimeout(uiEffectTimeoutIdsRef, () => {
        setter((current) => current.filter((entry) => entry.id !== pulseId));
      }, durationMs);
    }, delayMs);
  };

  useEffect(() => {
    const updateRemaining = () => {
      setSecondsRemaining(buildDisplayedLevelSeconds(snapshot));
    };

    updateRemaining();
    if (!blindClockActive) {
      return;
    }

    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    blindClockActive,
    snapshot.currentLevel.durationSeconds,
    snapshot.levelEndsAtEpochSecond,
    snapshot.secondsUntilNextLevel,
    snapshot.paused,
    snapshot.stateVersion,
    snapshot.status,
  ]);

  useEffect(() => {
    if (!showOpponentActionTimer) {
      setActionTimerNow(Date.now());
      return;
    }

    setActionTimerNow(Date.now());
    const intervalId = window.setInterval(() => {
      setActionTimerNow(Date.now());
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [showOpponentActionTimer, snapshot.actionDeadlineAtEpochMilli, snapshot.actingSeat, snapshot.stateVersion]);

  useEffect(() => {
    return () => {
      clearTrackedTimeouts(betChipTimeoutIdsRef);
      clearTrackedTimeouts(potChipTimeoutIdsRef);
      clearTrackedTimeouts(potCollectionTimeoutIdsRef);
      clearTrackedTimeouts(uiEffectTimeoutIdsRef);
    };
  }, []);

  useEffect(() => {
    const previousBetState = previousBetStateRef.current;

    clearTrackedTimeouts(betChipTimeoutIdsRef);
    clearTrackedTimeouts(potChipTimeoutIdsRef);
    clearTrackedTimeouts(potCollectionTimeoutIdsRef);
    clearTrackedTimeouts(uiEffectTimeoutIdsRef);
    replaceFlyingBetChips([]);
    replaceFlyingPotChips([]);
    setPotPulseId(null);
    setRevealedBoardCards([]);
    setSeatActionFlashes([]);
    setDealPulses([]);
    setFoldPulses([]);
    setActorFocusPulses([]);
    setWinnerPulses([]);

    if (
      previousBetState &&
      previousBetState.code === snapshot.code &&
      snapshot.handNumber > previousBetState.handNumber &&
      snapshot.status === "IN_HAND"
    ) {
      const dealingOrder = buildDealingOrder(snapshot.players, snapshot.dealerSeat);
      dealingOrder.forEach((player, index) => {
        queueSeatPulse(
          player.guestId,
          "deal-in",
          setDealPulses,
          DEAL_PULSE_DURATION_MS,
          DEAL_PULSE_BASE_DELAY_MS + index * DEAL_PULSE_STAGGER_MS,
        );
      });
    }
  }, [snapshot.code, snapshot.handNumber]);

  useEffect(() => {
    const currentContributionByGuest = new Map(snapshot.players.map((player) => [player.guestId, player.roundContribution]));
    const currentStatusByGuest = new Map(snapshot.players.map((player) => [player.guestId, player.status] as const));
    const currentGuestIdBySeat = new Map(snapshot.players.map((player) => [player.seatIndex, player.guestId] as const));
    const currentTotalContribution = snapshot.players.reduce((total, player) => total + player.roundContribution, 0);
    const currentMaximumContribution = snapshot.players.reduce(
      (maximumContribution, player) => Math.max(maximumContribution, player.roundContribution),
      0,
    );
    const previousBetState = previousBetStateRef.current;
    const canAnimateTransition = previousBetState ? isAnimatableChipTransition(previousBetState, snapshot) : false;

    if (previousBetState && canAnimateTransition) {
      const actionFlash =
        previousBetState.status === "IN_HAND" && snapshot.status === "IN_HAND"
          ? buildPreviousActorFlash(previousBetState, snapshot)
          : null;
      const didRevealBoard =
        snapshot.status === "IN_HAND" &&
        previousBetState.status === "IN_HAND" &&
        snapshot.boardCards.length > previousBetState.boardCards.length;
      if (
        didRevealBoard
      ) {
        triggerBoardReveal(snapshot.boardCards.slice(previousBetState.boardCards.length));
      }

      if (
        winnerGuestIds.length > 0 &&
        !haveSameGuestIds(previousBetState.winnerGuestIds, winnerGuestIds) &&
        (snapshot.status === "HAND_RESULT" || snapshot.status === "FINISHED")
      ) {
        for (const guestId of winnerGuestIds) {
          queueSeatPulse(guestId, "winner-burst", setWinnerPulses, 1_200);
        }
      }

      if (actionFlash) {
        queueSeatActionFlash(actionFlash.guestId, actionFlash.label, actionFlash.tone);
        if (actionFlash.label === "Fold") {
          queueSeatPulse(actionFlash.guestId, "fold-out", setFoldPulses, 560);
        }
      }

      let hasNewBetFlight = false;
      if (previousBetState.status === "IN_HAND" && snapshot.status === "IN_HAND") {
        const nextFlyingBetChips: FlyingChipMotion[] = [];
        const animationStartedAt = Date.now();

        for (const player of snapshot.players) {
          const previousContribution = previousBetState.contributionByGuest.get(player.guestId) ?? 0;
          const contributionDelta = player.roundContribution - previousContribution;
          if (contributionDelta <= 0) {
            continue;
          }

          const tablePositionIndex = displayedSeatIndexes.findIndex((seatIndex) => seatIndex === player.seatIndex);
          if (tablePositionIndex < 0) {
            continue;
          }

          const burstCount = buildFlyingChipBurstCount(contributionDelta, snapshot.currentLevel.bigBlind);
          for (let index = 0; index < burstCount; index += 1) {
            const chipId = `flying-chip-${snapshot.stateVersion}-${flyingChipIdRef.current}`;
            flyingChipIdRef.current += 1;
            nextFlyingBetChips.push({
              id: chipId,
              amount: contributionDelta,
              bigBlind: snapshot.currentLevel.bigBlind,
              expiresAt: animationStartedAt + BET_CHIP_ANIMATION_MS + BET_CHIP_CLEANUP_BUFFER_MS + index * 45,
              startLeft: SEAT_POSITIONS[tablePositionIndex].left,
              startTop: SEAT_POSITIONS[tablePositionIndex].top,
              endLeft: BET_MARKER_POSITIONS[tablePositionIndex].left,
              endTop: BET_MARKER_POSITIONS[tablePositionIndex].top,
              startOffsetX: (index - (burstCount - 1) / 2) * 5,
              startOffsetY: tablePositionIndex === HERO_TABLE_POSITION_INDEX ? -12 - index * 2 : -4 - index,
              endOffsetX: (index - (burstCount - 1) / 2) * 4,
              endOffsetY: index % 2 === 0 ? -1 : 1,
              lift: 18 + index * 4,
              delayMs: index * 45,
            });
          }
        }

        if (nextFlyingBetChips.length > 0) {
          hasNewBetFlight = true;
          replaceFlyingBetChips((current) => [...current, ...nextFlyingBetChips]);
          for (const chip of nextFlyingBetChips) {
            scheduleTrackedTimeout(betChipTimeoutIdsRef, () => {
              replaceFlyingBetChips((current) => current.filter((entry) => entry.id !== chip.id));
            }, BET_CHIP_ANIMATION_MS + BET_CHIP_CLEANUP_BUFFER_MS + chip.delayMs);
          }
        }
      }

      const shouldCollectToPot =
        previousBetState.totalContribution > 0 &&
        currentTotalContribution === 0 &&
        (snapshot.mainPot > previousBetState.mainPot || snapshot.status !== previousBetState.status);
      let collectionDelayMs = 0;

      if (shouldCollectToPot) {
        const latestBetChipExpiry = flyingBetChipsRef.current.reduce(
          (latestExpiry, chip) => Math.max(latestExpiry, chip.expiresAt),
          0,
        );
        collectionDelayMs =
          latestBetChipExpiry > 0
            ? Math.max(0, latestBetChipExpiry - Date.now()) + POT_COLLECTION_SETTLE_BUFFER_MS
            : 0;

        scheduleTrackedTimeout(potCollectionTimeoutIdsRef, () => {
          const nextFlyingPotChips: FlyingChipMotion[] = [];
          const animationStartedAt = Date.now();

          for (const player of snapshot.players) {
            const previousContribution = previousBetState.contributionByGuest.get(player.guestId) ?? 0;
            if (previousContribution <= 0) {
              continue;
            }

            const tablePositionIndex = displayedSeatIndexes.findIndex((seatIndex) => seatIndex === player.seatIndex);
            if (tablePositionIndex < 0) {
              continue;
            }

            const burstCount = buildFlyingChipBurstCount(previousContribution, snapshot.currentLevel.bigBlind);
            for (let index = 0; index < burstCount; index += 1) {
              const chipId = `pot-chip-${snapshot.stateVersion}-${flyingChipIdRef.current}`;
              flyingChipIdRef.current += 1;
              nextFlyingPotChips.push({
                id: chipId,
                amount: previousContribution,
                bigBlind: snapshot.currentLevel.bigBlind,
                expiresAt: animationStartedAt + POT_CHIP_ANIMATION_MS + POT_CHIP_CLEANUP_BUFFER_MS + index * 35,
                startLeft: BET_MARKER_POSITIONS[tablePositionIndex].left,
                startTop: BET_MARKER_POSITIONS[tablePositionIndex].top,
                endLeft: POT_COLLECTION_POSITION.left,
                endTop: POT_COLLECTION_POSITION.top,
                startOffsetX: (index - (burstCount - 1) / 2) * 3,
                startOffsetY: index % 2 === 0 ? -1 : 1,
                endOffsetX: (index - (burstCount - 1) / 2) * 5,
                endOffsetY: -2 - index,
                lift: 12 + index * 3,
                delayMs: index * 35,
              });
            }
          }

          if (nextFlyingPotChips.length > 0) {
            replaceFlyingPotChips((current) => [...current, ...nextFlyingPotChips]);
            for (const chip of nextFlyingPotChips) {
              scheduleTrackedTimeout(potChipTimeoutIdsRef, () => {
                replaceFlyingPotChips((current) => current.filter((entry) => entry.id !== chip.id));
              }, POT_CHIP_ANIMATION_MS + POT_CHIP_CLEANUP_BUFFER_MS + chip.delayMs);
            }
          }
        }, collectionDelayMs);
      }

      if (totalPot > previousBetState.totalPot) {
        const potPulseDelayMs = shouldCollectToPot ? collectionDelayMs + POT_PULSE_LANDING_OFFSET_MS : 0;
        triggerPotPulse(potPulseDelayMs);
      }

      if (snapshot.status === "IN_HAND" && snapshot.actingSeat !== previousBetState.actingSeat && snapshot.actingSeat !== null) {
        const nextActorGuestId = currentGuestIdBySeat.get(snapshot.actingSeat);
        if (nextActorGuestId) {
          let actorFocusDelayMs = 0;

          if (actionFlash) {
            actorFocusDelayMs = Math.max(actorFocusDelayMs, ACTOR_FOCUS_DELAY_WITH_ACTION_MS);
          }

          if (hasNewBetFlight) {
            actorFocusDelayMs = Math.max(actorFocusDelayMs, ACTOR_FOCUS_DELAY_WITH_CHIP_FLIGHT_MS);
          }

          if (didRevealBoard) {
            actorFocusDelayMs = Math.max(actorFocusDelayMs, ACTOR_FOCUS_DELAY_WITH_BOARD_REVEAL_MS);
          }

          queueSeatPulse(nextActorGuestId, "actor-focus", setActorFocusPulses, 620, actorFocusDelayMs);
        }
      }
    }

    previousBetStateRef.current = {
      code: snapshot.code,
      handNumber: snapshot.handNumber,
      stateVersion: snapshot.stateVersion,
      contributionByGuest: currentContributionByGuest,
      statusByGuest: currentStatusByGuest,
      guestIdBySeat: currentGuestIdBySeat,
      actingSeat: snapshot.actingSeat,
      boardCards: [...snapshot.boardCards],
      totalPot,
      maximumContribution: currentMaximumContribution,
      winnerGuestIds: [...winnerGuestIds],
      totalContribution: currentTotalContribution,
      mainPot: snapshot.mainPot,
      status: snapshot.status,
    };
  }, [
    displayedSeatIndexes,
    snapshot.code,
    snapshot.currentLevel.bigBlind,
    snapshot.handNumber,
    snapshot.mainPot,
    snapshot.players,
    snapshot.stateVersion,
    snapshot.status,
    totalPot,
    winnerGuestIdsKey,
  ]);

  return (
    <div className="relative mx-auto h-[760px] w-full max-w-[430px] overflow-hidden rounded-[2rem] border border-emerald-200/10 bg-[#050b0a] shadow-2xl shadow-black/40 sm:h-[840px] sm:max-w-[520px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,_rgba(255,255,255,0.08),_transparent_24%),radial-gradient(circle_at_50%_54%,_rgba(56,189,248,0.08),_transparent_30%),linear-gradient(180deg,_rgba(10,22,21,0.96),_rgba(1,6,6,0.98))]" />
      <div className="absolute left-1/2 top-[43.5%] h-[540px] w-[76%] min-w-[286px] max-w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-[46%] border-[12px] border-[#4a3427] bg-[radial-gradient(circle_at_50%_34%,_rgba(53,161,103,0.5),_rgba(19,89,56,0.92)_38%,_rgba(7,31,22,0.98)_78%)] shadow-[0_35px_80px_rgba(0,0,0,0.5),inset_0_0_70px_rgba(0,0,0,0.48)] sm:h-[620px] sm:max-w-[388px] sm:border-[16px]" />
      <div className="absolute left-1/2 top-[43.5%] h-[505px] w-[68%] min-w-[258px] max-w-[312px] -translate-x-1/2 -translate-y-1/2 rounded-[46%] border border-emerald-100/10 bg-[radial-gradient(circle_at_50%_30%,_rgba(66,191,128,0.17),_transparent_30%)] sm:h-[578px] sm:max-w-[345px]" />
      <div className="absolute left-1/2 top-[69%] h-24 w-48 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(245,158,11,0.22),_transparent_70%)] blur-2xl sm:h-28 sm:w-60" />

      <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-2 py-1.5 text-[10px] font-medium text-zinc-100 backdrop-blur-sm sm:left-4 sm:top-4 sm:text-xs">
        <p className="font-semibold">{snapshot.code}</p>
        <div className="flex rounded-full border border-white/10 bg-black/30 p-0.5">
          {(["chips", "bb"] as const).map((mode) => {
            const selected = stackDisplayMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onStackDisplayModeChange(mode)}
                className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] transition sm:text-[10px] ${
                  selected ? "bg-white/15 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {mode === "chips" ? "Chips" : "BB"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-30 w-[7.8rem] rounded-2xl border border-white/10 bg-black/35 px-2.5 py-1.5 text-right text-[9px] font-medium text-zinc-100 backdrop-blur-sm sm:right-4 sm:top-4 sm:w-[8.8rem] sm:px-3 sm:py-2 sm:text-[11px]">
        <p className="text-[8px] uppercase tracking-[0.16em] text-zinc-500 sm:text-[9px]">Blinds</p>
        <p className="mt-0.5 font-semibold">
          {snapshot.currentLevel.smallBlind}/{snapshot.currentLevel.bigBlind}
        </p>
        <p className="mt-0.5 text-[9px] text-zinc-400 sm:text-[10px]">
          Next {snapshot.nextLevel.smallBlind}/{snapshot.nextLevel.bigBlind}
        </p>
        <div className="mt-1 flex items-center justify-end gap-1.5">
          {snapshot.paused ? (
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.16em] text-amber-100 sm:text-[9px]">
              Paused
            </span>
          ) : null}
          <p className={`text-[9px] ${levelTimerState.timerClass} sm:text-[10px]`}>{formatLevelCountdown(secondsRemaining)}</p>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10 sm:h-[5px]">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ${levelTimerState.barClass}`}
            style={{ width: `${levelProgressPercent}%` }}
          />
        </div>
      </div>

      <div
        className="absolute left-1/2 z-10 w-[min(74%,18rem)] -translate-x-1/2 -translate-y-1/2 text-center sm:w-[21rem]"
        style={{ top: showBoardSlots ? "37.8%" : "39%" }}
      >
        <div className="mx-auto flex max-w-max flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-[10px] font-medium text-zinc-100 backdrop-blur-sm sm:gap-2 sm:px-3 sm:text-xs">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-emerald-100">
            {streetLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{centerStatusLabel}</span>
        </div>
        {snapshot.paused ? (
          <div className="mx-auto mt-2 max-w-[16rem] rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 shadow-lg shadow-black/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">All Players AFK</p>
            <p className="mt-1 text-[11px] text-amber-50/85">{snapshot.tableMessage}</p>
          </div>
        ) : null}
        {resultSummary ? (
          <div className="mx-auto mt-2 max-w-[14rem] rounded-2xl border border-amber-200/20 bg-[linear-gradient(135deg,_rgba(146,64,14,0.56),_rgba(12,12,12,0.86))] px-3 py-2 shadow-xl shadow-black/30">
            <div className="flex items-center justify-center gap-2">
              <p className="text-sm font-semibold text-white">{resultSummary.headline}</p>
              <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                {resultSummary.amountLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-50/80">{resultSummary.detail}</p>
          </div>
        ) : null}
        <p className="mt-3 text-[9px] uppercase tracking-[0.24em] text-zinc-400 sm:text-[10px]">Pot</p>
        <div className="relative mx-auto mt-1 w-max">
          {potPulseId ? <span className="table-pot-pulse-ring" /> : null}
          <p
            key={potPulseId ?? "pot-static"}
            className={`relative text-[1.9rem] font-black leading-none text-amber-100 sm:text-[2.7rem] ${
              potPulseId ? "table-pot-value-pulse" : ""
            }`}
          >
            {totalPotLabel}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[9px] text-zinc-200 sm:text-[10px]">
          <span className="rounded-full border border-white/10 bg-black/35 px-2 py-1">Main {mainPotLabel}</span>
          {sidePotSummary.map((pot) => (
            <span key={pot.id} className="rounded-full border border-white/10 bg-black/35 px-2 py-1">
              {pot.label}{" "}
              {formatAmountDisplay({
                amount: pot.amount,
                bigBlind: snapshot.currentLevel.bigBlind,
                mode: stackDisplayMode,
                includeUnit: stackDisplayMode === "bb",
              })}
            </span>
          ))}
        </div>
        {showBoardSlots ? (
          <div className="mt-3 flex justify-center gap-0.5 scale-[0.92] sm:mt-4 sm:gap-2 sm:scale-100">
            {boardSlots.map((card, index) =>
              card ? (
                <div key={card} className={revealedBoardCardSet.has(card) ? "board-card-reveal" : ""}>
                  <PlayingCard card={card} />
                </div>
              ) : (
                <div
                  key={`board-slot-${index}`}
                  className="grid h-18 w-12 place-items-center rounded-lg border border-white/10 bg-black/20 text-xs text-white/25 sm:h-24 sm:w-16"
                >
                  {index + 1}
                </div>
              ),
            )}
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-xs rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">
            Waiting for ready players.
          </p>
        )}
      </div>

      {Array.from({ length: TOTAL_SEATS }, (_, tablePositionIndex) => {
        const actualSeatIndex = displayedSeatIndexes[tablePositionIndex];
        const isHeroPosition = tablePositionIndex === HERO_TABLE_POSITION_INDEX;

        return (
          <div
            key={`seat-${tablePositionIndex}`}
            className={`absolute z-20 ${isHeroPosition ? "z-30" : ""}`}
            style={{
              left: SEAT_POSITIONS[tablePositionIndex].left,
              top: SEAT_POSITIONS[tablePositionIndex].top,
              transform: "translate(-50%, -50%)",
            }}
          >
            <PlayerSeat
              player={seats[actualSeatIndex]}
              seatIndex={actualSeatIndex}
              tablePositionIndex={tablePositionIndex}
              dealerSeat={snapshot.dealerSeat}
              smallBlindSeat={snapshot.smallBlindSeat}
              bigBlindSeat={snapshot.bigBlindSeat}
              currentBigBlind={snapshot.currentLevel.bigBlind}
              stackDisplayMode={stackDisplayMode}
              currentGuestId={currentGuestId}
              selfHoleCards={snapshot.selfHoleCards}
              revealedHoleCards={seats[actualSeatIndex] ? showdownHoleCardsByGuestId.get(seats[actualSeatIndex]!.guestId) ?? [] : []}
              actionFlash={seats[actualSeatIndex] ? seatActionFlashByGuestId.get(seats[actualSeatIndex]!.guestId) ?? null : null}
              dealPulseId={seats[actualSeatIndex] ? dealPulseByGuestId.get(seats[actualSeatIndex]!.guestId) ?? null : null}
              foldPulseId={seats[actualSeatIndex] ? foldPulseByGuestId.get(seats[actualSeatIndex]!.guestId) ?? null : null}
              actorFocusPulseId={seats[actualSeatIndex] ? actorFocusPulseByGuestId.get(seats[actualSeatIndex]!.guestId) ?? null : null}
              winner={seats[actualSeatIndex] ? winnerGuestIdSet.has(seats[actualSeatIndex]!.guestId) : false}
              winnerPulseId={seats[actualSeatIndex] ? winnerPulseByGuestId.get(seats[actualSeatIndex]!.guestId) ?? null : null}
              showActionTimer={
                showOpponentActionTimer &&
                remainingActionMs > 0 &&
                !!seats[actualSeatIndex]?.acting &&
                !isHeroPosition
              }
              actionTimerProgress={opponentActionTimerProgress}
            />
          </div>
        );
      })}

      {betMarkers.map((marker) => (
        <div
          key={`bet-marker-${marker.player.guestId}`}
          className={`absolute z-20 ${marker.tablePositionIndex === HERO_TABLE_POSITION_INDEX ? "z-30" : ""}`}
          style={{
            left: BET_MARKER_POSITIONS[marker.tablePositionIndex].left,
            top: BET_MARKER_POSITIONS[marker.tablePositionIndex].top,
            transform: "translate(-50%, -50%)",
          }}
        >
          <BetMarker
            amount={marker.amount}
            acting={marker.player.acting}
            bigBlind={snapshot.currentLevel.bigBlind}
            stackDisplayMode={stackDisplayMode}
            tablePositionIndex={marker.tablePositionIndex}
          />
        </div>
      ))}

      {flyingBetChips.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-50">
          {flyingBetChips.map((chip) => {
            const style = {
              ["--chip-start-left" as string]: chip.startLeft,
              ["--chip-start-top" as string]: chip.startTop,
              ["--chip-end-left" as string]: chip.endLeft,
              ["--chip-end-top" as string]: chip.endTop,
              ["--chip-start-offset-x" as string]: `${chip.startOffsetX}px`,
              ["--chip-start-offset-y" as string]: `${chip.startOffsetY}px`,
              ["--chip-end-offset-x" as string]: `${chip.endOffsetX}px`,
              ["--chip-end-offset-y" as string]: `${chip.endOffsetY}px`,
              ["--chip-lift" as string]: `${chip.lift}px`,
              animationDelay: `${chip.delayMs}ms`,
            } as CSSProperties;

            return (
              <div key={chip.id} className="flying-bet-chip" style={style}>
                <FlyingChipToken amount={chip.amount} bigBlind={chip.bigBlind} />
              </div>
            );
          })}
        </div>
      ) : null}

      {flyingPotChips.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[45]">
          {flyingPotChips.map((chip) => {
            const style = {
              ["--chip-start-left" as string]: chip.startLeft,
              ["--chip-start-top" as string]: chip.startTop,
              ["--chip-end-left" as string]: chip.endLeft,
              ["--chip-end-top" as string]: chip.endTop,
              ["--chip-start-offset-x" as string]: `${chip.startOffsetX}px`,
              ["--chip-start-offset-y" as string]: `${chip.startOffsetY}px`,
              ["--chip-end-offset-x" as string]: `${chip.endOffsetX}px`,
              ["--chip-end-offset-y" as string]: `${chip.endOffsetY}px`,
              ["--chip-lift" as string]: `${chip.lift}px`,
              animationDelay: `${chip.delayMs}ms`,
            } as CSSProperties;

            return (
              <div key={chip.id} className="flying-pot-chip" style={style}>
                <FlyingChipToken amount={chip.amount} bigBlind={chip.bigBlind} />
              </div>
            );
          })}
        </div>
      ) : null}

      {actionBar ? <div className="absolute inset-x-3 bottom-3 z-40 sm:inset-x-4 sm:bottom-4">{actionBar}</div> : null}
    </div>
  );
}
