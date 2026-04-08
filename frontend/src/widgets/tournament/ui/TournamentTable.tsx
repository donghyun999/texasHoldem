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

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_top,_#2f805b,_#123224_55%,_#091510)] p-6 shadow-2xl shadow-black/30">
      <div className="mx-auto grid min-h-[560px] max-w-5xl place-items-center rounded-[999px] border-[18px] border-[#5c341f] bg-[radial-gradient(circle,_#2b7c57,_#18533b_68%,_#123021)] px-6 py-12">
        <div className="grid w-full gap-10">
          <div className="grid grid-cols-3 gap-6">
            {seats.slice(0, 3).map((player, seatOffset) => (
              <PlayerSeat
                key={`top-${seatOffset}`}
                player={player}
                seatIndex={seatOffset}
                dealerSeat={snapshot.dealerSeat}
                smallBlindSeat={snapshot.smallBlindSeat}
                bigBlindSeat={snapshot.bigBlindSeat}
                currentGuestId={currentGuestId}
                selfHoleCards={snapshot.selfHoleCards}
              />
            ))}
          </div>

          <div className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white/10 bg-black/25 px-8 py-6 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-400">Main Pot</p>
            <p className="mt-2 text-4xl font-semibold text-white">{snapshot.mainPot}</p>
            <div className="mt-6 flex justify-center gap-3">
              {snapshot.boardCards.map((card) => (
                <PlayingCard key={card} card={card} />
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {snapshot.sidePots.map((pot) => (
                <div
                  key={pot.id}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100"
                >
                  {pot.type} POT {pot.amount}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {seats.slice(3).map((player, seatOffset) => (
              <PlayerSeat
                key={`bottom-${seatOffset}`}
                player={player}
                seatIndex={seatOffset + 3}
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
