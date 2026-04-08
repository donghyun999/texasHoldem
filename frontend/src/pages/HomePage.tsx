import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDemoTournamentSnapshot } from "@/entities/tournament/model/demo-snapshot";
import { buildTournamentSnapshotKey } from "@/entities/tournament/model/query-keys";
import type { TournamentSnapshot } from "@/entities/tournament/model/types";
import { LobbyForm } from "@/features/lobby/ui/LobbyForm";
import { createTournament, getActiveTournamentForGuest, getBackendStatus, joinTournament } from "@/shared/api/http";
import { useGuestSession } from "@/shared/model/use-guest-session";

// Converts unknown mutation failures into a short UI-safe message.
function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Renders the landing page for live tournament creation and entry.
export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { guestId, nickname, setNickname, ensureGuestSession } = useGuestSession();
  const [tournamentCode, setTournamentCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["backend-status"],
    queryFn: getBackendStatus,
    retry: false,
  });
  const activeTournamentQuery = useQuery({
    queryKey: ["active-tournament", guestId],
    queryFn: () => getActiveTournamentForGuest(guestId),
    enabled: !!guestId.trim(),
    retry: false,
  });
  const previewSnapshot = createDemoTournamentSnapshot(tournamentCode || "MVP01");
  const createMutation = useMutation({
    mutationFn: ({ guestId, nickname, code }: { guestId: string; nickname: string; code?: string }) =>
      createTournament(guestId, nickname, code),
    onSuccess: (snapshot) => handleTournamentEntry(snapshot),
  });
  const joinMutation = useMutation({
    mutationFn: ({ code, guestId, nickname }: { code: string; guestId: string; nickname: string }) =>
      joinTournament(code, guestId, nickname),
    onSuccess: (snapshot) => handleTournamentEntry(snapshot),
  });
  const activeError =
    validationError ||
    (createMutation.error && toErrorMessage(createMutation.error, "Failed to create tournament.")) ||
    (joinMutation.error && toErrorMessage(joinMutation.error, "Failed to join tournament.")) ||
    null;
  const activeTournament = activeTournamentQuery.data;
  const isCheckingActiveTournament = !!guestId.trim() && activeTournamentQuery.isPending;
  const controlsDisabled =
    !!activeTournament || isCheckingActiveTournament || createMutation.isPending || joinMutation.isPending;
  const busyLabel = createMutation.isPending
    ? "Creating tournament..."
    : joinMutation.isPending
      ? "Joining tournament..."
      : isCheckingActiveTournament
        ? "Checking your current tournament..."
      : null;

  // Seeds the destination snapshot cache before navigation so the table paints immediately.
  function handleTournamentEntry(snapshot: TournamentSnapshot) {
    queryClient.setQueryData(buildTournamentSnapshotKey(snapshot.code), snapshot);
    navigate(`/tournaments/${snapshot.code}`);
  }

  function handleNicknameChange(value: string) {
    setValidationError(null);
    setNickname(value);
  }

  function handleTournamentCodeChange(value: string) {
    setValidationError(null);
    setTournamentCode(value);
  }

  async function handleCreate() {
    if (isCheckingActiveTournament) {
      setValidationError("Checking whether this guest is already seated in another tournament.");
      return;
    }
    if (activeTournament) {
      setValidationError(`You are already participating in tournament ${activeTournament.tournamentCode}.`);
      return;
    }
    if (!nickname.trim()) {
      setValidationError("Enter a nickname before creating a tournament.");
      return;
    }

    setValidationError(null);
    try {
      const resolvedGuestId = await ensureGuestSession();
      createMutation.mutate({
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
        code: tournamentCode.trim() ? tournamentCode.trim().toUpperCase() : undefined,
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  async function handleJoin() {
    if (isCheckingActiveTournament) {
      setValidationError("Checking whether this guest is already seated in another tournament.");
      return;
    }
    if (activeTournament) {
      setValidationError(`You are already participating in tournament ${activeTournament.tournamentCode}.`);
      return;
    }
    if (!nickname.trim()) {
      setValidationError("Enter a nickname before joining a tournament.");
      return;
    }
    if (!tournamentCode.trim()) {
      setValidationError("Enter a tournament code before joining.");
      return;
    }

    setValidationError(null);
    try {
      const resolvedGuestId = await ensureGuestSession();
      joinMutation.mutate({
        code: tournamentCode.trim().toUpperCase(),
        guestId: resolvedGuestId,
        nickname: nickname.trim(),
      });
    } catch (error) {
      setValidationError(toErrorMessage(error, "Failed to create guest session."));
    }
  }

  function handleResumeTournament() {
    if (!activeTournament) {
      return;
    }

    setValidationError(null);
    navigate(`/tournaments/${activeTournament.tournamentCode}`);
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
        activeTournamentCode={activeTournament?.tournamentCode ?? null}
        activeTournamentStatus={activeTournament?.status ?? null}
        createDisabled={controlsDisabled}
        joinDisabled={controlsDisabled}
        busyLabel={busyLabel}
        errorMessage={activeError}
        onNicknameChange={handleNicknameChange}
        onTournamentCodeChange={handleTournamentCodeChange}
        onResumeTournament={handleResumeTournament}
        onCreate={handleCreate}
        onJoin={handleJoin}
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
