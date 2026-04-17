import type { TournamentSnapshot } from "@/entities/tournament/model/types";

type WaitingRoomDirectJoinPanelProps = {
  snapshot: TournamentSnapshot;
  nickname: string;
  password: string;
  joinPending?: boolean;
  autoJoinPending?: boolean;
  errorMessage?: string | null;
  onNicknameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onJoin: () => void;
};

export function WaitingRoomDirectJoinPanel({
  snapshot,
  nickname,
  password,
  joinPending = false,
  autoJoinPending = false,
  errorMessage = null,
  onNicknameChange,
  onPasswordChange,
  onJoin,
}: WaitingRoomDirectJoinPanelProps) {
  if (snapshot.status !== "WAITING") {
    return null;
  }

  const lockedTable = snapshot.visibility === "PRIVATE";
  const passwordEmbedded = lockedTable && password.trim().length > 0;

  return (
    <section className="social-surface rounded-[1.8rem] border-cyan-200/20 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black tracking-tight text-white">{snapshot.roomName} 대기실</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {lockedTable ? "잠금" : "공개"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {lockedTable
          ? passwordEmbedded
            ? "이 초대에는 비밀번호가 이미 포함되어 있어, 닉네임만 확인하면 참가할 수 있습니다."
            : "이 방은 비밀번호가 필요합니다. 아래에 입력한 뒤 로비에서 바로 참가하세요."
          : "이 방은 공개 상태입니다. 닉네임만 입력하면 대기실에서 바로 참가할 수 있습니다."}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-200">닉네임</span>
          <input
            data-testid="direct-join-nickname-input"
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="플레이어 이름"
            className="social-input"
          />
        </label>

        {lockedTable ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-200">비밀번호</span>
            <input
              data-testid="direct-join-password-input"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="방 비밀번호를 입력하세요"
              className="social-input"
            />
          </label>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-[1.25rem] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="direct-join-submit"
          onClick={onJoin}
          disabled={joinPending}
          className="social-cta-secondary px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joinPending ? "참가 중..." : "테이블 참가"}
        </button>
        <p className="text-sm text-zinc-300">
          {autoJoinPending
            ? "초대 링크로 자동 참가를 시도하는 중입니다."
            : lockedTable && passwordEmbedded
              ? "초대 링크에 비밀번호가 포함되어 있어, 바로 참가할 준비가 되어 있습니다."
              : "로비에서 대기하는 동안 방 상태를 새로고침합니다."}
        </p>
      </div>
    </section>
  );
}
