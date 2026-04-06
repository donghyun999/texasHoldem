import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { ActionPanel } from "@/features/table/ui/ActionPanel";
import { getTournamentSnapshot } from "@/shared/api/http";
import { TournamentOverview } from "@/widgets/tournament/ui/TournamentOverview";
import { TournamentTable } from "@/widgets/tournament/ui/TournamentTable";

// Renders a tournament table from either a live server snapshot or a local fallback.
export function TablePage() {
  const params = useParams();
  const tournamentCode = params.tournamentCode ?? params.roomCode ?? "DEMO1";
  const snapshotQuery = useQuery({
    queryKey: ["tournament-snapshot", tournamentCode],
    queryFn: () => getTournamentSnapshot(tournamentCode),
    retry: false,
  });
  const snapshot = snapshotQuery.data ?? createDemoTournamentSnapshot(tournamentCode);
  const syncState = snapshotQuery.data
    ? "LIVE SNAPSHOT"
    : snapshotQuery.isError
      ? "DEMO FALLBACK"
      : "SYNCING";

  return (
    <section className="space-y-6">
      <TournamentOverview snapshot={snapshot} syncState={syncState} />
      <TournamentTable snapshot={snapshot} />
      <ActionPanel actions={snapshot.availableActions} message={snapshot.tableMessage} />
    </section>
  );
}
