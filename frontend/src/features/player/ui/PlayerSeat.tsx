import type { TournamentPlayer } from "@/entities/tournament/model/types";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type PlayerSeatProps = {
  player?: TournamentPlayer;
  seatIndex: number;
  tablePositionIndex: number;
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  currentGuestId?: string;
  selfHoleCards?: string[];
};

const DEALER_BUTTON_POSITION: Record<number, string> = {
  0: "-bottom-3 left-1/2 -translate-x-1/2",
  1: "-bottom-3 right-4",
  2: "-bottom-3 left-4",
  3: "-top-3 left-4",
  4: "-top-3 right-4",
  5: "-top-3 left-1/2 -translate-x-1/2",
};

function isSeatBadge(value: string | null): value is string {
  return value !== null;
}

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

function getSeatBadgeTone(badge: string) {
  switch (badge) {
    case "YOU":
      return "border-sky-300/30 bg-sky-300/15 text-sky-50";
    case "OWNER":
      return "border-violet-300/25 bg-violet-300/12 text-violet-50";
    case "SB":
      return "border-cyan-300/25 bg-cyan-300/12 text-cyan-50";
    case "BB":
      return "border-amber-300/25 bg-amber-300/12 text-amber-50";
    default:
      return "border-white/10 bg-black/25 text-zinc-200";
  }
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
    <div className="relative mx-auto h-12 w-12 sm:hidden">
      <div className="absolute left-0 top-0 rotate-[-8deg]">
        <PlayingCard card="XX" variant="seat" />
      </div>
      <div className="absolute right-0 top-0 rotate-[8deg]">
        <PlayingCard card="XX" variant="seat" />
      </div>
    </div>
  );
}

function DealerButton({ seatIndex }: { seatIndex: number }) {
  return (
    <div
      className={`absolute z-10 grid h-7 w-7 place-items-center rounded-full border border-black/20 bg-white text-[11px] font-black text-black shadow-lg shadow-black/30 sm:h-8 sm:w-8 sm:text-xs ${DEALER_BUTTON_POSITION[seatIndex]}`}
      aria-label="Dealer button"
      title="Dealer"
    >
      D
    </div>
  );
}

// Renders either an occupied seat or an empty placeholder in the ring.
export function PlayerSeat({
  player,
  seatIndex,
  tablePositionIndex,
  dealerSeat,
  smallBlindSeat,
  bigBlindSeat,
  currentGuestId,
  selfHoleCards = [],
}: PlayerSeatProps) {
  if (!player) {
    return (
      <div className="flex min-h-[10.5rem] flex-col justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 p-2.5 text-center sm:min-h-0 sm:rounded-[1.75rem] sm:p-4">
        <p className="text-xs font-medium text-zinc-400 sm:text-sm">Empty Seat</p>
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:mt-2 sm:text-xs sm:tracking-[0.24em]">
          Seat {seatIndex + 1}
        </p>
      </div>
    );
  }

  const seatBadges = [
    player.guestId === currentGuestId ? "YOU" : null,
    player.owner ? "OWNER" : null,
    smallBlindSeat === player.seatIndex ? "SB" : null,
    bigBlindSeat === player.seatIndex ? "BB" : null,
  ].filter(isSeatBadge);
  const isSelfSeat = player.guestId === currentGuestId;
  const isCurrentPlayer = player.guestId === currentGuestId && selfHoleCards.length === 2;
  const visibleHoleCards = isCurrentPlayer ? selfHoleCards : ["XX", "XX"];
  const isDealerSeat = dealerSeat === player.seatIndex;
  const actingLabel = player.acting ? (isSelfSeat ? "YOUR TURN" : "ACTING") : null;

  return (
    <div
      className={`relative min-w-0 rounded-[1.5rem] border p-2.5 backdrop-blur-[2px] transition sm:rounded-[1.75rem] sm:p-4 ${getSeatTone(player)} ${isSelfSeat ? "ring-1 ring-sky-300/45 sm:ring-2" : ""}`}
    >
      {isDealerSeat ? <DealerButton seatIndex={tablePositionIndex} /> : null}
      <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium text-white sm:text-sm">{player.nickname}</p>
          <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-400 sm:text-xs sm:tracking-[0.24em]">
            Seat {player.seatIndex + 1}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-black/25 px-2 py-1 text-[9px] text-zinc-200 sm:px-3 sm:text-sm">
          {player.stack}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-4 sm:gap-2">
        {seatBadges.map((badge) => (
          <span
            key={badge}
            className={`rounded-full border px-1.5 py-1 text-[8px] font-medium tracking-[0.06em] sm:px-3 sm:text-[11px] sm:tracking-[0.18em] ${getSeatBadgeTone(badge)}`}
          >
            {badge}
          </span>
        ))}
        <span className="rounded-full border border-white/10 bg-black/25 px-1.5 py-1 text-[8px] font-medium tracking-[0.06em] text-zinc-200 sm:px-3 sm:text-[11px] sm:tracking-[0.18em]">
          {getStatusLabel(player)}
        </span>
      </div>
      {actingLabel ? (
        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-100 sm:text-[11px] sm:tracking-[0.18em]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-200" />
          </span>
          <span>{actingLabel}</span>
        </div>
      ) : null}
      <div className="mt-2 flex justify-center sm:mt-4">
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
