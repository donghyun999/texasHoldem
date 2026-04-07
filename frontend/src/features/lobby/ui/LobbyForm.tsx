type LobbyFormProps = {
  guestId: string;
  nickname: string;
  tournamentCode: string;
  createDisabled?: boolean;
  joinDisabled?: boolean;
  busyLabel?: string | null;
  errorMessage?: string | null;
  onNicknameChange: (value: string) => void;
  onTournamentCodeChange: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
};

// Collects the guest nickname and tournament code before create or join requests.
export function LobbyForm({
  guestId,
  nickname,
  tournamentCode,
  createDisabled = false,
  joinDisabled = false,
  busyLabel = null,
  errorMessage = null,
  onNicknameChange,
  onTournamentCodeChange,
  onCreate,
  onJoin,
}: LobbyFormProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Waiting Room</p>
      <h3 className="mt-3 text-2xl font-semibold text-white">Tournament Entry</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Create a new table as owner or join an existing waiting room with the current guest session.
      </p>
      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Guest ID</span>
          <input
            value={guestId || (createDisabled && joinDisabled ? "ASSIGNING..." : "OFFLINE")}
            readOnly
            className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-zinc-400 outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Nickname</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="player_one"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Tournament Code</span>
          <input
            value={tournamentCode}
            onChange={(event) => onTournamentCodeChange(event.target.value.toUpperCase())}
            placeholder="ABCDE"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
          />
        </label>
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
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={createDisabled}
            className="rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Tournament
          </button>
          <button
            type="button"
            onClick={onJoin}
            disabled={joinDisabled}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join Tournament
          </button>
        </div>
      </div>
    </div>
  );
}
