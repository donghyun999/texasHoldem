import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { useTournamentRealtimeSnapshot } from "@/entities/tournament/model/use-tournament-realtime-snapshot";
import { ActionPanel } from "@/features/table/ui/ActionPanel";
import { getTournamentSnapshot } from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";
import { TournamentOverview } from "@/widgets/tournament/ui/TournamentOverview";
import { TournamentShowdownPanel } from "@/widgets/tournament/ui/TournamentShowdownPanel";
import { TournamentTable } from "@/widgets/tournament/ui/TournamentTable";

// Renders a tournament table from either a live server snapshot or a local fallback.
export function TablePage() {
  const params = useParams();
  const tournamentCode = params.tournamentCode ?? params.roomCode ?? "DEMO1";
  const { guestId } = useGuestSession();
  const snapshotQuery = useQuery({
    queryKey: ["tournament-snapshot", tournamentCode],
    queryFn: () => getTournamentSnapshot(tournamentCode),
    retry: false,
  });
  const realtimeSnapshot = useTournamentRealtimeSnapshot(tournamentCode, guestId, snapshotQuery.data);
  const snapshot = realtimeSnapshot.snapshot ?? snapshotQuery.data ?? createDemoTournamentSnapshot(tournamentCode);
  const syncState = realtimeSnapshot.snapshot
    ? realtimeSnapshot.syncState
    : snapshotQuery.data
      ? "LIVE SNAPSHOT"
      : snapshotQuery.isError
        ? "DEMO FALLBACK"
        : "SYNCING";
  const currentPlayer =
    realtimeSnapshot.currentPlayer ?? snapshot.players.find((player) => player.guestId === guestId) ?? null;

  return (
    <section className="space-y-6">
      <TournamentOverview snapshot={snapshot} syncState={syncState} />
      <TournamentTable snapshot={snapshot} />
      <TournamentShowdownPanel snapshot={snapshot} />
      <ActionPanel
        actions={snapshot.availableActions}
        message={snapshot.tableMessage}
        tournamentStatus={snapshot.status}
        currentPlayer={currentPlayer}
        canPublish={realtimeSnapshot.canPublish}
        onAction={realtimeSnapshot.sendAction}
        onReadyChange={realtimeSnapshot.sendReady}
        onStart={realtimeSnapshot.sendStart}
        onDisconnect={realtimeSnapshot.sendDisconnect}
        onReconnect={realtimeSnapshot.sendReconnect}
      />
    </section>
  );
}
