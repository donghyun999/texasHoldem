import type { TournamentPlayer, TournamentSnapshot, TournamentStatus } from "@/entities/tournament/model/types";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type TournamentShowdownPanelProps = {
  snapshot: TournamentSnapshot;
};

// Chooses the result-panel title from the current tournament lifecycle state.
function buildResultTitle(status: TournamentStatus) {
  return status === "FINISHED" ? "Tournament Result" : "Hand Result";
}

function isShowdownResult(snapshot: TournamentSnapshot) {
  const showdownParticipants = snapshot.players.filter(
    (player) => player.status !== "FOLDED" && (player.participating || player.status === "BUSTED_OUT"),
  ).length;

  return snapshot.boardCards.length === 5 && snapshot.showdownPots.length > 0 && showdownParticipants > 1;
}

function findWinner(snapshot: TournamentSnapshot) {
  if (snapshot.status !== "FINISHED") {
    return null;
  }

  return (
    snapshot.players.find((player) => player.participating && player.stack > 0) ??
    [...snapshot.players].sort((left, right) => right.stack - left.stack)[0] ??
    null
  );
}

function findBustedPlayers(snapshot: TournamentSnapshot) {
  const recentlyBustedGuestIds = new Set(snapshot.recentlyBustedGuestIds);
  return snapshot.players.filter((player) => recentlyBustedGuestIds.has(player.guestId));
}

function buildSummaryLabel(
  snapshot: TournamentSnapshot,
  winner: TournamentPlayer | null,
  bustedPlayers: TournamentPlayer[],
) {
  const sidePotCount = snapshot.showdownPots.filter((pot) => pot.type === "SIDE").length;
  const splitPotCount = snapshot.showdownPots.filter((pot) => pot.payouts.length > 1).length;
  const fragments: string[] = [];

  if (winner) {
    fragments.push(`${winner.nickname} finishes with ${winner.stack} chips.`);
  } else {
    const settledChips = snapshot.showdownPots.reduce((total, pot) => total + pot.amount, 0);
    fragments.push(`${snapshot.showdownPots.length} settled pots for ${settledChips} chips.`);
  }

  if (sidePotCount > 0) {
    fragments.push(`${sidePotCount} side pot${sidePotCount > 1 ? "s" : ""}.`);
  }

  if (splitPotCount > 0) {
    fragments.push(`${splitPotCount} split pot${splitPotCount > 1 ? "s" : ""}.`);
  }

  if (bustedPlayers.length > 0) {
    fragments.push(`${bustedPlayers.length} elimination${bustedPlayers.length > 1 ? "s" : ""}.`);
  }

  return fragments.join(" ");
}

// Renders the settled pot-by-pot payouts once the hand reaches the result phase.
export function TournamentShowdownPanel({ snapshot }: TournamentShowdownPanelProps) {
  if ((snapshot.status !== "HAND_RESULT" && snapshot.status !== "FINISHED") || snapshot.showdownPots.length === 0) {
    return null;
  }

  const winner = findWinner(snapshot);
  const bustedPlayers = findBustedPlayers(snapshot);
  const showdown = isShowdownResult(snapshot);

  return (
    <section className="rounded-[2rem] border border-amber-200/15 bg-[linear-gradient(135deg,_rgba(120,53,15,0.35),_rgba(20,20,20,0.9))] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">{showdown ? "Showdown" : "Hand Result"}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{buildResultTitle(snapshot.status)}</h3>
          <p className="mt-2 text-sm text-amber-50/75">{buildSummaryLabel(snapshot, winner, bustedPlayers)}</p>
        </div>
        <p className="text-sm text-amber-50/80">{snapshot.tableMessage}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Board</p>
          {snapshot.boardCards.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {snapshot.boardCards.map((card) => (
                <PlayingCard key={card} card={card} variant="seat" />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-300">Hand ended before any community cards were revealed.</p>
          )}
          {!showdown && snapshot.boardCards.length > 0 ? (
            <p className="mt-4 text-sm text-zinc-300">No further board cards were revealed after the hand closed.</p>
          ) : null}
        </article>

        <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">
            {winner ? "Champion" : "Settled Pots"}
          </p>
          <p className="mt-3 text-lg font-semibold text-white">
            {winner ? winner.nickname : `${snapshot.showdownPots.length} pots`}
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            {winner ? `${winner.stack} chips` : `${snapshot.showdownPots.reduce((total, pot) => total + pot.amount, 0)} chips settled`}
          </p>
        </article>

        <article className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Eliminated This Result</p>
          {bustedPlayers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {bustedPlayers.map((player) => (
                <span
                  key={player.guestId}
                  className="rounded-full border border-rose-200/20 bg-rose-200/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-rose-100"
                >
                  {player.nickname}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-300">No players busted in this result.</p>
          )}
        </article>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {snapshot.showdownPots.map((pot) => (
          <article key={pot.id} className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">{pot.type} Pot</p>
                <p className="mt-2 text-3xl font-semibold text-white">{pot.amount}</p>
              </div>
              <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-amber-100">
                {pot.payouts.length > 1 ? "Split" : "Winner"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {pot.payouts.map((payout) => (
                <div
                  key={`${pot.id}-${payout.guestId}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{payout.nickname}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">{payout.guestId}</p>
                  </div>
                  <p className="text-lg font-semibold text-amber-100">+{payout.amount}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
