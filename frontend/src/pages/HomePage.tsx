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
  joinPrivateTournament,
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
  const [createRoomName, setCreateRoomName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [privateRoomName, setPrivateRoomName] = useState("");
  const [privateRoomPassword, setPrivateRoomPassword] = useState("");
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
  const publicJoinMutation = useMutation({
    mutationFn: ({ code, guestId, nickname }: { code: string; guestId: string; nickname: string }) =>
      joinTournament(code, guestId, nickname),
    onSuccess: (snapshot, variables) => {
      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });
  const privateJoinMutation = useMutation({
    mutationFn: ({
      roomName,
      password,
      guestId,
      nickname,
    }: {
      roomName: string;
      password: string;
      guestId: string;
      nickname: string;
    }) => joinPrivateTournament(roomName, password, guestId, nickname),
    onSuccess: (snapshot, variables) => {
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });
  const activeError =
    validationError ||
    (createMutation.error && toErrorMessage(createMutation.error, "Failed to create table.")) ||
    (publicJoinMutation.error && toErrorMessage(publicJoinMutation.error, "Failed to join table.")) ||
    (privateJoinMutation.error && toErrorMessage(privateJoinMutation.error, "Failed to join private table.")) ||
    null;
  const activeTournament = activeTournamentQuery.data;
  const isCheckingActiveTournament = !!guestId.trim() && activeTournamentQuery.isPending;
  const controlsDisabled =
    !!activeTournament ||
    isCheckingActiveTournament ||
    createMutation.isPending ||
    publicJoinMutation.isPending ||
    privateJoinMutation.isPending;
  const busyLabel = createMutation.isPending
    ? "Creating your table..."
    : publicJoinMutation.isPending
      ? "Joining table..."
      : privateJoinMutation.isPending
        ? "Joining private table..."
        : isCheckingActiveTournament
          ? "Checking for an active table..."
          : null;
  const publicListError =
    publicTournamentListQuery.error && !publicTournamentListQuery.isFetching
      ? toErrorMessage(publicTournamentListQuery.error, "Failed to load open tables.")
      : null;

  // Seeds the destination snapshot cache before navigation so the table paints immediately.
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

  function resetValidationError() {
    setValidationError(null);
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
    resetValidationError();

    if (!createRoomName.trim()) {
      setValidationError("Enter a table title before creating a table.");
      return;
    }
    if (roomVisibility === "PRIVATE" && !createPassword.trim()) {
      setValidationError("Set a password before creating a private table.");
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

  async function handleJoinPrivate() {
    resetValidationError();

    if (!privateRoomName.trim()) {
      setValidationError("Enter the private table title before joining.");
      return;
    }
    if (!privateRoomPassword.trim()) {
      setValidationError("Enter the private table password before joining.");
      return;
    }

    try {
      const resolvedGuestId = await ensureAvailableGuest("Enter a nickname before joining a table.");
      privateJoinMutation.mutate({
        roomName: privateRoomName.trim(),
        password: privateRoomPassword.trim(),
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  async function handleJoinPublicRoom(code: string) {
    resetValidationError();

    try {
      const resolvedGuestId = await ensureAvailableGuest("Enter a nickname before joining a table.");
      publicJoinMutation.mutate({
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

    resetValidationError();
    navigate(`/tournaments/${activeTournament.tournamentCode}`);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/70">Tournament MVP</p>
          <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-white">
            Create a table for friends, or jump straight into an open seat.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            Public tables appear in the lobby list. Private tables stay hidden and are shared with a title plus
            password.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricCard label="Backend" value={statusQuery.data?.status ?? "OFFLINE"} />
            <MetricCard label="Blinds" value={`L${previewSnapshot.currentLevel.level}`} />
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
        nickname={nickname}
        createRoomName={createRoomName}
        createPassword={createPassword}
        privateRoomName={privateRoomName}
        privateRoomPassword={privateRoomPassword}
        roomVisibility={roomVisibility}
        activeTournamentRoomName={activeTournament?.roomName ?? null}
        activeTournamentStatus={activeTournament?.status ?? null}
        createDisabled={controlsDisabled}
        joinDisabled={controlsDisabled}
        busyLabel={busyLabel}
        errorMessage={activeError}
        onNicknameChange={(value) => {
          resetValidationError();
          setNickname(value);
        }}
        onCreateRoomNameChange={(value) => {
          resetValidationError();
          setCreateRoomName(value);
        }}
        onCreatePasswordChange={(value) => {
          resetValidationError();
          setCreatePassword(value);
        }}
        onPrivateRoomNameChange={(value) => {
          resetValidationError();
          setPrivateRoomName(value);
        }}
        onPrivateRoomPasswordChange={(value) => {
          resetValidationError();
          setPrivateRoomPassword(value);
        }}
        onRoomVisibilityChange={(value) => {
          resetValidationError();
          setRoomVisibility(value);
        }}
        onResumeTournament={handleResumeTournament}
        onCreate={handleCreate}
        onJoinPrivate={handleJoinPrivate}
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
