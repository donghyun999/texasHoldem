import { useEffect, useState, type ReactNode } from "react";
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

const TOTAL_SEATS = 6;
const HERO_TABLE_POSITION_INDEX = 4;
const SEAT_POSITIONS: Record<number, { left: string; top: string }> = {
  0: { left: "24%", top: "18%" },
  1: { left: "50%", top: "11.5%" },
  2: { left: "76%", top: "18%" },
  3: { left: "91%", top: "47%" },
  4: { left: "50%", top: "76.5%" },
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
      <div className={`relative ${isHeroMarker ? "h-4.5 w-5 sm:h-5.5 sm:w-6" : "h-4 w-4.5 sm:h-5 sm:w-5"}`}>
        <span
          className={`absolute left-1/2 bottom-0 -translate-x-1/2 rounded-full border border-black/85 bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f3f3f3_55%,_#d6d6d6)] ${
            isHeroMarker ? "h-2.5 w-4 sm:h-3 sm:w-4.5" : "h-2.5 w-4 sm:h-3 sm:w-4"
          }`}
        />
        <span
          className={`absolute left-1/2 bottom-0.5 -translate-x-1/2 rounded-full border border-black bg-[radial-gradient(circle_at_50%_40%,_#ffffff,_#f7f7f7_48%,_#d2d2d2)] ${
            acting ? "ring-1 ring-amber-200/45" : ""
          } ${isHeroMarker ? "h-2.5 w-4 sm:h-3 sm:w-4.5" : "h-2.5 w-4 sm:h-3 sm:w-4"}`}
        />
        <span
          className={`absolute left-1/2 bottom-0.5 -translate-x-1/2 rounded-full border border-black/90 ${
            isHeroMarker ? "h-2.5 w-4 sm:h-3 sm:w-4.5" : "h-2.5 w-4 sm:h-3 sm:w-4"
          }`}
          style={{
            clipPath: "inset(0 round 999px)",
            background:
              "linear-gradient(90deg, #111 0 10%, #fff 10% 22%, #111 22% 32%, #fff 32% 44%, #111 44% 56%, #fff 56% 68%, #111 68% 78%, #fff 78% 90%, #111 90% 100%)",
            opacity: 0.95,
            maskImage: "radial-gradient(circle at center, transparent 0 34%, black 35%)",
          }}
        />
      </div>
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

      <div className="absolute right-3 top-3 z-30 w-[8.9rem] rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-right text-[10px] font-medium text-zinc-100 backdrop-blur-sm sm:right-4 sm:top-4 sm:w-[10rem] sm:text-xs">
        <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">Blinds</p>
        <p className="mt-1 font-semibold">
          {snapshot.currentLevel.smallBlind}/{snapshot.currentLevel.bigBlind}
        </p>
        <p className="mt-1 text-[10px] text-zinc-400">
          Next {snapshot.nextLevel.smallBlind}/{snapshot.nextLevel.bigBlind}
        </p>
        <p className={`mt-1 text-[10px] ${levelTimerState.timerClass}`}>{formatLevelCountdown(secondsRemaining)}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
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
        <p className="mt-1 text-[1.9rem] font-black leading-none text-amber-100 sm:text-[2.7rem]">{totalPotLabel}</p>
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

      {actionBar ? <div className="absolute inset-x-3 bottom-3 z-40 sm:inset-x-4 sm:bottom-4">{actionBar}</div> : null}
    </div>
  );
}
