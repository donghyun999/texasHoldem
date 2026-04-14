import { useEffect, useState } from "react";
import type { TournamentPlayer, TournamentSnapshot } from "@/entities/tournament/model/types";

type WaitingRoomInvitePanelProps = {
  snapshot: TournamentSnapshot;
  currentPlayer: TournamentPlayer | null;
  createdRoomPassword?: string | null;
};

function buildInviteText(snapshot: TournamentSnapshot, createdRoomPassword: string | null) {
  const lobbyUrl = typeof window === "undefined" ? "" : `${window.location.origin}/`;
  const sharedPassword = createdRoomPassword?.trim() ?? "";

  if (snapshot.visibility === "PRIVATE") {
    return sharedPassword
      ? `Open the lobby at ${lobbyUrl} and join "${snapshot.roomName}". This table is locked, so use password: ${sharedPassword}`
      : `Open the lobby at ${lobbyUrl} and join "${snapshot.roomName}". This table is locked, so ask the host for the password.`;
  }

  return `Open the lobby at ${lobbyUrl} and join "${snapshot.roomName}". This table is open, so no password is required.`;
}

// Gives the owner a concise waiting-room share card instead of relying on the internal code.
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

  const inviteText = buildInviteText(snapshot, createdRoomPassword);
  const hasSharedPassword = snapshot.visibility === "PRIVATE" && !!createdRoomPassword?.trim();

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="rounded-[1.8rem] border border-amber-300/20 bg-[linear-gradient(135deg,_rgba(120,53,15,0.22),_rgba(10,12,11,0.92))] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">Invite Players</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Share the table from the waiting room</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100">
          {snapshot.visibility === "PUBLIC" ? "Open Table" : "Locked Table"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {snapshot.visibility === "PRIVATE"
          ? "Players should open the lobby, choose this table, and enter the shared password. The internal room code is not part of the primary invite flow."
          : "Players should open the lobby and choose this table. The internal room code stays behind the scenes."}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Table Title</p>
          <p className="mt-2 text-base font-semibold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Password</p>
          <p className="mt-2 text-base font-semibold text-white">
            {snapshot.visibility === "PUBLIC"
              ? "Not required"
              : hasSharedPassword
                ? createdRoomPassword
                : "Use the password chosen at create time"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopyInvite}
          className="rounded-2xl border border-amber-300/25 bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Copy Invite Note
        </button>
        <p className="text-sm text-zinc-300">
          {copyState === "copied"
            ? "Invite note copied."
            : copyState === "failed"
              ? "Clipboard copy failed. Share the table title and password manually."
              : 'The copied note points players back to the lobby instead of a direct table link.'}
        </p>
      </div>
    </div>
  );
}
