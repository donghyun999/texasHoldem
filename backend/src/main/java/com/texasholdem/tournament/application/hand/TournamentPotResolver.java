package com.texasholdem.tournament.application.hand;
import com.texasholdem.tournament.application.state.TournamentPlayerState;
import com.texasholdem.tournament.application.state.TournamentRules;
import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownHandView;
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
public final class TournamentPotResolver {

    private final PokerHandEvaluator handEvaluator;
    private final TournamentRules rules;

    // Wires the pot resolver to the hand evaluator used for showdown comparisons.
    public TournamentPotResolver(PokerHandEvaluator handEvaluator, TournamentRules rules) {
        this.handEvaluator = handEvaluator;
        this.rules = rules;
    }

    // Builds the public main-pot and side-pot snapshot view from player contributions.
    PotOverview describePots(List<PlayerPotState> players) {
        var displayPots = buildDisplayPots(players);
        if (displayPots.isEmpty()) {
            return new PotOverview(0, List.of());
        }
        return new PotOverview(
                displayPots.get(0).amount(),
                displayPots.stream().skip(1).map(ResolvedPot::toView).toList()
        );
    }

    // Resolves refunds and pot awards for one completed hand settlement step.
    Settlement settle(List<PlayerPotState> players, List<String> boardCards, Integer dealerSeat) {
        var build = buildPots(players);
        var credits = new HashMap<String, Integer>();
        var potAwards = new LinkedHashMap<String, Integer>();
        var showdownPots = new ArrayList<ShowdownPotView>();
        var showdownHands = new ArrayList<ShowdownHandView>();
        var scoreCache = new HashMap<String, Long>();
        refundUnmatchedContributions(players, build.matchedContributions(), credits);
        awardMatchedPots(build.pots(), boardCards, dealerSeat, credits, potAwards, showdownPots, scoreCache);
        showdownHands.addAll(buildShowdownHands(players, boardCards, scoreCache));
        return new Settlement(credits, potAwards, showdownPots, showdownHands);
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

    // Builds the snapshot-facing pots from all currently committed chips, splitting only on all-in caps.
    private List<ResolvedPot> buildDisplayPots(List<PlayerPotState> players) {
        var committedPlayers = players.stream()
                .filter(player -> player.totalContribution() > 0)
                .toList();
        if (committedPlayers.isEmpty()) {
            return List.of();
        }

        var pots = new ArrayList<ResolvedPot>();
        var allInBoundaries = committedPlayers.stream()
                .filter(PlayerPotState::allIn)
                .mapToInt(PlayerPotState::totalContribution)
                .filter(amount -> amount > 0)
                .distinct()
                .sorted()
                .toArray();

        var previousBoundary = 0;
        for (var boundary : allInBoundaries) {
            var amount = committedSegmentAmount(committedPlayers, previousBoundary, boundary);
            if (amount > 0) {
                pots.add(new ResolvedPot(
                        pots.isEmpty() ? "main" : "side-" + pots.size(),
                        pots.isEmpty() ? "MAIN" : "SIDE",
                        amount,
                        eligiblePlayersForSegment(committedPlayers, previousBoundary)
                ));
            }
            previousBoundary = boundary;
        }

        var remainingBoundary = previousBoundary;
        var remainingAmount = committedPlayers.stream()
                .mapToInt(player -> Math.max(0, player.totalContribution() - remainingBoundary))
                .sum();
        if (remainingAmount > 0) {
            pots.add(new ResolvedPot(
                    pots.isEmpty() ? "main" : "side-" + pots.size(),
                    pots.isEmpty() ? "MAIN" : "SIDE",
                    remainingAmount,
                    eligiblePlayersForSegment(committedPlayers, remainingBoundary)
            ));
        }

        return pots;
    }

    // Sums the committed chips that sit between one contribution boundary and the next.
    private int committedSegmentAmount(List<PlayerPotState> players, int lowerBoundary, int upperBoundary) {
        var width = upperBoundary - lowerBoundary;
        if (width <= 0) {
            return 0;
        }

        return players.stream()
                .mapToInt(player -> Math.min(Math.max(0, player.totalContribution() - lowerBoundary), width))
                .sum();
    }

    // Keeps only the players that can still win the chips inside the current display segment.
    private List<PlayerPotState> eligiblePlayersForSegment(List<PlayerPotState> players, int lowerBoundary) {
        return players.stream()
                .filter(player -> player.totalContribution() > lowerBoundary)
                .filter(PlayerPotState::eligibleForPot)
                .toList();
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
            List<ShowdownPotView> showdownPots,
            Map<String, Long> scoreCache
    ) {
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

    // Builds one showdown-hand label per surviving revealed participant when a real showdown occurs.
    private List<ShowdownHandView> buildShowdownHands(
            List<PlayerPotState> players,
            List<String> boardCards,
            Map<String, Long> scoreCache
    ) {
        if (boardCards.size() < 5) {
            return List.of();
        }

        var showdownPlayers = players.stream()
                .filter(PlayerPotState::eligibleForPot)
                .toList();
        if (showdownPlayers.size() <= 1) {
            return List.of();
        }

        return showdownPlayers.stream()
                .sorted(Comparator.<PlayerPotState>comparingLong(player -> scoreCache.computeIfAbsent(
                                player.guestId(),
                                ignored -> handEvaluator.evaluate(boardCards, player.holeCards())
                        ))
                        .reversed()
                        .thenComparingInt(PlayerPotState::seatIndex))
                .map(player -> new ShowdownHandView(
                        player.guestId(),
                        player.nickname(),
                        handEvaluator.describe(scoreCache.get(player.guestId())),
                        List.copyOf(player.holeCards())
                ))
                .toList();
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
        return seatIndex >= dealerSeat
                ? seatIndex - dealerSeat
                : rules.maxSeats() - dealerSeat + seatIndex;
    }

    record PlayerPotState(
            String guestId,
            String nickname,
            int seatIndex,
            int totalContribution,
            boolean eligibleForPot,
            boolean allIn,
            List<String> holeCards
    ) {
    }

    record PotOverview(int mainPot, List<PotView> sidePots) {
    }

    record Settlement(
            Map<String, Integer> stackCredits,
            Map<String, Integer> potAwards,
            List<ShowdownPotView> showdownPots,
            List<ShowdownHandView> showdownHands
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
