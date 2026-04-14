import { useState } from "react";
import type { PublicTournamentSummary } from "@/entities/tournament/model/types";

type PublicTournamentListProps = {
  rooms: PublicTournamentSummary[];
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onJoin: (code: string, password?: string) => void;
};

// Renders the current open and locked waiting tables for the home lobby.
export function PublicTournamentList({
  rooms,
  disabled = false,
  loading = false,
  errorMessage = null,
  onJoin,
}: PublicTournamentListProps) {
  const [passwordRoomCode, setPasswordRoomCode] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");

  function openPasswordPrompt(code: string) {
    setPasswordRoomCode(code);
    setPasswordDraft("");
  }

  function closePasswordPrompt() {
    setPasswordRoomCode(null);
    setPasswordDraft("");
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Lobby</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Pick a Table</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
          Open seats only
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Every table below is still waiting for players. Locked tables stay visible in the lobby but need a password
        before you can sit down.
      </p>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
          Loading tables...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
          No waiting tables are open right now.
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
                        {locked ? "Locked" : "Open"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-300">Host: {room.ownerNickname || "Unknown"}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Seats {room.currentPlayers} / {room.maxPlayers}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => (locked ? openPasswordPrompt(room.code) : onJoin(room.code))}
                    disabled={disabled}
                    className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {locked ? "Enter Password" : "Join Table"}
                  </button>
                </div>

                {passwordPromptOpen ? (
                  <div className="mt-4 rounded-2xl border border-amber-300/20 bg-black/25 p-4">
                    <label className="block">
                      <span className="mb-2 block text-sm text-zinc-300">Password</span>
                      <input
                        type="password"
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        placeholder="Enter the table password"
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-amber-300"
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => onJoin(room.code, passwordDraft)}
                        disabled={disabled || !passwordDraft.trim()}
                        className="flex-1 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Join Locked Table
                      </button>
                      <button
                        type="button"
                        onClick={closePasswordPrompt}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
