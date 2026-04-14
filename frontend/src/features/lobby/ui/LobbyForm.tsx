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
    label: "Open Table",
    description: "Shows up in the lobby list so anyone can grab a seat before the game starts.",
  },
  {
    value: "PRIVATE",
    label: "Locked Table",
    description: "Still appears in the lobby list, but players need the password to join.",
  },
];

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
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Host a Table</p>
      <h3 className="mt-3 text-2xl font-semibold text-white">Create a New Game</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Pick a nickname, name your table, and decide whether anyone can sit down or a password is required.
      </p>

      {activeTournamentRoomName ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-200/10 px-4 py-4 text-sm text-amber-50">
          <p className="font-semibold">You already have a table in progress</p>
          <p className="mt-2">
            Return to <span className="font-semibold">{activeTournamentRoomName}</span>
            {activeTournamentStatus ? ` (${activeTournamentStatus.replaceAll("_", " ")})` : ""}.
          </p>
          {onResumeTournament ? (
            <button
              type="button"
              onClick={onResumeTournament}
              className="mt-3 rounded-2xl bg-amber-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Return to Table
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
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
          <div>
            <p className="text-sm font-semibold text-white">Table Setup</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Room codes are generated automatically. Players will see the title and, if locked, a password prompt.
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
                      {option.value === "PUBLIC" ? "OPEN" : "LOCKED"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{option.description}</p>
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-zinc-300">Table Title</span>
            <input
              value={createRoomName}
              onChange={(event) => onCreateRoomNameChange(event.target.value)}
              placeholder="Friday Night Sit & Go"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
            />
          </label>

          {roomVisibility === "PRIVATE" ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm text-zinc-300">Password</span>
              <input
                type="password"
                value={createPassword}
                onChange={(event) => onCreatePasswordChange(event.target.value)}
                placeholder="Choose a password for this table"
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
            Create {roomVisibility === "PUBLIC" ? "Open" : "Locked"} Table
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
