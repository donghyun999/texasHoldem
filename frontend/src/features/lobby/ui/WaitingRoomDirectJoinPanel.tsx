import type { TournamentSnapshot } from "@/entities/tournament/model/types";

type WaitingRoomDirectJoinPanelProps = {
  snapshot: TournamentSnapshot;
  nickname: string;
  password: string;
  joinPending?: boolean;
  autoJoinPending?: boolean;
  errorMessage?: string | null;
  onNicknameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onJoin: () => void;
};

export function WaitingRoomDirectJoinPanel({
  snapshot,
  nickname,
  password,
  joinPending = false,
  autoJoinPending = false,
  errorMessage = null,
  onNicknameChange,
  onPasswordChange,
  onJoin,
}: WaitingRoomDirectJoinPanelProps) {
  if (snapshot.status !== "WAITING") {
    return null;
  }

  const lockedTable = snapshot.visibility === "PRIVATE";
  const passwordEmbedded = lockedTable && password.trim().length > 0;

  return (
    <section className="rounded-[1.8rem] border border-cyan-300/20 bg-[linear-gradient(135deg,_rgba(14,116,144,0.22),_rgba(7,12,20,0.94))] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Direct Join</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Enter {snapshot.roomName} from this link</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100">
          {lockedTable ? "Private Table" : "Open Table"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {lockedTable
          ? passwordEmbedded
            ? "This invite already includes the room password. Review your nickname and join directly."
            : "This room still requires a password. Enter it here to join without going through the lobby."
          : "This link opens the room directly. Review your nickname and join without going through the lobby."}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Nickname</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="player_one"
            className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300"
          />
        </label>

        {lockedTable ? (
          <label className="block">
            <span className="mb-2 block text-sm text-zinc-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Enter room password"
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300"
            />
          </label>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Access</p>
            <p className="mt-2 text-base font-semibold text-white">No password required</p>
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onJoin}
          disabled={joinPending}
          className="rounded-2xl border border-cyan-300/25 bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joinPending ? "Joining..." : "Join Table"}
        </button>
        <p className="text-sm text-zinc-300">
          {autoJoinPending
            ? "Automatic join is in progress from the invite link."
            : lockedTable && passwordEmbedded
              ? "Invite password detected. You can still edit it before joining."
              : "The room preview below is live while the table is still waiting for players."}
        </p>
      </div>
    </section>
  );
}
