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
  const previewSnapshot = createDemoTournamentSnapshot("MVP01", createRoomName.trim() || "금요일 저녁 하이롤러");
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
  const activeTournament = activeTournamentQuery.data;
  const isCheckingActiveTournament = !!guestId.trim() && activeTournamentQuery.isPending;
  const controlsDisabled =
    !!activeTournament || isCheckingActiveTournament || createMutation.isPending || joinMutation.isPending;
  const busyLabel = createMutation.isPending
    ? "테이블을 만드는 중입니다..."
    : joinMutation.isPending
      ? "테이블에 입장하는 중입니다..."
      : isCheckingActiveTournament
        ? "이미 참가 중인 테이블이 있는지 확인하는 중입니다..."
        : null;
  const createError =
    (validationError?.scope === "create" ? validationError.message : null) ||
    (createMutation.error && toErrorMessage(createMutation.error, "테이블 생성에 실패했습니다.")) ||
    null;
  const joinError =
    (validationError?.scope === "join" ? validationError.message : null) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "테이블 입장에 실패했습니다.")) ||
    null;
  const passwordJoinError = lastJoinUsedPassword ? joinError : null;
  const waitingListError =
    (waitingRoomListQuery.error && !waitingRoomListQuery.isFetching
      ? toErrorMessage(waitingRoomListQuery.error, "대기 중인 테이블을 불러오지 못했습니다.")
      : null) ||
    (passwordJoinError ? null : joinError);

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
      throw new Error("이미 다른 테이블에 참가 중인지 확인하고 있습니다.");
    }
    if (activeTournament) {
      throw new Error("이미 다른 진행 중인 테이블에 참가하고 있습니다.");
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
      setValidationError({ scope: "create", message: "테이블을 만들기 전에 제목을 입력해 주세요." });
      return;
    }
    if (roomVisibility === "PRIVATE" && !createPassword.trim()) {
      setValidationError({ scope: "create", message: "잠금 테이블을 만들려면 비밀번호를 입력해 주세요." });
      return;
    }

    try {
      const resolvedGuestId = await ensureAvailableGuest("테이블을 만들기 전에 닉네임을 입력해 주세요.");
      createMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        roomName: createRoomName.trim(),
        visibility: roomVisibility,
        password: roomVisibility === "PRIVATE" ? createPassword.trim() : undefined,
      });
    } catch (error) {
      setValidationError({ scope: "create", message: toErrorMessage(error, "게스트 세션 생성에 실패했습니다.") });
    }
  }

  async function handleJoinTable(code: string, password?: string) {
    clearJoinErrors();
    clearCreateErrors();
    setLastJoinUsedPassword(typeof password === "string");

    try {
      const resolvedGuestId = await ensureAvailableGuest("테이블에 입장하기 전에 닉네임을 입력해 주세요.");
      joinMutation.mutate({
        code,
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        password,
      });
    } catch (error) {
      setValidationError({ scope: "join", message: toErrorMessage(error, "게스트 세션 생성에 실패했습니다.") });
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
        <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/70">토너먼트 MVP</p>
          <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-white">
            대기 중인 테이블을 살펴보고, 바로 입장하거나 비밀번호로 잠금 좌석을 해제해 보세요.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
            공개방과 잠금방이 같은 로비 목록에 함께 표시됩니다. 방장은 제목만 정하면 되고 내부 코드는 서버가 관리합니다.
            잠금방은 입장 전에 비밀번호를 입력합니다.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricCard label="서버" value={statusQuery.data?.status ?? "오프라인"} />
            <MetricCard label="블라인드" value={`L${previewSnapshot.currentLevel.level}`} />
            <MetricCard label="좌석" value={`${previewSnapshot.players.length} / 6`} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <GuidanceCard label="공개방" value="로비 목록에서 바로 입장합니다." />
            <GuidanceCard label="잠금방" value="목록에 보이지만 비밀번호가 있어야 입장합니다." />
            <GuidanceCard label="방 코드" value="플레이어에게는 공유하지 않는 내부 식별자입니다." />
          </div>
        </div>

        <PublicTournamentList
          rooms={waitingRoomListQuery.data ?? []}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-3 text-lg font-medium text-white">{value}</p>
    </div>
  );
}

function GuidanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/70">{label}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-200">{value}</p>
    </div>
  );
}
