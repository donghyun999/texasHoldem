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
    <section className="rounded-[1.8rem] border border-cyan-300/20 bg-[linear-gradient(135deg,_rgba(14,116,144,0.22),_rgba(7,12,20,0.94))] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">초대 링크</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{snapshot.roomName} 바로 입장</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100">
          {lockedTable ? "잠금 테이블" : "공개 테이블"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {lockedTable
          ? passwordEmbedded
            ? "이 초대에는 비밀번호가 포함되어 있습니다. 닉네임만 확인하고 바로 입장하면 됩니다."
            : "이 방은 비밀번호가 필요합니다. 로비를 거치지 않고 여기서 바로 입력해 입장할 수 있습니다."
          : "이 링크를 열면 로비를 거치지 않고 바로 테이블 화면으로 이동합니다."}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">닉네임</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="플레이어 이름"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300"
          />
        </label>

        {lockedTable ? (
          <label className="block">
            <span className="mb-2 block text-sm text-zinc-300">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="테이블 비밀번호를 입력해 주세요"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300"
            />
          </label>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">접속 정보</p>
            <p className="mt-2 text-base font-semibold text-white">비밀번호 필요 없음</p>
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onJoin}
          disabled={joinPending}
          className="rounded-2xl border border-cyan-300/25 bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joinPending ? "입장 중..." : "테이블 입장"}
        </button>
        <p className="text-sm text-zinc-300">
          {autoJoinPending
            ? "초대 링크에서 자동 입장을 시도하는 중입니다."
            : lockedTable && passwordEmbedded
              ? "초대에 포함된 비밀번호를 확인할 수 있습니다. 입장 전에 수정할 수도 있습니다."
              : "테이블은 아직 대기 중이며, 아래 미리보기는 실시간으로 갱신됩니다."}
        </p>
      </div>
    </section>
  );
}
