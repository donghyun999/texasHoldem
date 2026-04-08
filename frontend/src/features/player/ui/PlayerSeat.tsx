import type { TournamentPlayer } from "@/entities/tournament/model/types";

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
      <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-black/10 p-4">
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
  const visibleHoleCards = player.guestId === currentGuestId && selfHoleCards.length === 2 ? selfHoleCards : ["XX", "XX"];

  return (
    <div className={`rounded-[1.75rem] border p-4 transition ${getSeatTone(player)}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{player.nickname}</p>
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Seat {player.seatIndex + 1}</p>
        </div>
        <span className="rounded-full bg-black/25 px-3 py-1 text-sm text-zinc-200">
          {player.stack}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {seatBadges.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-zinc-200"
          >
            {badge}
          </span>
        ))}
        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-zinc-200">
          {getStatusLabel(player)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {visibleHoleCards.map((card, index) => (
          <div
            key={`${player.guestId}-card-${index}`}
            className="grid h-16 place-items-center rounded-xl bg-white text-sm font-semibold text-slate-900"
          >
            {card}
          </div>
        ))}
      </div>
    </div>
  );
}
