import type { TournamentSnapshot } from "@/entities/tournament/model/types";
import { TOURNAMENT_WS_URL } from "@/shared/config/runtime";

type TournamentOverviewProps = {
  snapshot: TournamentSnapshot;
  syncState: string;
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

// Renders the tournament header, blind state, and transport summary.
export function TournamentOverview({ snapshot, syncState }: TournamentOverviewProps) {
  return (
    <div className="grid gap-4 rounded-[2rem] border border-white/10 bg-black/20 px-6 py-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Tournament</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">{snapshot.code}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">{snapshot.tableMessage}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Status" value={snapshot.status} />
        <MetricCard
          label="Current Blind"
          value={formatBlindLevel(snapshot.currentLevel.smallBlind, snapshot.currentLevel.bigBlind)}
        />
        <MetricCard
          label="Next Level"
          value={`${formatBlindLevel(snapshot.nextLevel.smallBlind, snapshot.nextLevel.bigBlind)} in ${formatCountdown(snapshot.secondsUntilNextLevel)}`}
        />
        <MetricCard label="Realtime" value={`${syncState} @ ${TOURNAMENT_WS_URL}`} />
      </div>
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
