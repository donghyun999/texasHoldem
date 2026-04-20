import { useState } from "react";
import type { PublicTournamentSummary } from "@/entities/tournament/model/types";

type PublicTournamentListProps = {
  rooms: PublicTournamentSummary[];
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  passwordErrorMessage?: string | null;
  onPasswordInteraction?: () => void;
  onJoin: (code: string, password?: string) => void;
};

function LockMarker() {
  return (
    <span
      aria-label="Locked room"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/10 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.16)]"
      title="비밀번호가 필요한 방"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="M17 9h-1V7a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-6 6.73V17a1 1 0 1 0 2 0v-1.27a2 2 0 1 0-2 0ZM10 9V7a2 2 0 1 1 4 0v2h-4Z" />
      </svg>
    </span>
  );
}

export function PublicTournamentList({
  rooms,
  disabled = false,
  loading = false,
  errorMessage = null,
  passwordErrorMessage = null,
  onPasswordInteraction,
  onJoin,
}: PublicTournamentListProps) {
  const [passwordRoomCode, setPasswordRoomCode] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");

  function openPasswordPrompt(code: string) {
    onPasswordInteraction?.();
    setPasswordRoomCode(code);
    setPasswordDraft("");
  }

  function closePasswordPrompt() {
    onPasswordInteraction?.();
    setPasswordRoomCode(null);
    setPasswordDraft("");
  }

  return (
    <div data-testid="lobby-room-list" className="social-surface rounded-[2rem] p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">참가 가능한 테이블</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          대기 중 {rooms.length}
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
        공개 테이블은 바로 들어가고, 잠금 테이블은 비밀번호를 입력한 뒤 참가합니다.
      </p>

      {loading ? (
        <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-200">
          대기실을 불러오는 중...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-[1.35rem] border border-rose-300/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <div className="mt-5 rounded-[1.35rem] border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
          아직 대기 중인 테이블이 없습니다. 하나를 만들거나 몇 초 뒤에 다시 불러오세요.
        </div>
      ) : null}

      {rooms.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {rooms.map((room) => {
            const locked = room.visibility === "PRIVATE";
            const passwordPromptOpen = passwordRoomCode === room.code;

            return (
              <div
                key={room.code}
                className={`relative rounded-[1.5rem] border p-4 ${
                  locked
                    ? "border-amber-200/20 bg-[linear-gradient(180deg,_rgba(250,204,21,0.08),_rgba(255,255,255,0.03))]"
                    : "border-cyan-200/20 bg-[linear-gradient(180deg,_rgba(103,232,249,0.08),_rgba(255,255,255,0.03))]"
                }`}
              >
                {locked ? (
                    <div data-testid={`room-lock-marker-${room.code}`} className="pointer-events-none absolute right-4 top-4">
                      <LockMarker />
                    </div>
                ) : null}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className={`min-w-0 space-y-3 ${locked ? "pr-10" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-lg font-bold text-white">{room.roomName}</span>
                      <span
                        className={`social-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          locked ? "text-amber-50" : "text-cyan-50"
                        }`}
                      >
                        {locked ? "잠금" : "공개"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="social-chip px-2.5 py-1 uppercase tracking-[0.18em] text-zinc-100">
                        방장 {room.ownerNickname || "알 수 없음"}
                      </span>
                      <span className="social-chip px-2.5 py-1 uppercase tracking-[0.18em] text-zinc-100">
                        인원 {room.currentPlayers} / {room.maxPlayers}
                      </span>
                    </div>

                  </div>

                  <button
                    type="button"
                    data-testid={`room-join-button-${room.code}`}
                    onClick={() => (locked ? openPasswordPrompt(room.code) : onJoin(room.code))}
                    disabled={disabled}
                    className={`px-4 py-3 text-sm ${
                      locked ? "social-cta-secondary" : "social-cta"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {locked ? "비밀번호 입력" : "바로 참가"}
                  </button>
                </div>

                {passwordPromptOpen ? (
                  <form
                    data-testid={`room-password-prompt-${room.code}`}
                    className="mt-4 rounded-[1.35rem] border border-amber-200/20 bg-black/20 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (disabled || !passwordDraft.trim()) {
                        return;
                      }
                      onJoin(room.code, passwordDraft);
                    }}
                  >
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-zinc-200">{room.roomName} 비밀번호</span>
                      <input
                        data-testid={`room-password-input-${room.code}`}
                        type="password"
                        value={passwordDraft}
                        onChange={(event) => {
                          onPasswordInteraction?.();
                          setPasswordDraft(event.target.value);
                        }}
                        placeholder="방 비밀번호를 입력하세요"
                        autoFocus
                        className="social-input"
                      />
                    </label>

                    <p className="mt-2 text-xs leading-5 text-zinc-400">방 이름과 비밀번호를 입력하고 참가하세요.</p>

                    {passwordErrorMessage ? (
                      <p
                        data-testid={`room-password-error-${room.code}`}
                        className="mt-3 rounded-[1.1rem] border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100"
                      >
                        {passwordErrorMessage}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        data-testid={`room-password-submit-${room.code}`}
                        type="submit"
                        disabled={disabled || !passwordDraft.trim()}
                        className="social-cta px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        잠금 테이블 참가
                      </button>
                      <button
                        type="button"
                        onClick={closePasswordPrompt}
                        className="social-outline px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
