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
    <section className="social-surface rounded-[1.8rem] border-cyan-200/20 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="social-kicker text-cyan-100/80">Quick join</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-white">{snapshot.roomName} lobby</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {lockedTable ? "Locked" : "Open"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {lockedTable
          ? passwordEmbedded
            ? "This invite already includes the password, so you can join after confirming your nickname."
            : "This room needs a password. Enter it below and join from the lobby."
          : "This room is open. Enter your nickname and join straight from the waiting room."}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-200">Nickname</span>
          <input
            value={nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="Your player name"
            className="social-input"
          />
        </label>

        {lockedTable ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Enter the room password"
              className="social-input"
            />
          </label>
        ) : (
          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Join info</p>
            <p className="mt-2 text-base font-bold text-white">Password not required</p>
          </div>
        )}
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-[1.25rem] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onJoin}
          disabled={joinPending}
          className="social-cta-secondary px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joinPending ? "Joining..." : "Join table"}
        </button>
        <p className="text-sm text-zinc-300">
          {autoJoinPending
            ? "Trying to join the invite automatically."
            : lockedTable && passwordEmbedded
              ? "The invite already has the password embedded, so join is ready to go."
              : "The room will refresh while you are still waiting in the lobby."}
        </p>
      </div>
    </section>
  );
}
