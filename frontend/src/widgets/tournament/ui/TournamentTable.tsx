import { useEffect, useState, type ReactNode } from "react";
import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";
import type { StackDisplayMode } from "@/features/table/model/stack-display";
import { PlayerSeat } from "@/features/player/ui/PlayerSeat";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type TournamentTableProps = {
  snapshot: TournamentSnapshot;
  currentGuestId?: string;
  stackDisplayMode: StackDisplayMode;
  onStackDisplayModeChange: (mode: StackDisplayMode) => void;
  actionBar?: ReactNode;
};

const TOTAL_SEATS = 6;
const HERO_TABLE_POSITION_INDEX = 4;
const SEAT_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: "18%", top: "24%" },
  1: { left: "50%", top: "4%" },
  2: { left: "82%", top: "24%" },
  3: { left: "82%", top: "58%" },
  4: { left: "50%", top: "57%" },
  5: { left: "18%", top: "58%" },
};
const BET_MARKER_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: "24%", top: "33%" },
  1: { left: "50%", top: "19%" },
  2: { left: "76%", top: "33%" },
  3: { left: "74%", top: "51%" },
  4: { left: "50%", top: "50.6%" },
  5: { left: "26%", top: "51%" },
};

// Spreads players into a fixed six-seat array for the ring layout.
function buildSeatMap(players: TournamentPlayer[]) {
  const seats: Array<TournamentPlayer | undefined> = new Array(TOTAL_SEATS).fill(undefined);

  for (const player of players) {
    seats[player.seatIndex] = player;
  }

  return seats;
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

function BetMarker({
  amount,
  acting,
  tablePositionIndex,
}: {
  amount: number;
  acting: boolean;
  tablePositionIndex: number;
}) {
  const isHeroMarker = tablePositionIndex === HERO_TABLE_POSITION_INDEX;
  const chipBaseClass = isHeroMarker ? "h-3 w-4.5 sm:h-3.5 sm:w-5" : "h-2.5 w-4 sm:h-3 sm:w-4.5";
  const stackFrameClass = isHeroMarker ? "h-5.5 w-5 sm:h-6.5 sm:w-6" : "h-4.5 w-4.5 sm:h-5.5 sm:w-5";

  return (
    <div className="pointer-events-none flex flex-col items-center gap-0.5">
      <span
        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow-md shadow-black/30 sm:text-[10px] ${
          acting ? "border-amber-200/35 bg-black/55 text-amber-50" : "border-white/10 bg-black/45"
        }`}
      >
        {amount}
      </span>
      <div className={`relative ${stackFrameClass}`}>
        <span
          className={`absolute left-1/2 bottom-0 -translate-x-1/2 rounded-full border border-black/85 bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f3f3f3_55%,_#d6d6d6)] shadow-sm shadow-black/25 ${chipBaseClass}`}
        />
        <span
          className={`absolute left-1/2 bottom-1 -translate-x-1/2 rounded-full border border-black/85 bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f3f3f3_55%,_#d6d6d6)] shadow-sm shadow-black/25 ${chipBaseClass}`}
        />
        <span
          className={`absolute left-1/2 bottom-1 -translate-x-1/2 rounded-full border border-black bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f7f7f7_48%,_#d2d2d2)] shadow-md shadow-black/30 ${chipBaseClass} ${
            acting ? "ring-1 ring-amber-200/45" : ""
          }`}
        />
        <span
          className={`absolute left-1/2 bottom-1 -translate-x-1/2 rounded-full border border-black/90 ${chipBaseClass}`}
          style={{
            clipPath: "inset(0 round 999px)",
            background:
              "linear-gradient(90deg, #111 0 10%, #fff 10% 22%, #111 22% 32%, #fff 32% 44%, #111 44% 56%, #fff 56% 68%, #111 68% 78%, #fff 78% 90%, #111 90% 100%)",
            opacity: 0.95,
            maskImage: "radial-gradient(circle at center, transparent 0 34%, black 35%)",
          }}
        />
      </div>
    </div>
  );
}

// Renders the table, board cards, main pot, and side-pot summary.
export function TournamentTable({
  snapshot,
  currentGuestId,
  stackDisplayMode,
  onStackDisplayModeChange,
  actionBar,
}: TournamentTableProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(snapshot.secondsUntilNextLevel);
  const seats = buildSeatMap(snapshot.players);
  const displayedSeatIndexes = buildDisplayedSeatIndexes(snapshot.players, currentGuestId);
  const showdownHoleCardsByGuestId = new Map(
    snapshot.showdownHands.map((hand) => [hand.guestId, hand.holeCards] as const),
  );
  const actingPlayer = snapshot.players.find((player) => player.seatIndex === snapshot.actingSeat) ?? null;
  const streetLabel = getStreetLabel(snapshot.boardCards);
  const resultSummary = buildResultSummary(snapshot);
  const totalPot = snapshot.mainPot + snapshot.sidePots.reduce((total, pot) => total + pot.amount, 0);
  const boardSlots = Array.from({ length: 5 }, (_, index) => snapshot.boardCards[index] ?? null);
  const showBoardSlots = snapshot.status !== "WAITING" || snapshot.boardCards.length > 0;
  const betMarkers = buildBetMarkers(snapshot, displayedSeatIndexes);
  const sidePotSummary = buildSidePotSummary(snapshot);
  const levelProgressPercent = getLevelProgressPercent(secondsRemaining, snapshot.currentLevel.durationSeconds);
  const levelTimerState = getLevelTimerState(secondsRemaining, snapshot.currentLevel.durationSeconds);
  const centerStatusLabel = resultSummary
    ? "Hand settled"
    : actingPlayer
      ? `${actingPlayer.nickname} acting`
      : snapshot.status.replaceAll("_", " ");

  useEffect(() => {
    const updateRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecondsRemaining(Math.max(0, snapshot.levelEndsAtEpochSecond - now));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [snapshot.levelEndsAtEpochSecond, snapshot.stateVersion]);

  return (
    <div className="relative mx-auto h-[650px] w-full max-w-[430px] overflow-hidden rounded-2xl border border-emerald-200/10 bg-[#07100d] shadow-2xl shadow-black/35 sm:h-[720px] sm:max-w-4xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(44,126,87,0.34),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.05),_transparent_20%,_rgba(0,0,0,0.35))]" />
      <div className="absolute left-1/2 top-1/2 h-[360px] w-[72%] min-w-[300px] max-w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border-[10px] border-[#3f2d25] bg-[radial-gradient(circle,_#276b4a,_#12452f_64%,_#082116)] shadow-[inset_0_0_55px_rgba(0,0,0,0.55)] sm:h-[420px] sm:border-[18px]" />
      <div className="absolute bottom-[10%] left-1/2 h-28 w-48 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(34,211,238,0.18),_transparent_72%)] blur-2xl sm:h-36 sm:w-72" />
      <div
        className="absolute left-1/2 z-10 w-[min(82%,23rem)] -translate-x-1/2 -translate-y-1/2 text-center sm:w-[29rem]"
        style={{ top: showBoardSlots ? "35.5%" : "38.5%" }}
      >
        <div className="mx-auto flex max-w-max flex-wrap items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-1.5 text-[10px] font-medium text-zinc-100 backdrop-blur-sm sm:gap-2 sm:px-3 sm:py-2 sm:text-xs">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-emerald-100">
            {streetLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{centerStatusLabel}</span>
        </div>
        {resultSummary ? (
          <div className="mx-auto mt-2.5 max-w-xs rounded-2xl border border-amber-200/20 bg-[linear-gradient(135deg,_rgba(146,64,14,0.58),_rgba(12,12,12,0.86))] px-3 py-2.5 shadow-xl shadow-black/30">
            <div className="flex items-center justify-center gap-2">
              <p className="text-sm font-semibold text-white">{resultSummary.headline}</p>
              <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                {resultSummary.amountLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-50/80 sm:text-xs">{resultSummary.detail}</p>
          </div>
        ) : null}
        <p className="mt-3 text-[10px] uppercase tracking-[0.24em] text-zinc-300">Pot</p>
        <p className="mt-1 text-[2rem] font-black leading-none text-amber-100 sm:text-[3.5rem]">{totalPot}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[10px] text-zinc-200 sm:text-xs">
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">Main {snapshot.mainPot}</span>
          {sidePotSummary.map((pot) => (
            <span key={pot.id} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
              {pot.label} {pot.amount}
            </span>
          ))}
        </div>
        {showBoardSlots ? (
          <div className="mt-3 flex justify-center gap-1.5 sm:mt-4 sm:gap-3">
            {boardSlots.map((card, index) =>
              card ? (
                <PlayingCard key={card} card={card} />
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
              transform: "translateX(-50%)",
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
            tablePositionIndex={marker.tablePositionIndex}
          />
        </div>
      ))}

      <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-2 py-1.5 text-[10px] font-medium text-zinc-100 backdrop-blur-sm sm:left-4 sm:top-4 sm:text-xs">
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
                  selected ? "bg-white/14 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {mode === "chips" ? "Chips" : "BB"}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="absolute right-3 top-3 z-20 w-[8.9rem] rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-right text-[10px] font-medium text-zinc-100 backdrop-blur-sm sm:right-4 sm:top-4 sm:w-[10rem] sm:text-xs"
      >
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">Blinds</p>
        <p className="mt-1 font-semibold">
          {snapshot.currentLevel.smallBlind}/{snapshot.currentLevel.bigBlind}
        </p>
        <p className="mt-1 text-[10px] text-zinc-400">
          Next {snapshot.nextLevel.smallBlind}/{snapshot.nextLevel.bigBlind}
        </p>
        <p className={`mt-1 text-[10px] ${levelTimerState.timerClass}`}>
          {formatLevelCountdown(secondsRemaining)}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ${levelTimerState.barClass}`}
            style={{ width: `${levelProgressPercent}%` }}
          />
        </div>
      </div>

      {actionBar ? <div className="absolute inset-x-3 bottom-3 z-40 sm:inset-x-4 sm:bottom-4">{actionBar}</div> : null}
    </div>
  );
}
