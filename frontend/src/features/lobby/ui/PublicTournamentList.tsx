import type { PublicTournamentSummary } from "@/entities/tournament/model/types";

type PublicTournamentListProps = {
  rooms: PublicTournamentSummary[];
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onJoin: (code: string) => void;
};

// Renders the current joinable public waiting rooms for the lobby home page.
export function PublicTournamentList({
  rooms,
  disabled = false,
  loading = false,
  errorMessage = null,
  onJoin,
}: PublicTournamentListProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Public Lobby</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Join From Room List</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
          WAITING only
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Public rooms appear here while they are waiting for players. Started or finished tournaments stay out of the
        list to keep join behavior unambiguous.
      </p>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
          Loading public rooms...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!loading && rooms.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
          No public waiting rooms are open right now.
        </div>
      ) : null}

      {rooms.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {rooms.map((room) => (
            <div
              key={room.code}
              className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-white">{room.code}</span>
                    <span className="rounded-full bg-emerald-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-950">
                      {room.visibility}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                      {room.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">Owner: {room.ownerNickname || "Unknown"}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Players {room.currentPlayers} / {room.maxPlayers}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onJoin(room.code)}
                  disabled={disabled}
                  className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Join Room
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
