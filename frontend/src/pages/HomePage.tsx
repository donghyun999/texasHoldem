import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import type { TournamentSnapshot } from "@/entities/tournament/model/types";
import { LobbyForm } from "@/features/lobby/ui/LobbyForm";
import { createTournament, getBackendStatus, joinTournament } from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";

// Builds the shared React Query cache key for one tournament snapshot.
function buildTournamentSnapshotKey(code: string) {
  return ["tournament-snapshot", code.trim().toUpperCase()] as const;
}

// Converts unknown mutation failures into a short UI-safe message.
function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Renders the landing page for live tournament creation and entry.
export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guestId, nickname, setNickname, isBootstrappingGuest } = useGuestSession();
  const [tournamentCode, setTournamentCode] = useState("");
  const statusQuery = useQuery({
    queryKey: ["backend-status"],
    queryFn: getBackendStatus,
    retry: false,
  });
  const previewSnapshot = createDemoTournamentSnapshot(tournamentCode || "MVP01");
  const createMutation = useMutation({
    mutationFn: () => createTournament(guestId, nickname),
    onSuccess: (snapshot) => handleTournamentEntry(snapshot),
  });
  const joinMutation = useMutation({
    mutationFn: () => joinTournament(tournamentCode.trim().toUpperCase(), guestId, nickname),
    onSuccess: (snapshot) => handleTournamentEntry(snapshot),
  });
  const activeError =
    (createMutation.error && toErrorMessage(createMutation.error, "Failed to create tournament.")) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "Failed to join tournament.")) ||
    null;
  const busyLabel = createMutation.isPending
    ? "Creating tournament..."
    : joinMutation.isPending
      ? "Joining tournament..."
      : null;

  // Seeds the destination snapshot cache before navigation so the table paints immediately.
  function handleTournamentEntry(snapshot: TournamentSnapshot) {
    queryClient.setQueryData(buildTournamentSnapshotKey(snapshot.code), snapshot);
    navigate(`/tournaments/${snapshot.code}`);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/70">Tournament MVP</p>
        <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-white">
          Single-table sit and go flow with live snapshots, websocket actions, and server-side settlement.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
          The current build targets the MVP spec: live blind levels, all-in and side-pot settlement, reconnect
          recovery, and a real create or join entry flow backed by the backend APIs.
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
        createDisabled={isBootstrappingGuest || createMutation.isPending || joinMutation.isPending || !guestId || !nickname.trim()}
        joinDisabled={
          isBootstrappingGuest ||
          createMutation.isPending ||
          joinMutation.isPending ||
          !guestId ||
          !nickname.trim() ||
          !tournamentCode.trim()
        }
        busyLabel={busyLabel}
        errorMessage={activeError}
        onNicknameChange={setNickname}
        onTournamentCodeChange={setTournamentCode}
        onCreate={() => createMutation.mutate()}
        onJoin={() => joinMutation.mutate()}
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
