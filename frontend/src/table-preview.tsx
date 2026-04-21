import React from "react";
import ReactDOM from "react-dom/client";
import type { TournamentSnapshot } from "@/entities/tournament/model/types";
import { TournamentTable } from "@/widgets/tournament/ui/TournamentTable";
import "@/styles/index.css";

const previewSnapshot: TournamentSnapshot = {
  code: "UX12",
  roomName: "Unified Table",
  visibility: "PUBLIC",
  handNumber: 18,
  stateVersion: 42,
  snapshotAudience: "VIEWER",
  viewerGuestId: "guest-hero",
  viewerHoleCardsIncluded: true,
  status: "IN_HAND",
  currentLevel: {
    level: 4,
    smallBlind: 10,
    bigBlind: 20,
    durationSeconds: 300,
  },
  nextLevel: {
    level: 5,
    smallBlind: 15,
    bigBlind: 30,
    durationSeconds: 300,
  },
  levelEndsAtEpochSecond: Math.floor(Date.now() / 1000) + 247,
  secondsUntilNextLevel: 247,
  mainPot: 120,
  sidePots: [],
  boardCards: ["TH", "8S", "6D"],
  dealerSeat: 0,
  smallBlindSeat: 1,
  bigBlindSeat: 5,
  actingSeat: 0,
  paused: false,
  pauseReason: null,
  actionDeadlineAtEpochMilli: Date.now() + 16_000,
  actionTimeoutSeconds: 20,
  players: [
    {
      guestId: "guest-hero",
      nickname: "uxp1",
      seatIndex: 0,
      status: "ACTIVE",
      stack: 1900,
      roundContribution: 20,
      owner: true,
      connected: true,
      afk: false,
      participating: true,
      acting: true,
    },
    {
      guestId: "guest-2",
      nickname: "uxp2",
      seatIndex: 1,
      status: "ACTIVE",
      stack: 1980,
      roundContribution: 10,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-3",
      nickname: "uxp3",
      seatIndex: 2,
      status: "ACTIVE",
      stack: 1980,
      roundContribution: 20,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-4",
      nickname: "uxp4",
      seatIndex: 3,
      status: "ACTIVE",
      stack: 2000,
      roundContribution: 0,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-5",
      nickname: "uxp5",
      seatIndex: 4,
      status: "ACTIVE",
      stack: 1980,
      roundContribution: 0,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-6",
      nickname: "uxp6",
      seatIndex: 5,
      status: "ACTIVE",
      stack: 1980,
      roundContribution: 20,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-7",
      nickname: "uxp7",
      seatIndex: 6,
      status: "ACTIVE",
      stack: 1760,
      roundContribution: 0,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-8",
      nickname: "uxp8",
      seatIndex: 7,
      status: "FOLDED",
      stack: 1890,
      roundContribution: 0,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
    {
      guestId: "guest-9",
      nickname: "uxp9",
      seatIndex: 8,
      status: "ACTIVE",
      stack: 2010,
      roundContribution: 0,
      owner: false,
      connected: true,
      afk: false,
      participating: true,
      acting: false,
    },
  ],
  showdownPots: [],
  showdownHands: [],
  recentlyBustedGuestIds: [],
  availableActions: ["FOLD", "CHECK", "BET"],
  chipsToCall: 0,
  minimumRaiseTo: 40,
  tableMessage: "Flop is out. Side bet markers should clear the board edge.",
  selfHandLabel: "6 원페어",
  selfHoleCards: ["2D", "6C"],
};

function PreviewPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.2),_rgba(3,12,10,0.96)_58%)] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl justify-center">
        <div className="w-full max-w-[1024px]">
          <TournamentTable
            snapshot={previewSnapshot}
            currentGuestId={previewSnapshot.viewerGuestId ?? undefined}
            stackDisplayMode="chips"
            onStackDisplayModeChange={() => undefined}
          />
        </div>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewPage />
  </React.StrictMode>,
);
