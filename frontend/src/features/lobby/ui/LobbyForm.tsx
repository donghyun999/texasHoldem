import type { TournamentStatus, TournamentVisibility } from "@/entities/tournament/model/types";

type LobbyFormProps = {
  nickname: string;
  createRoomName: string;
  createPassword: string;
  roomVisibility: TournamentVisibility;
  activeTournamentRoomName?: string | null;
  activeTournamentStatus?: TournamentStatus | null;
  createDisabled?: boolean;
  busyLabel?: string | null;
  errorMessage?: string | null;
  onNicknameChange: (value: string) => void;
  onCreateRoomNameChange: (value: string) => void;
  onCreatePasswordChange: (value: string) => void;
  onRoomVisibilityChange: (value: TournamentVisibility) => void;
  onResumeTournament?: () => void;
  onCreate: () => void;
};

const visibilityOptions: Array<{ value: TournamentVisibility; label: string; description: string }> = [
  {
    value: "PUBLIC",
    label: "공개 테이블",
    description: "로비 목록에 표시되며, 게임 시작 전까지 누구나 바로 입장할 수 있습니다.",
  },
  {
    value: "PRIVATE",
    label: "잠금 테이블",
    description: "로비 목록에 보이지만 입장하려면 비밀번호가 필요합니다.",
  },
];

function toDisplayStatus(status: TournamentStatus) {
  switch (status) {
    case "WAITING":
      return "대기 중";
    case "IN_HAND":
      return "핸드 진행 중";
    case "HAND_RESULT":
      return "핸드 결과";
    case "FINISHED":
      return "종료";
    default:
      return status;
  }
}

// Collects player-facing inputs for creating one open or locked table.
export function LobbyForm({
  nickname,
  createRoomName,
  createPassword,
  roomVisibility,
  activeTournamentRoomName = null,
  activeTournamentStatus = null,
  createDisabled = false,
  busyLabel = null,
  errorMessage = null,
  onNicknameChange,
  onCreateRoomNameChange,
  onCreatePasswordChange,
  onRoomVisibilityChange,
  onResumeTournament,
  onCreate,
}: LobbyFormProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">테이블 만들기</p>
      <h3 className="mt-3 text-2xl font-semibold text-white">새 게임 생성</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        닉네임과 테이블 제목을 정하고, 누구나 바로 입장 가능한 공개방 또는 비밀번호가 필요한 잠금방 중 하나를
        선택해 주세요.
      </p>

      {activeTournamentRoomName ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-200/10 px-4 py-4 text-sm text-amber-50">
          <p className="font-semibold">이미 참가 중인 테이블이 있습니다</p>
          <p className="mt-2">
            <span className="font-semibold">{activeTournamentRoomName}</span>
            {activeTournamentStatus ? ` (${toDisplayStatus(activeTournamentStatus)})` : ""} 테이블로 돌아가세요.
          </p>
          {onResumeTournament ? (
            <button
              type="button"
              onClick={onResumeTournament}
              className="mt-3 rounded-2xl bg-amber-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              테이블로 돌아가기
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">닉네임</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="플레이어 이름"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
          />
        </label>

        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
          <div>
            <p className="text-sm font-semibold text-white">테이블 설정</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              방 코드는 자동 생성됩니다. 플레이어는 테이블 제목을 보고, 잠금 테이블이라면 비밀번호를 입력해
              입장합니다.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {visibilityOptions.map((option) => {
              const selected = roomVisibility === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onRoomVisibilityChange(option.value)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    selected
                      ? "border-emerald-300/35 bg-emerald-400/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{option.label}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                        selected ? "bg-emerald-300 text-slate-950" : "bg-white/10 text-zinc-300"
                      }`}
                    >
                      {option.value === "PUBLIC" ? "공개" : "잠금"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{option.description}</p>
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-zinc-300">테이블 제목</span>
            <input
              value={createRoomName}
              onChange={(event) => onCreateRoomNameChange(event.target.value)}
              placeholder="금요일 저녁 하이롤러"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
            />
          </label>

          {roomVisibility === "PRIVATE" ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm text-zinc-300">비밀번호</span>
              <input
                type="password"
                value={createPassword}
                onChange={(event) => onCreatePasswordChange(event.target.value)}
                placeholder="테이블 비밀번호를 입력해 주세요"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={onCreate}
            disabled={createDisabled}
            className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {roomVisibility === "PUBLIC" ? "공개" : "잠금"} 테이블 만들기
          </button>
        </div>

        {busyLabel ? (
          <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {busyLabel}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
