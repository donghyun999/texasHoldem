import type { TournamentPlayer, TournamentSnapshot, TournamentStatus } from "@/entities/tournament/model/types";
import { PlayingCard } from "@/shared/ui/PlayingCard";

type TournamentShowdownPanelProps = {
  snapshot: TournamentSnapshot;
  variant?: "section" | "overlay";
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

function findLargestPayoutAmount(snapshot: TournamentSnapshot) {
  return Math.max(0, ...snapshot.showdownPots.flatMap((pot) => pot.payouts.map((payout) => payout.amount)));
}

function buildShowdownTone(index: number) {
  if (index === 0) {
    return "border-amber-200/25 bg-amber-100/10";
  }

  return "border-white/10 bg-white/5";
}

// Renders the settled pot-by-pot payouts once the hand reaches the result phase.
export function TournamentShowdownPanel({ snapshot, variant = "section" }: TournamentShowdownPanelProps) {
  if ((snapshot.status !== "HAND_RESULT" && snapshot.status !== "FINISHED") || snapshot.showdownPots.length === 0) {
    return null;
  }

  const winner = findWinner(snapshot);
  const bustedPlayers = findBustedPlayers(snapshot);
  const showdown = isShowdownResult(snapshot);
  const largestPayoutAmount = findLargestPayoutAmount(snapshot);
  const isOverlay = variant === "overlay";
  const containerClass = isOverlay
    ? "w-full max-w-5xl rounded-[1.75rem] border border-amber-200/20 bg-[linear-gradient(135deg,_rgba(120,53,15,0.68),_rgba(20,20,20,0.96))] p-4 shadow-2xl shadow-black/45 backdrop-blur-md sm:p-6"
    : "rounded-[2rem] border border-amber-200/15 bg-[linear-gradient(135deg,_rgba(120,53,15,0.35),_rgba(20,20,20,0.9))] p-6";
  const summaryGridClass = isOverlay ? "mt-4 grid gap-3 lg:grid-cols-3" : "mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]";
  const handsGridClass = isOverlay ? "mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
  const potsGridClass = isOverlay ? "mt-4 grid gap-3 lg:grid-cols-2" : "mt-5 grid gap-4 lg:grid-cols-2";

  return (
    <section className={containerClass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">{showdown ? "Showdown" : "Hand Result"}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{buildResultTitle(snapshot.status)}</h3>
          <p className="mt-2 text-sm text-amber-50/75">{buildSummaryLabel(snapshot, winner, bustedPlayers)}</p>
        </div>
        <p className="text-sm text-amber-50/80">{snapshot.tableMessage}</p>
      </div>

      <div className={summaryGridClass}>
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
          {winner ? (
            <>
              <div className="mt-3 inline-flex rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100">
                Winner
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{winner.nickname}</p>
              <p className="mt-2 text-sm text-zinc-300">{winner.stack} chips</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-lg font-semibold text-white">{snapshot.showdownPots.length} pots</p>
              <p className="mt-2 text-sm text-zinc-300">
                {snapshot.showdownPots.reduce((total, pot) => total + pot.amount, 0)} chips settled
              </p>
            </>
          )}
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

      {snapshot.showdownHands.length > 0 ? (
        <article className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Showdown Hands</p>
              <p className="mt-2 text-sm text-zinc-300">Server-evaluated hand classes for the revealed contenders.</p>
            </div>
            <span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-amber-100">
              {snapshot.showdownHands.length} revealed
            </span>
          </div>

          <div className={handsGridClass}>
            {snapshot.showdownHands.map((hand, index) => (
              <div
                key={hand.guestId}
                className={`rounded-2xl border px-4 py-4 ${buildShowdownTone(index)}`}
              >
                <p className="text-sm font-medium text-white">{hand.nickname}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
                  {index === 0 ? "Best shown hand" : "Shown hand"}
                </p>
                <p className="mt-3 text-lg font-semibold text-amber-100">{hand.handLabel}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div className={potsGridClass}>
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
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                    payout.amount === largestPayoutAmount && payout.amount > 0
                      ? "border-amber-200/25 bg-amber-100/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-white">{payout.nickname}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">
                      {payout.amount === largestPayoutAmount && payout.amount > 0 ? "Best payout" : "Payout"}
                    </p>
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
