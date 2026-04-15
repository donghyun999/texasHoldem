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

const visibilityOptions: Array<{ value: TournamentVisibility; label: string; description: string; badge: string }> = [
  {
    value: "PUBLIC",
    label: "공개 테이블",
    badge: "공개",
    description: "로비에 표시되어 누구나 비밀번호 없이 바로 들어올 수 있습니다.",
  },
  {
    value: "PRIVATE",
    label: "잠금 테이블",
    badge: "잠금",
    description: "로비에 계속 표시되지만, 참가하려면 공유한 비밀번호가 필요합니다.",
  },
];

function toDisplayStatus(status: TournamentStatus) {
  switch (status) {
    case "WAITING":
      return "대기 중";
    case "IN_HAND":
      return "핸드 진행 중";
    case "HAND_RESULT":
      return "쇼다운";
    case "FINISHED":
      return "종료";
    default:
      return status;
  }
}

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
    <div className="social-surface social-surface-strong rounded-[2rem] p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="social-kicker text-cyan-100/70">테이블 생성</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">테이블을 만드세요</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {roomVisibility === "PRIVATE" ? "잠금" : "공개"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        닉네임과 방 유형만 정하면 바로 만들 수 있습니다.
      </p>

      {activeTournamentRoomName ? (
        <div className="mt-5 rounded-[1.4rem] border border-cyan-300/20 bg-[linear-gradient(135deg,_rgba(34,197,94,0.12),_rgba(10,18,16,0.94))] p-4 text-sm text-cyan-50">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">진행 중인 세션</p>
          <p className="mt-2 text-base font-bold text-white">
            {activeTournamentRoomName}
            {activeTournamentStatus ? ` · ${toDisplayStatus(activeTournamentStatus)}` : ""}
          </p>
          <p className="mt-2 leading-6 text-cyan-50/85">
            이미 진행 중인 토너먼트가 있습니다. 새로 만들지 말고 여기서 바로 돌아가세요.
          </p>
          {onResumeTournament ? (
            <button type="button" onClick={onResumeTournament} className="social-cta-secondary mt-4 px-4 py-3 text-sm">
              테이블로 돌아가기
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-200">닉네임</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="플레이어 이름"
            className="social-input"
          />
        </label>

        <div className="rounded-[1.55rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">방 유형</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                공개 테이블은 모두에게 보입니다. 잠금 테이블은 목록에 남아 있지만, 참가 시 비밀번호가 필요합니다.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibilityOptions.map((option) => {
              const selected = roomVisibility === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onRoomVisibilityChange(option.value)}
                  className={`rounded-[1.35rem] border p-4 text-left transition ${
                    selected
                      ? "border-cyan-200/40 bg-[linear-gradient(180deg,_rgba(103,232,249,0.14),_rgba(255,255,255,0.04))] shadow-lg shadow-cyan-950/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-white">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">{option.description}</p>
                    </div>
                    <span
                      className={`social-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                        selected ? "text-cyan-50" : "text-zinc-200"
                      }`}
                    >
                      {option.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-200">방 이름</span>
            <input
              value={createRoomName}
              onChange={(event) => onCreateRoomNameChange(event.target.value)}
              placeholder="금요일 밤 테이블"
              className="social-input"
            />
          </label>

          {roomVisibility === "PRIVATE" ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-zinc-200">비밀번호</span>
              <input
                type="password"
                value={createPassword}
                onChange={(event) => onCreatePasswordChange(event.target.value)}
                placeholder="방 비밀번호를 설정하세요"
                className="social-input"
              />
            </label>
          ) : null}

          <button type="button" onClick={onCreate} disabled={createDisabled} className="social-cta mt-4 w-full px-4 py-3">
            {roomVisibility === "PUBLIC" ? "공개 테이블 만들기" : "잠금 테이블 만들기"}
          </button>
        </div>

        {busyLabel ? (
          <p className="rounded-[1.25rem] border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
            {busyLabel}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-[1.25rem] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
