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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(max-width: 767px)").matches;
  });

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
    <div
      data-testid="waiting-room-invite-panel"
      className="social-surface rounded-[1.8rem] border-amber-200/20 p-5 shadow-xl shadow-black/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black tracking-tight text-white">친구에게 방을 공유하세요</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            호스트 화면을 가리지 않도록 줄여 두고, 필요할 때만 링크를 펼쳐 공유하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="social-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100">
            {snapshot.visibility === "PUBLIC" ? "공개 방" : "잠금 방"}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/10"
          >
            {collapsed ? "펼치기" : "접기"}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">방 이름</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{snapshot.roomName}</p>
            </div>
            <button type="button" onClick={handleCopyInvite} className="social-cta px-4 py-2 text-sm">
              링크 복사
            </button>
          </div>
          <p data-testid="invite-link-value" className="mt-3 break-all text-xs leading-5 text-zinc-400">
            {inviteUrl}
          </p>
          <p className="mt-2 text-xs text-zinc-300">
            {copyState === "copied"
              ? "초대 링크를 복사했습니다."
              : copyState === "failed"
                ? "복사에 실패했습니다."
                : snapshot.visibility === "PRIVATE"
                  ? hasEmbeddedPassword
                    ? "비밀번호가 링크에 포함되어 있습니다."
                    : "링크와 비밀번호를 따로 공유하세요."
                  : "필요할 때만 링크를 복사해 보내면 됩니다."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">초대 링크</p>
            <p data-testid="invite-link-value" className="mt-2 break-all text-sm text-zinc-100">
              {inviteUrl}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">방 이름</p>
              <p className="mt-2 text-sm font-semibold text-white">{snapshot.roomName}</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">비밀번호</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {snapshot.visibility === "PUBLIC"
                  ? "없음"
                  : hasEmbeddedPassword
                    ? "링크에 포함됨"
                    : "별도 공유"}
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
                  : snapshot.visibility === "PRIVATE"
                    ? hasEmbeddedPassword
                      ? "링크만 보내도 바로 참가할 수 있습니다."
                      : "링크를 연 뒤에도 비밀번호가 필요합니다."
                    : "링크만 보내면 바로 참가할 수 있습니다."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
