import type { TournamentPlayer } from "@/entities/tournament/model/types";
import { formatStackDisplay, type StackDisplayMode } from "@/features/table/model/stack-display";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type PlayerSeatProps = {
  player?: TournamentPlayer;
  seatIndex: number;
  tablePositionIndex: number;
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  currentBigBlind: number;
  stackDisplayMode: StackDisplayMode;
  currentGuestId?: string;
  selfHoleCards?: string[];
  revealedHoleCards?: string[];
  className?: string;
};

function isSeatBadge(value: string | null): value is string {
  return value !== null;
}

function getSeatMetaTone(player: TournamentPlayer) {
  if (player.guestId && player.connected && player.status === "ACTIVE" && player.acting) {
    return "text-amber-50";
  }

  if (!player.connected) {
    return "text-cyan-100";
  }

  if (player.status === "ALL_IN") {
    return "text-rose-100";
  }

  if (player.status === "BUSTED_OUT") {
    return "text-zinc-400";
  }

  return "text-white";
}

function getSeatPresenceTone(player: TournamentPlayer) {
  if (!player.connected) {
    return "opacity-80";
  }

  if (player.status === "BUSTED_OUT") {
    return "opacity-45 grayscale";
  }

  return "";
}

function getSeatBadgeTone(badge: string) {
  switch (badge) {
    case "YOU":
      return "border-cyan-200/35 bg-cyan-300/15 text-cyan-50";
    case "OWNER":
      return "border-white/15 bg-white/10 text-white";
    case "SB":
      return "border-cyan-300/25 bg-cyan-300/12 text-cyan-50";
    case "BB":
      return "border-amber-300/25 bg-amber-300/12 text-amber-50";
    default:
      return "border-white/10 bg-black/25 text-zinc-200";
  }
}

function getStatusBadge(player: TournamentPlayer) {
  if (!player.connected) {
    return "OFF";
  }

  switch (player.status) {
    case "ALL_IN":
      return "AI";
    case "BUSTED_OUT":
      return "OUT";
    default:
      return null;
  }
}

function DealerButton() {
  return (
    <div
      className="absolute -right-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full border border-black/20 bg-white text-[9px] font-black text-black shadow-lg shadow-black/30 sm:h-6 sm:w-6 sm:text-[10px]"
      aria-label="Dealer button"
      title="Dealer"
    >
      D
    </div>
  );
}

function HiddenSeatCards({ hero, muted }: { hero: boolean; muted?: boolean }) {
  const sizeClass = hero ? "h-14 w-16 sm:h-20 sm:w-24" : "h-13 w-12 sm:h-15 sm:w-16";

  return (
    <div className={`relative ${sizeClass} ${muted ? "opacity-55" : ""}`}>
      <div className="absolute left-0 top-1 rotate-[-10deg]">
        <PlayingCard card="XX" variant="seat" />
      </div>
      <div className="absolute right-0 top-1 rotate-[10deg]">
        <PlayingCard card="XX" variant="seat" />
      </div>
    </div>
  );
}

function SeatTag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-black/45 px-1.5 py-0.5 text-[8px] font-semibold text-zinc-100 sm:text-[9px]">
      {label}
    </span>
  );
}

function ActingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-200" />
    </span>
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
  currentBigBlind,
  stackDisplayMode,
  currentGuestId,
  selfHoleCards = [],
  revealedHoleCards = [],
  className = "",
}: PlayerSeatProps) {
  const isHeroSeat = tablePositionIndex === 4;

  if (!player) {
    return (
      <div
        className={`grid h-12 w-16 place-items-center rounded-full border border-dashed border-white/10 bg-black/15 text-center text-zinc-500 sm:h-14 sm:w-20 ${className}`}
      >
        <p className="text-[9px] sm:text-[10px]">Seat {seatIndex + 1}</p>
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
  const visibleHoleCards = isCurrentPlayer ? selfHoleCards : revealedHoleCards;
  const showVisibleHoleCards = visibleHoleCards.length === 2;
  const isDealerSeat = dealerSeat === player.seatIndex;
  const actingLabel = player.acting && isHeroSeat ? "TURN" : null;
  const statusBadge = getStatusBadge(player);
  const metaTone = getSeatMetaTone(player);
  const presenceTone = getSeatPresenceTone(player);
  const compactBadges = seatBadges.filter((badge) => badge !== "OWNER");
  const metaLabel = formatStackDisplay({
    stack: player.stack,
    bigBlind: currentBigBlind,
    mode: stackDisplayMode,
    includeUnit: stackDisplayMode === "bb" || isHeroSeat,
  });

  if (!isHeroSeat) {
    return (
      <div
        className={`relative flex w-20 min-w-0 flex-col items-center text-center sm:w-24 ${presenceTone} ${className}`}
      >
        {isDealerSeat ? <DealerButton /> : null}
        <div className="mb-1.5 flex min-h-4 flex-wrap items-center justify-center gap-1">
          {compactBadges.map((badge) => (
            <span
              key={badge}
              className={`rounded-md border px-1.5 py-0.5 text-[8px] font-semibold ${getSeatBadgeTone(badge)}`}
            >
              {badge}
            </span>
          ))}
          {statusBadge ? <SeatTag label={statusBadge} /> : null}
        </div>
        <div
          className={`relative grid min-h-12 place-items-center rounded-2xl border border-white/10 bg-black/15 px-2 py-1.5 shadow-lg shadow-black/25 backdrop-blur-sm sm:min-h-14 ${player.acting ? "border-amber-200/35 shadow-amber-950/30" : ""}`}
        >
          {player.acting ? (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/20 bg-black/60 px-1.5 py-1">
              <ActingDot />
            </div>
          ) : null}
          {showVisibleHoleCards ? (
            <div className="grid grid-cols-2 gap-1">
              {visibleHoleCards.map((card, index) => (
                <PlayingCard key={`${player.guestId}-revealed-${index}`} card={card} variant="seat" />
              ))}
            </div>
          ) : (
            <HiddenSeatCards hero={false} muted={!player.connected || player.status === "BUSTED_OUT"} />
          )}
        </div>
        <div className={`relative z-10 -mt-1 min-w-0 ${metaTone}`}>
          <p className="truncate text-[10px] font-semibold leading-none sm:text-[11px]">{player.nickname}</p>
          <p className="mt-1 text-[9px] leading-none text-zinc-300/85 sm:text-[10px]">{metaLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex w-28 min-w-0 flex-col items-center text-center sm:w-36 ${presenceTone} ${className}`}
    >
      {isDealerSeat ? <DealerButton /> : null}
      <div className="mb-2 flex min-h-5 flex-wrap items-center justify-center gap-1">
        {compactBadges.map((badge) => (
          <span
            key={badge}
            className={`rounded-md border px-1.5 py-0.5 text-[8px] font-semibold sm:px-2 sm:text-[9px] ${getSeatBadgeTone(badge)}`}
          >
            {badge}
          </span>
        ))}
        {actingLabel ? <SeatTag label={actingLabel} /> : null}
        {statusBadge ? <SeatTag label={statusBadge} /> : null}
      </div>
      <div
        className={`relative rounded-[1.4rem] border border-white/10 px-2 py-2 shadow-xl shadow-black/30 backdrop-blur-sm ${isSelfSeat ? "border-cyan-200/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_rgba(0,0,0,0.18)_52%)] ring-2 ring-cyan-200/50 shadow-cyan-950/35" : "bg-black/15"} ${player.acting ? "shadow-amber-950/35" : ""}`}
      >
        {player.acting ? (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full border border-amber-200/20 bg-black/60 px-1.5 py-1">
            <ActingDot />
          </div>
        ) : null}
        {showVisibleHoleCards ? (
          <div className="grid grid-cols-2 gap-1 sm:gap-2">
            {visibleHoleCards.map((card, index) => (
              <PlayingCard key={`${player.guestId}-card-${index}`} card={card} variant="seat" />
            ))}
          </div>
        ) : (
          <HiddenSeatCards hero muted={!player.connected || player.status === "BUSTED_OUT"} />
        )}
      </div>
      <div
        className={`relative z-10 -mt-4 min-w-0 sm:-mt-5 ${metaTone}`}
        style={{ textShadow: "0 1px 8px rgba(0, 0, 0, 0.95)" }}
      >
        <p className={`truncate text-[11px] font-semibold leading-none sm:text-xs ${isSelfSeat ? "text-cyan-50" : ""}`}>
          {player.nickname}
        </p>
        <p className="mt-1 text-[10px] leading-none text-zinc-100 sm:text-[11px]">{metaLabel}</p>
      </div>
    </div>
  );
}
