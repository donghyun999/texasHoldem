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

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guestId, nickname, setNickname, ensureGuestSession } = useGuestSession();
  const [roomVisibility, setRoomVisibility] = useState<TournamentVisibility>("PUBLIC");
  const [createRoomName, setCreateRoomName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
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
  const waitingRoomListQuery = useQuery({
    queryKey: publicTournamentListQueryKey,
    queryFn: getPublicWaitingTournaments,
    retry: false,
    refetchInterval: 5_000,
  });
  const previewSnapshot = createDemoTournamentSnapshot("MVP01", createRoomName.trim() || "Friday Night Sit & Go");
  const createMutation = useMutation({
    mutationFn: ({
      guestId,
      nickname,
      roomName,
      visibility,
      password,
    }: {
      guestId: string;
      nickname: string;
      roomName: string;
      visibility: TournamentVisibility;
      password?: string;
    }) => createTournament(guestId, nickname, roomName, visibility, password),
    onSuccess: (snapshot, variables) => {
      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });
  const joinMutation = useMutation({
    mutationFn: ({
      code,
      guestId,
      nickname,
      password,
    }: {
      code: string;
      guestId: string;
      nickname: string;
      password?: string;
    }) => joinTournament(code, guestId, nickname, password),
    onSuccess: (snapshot, variables) => {
      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });
  const activeTournament = activeTournamentQuery.data;
  const isCheckingActiveTournament = !!guestId.trim() && activeTournamentQuery.isPending;
  const controlsDisabled =
    !!activeTournament || isCheckingActiveTournament || createMutation.isPending || joinMutation.isPending;
  const busyLabel = createMutation.isPending
    ? "Creating your table..."
    : joinMutation.isPending
      ? "Joining table..."
      : isCheckingActiveTournament
        ? "Checking for an active table..."
        : null;
  const activeError =
    validationError ||
    (createMutation.error && toErrorMessage(createMutation.error, "Failed to create table.")) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "Failed to join table.")) ||
    null;
  const waitingListError =
    waitingRoomListQuery.error && !waitingRoomListQuery.isFetching
      ? toErrorMessage(waitingRoomListQuery.error, "Failed to load waiting tables.")
      : null;

  function handleTournamentEntry(snapshot: TournamentSnapshot, viewerGuestId: string) {
    queryClient.setQueryData(buildTournamentSnapshotKey(snapshot.code, viewerGuestId), snapshot);
    queryClient.setQueryData(buildActiveTournamentKey(viewerGuestId), {
      guestId: viewerGuestId,
      tournamentCode: snapshot.code,
      roomName: snapshot.roomName,
      status: snapshot.status,
    });
    syncPublicTournamentListCache(queryClient, snapshot);
    navigate(`/tournaments/${snapshot.code}`);
  }

  async function ensureAvailableGuest(nicknameRequiredMessage: string) {
    if (isCheckingActiveTournament) {
      throw new Error("Checking whether this guest is already seated at another table.");
    }
    if (activeTournament) {
      throw new Error("You are already seated at another active table.");
    }
    if (!nickname.trim()) {
      throw new Error(nicknameRequiredMessage);
    }

    return ensureGuestSession();
  }

  async function handleCreate() {
    setValidationError(null);

    if (!createRoomName.trim()) {
      setValidationError("Enter a table title before creating a table.");
      return;
    }
    if (roomVisibility === "PRIVATE" && !createPassword.trim()) {
      setValidationError("Set a password before creating a locked table.");
      return;
    }

    try {
      const resolvedGuestId = await ensureAvailableGuest("Enter a nickname before creating a table.");
      createMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        roomName: createRoomName.trim(),
        visibility: roomVisibility,
        password: roomVisibility === "PRIVATE" ? createPassword.trim() : undefined,
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  async function handleJoinTable(code: string, password?: string) {
    setValidationError(null);

    try {
      const resolvedGuestId = await ensureAvailableGuest("Enter a nickname before joining a table.");
      joinMutation.mutate({
        code,
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        password,
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
            Browse every waiting table, then join instantly or unlock a seat with a password.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            Open and locked tables now share the same lobby list. Hosts set a title, the server handles room codes, and
            locked tables prompt for a password before entry.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricCard label="Backend" value={statusQuery.data?.status ?? "OFFLINE"} />
            <MetricCard label="Blinds" value={`L${previewSnapshot.currentLevel.level}`} />
            <MetricCard label="Seats" value={`${previewSnapshot.players.length} / 6`} />
          </div>
        </div>

        <PublicTournamentList
          rooms={waitingRoomListQuery.data ?? []}
          disabled={controlsDisabled}
          loading={waitingRoomListQuery.isPending}
          errorMessage={waitingListError}
          onJoin={handleJoinTable}
        />
      </div>

      <LobbyForm
        nickname={nickname}
        createRoomName={createRoomName}
        createPassword={createPassword}
        roomVisibility={roomVisibility}
        activeTournamentRoomName={activeTournament?.roomName ?? null}
        activeTournamentStatus={activeTournament?.status ?? null}
        createDisabled={controlsDisabled}
        busyLabel={busyLabel}
        errorMessage={activeError}
        onNicknameChange={(value) => {
          setValidationError(null);
          setNickname(value);
        }}
        onCreateRoomNameChange={(value) => {
          setValidationError(null);
          setCreateRoomName(value);
        }}
        onCreatePasswordChange={(value) => {
          setValidationError(null);
          setCreatePassword(value);
        }}
        onRoomVisibilityChange={(value) => {
          setValidationError(null);
          setRoomVisibility(value);
        }}
        onResumeTournament={handleResumeTournament}
        onCreate={handleCreate}
      />
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-3 text-lg font-medium text-white">{value}</p>
    </div>
  );
}
