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
          <h3 className="text-xl font-black tracking-tight text-white">친구에게 방을 공유하세요</h3>
        </div>
        <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
          {snapshot.visibility === "PUBLIC" ? "공개 방" : "잠금 방"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {snapshot.visibility === "PRIVATE"
          ? hasEmbeddedPassword
            ? "링크 하나로 바로 참가할 수 있습니다."
            : "링크는 연결되지만, 참가하려면 비밀번호가 필요합니다."
          : "링크를 보내면 바로 참가할 수 있습니다."}
      </p>

      <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">초대 링크</p>
        <p className="mt-2 break-all text-sm text-zinc-100">{inviteUrl}</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">방 이름</p>
          <p className="mt-2 text-sm font-semibold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">비밀번호</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {snapshot.visibility === "PUBLIC" ? "없음" : hasEmbeddedPassword ? "포함됨" : "필요"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleCopyInvite} className="social-cta px-4 py-3 text-sm">
          초대 링크 복사
        </button>
        <p className="text-sm text-zinc-300">
          {copyState === "copied"
            ? "초대 링크를 복사했습니다."
            : copyState === "failed"
              ? "복사에 실패했습니다."
              : "링크를 복사해 공유하세요."}
        </p>
      </div>
    </div>
  );
}
