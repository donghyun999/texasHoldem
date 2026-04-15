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

// Renders the current open and locked waiting tables for the home lobby.
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
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">로비</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">테이블 선택</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
          빈자리가 있는 방만 표시
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        아래 목록은 모두 아직 플레이어를 기다리는 방입니다. 잠금 테이블도 로비에서 보이지만, 입장하려면 비밀번호가
        필요합니다.
      </p>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
          테이블을 불러오는 중...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
          지금 입장 가능한 대기 테이블이 없습니다.
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
                className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-white">{room.roomName}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          locked
                            ? "border border-amber-300/25 bg-amber-300/10 text-amber-100"
                            : "bg-emerald-300 text-slate-950"
                        }`}
                      >
                        {locked ? "잠금" : "공개"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-300">방장: {room.ownerNickname || "알 수 없음"}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      좌석 {room.currentPlayers} / {room.maxPlayers}
                    </p>
                    <p className="mt-2 text-xs text-zinc-400">
                      {locked
                        ? "잠금 테이블입니다. 들어가기 전에 비밀번호를 입력하면 바로 입장할 수 있습니다."
                        : "공개 테이블입니다. 자리가 남아 있으면 바로 입장할 수 있습니다."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => (locked ? openPasswordPrompt(room.code) : onJoin(room.code))}
                    disabled={disabled}
                    className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {locked ? "비밀번호 입력" : "입장하기"}
                  </button>
                </div>

                {passwordPromptOpen ? (
                  <form
                    className="mt-4 rounded-2xl border border-amber-300/20 bg-black/25 p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (disabled || !passwordDraft.trim()) {
                        return;
                      }
                      onJoin(room.code, passwordDraft);
                    }}
                  >
                    <label className="block">
                      <span className="mb-2 block text-sm text-zinc-300">{room.roomName} 비밀번호</span>
                      <input
                        type="password"
                        value={passwordDraft}
                        onChange={(event) => {
                          onPasswordInteraction?.();
                          setPasswordDraft(event.target.value);
                        }}
                        placeholder="테이블 비밀번호를 입력해 주세요"
                        autoFocus
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-amber-300"
                      />
                    </label>
                    <p className="mt-2 text-xs text-zinc-400">
                      초대받은 플레이어는 테이블 제목과 비밀번호를 공유받으면 됩니다. 방 코드는 내부 식별자로만
                      사용됩니다.
                    </p>
                    {passwordErrorMessage ? (
                      <p className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                        {passwordErrorMessage}
                      </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="submit"
                        disabled={disabled || !passwordDraft.trim()}
                        className="flex-1 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        잠금 테이블 입장
                      </button>
                      <button
                        type="button"
                        onClick={closePasswordPrompt}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
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
