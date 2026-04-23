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
      ? "h-12 w-8 rounded-[0.75rem] sm:h-18 sm:w-14 sm:rounded-2xl"
      : "h-18 w-12 rounded-[0.95rem] sm:h-24 sm:w-16 sm:rounded-[1.15rem]";

  if (parsedCard.hidden) {
    return (
      <div
        className={`relative overflow-hidden border border-sky-200/25 bg-[linear-gradient(160deg,_#143760,_#264d7f_54%,_#0c1d38)] shadow-[0_16px_24px_rgba(0,0,0,0.22)] ${sizeClass}`}
      >
        <div className="absolute inset-[4px] rounded-[inherit] border border-white/18 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_42%),repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0_6px,transparent_6px_12px)] sm:inset-[5px]" />
        <div className="absolute inset-[8%] rounded-[inherit] border border-white/8" />
        <div className="absolute inset-0 grid place-items-center text-[8px] font-semibold tracking-[0.06em] text-white/90 sm:text-lg sm:tracking-[0.18em]">
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
      className={`relative overflow-hidden border border-[#d3ccc0] bg-[linear-gradient(180deg,_#fffdf9,_#f0eadf)] shadow-[0_14px_24px_rgba(0,0,0,0.16)] ${sizeClass}`}
    >
      <div className="absolute inset-x-0 top-0 h-6 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_transparent_70%)] sm:h-8" />
      <div className="absolute inset-[5%] rounded-[inherit] border border-black/5" />
      <div className={`absolute left-1 top-1 flex flex-col leading-none sm:left-2 sm:top-2 ${suit.tone}`}>
        <span className="text-[9px] font-black sm:text-sm">{parsedCard.rank}</span>
        <span className="text-[0.5rem] sm:text-[0.9rem]">{suit.symbol}</span>
      </div>
      <div className={`absolute bottom-1 right-1 rotate-180 flex flex-col leading-none sm:bottom-2 sm:right-2 ${suit.tone}`}>
        <span className="text-[9px] font-black sm:text-sm">{parsedCard.rank}</span>
        <span className="text-[0.5rem] sm:text-[0.9rem]">{suit.symbol}</span>
      </div>
      <div className={`grid h-full place-items-center ${suit.tone}`}>
        <span className="text-base drop-shadow-sm sm:text-3xl">{suit.symbol}</span>
      </div>
    </div>
  );
}
