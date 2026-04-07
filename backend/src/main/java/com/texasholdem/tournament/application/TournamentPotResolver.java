package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownPayoutView;
import com.texasholdem.tournament.domain.ShowdownPotView;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
final class TournamentPotResolver {

    private final PokerHandEvaluator handEvaluator;

    // Wires the pot resolver to the hand evaluator used for showdown comparisons.
    TournamentPotResolver(PokerHandEvaluator handEvaluator) {
        this.handEvaluator = handEvaluator;
    }

    // Builds the public main-pot and side-pot snapshot view from player contributions.
    PotOverview describePots(List<PlayerPotState> players) {
        var build = buildPots(players);
        if (build.pots().isEmpty()) {
            return new PotOverview(0, List.of());
        }
        return new PotOverview(
                build.pots().get(0).amount(),
                build.pots().stream().skip(1).map(ResolvedPot::toView).toList()
        );
    }

    // Resolves refunds and pot awards for one completed hand settlement step.
    Settlement settle(List<PlayerPotState> players, List<String> boardCards, Integer dealerSeat) {
        var build = buildPots(players);
        var credits = new HashMap<String, Integer>();
        var potAwards = new LinkedHashMap<String, Integer>();
        var showdownPots = new ArrayList<ShowdownPotView>();
        refundUnmatchedContributions(players, build.matchedContributions(), credits);
        awardMatchedPots(build.pots(), boardCards, dealerSeat, credits, potAwards, showdownPots);
        return new Settlement(credits, potAwards, showdownPots);
    }

    // Builds the matched pots and remembers how much of each player's contribution was payable.
    private PotBuild buildPots(List<PlayerPotState> players) {
        var tiers = players.stream()
                .mapToInt(PlayerPotState::totalContribution)
                .filter(amount -> amount > 0)
                .distinct()
                .sorted()
                .toArray();
        var matchedContributions = new HashMap<String, Integer>();
        var pots = new ArrayList<ResolvedPot>();
        var previousTier = 0;

        for (var tier : tiers) {
            var contributorCount = (int) players.stream()
                    .filter(player -> player.totalContribution() >= tier)
                    .count();
            var tierContribution = tier - previousTier;
            if (contributorCount < 2 || tierContribution <= 0) {
                previousTier = tier;
                continue;
            }

            var contributingPlayers = players.stream()
                    .filter(player -> player.totalContribution() >= tier)
                    .toList();
            for (var player : contributingPlayers) {
                matchedContributions.merge(player.guestId(), tierContribution, Integer::sum);
            }

            var eligiblePlayers = contributingPlayers.stream()
                    .filter(PlayerPotState::eligibleForPot)
                    .toList();
            var potIndex = pots.size();
            pots.add(new ResolvedPot(
                    potIndex == 0 ? "main" : "side-" + potIndex,
                    potIndex == 0 ? "MAIN" : "SIDE",
                    tierContribution * contributorCount,
                    eligiblePlayers
            ));
            previousTier = tier;
        }

        return new PotBuild(pots, matchedContributions);
    }

    // Returns every unmatched chip above the highest payable tier to its original owner.
    private void refundUnmatchedContributions(
            List<PlayerPotState> players,
            Map<String, Integer> matchedContributions,
            Map<String, Integer> credits
    ) {
        for (var player : players) {
            var matched = matchedContributions.getOrDefault(player.guestId(), 0);
            var refund = player.totalContribution() - matched;
            if (refund > 0) {
                credits.merge(player.guestId(), refund, Integer::sum);
            }
        }
    }

    // Awards each main pot or side pot to the proper winner set and splits odd chips by seat order.
    private void awardMatchedPots(
            List<ResolvedPot> pots,
            List<String> boardCards,
            Integer dealerSeat,
            Map<String, Integer> credits,
            Map<String, Integer> potAwards,
            List<ShowdownPotView> showdownPots
    ) {
        var scoreCache = new HashMap<String, Long>();
        for (var pot : pots) {
            var winners = resolveWinners(pot, boardCards, scoreCache);
            if (winners.isEmpty()) {
                continue;
            }

            var orderedWinners = orderWinnersByOddChipPriority(winners, dealerSeat);
            var share = pot.amount() / orderedWinners.size();
            var remainder = pot.amount() % orderedWinners.size();
            var payouts = new ArrayList<ShowdownPayoutView>();
            for (var index = 0; index < orderedWinners.size(); index++) {
                var winner = orderedWinners.get(index);
                var award = share + (index < remainder ? 1 : 0);
                credits.merge(winner.guestId(), award, Integer::sum);
                potAwards.merge(winner.guestId(), award, Integer::sum);
                payouts.add(new ShowdownPayoutView(winner.guestId(), winner.nickname(), award));
            }
            showdownPots.add(new ShowdownPotView(pot.id(), pot.type(), pot.amount(), List.copyOf(payouts)));
        }
    }

    // Resolves the winner list for one matched pot, using showdown scores only when needed.
    private List<PlayerPotState> resolveWinners(
            ResolvedPot pot,
            List<String> boardCards,
            Map<String, Long> scoreCache
    ) {
        if (pot.eligiblePlayers().size() <= 1) {
            return pot.eligiblePlayers();
        }

        var bestScore = pot.eligiblePlayers().stream()
                .mapToLong(player -> scoreCache.computeIfAbsent(
                        player.guestId(),
                        ignored -> handEvaluator.evaluate(boardCards, player.holeCards())
                ))
                .max()
                .orElse(0L);
        return pot.eligiblePlayers().stream()
                .filter(player -> scoreCache.getOrDefault(player.guestId(), 0L) == bestScore)
                .toList();
    }

    // Orders split-pot winners by clockwise distance from the dealer button.
    private List<PlayerPotState> orderWinnersByOddChipPriority(List<PlayerPotState> winners, Integer dealerSeat) {
        return winners.stream()
                .sorted(Comparator.comparingInt(player -> distanceFromDealer(player.seatIndex(), dealerSeat)))
                .toList();
    }

    // Measures clockwise seat distance for odd-chip allocation ordering.
    private int distanceFromDealer(int seatIndex, Integer dealerSeat) {
        if (dealerSeat == null) {
            return seatIndex;
        }
        return seatIndex >= dealerSeat ? seatIndex - dealerSeat : 6 - dealerSeat + seatIndex;
    }

    record PlayerPotState(
            String guestId,
            String nickname,
            int seatIndex,
            int totalContribution,
            boolean eligibleForPot,
            List<String> holeCards
    ) {
    }

    record PotOverview(int mainPot, List<PotView> sidePots) {
    }

    record Settlement(
            Map<String, Integer> stackCredits,
            Map<String, Integer> potAwards,
            List<ShowdownPotView> showdownPots
    ) {
    }

    // Stores the internal matched-pot build used by both snapshot and settlement flows.
    private record PotBuild(List<ResolvedPot> pots, Map<String, Integer> matchedContributions) {
    }

    // Stores one matched pot with the exact player set that can win it.
    private record ResolvedPot(String id, String type, int amount, List<PlayerPotState> eligiblePlayers) {

        // Converts an internal resolved pot into the snapshot-facing view model.
        private PotView toView() {
            return new PotView(
                    id,
                    type,
                    amount,
                    eligiblePlayers.stream().map(PlayerPotState::guestId).toList()
            );
        }
    }
}
