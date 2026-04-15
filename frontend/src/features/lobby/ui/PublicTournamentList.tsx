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
    <div className="social-surface rounded-[2rem] p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="social-kicker text-cyan-100/70">Lobby feed</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">Available tables</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {rooms.length} waiting
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
        Open tables are one tap away. Locked tables stay in the list, but joining them shows a password prompt first.
      </p>

      {loading ? (
        <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-200">
          Loading waiting rooms...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-[1.35rem] border border-rose-300/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <div className="mt-5 rounded-[1.35rem] border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
          No waiting tables yet. Create one or refresh in a few seconds.
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
                className={`rounded-[1.5rem] border p-4 ${
                  locked
                    ? "border-amber-200/20 bg-[linear-gradient(180deg,_rgba(250,204,21,0.08),_rgba(255,255,255,0.03))]"
                    : "border-cyan-200/20 bg-[linear-gradient(180deg,_rgba(103,232,249,0.08),_rgba(255,255,255,0.03))]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-lg font-bold text-white">{room.roomName}</span>
                      <span
                        className={`social-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                          locked ? "text-amber-50" : "text-cyan-50"
                        }`}
                      >
                        {locked ? "Locked" : "Open"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="social-chip px-2.5 py-1 uppercase tracking-[0.18em] text-zinc-100">
                        Host {room.ownerNickname || "Unknown"}
                      </span>
                      <span className="social-chip px-2.5 py-1 uppercase tracking-[0.18em] text-zinc-100">
                        Players {room.currentPlayers} / {room.maxPlayers}
                      </span>
                      <span className="social-chip px-2.5 py-1 uppercase tracking-[0.18em] text-zinc-100">
                        {locked ? "Password required" : "No password"}
                      </span>
                    </div>

                    <p className="max-w-2xl text-sm leading-6 text-zinc-300">
                      {locked
                        ? "This table is visible in the lobby, but you will need the host password to join."
                        : "This table is open to anyone in the lobby who wants to join right away."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => (locked ? openPasswordPrompt(room.code) : onJoin(room.code))}
                    disabled={disabled}
                    className={`px-4 py-3 text-sm ${
                      locked ? "social-cta-secondary" : "social-cta"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {locked ? "Enter password" : "Join now"}
                  </button>
                </div>

                {passwordPromptOpen ? (
                  <form
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
                      <span className="mb-2 block text-sm font-medium text-zinc-200">{room.roomName} password</span>
                      <input
                        type="password"
                        value={passwordDraft}
                        onChange={(event) => {
                          onPasswordInteraction?.();
                          setPasswordDraft(event.target.value);
                        }}
                        placeholder="Enter the room password"
                        autoFocus
                        className="social-input"
                      />
                    </label>

                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      Share the room title and password with friends. The room code is still an internal identifier.
                    </p>

                    {passwordErrorMessage ? (
                      <p className="mt-3 rounded-[1.1rem] border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                        {passwordErrorMessage}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={disabled || !passwordDraft.trim()}
                        className="social-cta px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Join locked table
                      </button>
                      <button
                        type="button"
                        onClick={closePasswordPrompt}
                        className="social-outline px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        Cancel
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
