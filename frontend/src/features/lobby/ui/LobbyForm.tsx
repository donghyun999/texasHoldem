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
    label: "Open table",
    badge: "Open",
    description: "Shows up in the lobby so anyone can jump in without a password.",
  },
  {
    value: "PRIVATE",
    label: "Locked table",
    badge: "Locked",
    description: "Still visible in the lobby, but joining needs the password you share.",
  },
];

function toDisplayStatus(status: TournamentStatus) {
  switch (status) {
    case "WAITING":
      return "Waiting";
    case "IN_HAND":
      return "Hand active";
    case "HAND_RESULT":
      return "Showdown";
    case "FINISHED":
      return "Finished";
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
          <p className="social-kicker text-cyan-100/70">Create a room</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">Build your table</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {roomVisibility === "PRIVATE" ? "Locked" : "Open"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        Pick a nickname, choose whether the room is open or locked, and create a table that is easy to share with
        friends.
      </p>

      {activeTournamentRoomName ? (
        <div className="mt-5 rounded-[1.4rem] border border-cyan-300/20 bg-[linear-gradient(135deg,_rgba(34,197,94,0.12),_rgba(10,18,16,0.94))] p-4 text-sm text-cyan-50">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">Active session</p>
          <p className="mt-2 text-base font-bold text-white">
            {activeTournamentRoomName}
            {activeTournamentStatus ? ` · ${toDisplayStatus(activeTournamentStatus)}` : ""}
          </p>
          <p className="mt-2 leading-6 text-cyan-50/85">
            You already have a live tournament. Jump back in from here instead of creating a new one.
          </p>
          {onResumeTournament ? (
            <button type="button" onClick={onResumeTournament} className="social-cta-secondary mt-4 px-4 py-3 text-sm">
              Resume table
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-200">Nickname</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="Your player name"
            className="social-input"
          />
        </label>

        <div className="rounded-[1.55rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Room style</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Open tables are public. Locked tables stay listed, but the password is required at join time.
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

          <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
            <p className="font-semibold text-white">
              {roomVisibility === "PRIVATE" ? "Private table share" : "Open table share"}
            </p>
            <p className="mt-2 leading-6 text-zinc-300">
              {roomVisibility === "PRIVATE"
                ? "Share the room title and password with friends. The room code stays internal."
                : "Share the room title or code and friends can join straight from the lobby."}
            </p>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-200">Room name</span>
            <input
              value={createRoomName}
              onChange={(event) => onCreateRoomNameChange(event.target.value)}
              placeholder="Friday Night Table"
              className="social-input"
            />
          </label>

          {roomVisibility === "PRIVATE" ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
              <input
                type="password"
                value={createPassword}
                onChange={(event) => onCreatePasswordChange(event.target.value)}
                placeholder="Set a room password"
                className="social-input"
              />
            </label>
          ) : null}

          <button type="button" onClick={onCreate} disabled={createDisabled} className="social-cta mt-4 w-full px-4 py-3">
            {roomVisibility === "PUBLIC" ? "Create open table" : "Create locked table"}
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
