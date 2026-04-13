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
    return "text-amber-100";
  }

  if (!player.connected) {
    return "text-cyan-100";
  }

  if (player.status === "ALL_IN") {
    return "text-rose-100";
  }

  if (player.status === "BUSTED_OUT") {
    return "text-zinc-500";
  }

  return "text-white";
}

function getSeatPresenceTone(player: TournamentPlayer) {
  if (!player.connected) {
    return "opacity-80";
  }

  if (player.status === "BUSTED_OUT") {
    return "opacity-40 grayscale";
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
      return "border-sky-300/25 bg-sky-300/15 text-sky-50";
    case "BB":
      return "border-amber-300/25 bg-amber-300/15 text-amber-50";
    default:
      return "border-white/10 bg-black/35 text-zinc-200";
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

function DealerButton({ hero = false }: { hero?: boolean }) {
  return (
    <div
      className={`absolute right-0 top-0 z-20 grid place-items-center rounded-full border border-black/20 bg-white font-black text-black shadow-lg shadow-black/30 ${
        hero ? "h-5 w-5 text-[9px] sm:h-6 sm:w-6 sm:text-[10px]" : "h-4.5 w-4.5 text-[8px] sm:h-5 sm:w-5 sm:text-[9px]"
      }`}
      aria-label="Dealer button"
      title="Dealer"
    >
      D
    </div>
  );
}

function SeatTag({ label, tone }: { label: string; tone?: string }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] sm:text-[8px] ${
        tone ?? "border-white/10 bg-black/35 text-zinc-100"
      }`}
    >
      {label}
    </span>
  );
}

function ActingDot({ hero = false }: { hero?: boolean }) {
  return (
    <span className={`relative flex ${hero ? "h-3 w-3" : "h-2.5 w-2.5"}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/75" />
      <span className={`relative inline-flex rounded-full bg-amber-200 ${hero ? "h-3 w-3" : "h-2.5 w-2.5"}`} />
    </span>
  );
}

function SeatCardFan({
  cards,
  hero,
  muted = false,
}: {
  cards: string[];
  hero: boolean;
  muted?: boolean;
}) {
  const normalizedCards = cards.length === 2 ? cards : ["XX", "XX"];
  const frameClass = hero ? "h-16 w-[4.5rem] sm:h-22 sm:w-24" : "h-11 w-12 sm:h-15 sm:w-16";
  const leftClass = hero
    ? "absolute left-0 top-1 rotate-[-9deg] sm:left-1 sm:top-1"
    : "absolute left-0 top-0.5 rotate-[-11deg]";
  const rightClass = hero
    ? "absolute right-0 top-1 rotate-[9deg] sm:right-1 sm:top-1"
    : "absolute right-0 top-0.5 rotate-[11deg]";

  return (
    <div className={`relative ${frameClass} ${muted ? "opacity-55" : ""}`}>
      <div className={leftClass}>
        <PlayingCard card={normalizedCards[0]} variant="seat" />
      </div>
      <div className={rightClass}>
        <PlayingCard card={normalizedCards[1]} variant="seat" />
      </div>
    </div>
  );
}

function CompactMeta({
  nickname,
  metaLabel,
  metaTone,
  hero = false,
  highlight = false,
}: {
  nickname: string;
  metaLabel: string;
  metaTone: string;
  hero?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-full border px-2 py-1 backdrop-blur-sm ${
        hero
          ? "border-white/10 bg-black/60 shadow-lg shadow-black/30 sm:px-3"
          : "border-transparent bg-black/45 shadow-md shadow-black/20"
      } ${highlight ? "ring-1 ring-cyan-200/40" : ""}`}
      style={{ textShadow: "0 1px 6px rgba(0, 0, 0, 0.95)" }}
    >
      <p className={`truncate font-semibold leading-none ${hero ? "text-[10px] sm:text-[11px]" : "text-[9px] sm:text-[10px]"} ${metaTone}`}>
        {nickname}
      </p>
      <p className={`mt-0.5 leading-none text-zinc-100/90 ${hero ? "text-[10px] sm:text-[11px]" : "text-[8px] sm:text-[9px]"}`}>
        {metaLabel}
      </p>
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
        className={`grid place-items-center rounded-full border border-dashed border-white/10 bg-black/15 text-center text-zinc-500 ${
          isHeroSeat ? "h-10 w-24 sm:h-12 sm:w-28" : "h-8 w-14 sm:h-10 sm:w-16"
        } ${className}`}
      >
        <p className={`${isHeroSeat ? "text-[9px] sm:text-[10px]" : "text-[8px] sm:text-[9px]"}`}>Seat {seatIndex + 1}</p>
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
  const cards = showVisibleHoleCards ? visibleHoleCards : ["XX", "XX"];
  const shouldMuteCards = !player.connected || player.status === "BUSTED_OUT";
  const actingTone = player.acting ? "ring-1 ring-amber-300/40 shadow-amber-950/35" : "";

  if (!isHeroSeat) {
    return (
      <div className={`relative flex w-18 min-w-0 flex-col items-center text-center sm:w-20 ${presenceTone} ${className}`}>
        <div className="relative">
          {isDealerSeat ? <DealerButton /> : null}
          {player.acting ? (
            <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-2">
              <ActingDot />
            </div>
          ) : null}
          <div className={`rounded-[1.3rem] bg-black/20 px-1.5 py-1 ${actingTone}`}>
            <SeatCardFan cards={cards} hero={false} muted={shouldMuteCards} />
          </div>
        </div>
        <div className="mt-1 flex min-h-4 flex-wrap items-center justify-center gap-1">
          {compactBadges.map((badge) => (
            <SeatTag key={badge} label={badge} tone={getSeatBadgeTone(badge)} />
          ))}
          {statusBadge ? <SeatTag label={statusBadge} /> : null}
        </div>
        <div className="mt-1 w-full">
          <CompactMeta nickname={player.nickname} metaLabel={metaLabel} metaTone={metaTone} />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex w-32 min-w-0 flex-col items-center text-center sm:w-40 ${presenceTone} ${className}`}>
      <div className="mb-1.5 flex min-h-4 flex-wrap items-center justify-center gap-1">
        {compactBadges.map((badge) => (
          <SeatTag key={badge} label={badge} tone={getSeatBadgeTone(badge)} />
        ))}
        {statusBadge ? <SeatTag label={statusBadge} /> : null}
        {player.acting ? <SeatTag label="TURN" tone="border-amber-300/25 bg-amber-300/15 text-amber-50" /> : null}
      </div>
      <div className="relative">
        {isDealerSeat ? <DealerButton hero /> : null}
        {player.acting ? (
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-2">
            <ActingDot hero />
          </div>
        ) : null}
        <div
          className={`rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_rgba(0,0,0,0.14)_52%)] px-2 py-2 shadow-xl shadow-black/30 ${
            isSelfSeat ? "ring-2 ring-cyan-200/45 shadow-cyan-950/35" : ""
          } ${actingTone}`}
        >
          <SeatCardFan cards={cards} hero muted={shouldMuteCards} />
        </div>
      </div>
      <div className="mt-1.5 w-full max-w-[9.5rem] sm:max-w-[11rem]">
        <CompactMeta
          nickname={player.nickname}
          metaLabel={metaLabel}
          metaTone={isSelfSeat ? "text-cyan-50" : metaTone}
          hero
          highlight={isSelfSeat}
        />
      </div>
    </div>
  );
}
