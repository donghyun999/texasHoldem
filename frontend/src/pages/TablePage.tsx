import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { buildActiveTournamentKey, buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import type { TournamentSnapshot } from "@/entities/tournament/model/types";
import { findCreatedRoomPassword } from "@/features/lobby/model/created-room-passwords";
import { WaitingRoomDirectJoinPanel } from "@/features/lobby/ui/WaitingRoomDirectJoinPanel";
import { WaitingRoomInvitePanel } from "@/features/lobby/ui/WaitingRoomInvitePanel";
import { useTournamentRealtimeSnapshot } from "@/entities/tournament/model/use-tournament-realtime-snapshot";
import { ActionPanel } from "@/features/table/ui/ActionPanel";
import { getTournamentSnapshot, joinTournament } from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";
import { useUiStore } from "@/shared/model/ui-store";
import { TournamentShowdownPanel } from "@/widgets/tournament/ui/TournamentShowdownPanel";
import { TournamentTable } from "@/widgets/tournament/ui/TournamentTable";

// Renders a tournament table from either a live server snapshot or a local fallback.
export function TablePage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tournamentCode = params.tournamentCode ?? params.roomCode ?? "DEMO1";
  const { guestId, nickname, setNickname, ensureGuestSession } = useGuestSession({ autoBootstrap: false });
  const inviteSearchParams = new URLSearchParams(location.search);
  const invitePasswordFromUrl = inviteSearchParams.get("password")?.trim() ?? "";
  const autoJoinRequested = inviteSearchParams.get("join") === "1";
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
  const createdRoomPasswordFromState =
    (location.state as { createdRoomPassword?: string | null } | null)?.createdRoomPassword ?? null;
  const createdRoomPassword = createdRoomPasswordFromState ?? findCreatedRoomPassword(snapshot.code);
  const [joinPassword, setJoinPassword] = useState(invitePasswordFromUrl);
  const [joinValidationError, setJoinValidationError] = useState<string | null>(null);
  const wasSeatedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const totalPot = snapshot.mainPot + snapshot.sidePots.reduce((total, pot) => total + pot.amount, 0);

  useEffect(() => {
    setJoinPassword(invitePasswordFromUrl);
    setJoinValidationError(null);
    autoJoinAttemptedRef.current = false;
  }, [invitePasswordFromUrl, snapshot.code]);

  const joinMutation = useMutation({
    mutationFn: ({
      guestId,
      nickname,
      password,
    }: {
      guestId: string;
      nickname: string;
      password?: string;
    }) => joinTournament(snapshot.code, guestId, nickname, password),
    onSuccess: (joinedSnapshot, variables) => {
      queryClient.setQueryData(buildTournamentSnapshotKey(joinedSnapshot.code, variables.guestId), joinedSnapshot);
      queryClient.setQueryData(buildActiveTournamentKey(), {
        guestId: variables.guestId,
        tournamentCode: joinedSnapshot.code,
        roomName: joinedSnapshot.roomName,
        status: joinedSnapshot.status,
      });
      navigate(`/tournaments/${joinedSnapshot.code}`, { replace: true });
    },
  });

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

  async function handleDirectJoin() {
    setJoinValidationError(null);
    joinMutation.reset();

    if (!nickname.trim()) {
      setJoinValidationError("Enter a nickname before joining.");
      return;
    }

    if (snapshot.visibility === "PRIVATE" && !joinPassword.trim()) {
      setJoinValidationError("Enter the room password before joining.");
      return;
    }

    try {
      const resolvedGuestId = await ensureGuestSession();
      joinMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        password: snapshot.visibility === "PRIVATE" ? joinPassword.trim() : undefined,
      });
    } catch (error) {
      setJoinValidationError(error instanceof Error && error.message ? error.message : "Could not prepare this browser for joining.");
    }
  }

  useEffect(() => {
    const automaticJoinReady =
      autoJoinRequested &&
      snapshot.status === "WAITING" &&
      !currentPlayer &&
      !joinMutation.isPending &&
      !!guestId.trim() &&
      (!!nickname.trim() && (snapshot.visibility === "PUBLIC" || !!joinPassword.trim()));

    if (!automaticJoinReady || autoJoinAttemptedRef.current) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    void handleDirectJoin();
  }, [
    autoJoinRequested,
    currentPlayer,
    guestId,
    joinMutation.isPending,
    joinPassword,
    nickname,
    snapshot.status,
    snapshot.visibility,
  ]);

  const directJoinError =
    joinValidationError ||
    (joinMutation.error instanceof Error && joinMutation.error.message ? joinMutation.error.message : null);
  const showDirectJoinPanel = snapshot.status === "WAITING" && !currentPlayer;

  return (
    <section className="space-y-6">
      <WaitingRoomInvitePanel
        snapshot={snapshot}
        currentPlayer={currentPlayer}
        createdRoomPassword={createdRoomPassword}
      />
      {showDirectJoinPanel ? (
        <WaitingRoomDirectJoinPanel
          snapshot={snapshot}
          nickname={nickname}
          password={joinPassword}
          joinPending={joinMutation.isPending}
          autoJoinPending={autoJoinRequested && joinMutation.isPending}
          errorMessage={directJoinError}
          onNicknameChange={(value) => {
            setJoinValidationError(null);
            joinMutation.reset();
            setNickname(value);
          }}
          onPasswordChange={(value) => {
            setJoinValidationError(null);
            joinMutation.reset();
            setJoinPassword(value);
          }}
          onJoin={() => {
            void handleDirectJoin();
          }}
        />
      ) : null}
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
            paused={snapshot.paused}
            pauseReason={snapshot.pauseReason}
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
