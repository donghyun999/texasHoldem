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
      ? `${lobbyUrl} 로비에 접속한 뒤 "${snapshot.roomName}" 테이블에 입장하세요. 잠금 테이블이므로 비밀번호는 ${sharedPassword} 입니다.`
      : `${lobbyUrl} 로비에 접속한 뒤 "${snapshot.roomName}" 테이블에 입장하세요. 잠금 테이블이므로 방장에게 비밀번호를 확인하세요.`;
  }

  return `${lobbyUrl} 로비에 접속한 뒤 "${snapshot.roomName}" 테이블에 입장하세요. 공개 테이블이라 비밀번호는 필요하지 않습니다.`;
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
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">초대 안내</p>
          <h3 className="mt-2 text-xl font-semibold text-white">대기실에서 바로 공유하기</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100">
          {snapshot.visibility === "PUBLIC" ? "공개 테이블" : "잠금 테이블"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-300">
        {snapshot.visibility === "PRIVATE"
          ? "초대받은 플레이어는 로비에서 이 테이블을 선택한 뒤 비밀번호를 입력해 입장해야 합니다. 내부 room code는 기본 초대 흐름에 포함되지 않습니다."
          : "초대받은 플레이어는 로비에서 이 테이블을 선택해 입장하면 됩니다. 내부 room code는 화면 뒤에서만 사용됩니다."}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">테이블 제목</p>
          <p className="mt-2 text-base font-semibold text-white">{snapshot.roomName}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">비밀번호</p>
          <p className="mt-2 text-base font-semibold text-white">
            {snapshot.visibility === "PUBLIC"
              ? "없음"
              : hasSharedPassword
                ? createdRoomPassword
                : "방 생성 시 입력한 비밀번호 사용"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopyInvite}
          className="rounded-2xl border border-amber-300/25 bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          초대 문구 복사
        </button>
        <p className="text-sm text-zinc-300">
          {copyState === "copied"
            ? "초대 문구를 복사했습니다."
            : copyState === "failed"
              ? "클립보드 복사에 실패했습니다. 테이블 제목과 비밀번호를 직접 전달하세요."
              : "복사된 문구는 직접 테이블 링크 대신 로비 입장 기준으로 안내합니다."}
        </p>
      </div>
    </div>
  );
}
