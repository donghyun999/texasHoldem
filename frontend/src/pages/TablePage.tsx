import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import type { TournamentSnapshot } from "@/entities/tournament/model/types";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tournamentCode = params.tournamentCode ?? params.roomCode ?? "DEMO1";
  const { guestId } = useGuestSession();
  const snapshotQueryKey = buildTournamentSnapshotKey(tournamentCode);
  const cachedSnapshot = queryClient.getQueryData<TournamentSnapshot>(snapshotQueryKey);
  const snapshotQuery = useQuery({
    queryKey: snapshotQueryKey,
    queryFn: () => getTournamentSnapshot(tournamentCode, guestId),
    initialData: cachedSnapshot,
    refetchOnMount: cachedSnapshot ? false : undefined,
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
  const wasSeatedRef = useRef(false);

  // Returns the user to the lobby after an explicit waiting-room leave removes the seat.
  useEffect(() => {
    if (currentPlayer) {
      wasSeatedRef.current = true;
      return;
    }

    if (wasSeatedRef.current && snapshot.status === "WAITING") {
      wasSeatedRef.current = false;
      navigate("/", { replace: true });
    }
  }, [currentPlayer, navigate, snapshot.status]);

  return (
    <section className="space-y-6">
      <TournamentOverview snapshot={snapshot} syncState={syncState} />
      <div className="lg:hidden">
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
      </div>
      <TournamentTable snapshot={snapshot} currentGuestId={guestId} />
      <TournamentShowdownPanel snapshot={snapshot} />
      <div className="hidden lg:block">
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
      </div>
    </section>
  );
}
