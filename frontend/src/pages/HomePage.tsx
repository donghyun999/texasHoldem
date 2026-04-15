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
import { rememberCreatedRoomPassword } from "@/features/lobby/model/created-room-passwords";
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

type ValidationError = {
  scope: "create" | "join";
  message: string;
};

type TableNavigationState = {
  createdRoomPassword?: string | null;
};

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guestId, nickname, setNickname, ensureGuestSession } = useGuestSession();
  const [roomVisibility, setRoomVisibility] = useState<TournamentVisibility>("PUBLIC");
  const [createRoomName, setCreateRoomName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [lastJoinUsedPassword, setLastJoinUsedPassword] = useState(false);

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

  const previewSnapshot = createDemoTournamentSnapshot("MVP01", createRoomName.trim() || "Quick Table");
  const activeTournament = activeTournamentQuery.data;
  const waitingRooms = waitingRoomListQuery.data ?? [];
  const liveOpenRooms = waitingRooms.filter((room) => room.visibility === "PUBLIC").length;
  const liveLockedRooms = waitingRooms.length - liveOpenRooms;

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
      if (variables.visibility === "PRIVATE" && variables.password) {
        rememberCreatedRoomPassword(snapshot.code, variables.password);
      }

      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId, {
        createdRoomPassword: variables.visibility === "PRIVATE" ? variables.password ?? null : null,
      });
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

  const controlsDisabled =
    !!activeTournament ||
    (!!guestId.trim() && activeTournamentQuery.isPending) ||
    createMutation.isPending ||
    joinMutation.isPending;

  const isCheckingActiveTournament = !!guestId.trim() && activeTournamentQuery.isPending;
  const busyLabel = createMutation.isPending
    ? "Creating a table..."
    : joinMutation.isPending
      ? "Joining the table..."
      : isCheckingActiveTournament
        ? "Checking whether you already have an active table..."
        : null;
  const createError =
    (validationError?.scope === "create" ? validationError.message : null) ||
    (createMutation.error && toErrorMessage(createMutation.error, "Table creation failed.")) ||
    null;
  const joinError =
    (validationError?.scope === "join" ? validationError.message : null) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "Table join failed.")) ||
    null;
  const passwordJoinError = lastJoinUsedPassword ? joinError : null;
  const waitingListError =
    (waitingRoomListQuery.error && !waitingRoomListQuery.isFetching
      ? toErrorMessage(waitingRoomListQuery.error, "Could not load the waiting room list.")
      : null) || (passwordJoinError ? null : joinError);

  function clearCreateErrors() {
    if (validationError?.scope === "create") {
      setValidationError(null);
    }
    if (createMutation.error) {
      createMutation.reset();
    }
  }

  function clearJoinErrors() {
    if (validationError?.scope === "join") {
      setValidationError(null);
    }
    if (joinMutation.error) {
      joinMutation.reset();
    }
    setLastJoinUsedPassword(false);
  }

  function handleTournamentEntry(
    snapshot: TournamentSnapshot,
    viewerGuestId: string,
    navigationState?: TableNavigationState,
  ) {
    queryClient.setQueryData(buildTournamentSnapshotKey(snapshot.code, viewerGuestId), snapshot);
    queryClient.setQueryData(buildActiveTournamentKey(viewerGuestId), {
      guestId: viewerGuestId,
      tournamentCode: snapshot.code,
      roomName: snapshot.roomName,
      status: snapshot.status,
    });
    syncPublicTournamentListCache(queryClient, snapshot);
    navigate(`/tournaments/${snapshot.code}`, { state: navigationState });
  }

  async function ensureAvailableGuest(nicknameRequiredMessage: string) {
    if (isCheckingActiveTournament) {
      throw new Error("Checking whether another session is already active.");
    }
    if (activeTournament) {
      throw new Error("You already have an active tournament session.");
    }
    if (!nickname.trim()) {
      throw new Error(nicknameRequiredMessage);
    }

    return ensureGuestSession();
  }

  async function handleCreate() {
    clearCreateErrors();
    clearJoinErrors();

    if (!createRoomName.trim()) {
      setValidationError({ scope: "create", message: "Enter a room name before creating a table." });
      return;
    }
    if (roomVisibility === "PRIVATE" && !createPassword.trim()) {
      setValidationError({ scope: "create", message: "Private tables need a password." });
      return;
    }

    try {
      const resolvedGuestId = await ensureAvailableGuest("Enter your nickname before creating a table.");
      createMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        roomName: createRoomName.trim(),
        visibility: roomVisibility,
        password: roomVisibility === "PRIVATE" ? createPassword.trim() : undefined,
      });
    } catch (error) {
      setValidationError({ scope: "create", message: toErrorMessage(error, "Table creation failed.") });
    }
  }

  async function handleJoinTable(code: string, password?: string) {
    clearJoinErrors();
    clearCreateErrors();
    setLastJoinUsedPassword(typeof password === "string");

    try {
      const resolvedGuestId = await ensureAvailableGuest("Enter your nickname before joining a table.");
      joinMutation.mutate({
        code,
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        password,
      });
    } catch (error) {
      setValidationError({ scope: "join", message: toErrorMessage(error, "Table join failed.") });
    }
  }

  function handleResumeTournament() {
    if (!activeTournament) {
      return;
    }

    clearCreateErrors();
    clearJoinErrors();
    navigate(`/tournaments/${activeTournament.tournamentCode}`);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-6">
        <div className="social-surface social-surface-strong relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <div className="absolute -right-10 top-6 h-32 w-32 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="absolute -bottom-10 left-6 h-36 w-36 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-5">
              <p className="social-kicker text-cyan-100/70">WPL-inspired social poker</p>
              <h2 className="max-w-2xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                Fast lobby, bigger buttons, and a table that feels alive.
              </h2>
              <p className="max-w-xl text-base leading-7 text-[color:var(--app-text-dim)]">
                Open rooms stay easy to scan, locked rooms stay obvious, and private invites are shared with less
                friction. The goal here is a friendlier game-app feel, not a heavy casino frame.
              </p>

              <div className="flex flex-wrap gap-2">
                <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-50">
                  Live: {statusQuery.data?.status ?? "checking"}
                </span>
                <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
                  Open rooms {liveOpenRooms}
                </span>
                <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
                  Locked rooms {liveLockedRooms}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Demo blind" value={`L${previewSnapshot.currentLevel.level}`} accent="cyan" />
                <MetricCard label="Seats" value={`${previewSnapshot.players.length} / 6`} accent="gold" />
                <MetricCard
                  label="Room code"
                  value={previewSnapshot.code}
                  accent="green"
                  helper="Internal identifier"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <GuidanceCard
                  label="Open rooms"
                  value="Rooms are visible immediately, so it is simple to jump into a table and start playing."
                />
                <GuidanceCard
                  label="Private rooms"
                  value="Locked tables stay listed, but joining needs the password the host shares with friends."
                />
                <GuidanceCard
                  label="Fast return"
                  value="If you already have a live session, the lobby makes it clear how to jump back in."
                />
              </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/10 bg-black/25 p-5 shadow-[0_22px_60px_rgba(0,0,0,0.18)]">
              <p className="social-kicker text-amber-100/80">Live snapshot</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Current table</p>
                  <p className="mt-2 text-lg font-bold text-white">{previewSnapshot.roomName}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Lobby state</p>
                  <p className="mt-2 text-lg font-bold text-white">{statusQuery.data?.status ?? "unknown"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Big blind</p>
                  <p className="mt-2 text-lg font-bold text-white">{previewSnapshot.currentLevel.bigBlind}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Room format</p>
                  <p className="mt-2 text-lg font-bold text-white">Open / locked</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <PublicTournamentList
          rooms={waitingRooms}
          disabled={controlsDisabled}
          loading={waitingRoomListQuery.isPending}
          errorMessage={waitingListError}
          passwordErrorMessage={passwordJoinError}
          onPasswordInteraction={clearJoinErrors}
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
        errorMessage={createError}
        onNicknameChange={(value) => {
          clearCreateErrors();
          clearJoinErrors();
          setNickname(value);
        }}
        onCreateRoomNameChange={(value) => {
          clearCreateErrors();
          setCreateRoomName(value);
        }}
        onCreatePasswordChange={(value) => {
          clearCreateErrors();
          setCreatePassword(value);
        }}
        onRoomVisibilityChange={(value) => {
          clearCreateErrors();
          setRoomVisibility(value);
        }}
        onResumeTournament={handleResumeTournament}
        onCreate={handleCreate}
      />
    </section>
  );
}

function MetricCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper?: string;
  accent: "cyan" | "gold" | "green";
}) {
  const accentClass =
    accent === "gold"
      ? "from-amber-300/20 to-amber-100/0 border-amber-200/20"
      : accent === "green"
        ? "from-emerald-300/20 to-emerald-100/0 border-emerald-200/20"
        : "from-cyan-300/20 to-cyan-100/0 border-cyan-200/20";

  return (
    <div className={`rounded-3xl border bg-[linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.04))] p-4 ${accentClass}`}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-2 text-lg font-bold text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs text-zinc-300">{helper}</p> : null}
    </div>
  );
}

function GuidanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/70">{label}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-200">{value}</p>
    </div>
  );
}
