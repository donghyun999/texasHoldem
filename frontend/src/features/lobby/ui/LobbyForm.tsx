import type { TournamentStatus, TournamentVisibility } from "@/entities/tournament/model/types";

type LobbyFormProps = {
  nickname: string;
  createRoomName: string;
  createPassword: string;
  privateRoomName: string;
  privateRoomPassword: string;
  roomVisibility: TournamentVisibility;
  activeTournamentRoomName?: string | null;
  activeTournamentStatus?: TournamentStatus | null;
  createDisabled?: boolean;
  joinDisabled?: boolean;
  busyLabel?: string | null;
  errorMessage?: string | null;
  onNicknameChange: (value: string) => void;
  onCreateRoomNameChange: (value: string) => void;
  onCreatePasswordChange: (value: string) => void;
  onPrivateRoomNameChange: (value: string) => void;
  onPrivateRoomPasswordChange: (value: string) => void;
  onRoomVisibilityChange: (value: TournamentVisibility) => void;
  onResumeTournament?: () => void;
  onCreate: () => void;
  onJoinPrivate: () => void;
};

const visibilityOptions: Array<{ value: TournamentVisibility; label: string; description: string }> = [
  {
    value: "PUBLIC",
    label: "Open Table",
    description: "Shows up in the lobby list so anyone can grab a seat before the game starts.",
  },
  {
    value: "PRIVATE",
    label: "Private Table",
    description: "Hidden from the lobby list. Friends join with the table title and password.",
  },
];

// Collects player-facing lobby inputs for creating a table or joining a private one.
export function LobbyForm({
  nickname,
  createRoomName,
  createPassword,
  privateRoomName,
  privateRoomPassword,
  roomVisibility,
  activeTournamentRoomName = null,
  activeTournamentStatus = null,
  createDisabled = false,
  joinDisabled = false,
  busyLabel = null,
  errorMessage = null,
  onNicknameChange,
  onCreateRoomNameChange,
  onCreatePasswordChange,
  onPrivateRoomNameChange,
  onPrivateRoomPasswordChange,
  onRoomVisibilityChange,
  onResumeTournament,
  onCreate,
  onJoinPrivate,
}: LobbyFormProps) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Play Now</p>
      <h3 className="mt-3 text-2xl font-semibold text-white">Create or Join a Table</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Pick a nickname, open a table for the lobby, or join a private table with its title and password.
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Create Table</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Room codes are generated automatically. Players will see the title you set here.
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
                      {option.value === "PUBLIC" ? "OPEN" : "PRIVATE"}
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
                placeholder="Choose a password for your table"
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
            Create {roomVisibility === "PUBLIC" ? "Open" : "Private"} Table
          </button>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-semibold text-white">Join Private Table</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Ask the host for the table title and password. Open tables can be joined from the list.
          </p>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-zinc-300">Table Title</span>
            <input
              value={privateRoomName}
              onChange={(event) => onPrivateRoomNameChange(event.target.value)}
              placeholder="Enter the private table title"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-zinc-300">Password</span>
            <input
              type="password"
              value={privateRoomPassword}
              onChange={(event) => onPrivateRoomPasswordChange(event.target.value)}
              placeholder="Enter the table password"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
            />
          </label>

          <button
            type="button"
            onClick={onJoinPrivate}
            disabled={joinDisabled}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join Private Table
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
