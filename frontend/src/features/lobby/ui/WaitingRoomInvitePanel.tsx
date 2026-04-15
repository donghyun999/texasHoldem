import { useEffect, useState } from "react";
import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";
import { buildTournamentInviteUrl } from "@/features/lobby/model/invite-link";

type WaitingRoomInvitePanelProps = {
  snapshot: TournamentSnapshot;
  currentPlayer: TournamentPlayer | null;
  createdRoomPassword?: string | null;
};

export function WaitingRoomInvitePanel({
  snapshot,
  currentPlayer,
  createdRoomPassword = null,
}: WaitingRoomInvitePanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  if (snapshot.status !== "WAITING" || !currentPlayer?.owner) {
    return null;
  }

  const inviteUrl = buildTournamentInviteUrl(snapshot.code, snapshot.visibility, createdRoomPassword);
  const hasEmbeddedPassword = snapshot.visibility === "PRIVATE" && !!createdRoomPassword?.trim();

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="social-surface rounded-[1.8rem] border-amber-200/20 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="social-kicker text-amber-100/80">Host invite panel</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-white">Share this room with friends</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {snapshot.visibility === "PUBLIC" ? "Open room" : "Locked room"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {snapshot.visibility === "PRIVATE"
          ? hasEmbeddedPassword
            ? "The invite link already includes the room password, so friends can join with one tap."
            : "The invite link points to the room, but friends will still need the password when they join."
          : "Send the link to friends and they can join the lobby directly without a password."}
      </p>

      <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Invite link</p>
        <p className="mt-2 break-all text-sm text-zinc-100">{inviteUrl}</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Room title</p>
          <p className="mt-2 text-base font-bold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Password</p>
          <p className="mt-2 text-base font-bold text-white">
            {snapshot.visibility === "PUBLIC" ? "Not required" : hasEmbeddedPassword ? "Embedded in invite" : "Share separately"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Share title</p>
          <p className="mt-2 text-sm font-semibold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Share password</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {snapshot.visibility === "PUBLIC" ? "None" : hasEmbeddedPassword ? "Included" : "Required"}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Room code</p>
          <p className="mt-2 text-sm font-semibold text-white">Internal only</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleCopyInvite} className="social-cta px-4 py-3 text-sm">
          Copy invite
        </button>
        <p className="text-sm text-zinc-300">
          {copyState === "copied"
            ? "Invite link copied."
            : copyState === "failed"
              ? "Copy failed. Please share the link manually."
              : "Copy the invite link and send it through chat or message."}
        </p>
      </div>
    </div>
  );
}
