export type TournamentStatus = "WAITING" | "IN_HAND" | "HAND_RESULT" | "FINISHED";

export type PlayerStatus =
  | "LOBBY"
  | "SEATED"
  | "READY"
  | "ACTIVE"
  | "FOLDED"
  | "ALL_IN"
  | "BUSTED_OUT"
  | "DISCONNECTED";

export type BlindLevel = {
  level: number;
  smallBlind: number;
  bigBlind: number;
  durationSeconds: number;
};

export type PotView = {
  id: string;
  type: "MAIN" | "SIDE" | string;
  amount: number;
  eligibleGuestIds: string[];
};

export type ShowdownPayout = {
  guestId: string;
  nickname: string;
  amount: number;
};

export type ShowdownPot = {
  id: string;
  type: "MAIN" | "SIDE" | string;
  amount: number;
  payouts: ShowdownPayout[];
};

export type TournamentPlayer = {
  guestId: string;
  nickname: string;
  seatIndex: number;
  status: PlayerStatus;
  stack: number;
  owner: boolean;
  connected: boolean;
  participating: boolean;
  acting: boolean;
};

export type TournamentSnapshot = {
  code: string;
  status: TournamentStatus;
  currentLevel: BlindLevel;
  nextLevel: BlindLevel;
  levelEndsAtEpochSecond: number;
  secondsUntilNextLevel: number;
  mainPot: number;
  sidePots: PotView[];
  boardCards: string[];
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  actingSeat: number | null;
  players: TournamentPlayer[];
  showdownPots: ShowdownPot[];
  availableActions: string[];
  tableMessage: string;
};

export type TournamentEvent = {
  eventType: string;
  snapshot: TournamentSnapshot;
  payload: Record<string, unknown>;
};
