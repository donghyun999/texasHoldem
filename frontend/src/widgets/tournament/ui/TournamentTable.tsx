import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";
import { PlayerSeat } from "@/features/player/ui/PlayerSeat";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type TournamentTableProps = {
  snapshot: TournamentSnapshot;
  currentGuestId?: string;
};

const TOTAL_SEATS = 6;
const HERO_TABLE_POSITION_INDEX = 4;

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
    return {
      headline: "Split Pot",
      detail: `${bestWinners[0].nickname} +${bestWinners.length - 1} players`,
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

// Renders the table, board cards, main pot, and side-pot summary.
export function TournamentTable({ snapshot, currentGuestId }: TournamentTableProps) {
  const seats = buildSeatMap(snapshot.players);
  const displayedSeatIndexes = buildDisplayedSeatIndexes(snapshot.players, currentGuestId);
  const topRowSeatIndexes = [0, 1, 2];
  const bottomRowSeatIndexes = [5, 4, 3];
  const actingPlayer = snapshot.players.find((player) => player.seatIndex === snapshot.actingSeat) ?? null;
  const streetLabel = getStreetLabel(snapshot.boardCards);
  const resultSummary = buildResultSummary(snapshot);

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_top,_#2f805b,_#123224_55%,_#091510)] p-2.5 shadow-2xl shadow-black/30 sm:rounded-[2.5rem] sm:p-6">
      <div className="mx-auto grid min-h-[500px] max-w-5xl place-items-center rounded-[2.5rem] border-[10px] border-[#5c341f] bg-[radial-gradient(circle,_#2b7c57,_#18533b_68%,_#123021)] px-2.5 py-5 sm:min-h-[560px] sm:rounded-[999px] sm:border-[18px] sm:px-6 sm:py-12">
        <div className="grid w-full gap-4 sm:gap-10">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-6">
            {topRowSeatIndexes.map((tablePositionIndex) => {
              const actualSeatIndex = displayedSeatIndexes[tablePositionIndex];
              return (
                <PlayerSeat
                  key={`seat-${tablePositionIndex}`}
                  player={seats[actualSeatIndex]}
                  seatIndex={actualSeatIndex}
                  tablePositionIndex={tablePositionIndex}
                  dealerSeat={snapshot.dealerSeat}
                  smallBlindSeat={snapshot.smallBlindSeat}
                  bigBlindSeat={snapshot.bigBlindSeat}
                  currentGuestId={currentGuestId}
                  selfHoleCards={snapshot.selfHoleCards}
                />
              );
            })}
          </div>

          <div className="mx-auto w-full max-w-[21rem] min-w-0 rounded-[1.75rem] border border-white/10 bg-black/25 px-3 py-4 text-center sm:max-w-2xl sm:rounded-[2rem] sm:px-8 sm:py-6">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-50 sm:text-xs">
                {streetLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-100 sm:text-xs">
                {actingPlayer ? `${actingPlayer.nickname} acting` : snapshot.status}
              </span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-zinc-400">Main Pot</p>
            <p className="mt-1.5 text-2xl font-semibold text-white sm:mt-2 sm:text-4xl">{snapshot.mainPot}</p>
            <div className="mt-4 flex justify-center gap-1.5 sm:mt-6 sm:gap-3">
              {snapshot.boardCards.map((card) => (
                <PlayingCard key={card} card={card} />
              ))}
            </div>
            {snapshot.sidePots.length > 0 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:mt-6 sm:gap-3">
                {snapshot.sidePots.map((pot) => (
                  <div
                    key={pot.id}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-100 sm:px-4 sm:py-2 sm:text-sm"
                  >
                    {pot.type} POT {pot.amount}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-6">
            {bottomRowSeatIndexes.map((tablePositionIndex) => {
              const actualSeatIndex = displayedSeatIndexes[tablePositionIndex];
              return (
                <PlayerSeat
                  key={`seat-${tablePositionIndex}`}
                  player={seats[actualSeatIndex]}
                  seatIndex={actualSeatIndex}
                  tablePositionIndex={tablePositionIndex}
                  dealerSeat={snapshot.dealerSeat}
                  smallBlindSeat={snapshot.smallBlindSeat}
                  bigBlindSeat={snapshot.bigBlindSeat}
                  currentGuestId={currentGuestId}
                  selfHoleCards={snapshot.selfHoleCards}
                />
              );
            })}
          </div>
        </div>
      </div>
      {resultSummary ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 sm:top-6 sm:max-w-md">
          <div className="rounded-[1.35rem] border border-amber-200/25 bg-[linear-gradient(135deg,_rgba(120,53,15,0.72),_rgba(20,20,20,0.92))] px-4 py-3 text-center shadow-xl shadow-black/35 backdrop-blur-md sm:px-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200/70">Result</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <p className="text-base font-semibold text-white sm:text-lg">{resultSummary.headline}</p>
              <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                {resultSummary.amountLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-50/80 sm:text-sm">{resultSummary.detail}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
