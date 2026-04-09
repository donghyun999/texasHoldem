import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";
import { PlayerSeat } from "@/features/player/ui/PlayerSeat";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type TournamentTableProps = {
  snapshot: TournamentSnapshot;
  currentGuestId?: string;
};

// Spreads players into a fixed six-seat array for the ring layout.
function buildSeatMap(players: TournamentPlayer[]) {
  const seats: Array<TournamentPlayer | undefined> = new Array(6).fill(undefined);

  for (const player of players) {
    seats[player.seatIndex] = player;
  }

  return seats;
}

// Renders the table, board cards, main pot, and side-pot summary.
export function TournamentTable({ snapshot, currentGuestId }: TournamentTableProps) {
  const seats = buildSeatMap(snapshot.players);
  const topRowSeatIndexes = [0, 1, 2];
  const bottomRowSeatIndexes = [5, 4, 3];

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_top,_#2f805b,_#123224_55%,_#091510)] p-2.5 shadow-2xl shadow-black/30 sm:rounded-[2.5rem] sm:p-6">
      <div className="mx-auto grid min-h-[500px] max-w-5xl place-items-center rounded-[2.5rem] border-[10px] border-[#5c341f] bg-[radial-gradient(circle,_#2b7c57,_#18533b_68%,_#123021)] px-2.5 py-5 sm:min-h-[560px] sm:rounded-[999px] sm:border-[18px] sm:px-6 sm:py-12">
        <div className="grid w-full gap-4 sm:gap-10">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-6">
            {topRowSeatIndexes.map((seatIndex) => (
              <PlayerSeat
                key={`seat-${seatIndex}`}
                player={seats[seatIndex]}
                seatIndex={seatIndex}
                dealerSeat={snapshot.dealerSeat}
                smallBlindSeat={snapshot.smallBlindSeat}
                bigBlindSeat={snapshot.bigBlindSeat}
                currentGuestId={currentGuestId}
                selfHoleCards={snapshot.selfHoleCards}
              />
            ))}
          </div>

          <div className="mx-auto w-full max-w-[21rem] min-w-0 rounded-[1.75rem] border border-white/10 bg-black/25 px-3 py-4 text-center sm:max-w-2xl sm:rounded-[2rem] sm:px-8 sm:py-6">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Main Pot</p>
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
            {bottomRowSeatIndexes.map((seatIndex) => (
              <PlayerSeat
                key={`seat-${seatIndex}`}
                player={seats[seatIndex]}
                seatIndex={seatIndex}
                dealerSeat={snapshot.dealerSeat}
                smallBlindSeat={snapshot.smallBlindSeat}
                bigBlindSeat={snapshot.bigBlindSeat}
                currentGuestId={currentGuestId}
                selfHoleCards={snapshot.selfHoleCards}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
