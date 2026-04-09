import type { TournamentPlayer } from "@/entities/tournament/model/types";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type PlayerSeatProps = {
  player?: TournamentPlayer;
  seatIndex: number;
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  currentGuestId?: string;
  selfHoleCards?: string[];
};

// Maps player state into a small seat-specific tone for the table grid.
function getSeatTone(player: TournamentPlayer) {
  if (!player.connected) {
    return "border-sky-300/40 bg-sky-300/10";
  }

  if (player.acting) {
    return "border-amber-300/80 bg-amber-300/10 shadow-lg shadow-amber-950/40";
  }

  if (player.status === "ALL_IN") {
    return "border-rose-300/70 bg-rose-300/10";
  }

  if (player.status === "BUSTED_OUT") {
    return "border-white/5 bg-black/35";
  }

  return player.status === "ACTIVE"
    ? "border-emerald-300/70 bg-emerald-400/10 shadow-lg shadow-emerald-950/40"
    : "border-white/10 bg-black/20";
}

// Converts raw player status into a short seat label.
function getStatusLabel(player: TournamentPlayer) {
  if (!player.connected) {
    return "OFFLINE";
  }

  switch (player.status) {
    case "ALL_IN":
      return "ALL-IN";
    case "BUSTED_OUT":
      return "OUT";
    case "DISCONNECTED":
      return "OFFLINE";
    default:
      return player.status;
  }
}

function StackedHiddenCards() {
  return (
    <div className="relative mx-auto h-13 w-14 sm:hidden">
      <div className="absolute left-0 top-0 rotate-[-8deg]">
        <PlayingCard card="XX" variant="seat" />
      </div>
      <div className="absolute right-0 top-0 rotate-[8deg]">
        <PlayingCard card="XX" variant="seat" />
      </div>
    </div>
  );
}

// Renders either an occupied seat or an empty placeholder in the ring.
export function PlayerSeat({
  player,
  seatIndex,
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  currentGuestId,
  selfHoleCards = [],
}: PlayerSeatProps) {
  if (!player) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-black/10 p-3 sm:p-4">
        <p className="text-sm font-medium text-zinc-400">Empty Seat</p>
        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-zinc-500">Seat {seatIndex + 1}</p>
      </div>
    );
  }

  const seatBadges = [
    player.owner ? "OWNER" : null,
    dealerSeat === player.seatIndex ? "D" : null,
    smallBlindSeat === player.seatIndex ? "SB" : null,
    bigBlindSeat === player.seatIndex ? "BB" : null,
  ].filter(Boolean);
  const isCurrentPlayer = player.guestId === currentGuestId && selfHoleCards.length === 2;
  const visibleHoleCards = isCurrentPlayer ? selfHoleCards : ["XX", "XX"];

  return (
    <div className={`min-w-0 rounded-[1.75rem] border p-2 transition sm:p-4 ${getSeatTone(player)}`}>
      <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-white sm:text-sm">{player.nickname}</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-400 sm:text-xs sm:tracking-[0.24em]">
            Seat {player.seatIndex + 1}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-black/25 px-2 py-1 text-[10px] text-zinc-200 sm:px-3 sm:text-sm">
          {player.stack}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 sm:mt-4 sm:gap-2">
        {seatBadges.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-white/10 bg-black/25 px-1.5 py-1 text-[9px] font-medium tracking-[0.08em] text-zinc-200 sm:px-3 sm:text-[11px] sm:tracking-[0.18em]"
          >
            {badge}
          </span>
        ))}
        <span className="rounded-full border border-white/10 bg-black/25 px-1.5 py-1 text-[9px] font-medium tracking-[0.08em] text-zinc-200 sm:px-3 sm:text-[11px] sm:tracking-[0.18em]">
          {getStatusLabel(player)}
        </span>
      </div>
      <div className="mt-2 sm:mt-4">
        {isCurrentPlayer ? (
          <div className="grid grid-cols-2 gap-1 sm:gap-2">
            {visibleHoleCards.map((card, index) => (
              <PlayingCard key={`${player.guestId}-card-${index}`} card={card} variant="seat" />
            ))}
          </div>
        ) : (
          <>
            <StackedHiddenCards />
            <div className="hidden grid-cols-2 gap-1 sm:grid sm:gap-2">
              {visibleHoleCards.map((card, index) => (
                <PlayingCard key={`${player.guestId}-card-${index}`} card={card} variant="seat" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
