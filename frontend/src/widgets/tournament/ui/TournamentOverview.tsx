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

// Renders the tournament header, blind state, and transport summary.
export function TournamentOverview({ snapshot, syncState, currentPlayer }: TournamentOverviewProps) {
  const syncSummary = getSyncSummary(syncState);
  const seatSummary = buildSeatSummary(snapshot);
  const realtimeHost = TOURNAMENT_WS_URL.replace(/^wss?:\/\//, "");

  return (
    <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-black/20 px-5 py-5 lg:grid-cols-[1.1fr_0.9fr] lg:px-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Tournament</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-3xl font-semibold text-white">{snapshot.code}</h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-100 sm:text-xs">
            {snapshot.status}
          </span>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] sm:text-xs ${syncSummary.tone}`}>
            {syncSummary.label}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">{snapshot.tableMessage}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <HeaderChip label="Players" value={`${seatSummary.seatedPlayers} / 6`} />
          <HeaderChip label="Online" value={`${seatSummary.connectedPlayers}`} />
          <HeaderChip
            label="You"
            value={
              currentPlayer
                ? `Seat ${currentPlayer.seatIndex + 1} · ${currentPlayer.stack} chips`
                : "Not seated"
            }
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Current Blind"
          value={formatBlindLevel(snapshot.currentLevel.smallBlind, snapshot.currentLevel.bigBlind)}
        />
        <MetricCard
          label="Next Level"
          value={`${formatBlindLevel(snapshot.nextLevel.smallBlind, snapshot.nextLevel.bigBlind)} in ${formatCountdown(snapshot.secondsUntilNextLevel)}`}
        />
        <MetricCard label="Table Sync" value={syncSummary.value} />
        <MetricCard label="Transport" value={realtimeHost} />
      </div>
    </div>
  );
}

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-400 sm:text-[10px]">{label}</p>
      <p className="mt-1 text-xs font-medium text-white sm:text-sm">{value}</p>
    </div>
  );
}

// Displays a single tournament metric with consistent styling.
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-3 text-sm font-medium leading-6 text-white">{value}</p>
    </div>
  );
}
