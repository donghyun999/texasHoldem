import type { TournamentSnapshot, TournamentStatus } from "@/entities/tournament/model/types";

type TournamentShowdownPanelProps = {
  snapshot: TournamentSnapshot;
};

// Chooses the result-panel title from the current tournament lifecycle state.
function buildResultTitle(status: TournamentStatus) {
  return status === "FINISHED" ? "Tournament Result" : "Hand Result";
}

// Renders the settled pot-by-pot payouts once the hand reaches the result phase.
export function TournamentShowdownPanel({ snapshot }: TournamentShowdownPanelProps) {
  if ((snapshot.status !== "HAND_RESULT" && snapshot.status !== "FINISHED") || snapshot.showdownPots.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-amber-200/15 bg-[linear-gradient(135deg,_rgba(120,53,15,0.35),_rgba(20,20,20,0.9))] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">Showdown</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{buildResultTitle(snapshot.status)}</h3>
        </div>
        <p className="text-sm text-amber-50/80">{snapshot.tableMessage}</p>
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
