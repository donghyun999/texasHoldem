import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { LobbyForm } from "@/features/lobby/ui/LobbyForm";
import { getBackendStatus } from "@/shared/api/http";
import { useUiStore } from "@/shared/model/ui-store";

// Renders the landing page for tournament entry and current project scope.
export function HomePage() {
  const navigate = useNavigate();
  const guestId = useUiStore((state) => state.guestId);
  const nickname = useUiStore((state) => state.nickname);
  const setNickname = useUiStore((state) => state.setNickname);
  const [tournamentCode, setTournamentCode] = useState("DEMO1");
  const statusQuery = useQuery({
    queryKey: ["backend-status"],
    queryFn: getBackendStatus,
    retry: false,
  });
  const previewSnapshot = createDemoTournamentSnapshot(tournamentCode);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/70">Tournament MVP</p>
        <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-white">
          단일 테이블 Sit and Go 구조에 맞춰 대기실, 스냅샷, 액션 계약을 다시 정리한 상태입니다.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
          현재 화면은 명세서의 핵심 용어를 기준으로 토너먼트 상태, 블라인드 레벨, 올인과 사이드팟 표시 영역을
          우선 정리한 단계입니다. 다음 구현은 실제 서버 스냅샷 동기화와 액션 검증입니다.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard label="Backend API" value={statusQuery.data?.status ?? "OFFLINE"} />
          <MetricCard label="Blind Level" value={`L${previewSnapshot.currentLevel.level}`} />
          <MetricCard label="Seats" value={`${previewSnapshot.players.length} / 6`} />
        </div>
      </div>

      <LobbyForm
        guestId={guestId}
        nickname={nickname}
        tournamentCode={tournamentCode}
        onNicknameChange={setNickname}
        onTournamentCodeChange={setTournamentCode}
        onSubmit={() => navigate(`/tournaments/${tournamentCode || "DEMO1"}`)}
      />
    </section>
  );
}

// Displays one landing-page metric for the current prototype state.
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">{label}</p>
      <p className="mt-3 text-lg font-medium text-white">{value}</p>
    </div>
  );
}
