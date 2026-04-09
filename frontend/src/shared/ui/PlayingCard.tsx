type PlayingCardProps = {
  card: string;
  variant?: "seat" | "board";
};

const SUIT_MAP: Record<string, { symbol: string; tone: string }> = {
  S: { symbol: "\u2660", tone: "text-slate-900" },
  C: { symbol: "\u2663", tone: "text-slate-900" },
  H: { symbol: "\u2665", tone: "text-rose-600" },
  D: { symbol: "\u2666", tone: "text-rose-600" },
};

function parseCard(card: string) {
  const normalizedCard = card.trim().toUpperCase();
  if (normalizedCard === "XX") {
    return { hidden: true, rank: "X", suit: "X" };
  }

  if (normalizedCard.length < 2) {
    return { hidden: false, rank: normalizedCard, suit: "" };
  }

  return {
    hidden: false,
    rank: normalizedCard.slice(0, -1),
    suit: normalizedCard.slice(-1),
  };
}

export function PlayingCard({ card, variant = "board" }: PlayingCardProps) {
  const parsedCard = parseCard(card);
  const suit = SUIT_MAP[parsedCard.suit];
  const sizeClass =
    variant === "seat"
      ? "h-13 w-9 rounded-[0.85rem] sm:h-18 sm:w-14 sm:rounded-2xl"
      : "h-20 w-14 rounded-[1rem] sm:h-24 sm:w-16 sm:rounded-[1.15rem]";

  if (parsedCard.hidden) {
    return (
      <div
        className={`relative overflow-hidden border border-sky-200/30 bg-[linear-gradient(160deg,_#183a67,_#28558d_55%,_#0d213f)] shadow-lg shadow-black/20 ${sizeClass}`}
      >
        <div className="absolute inset-[5px] rounded-[inherit] border border-white/20 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_45%),repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0_6px,transparent_6px_12px)]" />
        <div className="absolute inset-0 grid place-items-center text-[9px] font-semibold tracking-[0.08em] text-white/90 sm:text-lg sm:tracking-[0.18em]">
          HOLD
        </div>
      </div>
    );
  }

  if (!suit) {
    return (
      <div
        className={`grid place-items-center border border-white/20 bg-white text-sm font-semibold text-slate-900 shadow-lg shadow-black/15 ${sizeClass}`}
      >
        {card}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden border border-slate-300/80 bg-[linear-gradient(180deg,_#ffffff,_#f4f1ea)] shadow-lg shadow-black/15 ${sizeClass}`}
    >
      <div className="absolute inset-x-0 top-0 h-8 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_transparent_70%)]" />
      <div className={`absolute left-1 top-1 flex flex-col leading-none sm:left-2 sm:top-2 ${suit.tone}`}>
        <span className="text-[10px] font-black sm:text-sm">{parsedCard.rank}</span>
        <span className="text-[0.55rem] sm:text-[0.9rem]">{suit.symbol}</span>
      </div>
      <div className={`absolute bottom-1 right-1 rotate-180 flex flex-col leading-none sm:bottom-2 sm:right-2 ${suit.tone}`}>
        <span className="text-[10px] font-black sm:text-sm">{parsedCard.rank}</span>
        <span className="text-[0.55rem] sm:text-[0.9rem]">{suit.symbol}</span>
      </div>
      <div className={`grid h-full place-items-center ${suit.tone}`}>
        <span className="text-lg drop-shadow-sm sm:text-3xl">{suit.symbol}</span>
      </div>
    </div>
  );
}
