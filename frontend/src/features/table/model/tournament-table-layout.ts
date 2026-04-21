export type TableAnchor = {
  left: string;
  top: string;
};

export type BetMarkerDisplay = {
  compact?: boolean;
  reverse?: boolean;
};

export type TournamentTableLayout = {
  totalSeats: number;
  heroTablePositionIndex: number;
  seatPositions: TableAnchor[];
  betMarkerPositions: TableAnchor[];
  betMarkerDisplays: BetMarkerDisplay[];
  potCollectionPosition: TableAnchor;
  containerClassName: string;
  feltOuterClassName: string;
  feltInnerClassName: string;
  bottomGlowClassName: string;
};

export const TOURNAMENT_MAX_SEATS = 9;

export const TOURNAMENT_TABLE_LAYOUT: TournamentTableLayout = {
  totalSeats: TOURNAMENT_MAX_SEATS,
  heroTablePositionIndex: 6,
  seatPositions: [
    { left: "18%", top: "24%" },
    { left: "35%", top: "13.5%" },
    { left: "65%", top: "13.5%" },
    { left: "82%", top: "24%" },
    { left: "89%", top: "47%" },
    { left: "76%", top: "64%" },
    { left: "50%", top: "75.2%" },
    { left: "24%", top: "64%" },
    { left: "11%", top: "47%" },
  ],
  betMarkerPositions: [
    { left: "28%", top: "33.2%" },
    { left: "41%", top: "26.2%" },
    { left: "59%", top: "26.2%" },
    { left: "72%", top: "33.2%" },
    { left: "79%", top: "47.8%" },
    { left: "66%", top: "57.8%" },
    { left: "50%", top: "61.8%" },
    { left: "34%", top: "57.8%" },
    { left: "21%", top: "47.8%" },
  ],
  betMarkerDisplays: [
    {},
    {},
    {},
    {},
    { compact: true },
    { compact: true },
    {},
    { compact: true, reverse: true },
    { compact: true, reverse: true },
  ],
  potCollectionPosition: { left: "50%", top: "40.8%" },
  containerClassName:
    "relative mx-auto h-[820px] w-full max-w-[470px] overflow-hidden rounded-[2.2rem] border border-white/12 bg-[linear-gradient(180deg,_rgba(6,16,13,0.98),_rgba(2,7,6,0.99))] shadow-2xl shadow-black/40 sm:h-[920px] sm:max-w-[620px]",
  feltOuterClassName:
    "absolute left-1/2 top-[43.5%] h-[590px] w-[80%] min-w-[316px] max-w-[408px] -translate-x-1/2 -translate-y-1/2 rounded-[46%] border-[12px] border-[#355f56] bg-[radial-gradient(circle_at_50%_34%,_rgba(103,232,249,0.22),_rgba(35,163,116,0.92)_38%,_rgba(7,33,26,0.98)_78%)] shadow-[0_35px_80px_rgba(0,0,0,0.5),inset_0_0_70px_rgba(0,0,0,0.48)] sm:h-[700px] sm:max-w-[470px] sm:border-[16px]",
  feltInnerClassName:
    "absolute left-1/2 top-[43.5%] h-[550px] w-[72%] min-w-[284px] max-w-[364px] -translate-x-1/2 -translate-y-1/2 rounded-[46%] border border-white/10 bg-[radial-gradient(circle_at_50%_30%,_rgba(255,255,255,0.08),_transparent_30%)] sm:h-[648px] sm:max-w-[412px]",
  bottomGlowClassName:
    "absolute left-1/2 top-[69%] h-24 w-48 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(250,204,21,0.2),_transparent_70%)] blur-2xl sm:h-28 sm:w-60",
};
