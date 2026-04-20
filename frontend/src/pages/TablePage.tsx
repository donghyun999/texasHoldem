import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { buildActiveTournamentKey, buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import type { TournamentSnapshot } from "@/entities/tournament/model/types";
import { findCreatedRoomPassword } from "@/features/lobby/model/created-room-passwords";
import { WaitingRoomDirectJoinPanel } from "@/features/lobby/ui/WaitingRoomDirectJoinPanel";
import { WaitingRoomInvitePanel } from "@/features/lobby/ui/WaitingRoomInvitePanel";
import { resolveSnapshotViewerGuestId } from "@/entities/tournament/model/tournament-realtime-sync";
import { useTournamentRealtimeSnapshot } from "@/entities/tournament/model/use-tournament-realtime-snapshot";
import { ActionPanel } from "@/features/table/ui/ActionPanel";
import { getTournamentSnapshot, joinTournament } from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";
import { useUiStore } from "@/shared/model/ui-store";
import { TournamentShowdownPanel } from "@/widgets/tournament/ui/TournamentShowdownPanel";
import { TournamentTable } from "@/widgets/tournament/ui/TournamentTable";

// Renders a tournament table from the live server snapshot.
export function TablePage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tournamentCode = params.tournamentCode ?? "";
  const { guestId, nickname, setNickname, ensureGuestSession, isBootstrappingGuest } = useGuestSession({
    autoBootstrap: false,
  });
  const inviteSearchParams = new URLSearchParams(location.search);
  const invitePasswordFromUrl = inviteSearchParams.get("password")?.trim() ?? "";
  const autoJoinRequested = inviteSearchParams.get("join") === "1";
  const snapshotQueryKey = buildTournamentSnapshotKey(tournamentCode, guestId);
  const cachedSnapshot = queryClient.getQueryData<TournamentSnapshot>(snapshotQueryKey);
  const snapshotQuery = useQuery({
    queryKey: snapshotQueryKey,
    queryFn: () => getTournamentSnapshot(tournamentCode),
    initialData: cachedSnapshot,
    refetchOnMount: "always",
    retry: false,
  });
  const realtimeSnapshot = useTournamentRealtimeSnapshot(tournamentCode, guestId, snapshotQuery.data);
  const snapshot = realtimeSnapshot.snapshot ?? snapshotQuery.data ?? null;
  const stackDisplayMode = useUiStore((state) => state.stackDisplayMode);
  const setStackDisplayMode = useUiStore((state) => state.setStackDisplayMode);
  const createdRoomPasswordFromState = (location.state as { createdRoomPassword?: string | null } | null)?.createdRoomPassword ?? null;
  const [joinPassword, setJoinPassword] = useState(invitePasswordFromUrl);
  const [joinValidationError, setJoinValidationError] = useState<string | null>(null);
  const wasSeatedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tournamentCode]);

  const resolvedViewerGuestId = resolveSnapshotViewerGuestId(snapshot, guestId);
  const currentPlayer =
    realtimeSnapshot.currentPlayer ??
    snapshot?.players.find((player) => player.guestId === resolvedViewerGuestId) ??
    null;
  const createdRoomPassword = snapshot
    ? createdRoomPasswordFromState ?? findCreatedRoomPassword(snapshot.code)
    : createdRoomPasswordFromState;
  const totalPot = snapshot ? snapshot.mainPot + snapshot.sidePots.reduce((total, pot) => total + pot.amount, 0) : 0;

  useEffect(() => {
    setJoinPassword(invitePasswordFromUrl);
    setJoinValidationError(null);
    autoJoinAttemptedRef.current = false;
  }, [invitePasswordFromUrl, snapshot?.code]);

  const joinMutation = useMutation({
    mutationFn: ({
      guestId,
      nickname,
      password,
    }: {
      guestId: string;
      nickname: string;
      password?: string;
    }) => joinTournament(snapshot?.code ?? tournamentCode, nickname, password),
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

    if (wasSeatedRef.current && snapshot?.status === "WAITING") {
      wasSeatedRef.current = false;
      navigate("/", { replace: true });
    }
  }, [currentPlayer, navigate, snapshot?.status]);

  async function handleDirectJoin() {
    setJoinValidationError(null);
    joinMutation.reset();

    if (!snapshot) {
      setJoinValidationError("Tournament snapshot is still loading.");
      return;
    }

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
      snapshot?.status === "WAITING" &&
      !currentPlayer &&
      !joinMutation.isPending &&
      !!resolvedViewerGuestId &&
      !!nickname.trim() &&
      (snapshot?.visibility === "PUBLIC" || !!joinPassword.trim());

    if (!automaticJoinReady || autoJoinAttemptedRef.current) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    void handleDirectJoin();
  }, [
    autoJoinRequested,
    currentPlayer,
    joinMutation.isPending,
    joinPassword,
    nickname,
    resolvedViewerGuestId,
    snapshot?.status,
    snapshot?.visibility,
  ]);

  const directJoinError =
    joinValidationError ||
    (joinMutation.error instanceof Error && joinMutation.error.message ? joinMutation.error.message : null);
  const expectedViewerGuestId = guestId.trim();
  const hasCreateNavigationContext = createdRoomPasswordFromState !== null;
  const waitingForViewerSeatResolution =
    snapshot?.status === "WAITING" &&
    !currentPlayer &&
    !!expectedViewerGuestId &&
    (isBootstrappingGuest ||
      hasCreateNavigationContext ||
      autoJoinRequested ||
      joinMutation.isPending ||
      snapshotQuery.isFetching ||
      realtimeSnapshot.realtimeState === "CONNECTING" ||
      realtimeSnapshot.realtimeState === "RECONNECTING");

  if (!snapshot) {
    return (
      <section className="social-surface social-surface-strong rounded-[2rem] p-6 text-center text-zinc-100 shadow-2xl shadow-black/20">
        <p className="text-sm font-semibold tracking-[0.12em] text-cyan-100/70">테이블 입장 중</p>
        <p className="mt-3 text-base text-zinc-200">이 브라우저의 실시간 스냅샷을 불러오고 있습니다.</p>
      </section>
    );
  }

  const showDirectJoinPanel = snapshot.status === "WAITING" && !currentPlayer && !waitingForViewerSeatResolution;

  return (
    <section className="space-y-6 pb-32 sm:pb-0">
      <WaitingRoomInvitePanel snapshot={snapshot} currentPlayer={currentPlayer} createdRoomPassword={createdRoomPassword} />
      {waitingForViewerSeatResolution ? (
        <section className="social-surface rounded-[1.8rem] border-cyan-200/20 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black tracking-tight text-white">
                {hasCreateNavigationContext ? "Setting up your table" : "Restoring your seat"}
              </h3>
            </div>
            <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
              Syncing
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            {hasCreateNavigationContext
              ? "Your room was created. Waiting for the personalized seat view before showing owner controls."
              : isBootstrappingGuest
                ? "Checking whether this browser still has a valid guest session before restoring the seat."
                : "Waiting for this browser to recover its player seat before showing join or table controls."}
          </p>
        </section>
      ) : null}
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
        currentGuestId={resolvedViewerGuestId}
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
