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
    <div className="rounded-[1.8rem] border border-amber-300/20 bg-[linear-gradient(135deg,_rgba(120,53,15,0.22),_rgba(10,12,11,0.92))] p-5 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">초대 링크</p>
          <h3 className="mt-2 text-xl font-semibold text-white">로비 없이 바로 들어오는 링크</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100">
          {snapshot.visibility === "PUBLIC" ? "공개 테이블" : "잠금 테이블"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {snapshot.visibility === "PRIVATE"
          ? hasEmbeddedPassword
            ? "이 링크는 테이블 화면으로 바로 이동하며, 비밀번호도 포함되어 있어 즉시 입장을 시도할 수 있습니다."
            : "이 링크는 테이블 화면으로 바로 이동합니다. 다만 비밀번호는 포함되지 않아 입장 전에 직접 입력해야 합니다."
          : "이 링크를 열면 로비를 거치지 않고 바로 테이블 화면으로 이동해 즉시 입장할 수 있습니다."}
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Invite URL</p>
        <p className="mt-2 break-all text-sm text-zinc-100">{inviteUrl}</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">테이블 제목</p>
          <p className="mt-2 text-base font-semibold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">비밀번호 포함</p>
          <p className="mt-2 text-base font-semibold text-white">
            {snapshot.visibility === "PUBLIC" ? "필요 없음" : hasEmbeddedPassword ? "포함됨" : "별도 전달 필요"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">공유할 제목</p>
          <p className="mt-2 text-sm font-semibold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">공유할 비밀번호</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {snapshot.visibility === "PUBLIC" ? "필요 없음" : hasEmbeddedPassword ? "링크에 포함됨" : "별도 전달 필요"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">방 코드</p>
          <p className="mt-2 text-sm font-semibold text-white">내부 식별자</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopyInvite}
          className="rounded-2xl border border-amber-300/25 bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          초대 링크 복사
        </button>
        <p className="text-sm text-zinc-300">
          {copyState === "copied"
            ? "초대 링크를 복사했습니다."
            : copyState === "failed"
              ? "클립보드 복사에 실패했습니다. 링크를 직접 전달해 주세요."
              : "받는 사람은 링크를 열고 바로 이 테이블에 입장할 수 있습니다."}
        </p>
      </div>
    </div>
  );
}
