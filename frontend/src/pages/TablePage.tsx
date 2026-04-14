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
import { useUiStore } from "@/shared/model/ui-store";
import { TournamentShowdownPanel } from "@/widgets/tournament/ui/TournamentShowdownPanel";
import { TournamentTable } from "@/widgets/tournament/ui/TournamentTable";

// Renders a tournament table from either a live server snapshot or a local fallback.
export function TablePage() {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tournamentCode = params.tournamentCode ?? params.roomCode ?? "DEMO1";
  const { guestId } = useGuestSession();
  const snapshotQueryKey = buildTournamentSnapshotKey(tournamentCode, guestId);
  const cachedSnapshot = queryClient.getQueryData<TournamentSnapshot>(snapshotQueryKey);
  const snapshotQuery = useQuery({
    queryKey: snapshotQueryKey,
    queryFn: () => getTournamentSnapshot(tournamentCode, guestId),
    initialData: cachedSnapshot,
    refetchOnMount: "always",
    retry: false,
  });
  const realtimeSnapshot = useTournamentRealtimeSnapshot(tournamentCode, guestId, snapshotQuery.data);
  const snapshot = realtimeSnapshot.snapshot ?? snapshotQuery.data ?? createDemoTournamentSnapshot(tournamentCode);
  const stackDisplayMode = useUiStore((state) => state.stackDisplayMode);
  const setStackDisplayMode = useUiStore((state) => state.setStackDisplayMode);
  const currentPlayer =
    realtimeSnapshot.currentPlayer ?? snapshot.players.find((player) => player.guestId === guestId) ?? null;
  const wasSeatedRef = useRef(false);
  const totalPot = snapshot.mainPot + snapshot.sidePots.reduce((total, pot) => total + pot.amount, 0);

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
      <TournamentTable
        snapshot={snapshot}
        currentGuestId={guestId}
        stackDisplayMode={stackDisplayMode}
        onStackDisplayModeChange={setStackDisplayMode}
        actionBar={
          <ActionPanel
            actions={snapshot.availableActions}
            chipsToCall={snapshot.chipsToCall}
            minimumRaiseTo={snapshot.minimumRaiseTo}
            potSize={totalPot}
            bigBlind={snapshot.currentLevel.bigBlind}
            message={snapshot.tableMessage}
            tournamentStatus={snapshot.status}
            currentPlayer={currentPlayer}
            actionDeadlineAtEpochMilli={snapshot.actionDeadlineAtEpochMilli}
            actionTimeoutSeconds={snapshot.actionTimeoutSeconds}
            stackDisplayMode={stackDisplayMode}
            canPublish={realtimeSnapshot.canPublish}
            onAction={realtimeSnapshot.sendAction}
            onReadyChange={realtimeSnapshot.sendReady}
            onStart={realtimeSnapshot.sendStart}
            onDisconnect={realtimeSnapshot.sendDisconnect}
            onReconnect={realtimeSnapshot.sendReconnect}
            onReturnToPlay={realtimeSnapshot.sendReturnToPlay}
          />
        }
      />
      <TournamentShowdownPanel snapshot={snapshot} />
    </section>
  );
}
