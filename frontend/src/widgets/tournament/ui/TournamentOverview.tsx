import { useEffect, useState } from "react";
import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";
import { TOURNAMENT_WS_URL } from "@/shared/config/runtime";

type TournamentOverviewProps = {
  snapshot: TournamentSnapshot;
  syncState: string;
  currentPlayer: TournamentPlayer | null;
};

// Formats blind levels into a compact table header label.
function formatBlindLevel(smallBlind: number, bigBlind: number) {
  return `${smallBlind} / ${bigBlind}`;
}

// Formats the countdown to the next blind level as mm:ss.
function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function getSyncSummary(syncState: string) {
  switch (syncState) {
    case "LIVE WS":
      return {
        label: "Realtime",
        value: "WebSocket connected",
        tone: "border-emerald-300/25 bg-emerald-400/10 text-emerald-50",
      };
    case "LIVE SNAPSHOT":
      return {
        label: "Snapshot",
        value: "REST snapshot loaded",
        tone: "border-sky-300/25 bg-sky-400/10 text-sky-50",
      };
    case "DEMO FALLBACK":
      return {
        label: "Fallback",
        value: "Demo state in use",
        tone: "border-amber-300/25 bg-amber-400/10 text-amber-50",
      };
    default:
      return {
        label: "Syncing",
        value: "Connecting to table",
        tone: "border-white/10 bg-white/5 text-zinc-100",
      };
  }
}

function buildSeatSummary(snapshot: TournamentSnapshot) {
  const seatedPlayers = snapshot.players.filter((player) => player.status !== "BUSTED_OUT").length;
  const connectedPlayers = snapshot.players.filter((player) => player.connected).length;
  return {
    seatedPlayers,
    connectedPlayers,
  };
}

function buildLiveSecondsUntilNextLevel(snapshot: TournamentSnapshot, currentEpochSecond: number) {
  if (snapshot.levelEndsAtEpochSecond > 0) {
    return Math.max(0, snapshot.levelEndsAtEpochSecond - currentEpochSecond);
  }

  return Math.max(0, snapshot.secondsUntilNextLevel);
}

// Renders the tournament header, blind state, and transport summary.
export function TournamentOverview({ snapshot, syncState, currentPlayer }: TournamentOverviewProps) {
  const [currentEpochSecond, setCurrentEpochSecond] = useState(() => Math.floor(Date.now() / 1000));
  const syncSummary = getSyncSummary(syncState);
  const seatSummary = buildSeatSummary(snapshot);
  const realtimeHost = TOURNAMENT_WS_URL.replace(/^wss?:\/\//, "");
  const liveSecondsUntilNextLevel = buildLiveSecondsUntilNextLevel(snapshot, currentEpochSecond);

  useEffect(() => {
    setCurrentEpochSecond(Math.floor(Date.now() / 1000));

    const timerId = window.setInterval(() => {
      setCurrentEpochSecond(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [snapshot.levelEndsAtEpochSecond]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-white sm:text-2xl">{snapshot.roomName}</h2>
            <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-100">
              {snapshot.status.replaceAll("_", " ")}
            </span>
            <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-100">
              {snapshot.visibility === "PUBLIC" ? "Open Table" : "Private Table"}
            </span>
            <span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${syncSummary.tone}`}>
              {syncSummary.label}
            </span>
          </div>
          <p className="mt-2 truncate text-sm text-zinc-300">{snapshot.tableMessage}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-xs sm:w-auto sm:grid-cols-4">
          <HeaderChip label="Blind" value={formatBlindLevel(snapshot.currentLevel.smallBlind, snapshot.currentLevel.bigBlind)} />
          <HeaderChip label="Next" value={formatCountdown(liveSecondsUntilNextLevel)} />
          <HeaderChip label="Players" value={`${seatSummary.seatedPlayers}/6`} />
          <HeaderChip
            label="You"
            value={currentPlayer ? `S${currentPlayer.seatIndex + 1} ${currentPlayer.stack}` : "Out"}
          />
        </div>
      </div>
      <p className="mt-2 hidden text-xs text-zinc-500 sm:block">
        {syncSummary.value} | {realtimeHost}
      </p>
    </div>
  );
}

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className="mt-1 text-xs font-semibold text-white sm:text-sm">{value}</p>
    </div>
  );
}
