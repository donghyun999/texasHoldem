package com.texasholdem.tournament.application.hand;

import com.texasholdem.tournament.application.state.*;
import com.texasholdem.tournament.domain.PlayerStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TournamentEdgeCaseTest {

    private final PokerHandEvaluator handEvaluator = new PokerHandEvaluator();
    private final TournamentRules defaultRules = new TournamentRules();
    private final TournamentPotResolver potResolver = new TournamentPotResolver(handEvaluator, defaultRules);

    @Test
    void resolvesMultiSidePotsWithDifferentWinnersPerTier() {
        var board = List.of("2C", "3D", "7H", "9S", "KD");
        var players = List.of(
                potPlayer("guest-1", "Seat1", 0, 50, true, true, "AS", "AD"),
                potPlayer("guest-2", "Seat2", 1, 100, true, true, "QS", "QD"),
                potPlayer("guest-3", "Seat3", 2, 200, true, true, "JS", "JD"),
                potPlayer("guest-4", "Seat4", 3, 500, true, true, "TS", "TD"),
                potPlayer("guest-5", "Seat5", 4, 500, true, true, "4C", "5C")
        );

        var settlement = potResolver.settle(players, board, 0);

        assertThat(settlement.showdownPots()).hasSize(4);
        assertPot(settlement, 0, "main", "MAIN", 250, "guest-1", 250);
        assertPot(settlement, 1, "side-1", "SIDE", 200, "guest-2", 200);
        assertPot(settlement, 2, "side-2", "SIDE", 300, "guest-3", 300);
        assertPot(settlement, 3, "side-3", "SIDE", 600, "guest-4", 600);
        assertThat(settlement.stackCredits())
                .containsEntry("guest-1", 250)
                .containsEntry("guest-2", 200)
                .containsEntry("guest-3", 300)
                .containsEntry("guest-4", 600);
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void splitsBoardOnlyPotAndAwardsOddChipByDealerPriority() {
        var players = List.of(
                potPlayer("guest-1", "Seat1", 0, 1, true, true, "2H", "3H"),
                potPlayer("guest-2", "Seat2", 1, 1, true, true, "4H", "5H"),
                potPlayer("guest-3", "Seat3", 2, 1, false, false, "AS", "AD")
        );
        var settlement = potResolver.settle(players, List.of("TC", "JD", "QS", "KH", "AC"), 1);

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(3);
            assertThat(pot.payouts()).extracting("guestId").containsExactly("guest-2", "guest-1");
            assertThat(pot.payouts()).extracting("amount").containsExactly(2, 1);
        });
        assertThat(settlement.showdownHands()).extracting("guestId").containsExactly("guest-1", "guest-2");
        assertThat(settlement.showdownHands()).extracting("handLabel").containsExactly("Straight", "Straight");
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void excludesFoldedPlayerEvenWhenFoldedCardsWouldHaveWon() {
        var players = List.of(
                potPlayer("guest-1", "FoldedAces", 0, 100, false, false, "AS", "AD"),
                potPlayer("guest-2", "Queens", 1, 100, true, false, "QS", "QD"),
                potPlayer("guest-3", "Jacks", 2, 100, true, false, "JS", "JD")
        );
        var settlement = potResolver.settle(players, List.of("2C", "3D", "7H", "9S", "KD"), 0);

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(300);
            assertThat(pot.payouts()).singleElement().satisfies(payout -> {
                assertThat(payout.guestId()).isEqualTo("guest-2");
                assertThat(payout.amount()).isEqualTo(300);
            });
        });
        assertThat(settlement.showdownHands()).extracting("guestId").containsExactly("guest-2", "guest-3");
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void refundsUnmatchedOverbetAboveHighestPayableTier() {
        var players = List.of(
                potPlayer("guest-1", "Overbettor", 0, 1_000, true, true, "AS", "AD"),
                potPlayer("guest-2", "ShortStack", 1, 100, true, true, "QS", "QD")
        );
        var settlement = potResolver.settle(players, List.of("2C", "3D", "7H", "9S", "KD"), 0);

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(200);
            assertThat(pot.payouts()).singleElement().satisfies(payout -> {
                assertThat(payout.guestId()).isEqualTo("guest-1");
                assertThat(payout.amount()).isEqualTo(200);
            });
        });
        assertThat(settlement.stackCredits()).containsEntry("guest-1", 1_100);
        assertThat(settlement.stackCredits()).doesNotContainKey("guest-2");
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void describesSidePotEligibilityAndBlocksShortStacksFromUpperTiers() {
        var players = List.of(
                potPlayer("guest-1", "ShortAces", 0, 50, true, true, "AS", "AD"),
                potPlayer("guest-2", "MidQueens", 1, 100, true, true, "QS", "QD"),
                potPlayer("guest-3", "DeepJacks", 2, 200, true, true, "JS", "JD"),
                potPlayer("guest-4", "DeepTens", 3, 200, true, false, "TS", "TD")
        );

        var overview = potResolver.describePots(players);
        var settlement = potResolver.settle(players, List.of("2C", "3D", "7H", "9S", "KD"), 0);

        assertThat(overview.mainPot()).isEqualTo(200);
        assertThat(overview.sidePots()).hasSize(2);
        assertThat(overview.sidePots().get(0).eligibleGuestIds())
                .containsExactly("guest-2", "guest-3", "guest-4");
        assertThat(overview.sidePots().get(1).eligibleGuestIds())
                .containsExactly("guest-3", "guest-4");
        assertPot(settlement, 0, "main", "MAIN", 200, "guest-1", 200);
        assertPot(settlement, 1, "side-1", "SIDE", 150, "guest-2", 150);
        assertPot(settlement, 2, "side-2", "SIDE", 200, "guest-3", 200);
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void splitsOddChipsAcrossThreeWinnersWithWrapAroundDealerPriority() {
        var players = List.of(
                potPlayer("guest-1", "Seat5", 5, 1, true, true, "2H", "3H"),
                potPlayer("guest-2", "Seat0", 0, 1, true, true, "4H", "5H"),
                potPlayer("guest-3", "Seat2", 2, 1, true, true, "6H", "7H"),
                potPlayer("guest-4", "FoldedSeat3", 3, 1, false, false, "AS", "AD"),
                potPlayer("guest-5", "FoldedSeat4", 4, 1, false, false, "KS", "KD")
        );

        var settlement = potResolver.settle(players, List.of("TC", "JD", "QS", "KH", "AC"), 4);

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(5);
            assertThat(pot.payouts()).extracting("guestId")
                    .containsExactly("guest-1", "guest-2", "guest-3");
            assertThat(pot.payouts()).extracting("amount")
                    .containsExactly(2, 2, 1);
        });
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void splitsOddChipsAcrossNineSeatWrapAroundDealerPriority() {
        var resolver = new TournamentPotResolver(handEvaluator, new TournamentRules(9));
        var players = List.of(
                potPlayer("guest-1", "Seat0", 0, 1, true, true, "2H", "3H"),
                potPlayer("guest-2", "Seat2", 2, 1, true, true, "4H", "5H"),
                potPlayer("guest-3", "Seat7", 7, 1, true, true, "6H", "7H"),
                potPlayer("guest-4", "FoldedSeat4", 4, 1, false, false, "AS", "AD"),
                potPlayer("guest-5", "FoldedSeat8", 8, 1, false, false, "KS", "KD")
        );

        var settlement = resolver.settle(players, List.of("TC", "JD", "QS", "KH", "AC"), 8);

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(5);
            assertThat(pot.payouts()).extracting("guestId")
                    .containsExactly("guest-1", "guest-2", "guest-3");
            assertThat(pot.payouts()).extracting("amount")
                    .containsExactly(2, 2, 1);
        });
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void excludesIneligibleAllInPlayerEvenWhenCardsWouldWin() {
        var players = List.of(
                potPlayer("guest-1", "IneligibleAllInAces", 0, 100, false, true, "AS", "AD"),
                potPlayer("guest-2", "Queens", 1, 100, true, false, "QS", "QD"),
                potPlayer("guest-3", "Jacks", 2, 100, true, false, "JS", "JD")
        );

        var settlement = potResolver.settle(players, List.of("2C", "3D", "7H", "9S", "KD"), 0);

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(300);
            assertThat(pot.payouts()).singleElement().satisfies(payout -> {
                assertThat(payout.guestId()).isEqualTo("guest-2");
                assertThat(payout.amount()).isEqualTo(300);
            });
        });
        assertThat(settlement.showdownHands()).extracting("guestId").containsExactly("guest-2", "guest-3");
        assertSettlementConservesContributions(players, settlement);
    }

    @Test
    void evaluatesWheelStraightAndKickerTieBreakers() {
        var wheel = handEvaluator.evaluate(List.of("2C", "3D", "AH", "9S", "KD"), List.of("4C", "5H"));
        var pairOfAces = handEvaluator.evaluate(List.of("2C", "3D", "AH", "9S", "KD"), List.of("AS", "AD"));
        var acePairKingKicker = handEvaluator.evaluate(List.of("AH", "7D", "4C", "2S", "9H"), List.of("AD", "KS"));
        var acePairQueenKicker = handEvaluator.evaluate(List.of("AH", "7D", "4C", "2S", "9H"), List.of("AC", "QS"));

        assertThat(handEvaluator.describe(wheel)).isEqualTo("Straight");
        assertThat(wheel).isGreaterThan(pairOfAces);
        assertThat(acePairKingKicker).isGreaterThan(acePairQueenKicker);
    }

    @Test
    void comparesStraightHighCards() {
        var sixHighStraight = handEvaluator.evaluate(List.of("2C", "3D", "4H", "9S", "KD"), List.of("5C", "6H"));
        var fiveHighWheel = handEvaluator.evaluate(List.of("2C", "3D", "4H", "9S", "KD"), List.of("AC", "5H"));

        assertThat(handEvaluator.describe(sixHighStraight)).isEqualTo("Straight");
        assertThat(handEvaluator.describe(fiveHighWheel)).isEqualTo("Straight");
        assertThat(sixHighStraight).isGreaterThan(fiveHighWheel);
    }

    @Test
    void comparesTwoPairKickers() {
        var queenKicker = handEvaluator.evaluate(List.of("AH", "AD", "KC", "KD", "2S"), List.of("QS", "3C"));
        var jackKicker = handEvaluator.evaluate(List.of("AH", "AD", "KC", "KD", "2S"), List.of("JS", "TC"));

        assertThat(handEvaluator.describe(queenKicker)).isEqualTo("Two Pair");
        assertThat(queenKicker).isGreaterThan(jackKicker);
    }

    @Test
    void comparesFullHouseTripsBeforePair() {
        var kingsFullOfTwos = handEvaluator.evaluate(List.of("2C", "2D", "KH", "KS", "9C"), List.of("KC", "3S"));
        var twosFullOfKings = handEvaluator.evaluate(List.of("2C", "2D", "KH", "KS", "9C"), List.of("2H", "AS"));

        assertThat(handEvaluator.describe(kingsFullOfTwos)).isEqualTo("Full House");
        assertThat(kingsFullOfTwos).isGreaterThan(twosFullOfKings);
    }

    @Test
    void ignoresHoleCardsWhenBoardAlreadyLocksBestHand() {
        var boardLockedStraight = handEvaluator.evaluate(List.of("TC", "JD", "QS", "KH", "AC"), List.of("AS", "AD"));
        var sameBoardStraight = handEvaluator.evaluate(List.of("TC", "JD", "QS", "KH", "AC"), List.of("2C", "3C"));

        assertThat(handEvaluator.describe(boardLockedStraight)).isEqualTo("Straight");
        assertThat(boardLockedStraight).isEqualTo(sameBoardStraight);
    }

    @Test
    void comparesFlushKickers() {
        var aceHighFlush = handEvaluator.evaluate(List.of("2H", "5H", "9H", "KH", "3D"), List.of("AH", "4S"));
        var kingHighFlush = handEvaluator.evaluate(List.of("2H", "5H", "9H", "KH", "3D"), List.of("QH", "AD"));

        assertThat(handEvaluator.describe(aceHighFlush)).isEqualTo("Flush");
        assertThat(aceHighFlush).isGreaterThan(kingHighFlush);
    }

    @Test
    void postsShortBlindsAsAllInWithoutNegativeStacks() {
        var rules = new TournamentRules();
        var stateAccess = new TournamentStateAccess(rules);
        var setupManager = new TournamentHandSetupManager(rules, stateAccess, new OrderedDeckFactory());
        var tournament = new TournamentState("EDGE1");
        tournament.players.addAll(List.of(
                activePlayer("guest-1", "Button", 0, 2_000, true),
                activePlayer("guest-2", "ShortSmallBlind", 1, 5, false),
                activePlayer("guest-3", "ShortBigBlind", 2, 10, false)
        ));
        tournament.levelActivatedAtEpochSecond = java.time.Instant.now().getEpochSecond();

        setupManager.initializeHand(tournament);

        assertThat(tournament.dealerSeat).isEqualTo(0);
        assertThat(tournament.smallBlindSeat).isEqualTo(1);
        assertThat(tournament.bigBlindSeat).isEqualTo(2);
        assertThat(requirePlayer(tournament, "guest-2").stack).isZero();
        assertThat(requirePlayer(tournament, "guest-2").totalContribution).isEqualTo(5);
        assertThat(requirePlayer(tournament, "guest-2").status).isEqualTo(PlayerStatus.ALL_IN);
        assertThat(requirePlayer(tournament, "guest-3").stack).isZero();
        assertThat(requirePlayer(tournament, "guest-3").totalContribution).isEqualTo(10);
        assertThat(requirePlayer(tournament, "guest-3").status).isEqualTo(PlayerStatus.ALL_IN);
        assertThat(tournament.currentBet).isEqualTo(10);
    }

    @Test
    void postsHeadsUpDealerSmallBlindAndUsesHighestActualPostedBlind() {
        var rules = new TournamentRules();
        var stateAccess = new TournamentStateAccess(rules);
        var setupManager = new TournamentHandSetupManager(rules, stateAccess, new OrderedDeckFactory());
        var tournament = new TournamentState("EDGE2");
        tournament.players.addAll(List.of(
                activePlayer("guest-1", "ButtonSmallBlind", 0, 2_000, true),
                activePlayer("guest-2", "ShortBigBlind", 4, 7, false)
        ));
        tournament.levelActivatedAtEpochSecond = java.time.Instant.now().getEpochSecond();

        setupManager.initializeHand(tournament);

        assertThat(tournament.dealerSeat).isEqualTo(0);
        assertThat(tournament.smallBlindSeat).isEqualTo(0);
        assertThat(tournament.bigBlindSeat).isEqualTo(4);
        assertThat(requirePlayer(tournament, "guest-1").stack).isEqualTo(1_990);
        assertThat(requirePlayer(tournament, "guest-1").totalContribution).isEqualTo(10);
        assertThat(requirePlayer(tournament, "guest-2").stack).isZero();
        assertThat(requirePlayer(tournament, "guest-2").totalContribution).isEqualTo(7);
        assertThat(requirePlayer(tournament, "guest-2").status).isEqualTo(PlayerStatus.ALL_IN);
        assertThat(tournament.currentBet).isEqualTo(10);
    }

    @Test
    void dropsZeroStackParticipantBeforeBlindAssignment() {
        var rules = new TournamentRules();
        var stateAccess = new TournamentStateAccess(rules);
        var setupManager = new TournamentHandSetupManager(rules, stateAccess, new OrderedDeckFactory());
        var tournament = new TournamentState("EDGE3");
        tournament.players.addAll(List.of(
                activePlayer("guest-1", "Button", 0, 2_000, true),
                activePlayer("guest-2", "Busted", 1, 0, false),
                activePlayer("guest-3", "BigBlind", 2, 2_000, false)
        ));
        tournament.levelActivatedAtEpochSecond = java.time.Instant.now().getEpochSecond();

        setupManager.preparePlayersForNextHand(tournament);
        setupManager.initializeHand(tournament);

        assertThat(requirePlayer(tournament, "guest-2").participating).isFalse();
        assertThat(requirePlayer(tournament, "guest-2").status).isEqualTo(PlayerStatus.BUSTED_OUT);
        assertThat(requirePlayer(tournament, "guest-2").holeCards).isEmpty();
        assertThat(tournament.dealerSeat).isEqualTo(0);
        assertThat(tournament.smallBlindSeat).isEqualTo(0);
        assertThat(tournament.bigBlindSeat).isEqualTo(2);
        assertThat(requirePlayer(tournament, "guest-1").totalContribution).isEqualTo(10);
        assertThat(requirePlayer(tournament, "guest-3").totalContribution).isEqualTo(20);
        assertThat(tournament.currentBet).isEqualTo(20);
    }

    @Test
    void rotatesDealerAndBlindsForTwoSeatTable() {
        assertBlindAssignmentsForTwoConsecutiveHands(
                2,
                List.of(0, 1),
                new BlindAssignment(0, 0, 1),
                new BlindAssignment(1, 1, 0)
        );
    }

    @Test
    void rotatesDealerAndBlindsForSixSeatTable() {
        assertBlindAssignmentsForTwoConsecutiveHands(
                6,
                List.of(0, 1, 2, 3, 4, 5),
                new BlindAssignment(0, 1, 2),
                new BlindAssignment(1, 2, 3)
        );
    }

    @Test
    void rotatesDealerAndBlindsForNineSeatTable() {
        assertBlindAssignmentsForTwoConsecutiveHands(
                9,
                List.of(0, 1, 2, 3, 4, 5, 6, 7, 8),
                new BlindAssignment(0, 1, 2),
                new BlindAssignment(1, 2, 3)
        );
    }

    private TournamentPotResolver.PlayerPotState potPlayer(
            String guestId,
            String nickname,
            int seatIndex,
            int totalContribution,
            boolean eligibleForPot,
            boolean allIn,
            String firstCard,
            String secondCard
    ) {
        return new TournamentPotResolver.PlayerPotState(
                guestId,
                nickname,
                seatIndex,
                totalContribution,
                eligibleForPot,
                allIn,
                List.of(firstCard, secondCard)
        );
    }

    private TournamentPlayerState activePlayer(
            String guestId,
            String nickname,
            int seatIndex,
            int stack,
            boolean owner
    ) {
        var player = new TournamentPlayerState(guestId, nickname, seatIndex);
        player.stack = stack;
        player.owner = owner;
        player.connected = true;
        player.participating = true;
        player.status = PlayerStatus.ACTIVE;
        return player;
    }

    private TournamentPlayerState requirePlayer(TournamentState tournament, String guestId) {
        return tournament.players.stream()
                .filter(player -> player.guestId.equals(guestId))
                .findFirst()
                .orElseThrow();
    }

    private void assertBlindAssignmentsForTwoConsecutiveHands(
            int maxSeats,
            List<Integer> seatIndexes,
            BlindAssignment firstHand,
            BlindAssignment secondHand
    ) {
        var rules = new TournamentRules(maxSeats);
        var stateAccess = new TournamentStateAccess(rules);
        var setupManager = new TournamentHandSetupManager(rules, stateAccess, new OrderedDeckFactory());
        var tournament = new TournamentState("ROTATE-" + maxSeats);
        for (var seatIndex : seatIndexes) {
            tournament.players.add(activePlayer("guest-" + seatIndex, "Seat" + seatIndex, seatIndex, 2_000, seatIndex == 0));
        }
        tournament.levelActivatedAtEpochSecond = java.time.Instant.now().getEpochSecond();

        setupManager.initializeHand(tournament);
        assertThat(new BlindAssignment(tournament.dealerSeat, tournament.smallBlindSeat, tournament.bigBlindSeat))
                .isEqualTo(firstHand);

        setupManager.preparePlayersForNextHand(tournament);
        setupManager.initializeHand(tournament);
        assertThat(new BlindAssignment(tournament.dealerSeat, tournament.smallBlindSeat, tournament.bigBlindSeat))
                .isEqualTo(secondHand);
    }

    private void assertPot(
            TournamentPotResolver.Settlement settlement,
            int index,
            String id,
            String type,
            int amount,
            String winnerGuestId,
            int payoutAmount
    ) {
        assertThat(settlement.showdownPots().get(index).id()).isEqualTo(id);
        assertThat(settlement.showdownPots().get(index).type()).isEqualTo(type);
        assertThat(settlement.showdownPots().get(index).amount()).isEqualTo(amount);
        assertThat(settlement.showdownPots().get(index).payouts()).singleElement().satisfies(payout -> {
            assertThat(payout.guestId()).isEqualTo(winnerGuestId);
            assertThat(payout.amount()).isEqualTo(payoutAmount);
        });
    }

    private void assertSettlementConservesContributions(
            List<TournamentPotResolver.PlayerPotState> players,
            TournamentPotResolver.Settlement settlement
    ) {
        var totalContributions = players.stream()
                .mapToInt(TournamentPotResolver.PlayerPotState::totalContribution)
                .sum();
        var totalCredits = settlement.stackCredits().values().stream()
                .mapToInt(Integer::intValue)
                .sum();
        var totalPotAwards = settlement.potAwards().values().stream()
                .mapToInt(Integer::intValue)
                .sum();
        var totalShowdownPotAmount = settlement.showdownPots().stream()
                .mapToInt(pot -> pot.amount())
                .sum();
        var totalShowdownPayouts = settlement.showdownPots().stream()
                .flatMap(pot -> pot.payouts().stream())
                .mapToInt(payout -> payout.amount())
                .sum();

        assertThat(totalCredits).isEqualTo(totalContributions);
        assertThat(totalPotAwards).isEqualTo(totalShowdownPotAmount);
        assertThat(totalShowdownPayouts).isEqualTo(totalShowdownPotAmount);
    }

    private static final class OrderedDeckFactory implements TournamentDeckFactory {

        @Override
        public List<String> createDeck(int playersToDeal) {
            var deck = new ArrayList<String>();
            var ranks = "23456789TJQKA";
            var suits = "CDHS";
            for (var rankIndex = 0; rankIndex < ranks.length(); rankIndex++) {
                for (var suitIndex = 0; suitIndex < suits.length(); suitIndex++) {
                    deck.add("" + ranks.charAt(rankIndex) + suits.charAt(suitIndex));
                }
            }
            return deck;
        }
    }

    private record BlindAssignment(int dealerSeat, int smallBlindSeat, int bigBlindSeat) {
    }
}
