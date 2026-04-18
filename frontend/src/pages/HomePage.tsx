import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { syncPublicTournamentListCache } from "@/entities/tournament/model/lobby-cache";
import {
  buildActiveTournamentKey,
  buildTournamentSnapshotKey,
  publicTournamentListQueryKey,
} from "@/entities/tournament/model/query-keys";
import type { ActiveTournamentSession, TournamentSnapshot, TournamentVisibility } from "@/entities/tournament/model/types";
import { rememberCreatedRoomPassword } from "@/features/lobby/model/created-room-passwords";
import { LobbyForm } from "@/features/lobby/ui/LobbyForm";
import { PublicTournamentList } from "@/features/lobby/ui/PublicTournamentList";
import {
  createTournament,
  getActiveTournamentForCurrentGuest,
  getBackendStatus,
  getPublicWaitingTournaments,
  isUnauthorizedError,
  joinTournament,
} from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatBackendStatus(status?: string | null) {
  switch (status?.trim().toUpperCase()) {
    case "UP":
    case "OK":
      return "정상";
    case "DOWN":
      return "오류";
    case "DEGRADED":
      return "성능 저하";
    case "MAINTENANCE":
      return "점검 중";
    default:
      return status?.trim() ? "알 수 없음" : "확인 중";
  }
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
  const { nickname, setNickname, ensureGuestSession, isBootstrappingGuest } = useGuestSession();
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
  const activeTournamentQuery = useQuery<ActiveTournamentSession | null, Error>({
    queryKey: buildActiveTournamentKey(),
    queryFn: async () => {
      try {
        return await getActiveTournamentForCurrentGuest();
      } catch (error) {
        if (isUnauthorizedError(error)) {
          return null;
        }

        throw error;
      }
    },
    enabled: !isBootstrappingGuest,
    retry: false,
  });
  const waitingRoomListQuery = useQuery({
    queryKey: publicTournamentListQueryKey,
    queryFn: getPublicWaitingTournaments,
    retry: false,
    refetchInterval: 5_000,
  });

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
    }) => createTournament(nickname, roomName, visibility, password),
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
    }) => joinTournament(code, nickname, password),
    onSuccess: (snapshot, variables) => {
      void queryClient.invalidateQueries({ queryKey: publicTournamentListQueryKey });
      handleTournamentEntry(snapshot, variables.guestId);
    },
  });

  const controlsDisabled =
    isBootstrappingGuest ||
    !!activeTournament ||
    activeTournamentQuery.isPending ||
    createMutation.isPending ||
    joinMutation.isPending;

  const isCheckingActiveTournament = activeTournamentQuery.isPending;
  const busyLabel = createMutation.isPending
    ? "테이블을 만드는 중..."
    : joinMutation.isPending
      ? "테이블에 참가하는 중..."
      : isCheckingActiveTournament
        ? "이미 활성 테이블이 있는지 확인하는 중..."
        : null;
  const createError =
    (validationError?.scope === "create" ? validationError.message : null) ||
    (createMutation.error && toErrorMessage(createMutation.error, "테이블 생성에 실패했습니다.")) ||
    null;
  const joinError =
    (validationError?.scope === "join" ? validationError.message : null) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "테이블 참가에 실패했습니다.")) ||
    null;
  const passwordJoinError = lastJoinUsedPassword ? joinError : null;
  const waitingListError =
    (waitingRoomListQuery.error && !waitingRoomListQuery.isFetching
      ? toErrorMessage(waitingRoomListQuery.error, "대기실 목록을 불러오지 못했습니다.")
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
    queryClient.setQueryData(buildActiveTournamentKey(), {
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
      throw new Error("이미 다른 세션이 활성화되어 있는지 확인하는 중입니다.");
    }
    if (activeTournament) {
      throw new Error("이미 활성 토너먼트 세션이 있습니다.");
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
      setValidationError({ scope: "create", message: "테이블을 만들기 전에 방 이름을 입력하세요." });
      return;
    }
    if (roomVisibility === "PRIVATE" && !createPassword.trim()) {
      setValidationError({ scope: "create", message: "잠금 테이블에는 비밀번호가 필요합니다." });
      return;
    }

    try {
      const resolvedGuestId = await ensureAvailableGuest("테이블을 만들기 전에 닉네임을 입력하세요.");
      createMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        roomName: createRoomName.trim(),
        visibility: roomVisibility,
        password: roomVisibility === "PRIVATE" ? createPassword.trim() : undefined,
      });
    } catch (error) {
      setValidationError({ scope: "create", message: toErrorMessage(error, "테이블 생성에 실패했습니다.") });
    }
  }

  async function handleJoinTable(code: string, password?: string) {
    clearJoinErrors();
    clearCreateErrors();
    setLastJoinUsedPassword(typeof password === "string");

    try {
      const resolvedGuestId = await ensureAvailableGuest("테이블에 참가하기 전에 닉네임을 입력하세요.");
      joinMutation.mutate({
        code,
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        password,
      });
    } catch (error) {
      setValidationError({ scope: "join", message: toErrorMessage(error, "테이블 참가에 실패했습니다.") });
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
          <div className="relative space-y-5">
            <div className="space-y-5">
              <h2 className="max-w-2xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                빠르게 방을 만들고, 바로 참가하세요.
              </h2>
              <p className="max-w-xl text-base leading-7 text-[color:var(--app-text-dim)]">
                공개 방은 바로 들어가고, 잠금 방은 비밀번호로 들어갑니다. 친구에게는 방 이름과 필요한 정보만
                공유하면 됩니다.
              </p>

              <div className="flex flex-wrap gap-2">
                <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-50">
                  서비스 상태: {formatBackendStatus(statusQuery.data?.status)}
                </span>
                <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
                  공개 방 {liveOpenRooms}
                </span>
                <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
                  잠금 방 {liveLockedRooms}
                </span>
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
