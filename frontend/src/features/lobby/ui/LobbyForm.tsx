import type { TournamentStatus, TournamentVisibility } from "@/entities/tournament/model/types";

type LobbyFormProps = {
  guestId: string;
  nickname: string;
  createTournamentCode: string;
  joinTournamentCode: string;
  roomVisibility: TournamentVisibility;
  activeTournamentCode?: string | null;
  activeTournamentStatus?: TournamentStatus | null;
  createDisabled?: boolean;
  joinDisabled?: boolean;
  busyLabel?: string | null;
  errorMessage?: string | null;
  onNicknameChange: (value: string) => void;
  onCreateTournamentCodeChange: (value: string) => void;
  onJoinTournamentCodeChange: (value: string) => void;
  onRoomVisibilityChange: (value: TournamentVisibility) => void;
  onResumeTournament?: () => void;
  onCreate: () => void;
  onJoin: () => void;
};

const visibilityOptions: Array<{ value: TournamentVisibility; label: string; description: string }> = [
  {
    value: "PUBLIC",
    label: "Public Room",
    description: "Visible in the lobby list. Anyone can join while the room is waiting.",
  },
  {
    value: "PRIVATE",
    label: "Private Room",
    description: "Hidden from the public list. Share the code directly to invite players.",
  },
];

// Collects the shared guest identity and separates create from direct code join.
export function LobbyForm({
  guestId,
  nickname,
  createTournamentCode,
  joinTournamentCode,
  roomVisibility,
  activeTournamentCode = null,
  activeTournamentStatus = null,
  createDisabled = false,
  joinDisabled = false,
  busyLabel = null,
  errorMessage = null,
  onNicknameChange,
  onCreateTournamentCodeChange,
  onJoinTournamentCodeChange,
  onRoomVisibilityChange,
  onResumeTournament,
  onCreate,
  onJoin,
}: LobbyFormProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Waiting Room</p>
      <h3 className="mt-3 text-2xl font-semibold text-white">Tournament Entry</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Create a public room for list-based join, or keep the room private and enter by code as before.
      </p>

      {activeTournamentCode ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-200/10 px-4 py-4 text-sm text-amber-50">
          <p className="font-semibold">Active tournament detected</p>
          <p className="mt-2">
            You are already participating in <span className="font-semibold">{activeTournamentCode}</span>
            {activeTournamentStatus ? ` (${activeTournamentStatus})` : ""}.
          </p>
          {onResumeTournament ? (
            <button
              type="button"
              onClick={onResumeTournament}
              className="mt-3 rounded-2xl bg-amber-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Resume Tournament
            </button>
          ) : null}
        </div>
      ) : null}

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

        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Create Room</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Pick the room policy first, then optionally reserve a custom code.
              </p>
            </div>
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
                      {option.value}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{option.description}</p>
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-zinc-300">Custom Room Code</span>
            <input
              value={createTournamentCode}
              onChange={(event) => onCreateTournamentCodeChange(event.target.value.toUpperCase())}
              placeholder={roomVisibility === "PUBLIC" ? "Optional for public room" : "Optional private invite code"}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
            />
          </label>

          <button
            type="button"
            onClick={onCreate}
            disabled={createDisabled}
            className="mt-4 w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create {roomVisibility === "PUBLIC" ? "Public" : "Private"} Tournament
          </button>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">Join Private Room by Code</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Public rooms can be joined from the list. Use this path when you received a direct code.
          </p>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-zinc-300">Tournament Code</span>
            <input
              value={joinTournamentCode}
              onChange={(event) => onJoinTournamentCodeChange(event.target.value.toUpperCase())}
              placeholder="Enter private room code"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
            />
          </label>

          <button
            type="button"
            onClick={onJoin}
            disabled={joinDisabled}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join by Code
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
