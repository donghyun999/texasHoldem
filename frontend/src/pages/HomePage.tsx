import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { syncPublicTournamentListCache } from "@/entities/tournament/model/lobby-cache";
import {
  buildActiveTournamentKey,
  buildTournamentSnapshotKey,
  publicTournamentListQueryKey,
} from "@/entities/tournament/model/query-keys";
import type { TournamentSnapshot, TournamentVisibility } from "@/entities/tournament/model/types";
import { LobbyForm } from "@/features/lobby/ui/LobbyForm";
import { PublicTournamentList } from "@/features/lobby/ui/PublicTournamentList";
import {
  createTournament,
  getActiveTournamentForGuest,
  getBackendStatus,
  getPublicWaitingTournaments,
  joinTournament,
} from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";

// Converts unknown mutation failures into a short UI-safe message.
function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Renders the landing page for live tournament creation and entry.
export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guestId, nickname, setNickname, ensureGuestSession } = useGuestSession();
  const [roomVisibility, setRoomVisibility] = useState<TournamentVisibility>("PUBLIC");
  const [createTournamentCode, setCreateTournamentCode] = useState("");
  const [joinTournamentCode, setJoinTournamentCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["backend-status"],
    queryFn: getBackendStatus,
    retry: false,
  });
  const activeTournamentQuery = useQuery({
    queryKey: buildActiveTournamentKey(guestId),
    queryFn: () => getActiveTournamentForGuest(guestId),
    enabled: !!guestId.trim(),
    retry: false,
  });
  const publicTournamentListQuery = useQuery({
    queryKey: publicTournamentListQueryKey,
    queryFn: getPublicWaitingTournaments,
    retry: false,
    refetchInterval: 5_000,
  });
  const previewSnapshot = createDemoTournamentSnapshot(createTournamentCode || "MVP01");
  const createMutation = useMutation({
    mutationFn: ({
      guestId,
      nickname,
      visibility,
      code,
    }: {
      guestId: string;
      nickname: string;
      visibility: TournamentVisibility;
      code?: string;
    }) => createTournament(guestId, nickname, visibility, code),
    onSuccess: (snapshot, variables) => {
      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });
  const joinMutation = useMutation({
    mutationFn: ({ code, guestId, nickname }: { code: string; guestId: string; nickname: string }) =>
      joinTournament(code, guestId, nickname),
    onSuccess: (snapshot, variables) => {
      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });
  const activeError =
    validationError ||
    (createMutation.error && toErrorMessage(createMutation.error, "Failed to create tournament.")) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "Failed to join tournament.")) ||
    null;
  const activeTournament = activeTournamentQuery.data;
  const isCheckingActiveTournament = !!guestId.trim() && activeTournamentQuery.isPending;
  const controlsDisabled =
    !!activeTournament || isCheckingActiveTournament || createMutation.isPending || joinMutation.isPending;
  const busyLabel = createMutation.isPending
    ? "Creating tournament..."
    : joinMutation.isPending
      ? "Joining tournament..."
      : isCheckingActiveTournament
        ? "Checking your current tournament..."
      : null;
  const publicListError =
    publicTournamentListQuery.error && !publicTournamentListQuery.isFetching
      ? toErrorMessage(publicTournamentListQuery.error, "Failed to load public rooms.")
      : null;

  // Seeds the destination snapshot cache before navigation so the table paints immediately.
  function handleTournamentEntry(snapshot: TournamentSnapshot, viewerGuestId: string) {
    queryClient.setQueryData(buildTournamentSnapshotKey(snapshot.code, viewerGuestId), snapshot);
    queryClient.setQueryData(buildActiveTournamentKey(viewerGuestId), {
      guestId: viewerGuestId,
      tournamentCode: snapshot.code,
      status: snapshot.status,
    });
    syncPublicTournamentListCache(queryClient, snapshot);
    navigate(`/tournaments/${snapshot.code}`);
  }

  function handleNicknameChange(value: string) {
    setValidationError(null);
    setNickname(value);
  }

  function handleTournamentCodeChange(value: string) {
    setValidationError(null);
    setCreateTournamentCode(value);
  }

  function handleJoinTournamentCodeChange(value: string) {
    setValidationError(null);
    setJoinTournamentCode(value);
  }

  async function handleCreate() {
    if (isCheckingActiveTournament) {
      setValidationError("Checking whether this guest is already seated in another tournament.");
      return;
    }
    if (activeTournament) {
      setValidationError(`You are already participating in tournament ${activeTournament.tournamentCode}.`);
      return;
    }
    if (!nickname.trim()) {
      setValidationError("Enter a nickname before creating a tournament.");
      return;
    }

    setValidationError(null);
    try {
      const resolvedGuestId = await ensureGuestSession();
      createMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        visibility: roomVisibility,
        code: createTournamentCode.trim() ? createTournamentCode.trim().toUpperCase() : undefined,
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  async function handleJoin() {
    if (isCheckingActiveTournament) {
      setValidationError("Checking whether this guest is already seated in another tournament.");
      return;
    }
    if (activeTournament) {
      setValidationError(`You are already participating in tournament ${activeTournament.tournamentCode}.`);
      return;
    }
    if (!nickname.trim()) {
      setValidationError("Enter a nickname before joining a tournament.");
      return;
    }
    if (!joinTournamentCode.trim()) {
      setValidationError("Enter a tournament code before joining.");
      return;
    }

    setValidationError(null);
    try {
      const resolvedGuestId = await ensureGuestSession();
      joinMutation.mutate({
        code: joinTournamentCode.trim().toUpperCase(),
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  async function handleJoinPublicRoom(code: string) {
    if (isCheckingActiveTournament) {
      setValidationError("Checking whether this guest is already seated in another tournament.");
      return;
    }
    if (activeTournament) {
      setValidationError(`You are already participating in tournament ${activeTournament.tournamentCode}.`);
      return;
    }
    if (!nickname.trim()) {
      setValidationError("Enter a nickname before joining a tournament.");
      return;
    }

    setValidationError(null);
    try {
      const resolvedGuestId = await ensureGuestSession();
      joinMutation.mutate({
        code,
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  function handleResumeTournament() {
    if (!activeTournament) {
      return;
    }

    setValidationError(null);
    navigate(`/tournaments/${activeTournament.tournamentCode}`);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/70">Tournament MVP</p>
          <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-white">
            Public list join for open rooms, private code entry for direct invites.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            The current build keeps the existing ready, owner start, snapshot, and reconnect flow while making room
            creation and entry clearer on the home screen.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricCard label="Backend API" value={statusQuery.data?.status ?? "OFFLINE"} />
            <MetricCard label="Blind Level" value={`L${previewSnapshot.currentLevel.level}`} />
            <MetricCard label="Seats" value={`${previewSnapshot.players.length} / 6`} />
          </div>
        </div>

        <PublicTournamentList
          rooms={publicTournamentListQuery.data ?? []}
          disabled={controlsDisabled}
          loading={publicTournamentListQuery.isPending}
          errorMessage={publicListError}
          onJoin={handleJoinPublicRoom}
        />
      </div>

      <LobbyForm
        guestId={guestId}
        nickname={nickname}
        createTournamentCode={createTournamentCode}
        joinTournamentCode={joinTournamentCode}
        roomVisibility={roomVisibility}
        activeTournamentCode={activeTournament?.tournamentCode ?? null}
        activeTournamentStatus={activeTournament?.status ?? null}
        createDisabled={controlsDisabled}
        joinDisabled={controlsDisabled}
        busyLabel={busyLabel}
        errorMessage={activeError}
        onNicknameChange={handleNicknameChange}
        onCreateTournamentCodeChange={handleTournamentCodeChange}
        onJoinTournamentCodeChange={handleJoinTournamentCodeChange}
        onRoomVisibilityChange={setRoomVisibility}
        onResumeTournament={handleResumeTournament}
        onCreate={handleCreate}
        onJoin={handleJoin}
      />
    </section>
  );
}

// Displays one landing-page metric for the current prototype state.
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-3 text-lg font-medium text-white">{value}</p>
    </div>
  );
}
