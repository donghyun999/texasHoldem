package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TournamentEdgeCaseTest {

    private final PokerHandEvaluator handEvaluator = new PokerHandEvaluator();
    private final TournamentPotResolver potResolver = new TournamentPotResolver(handEvaluator);

    @Test
    void resolvesMultiSidePotsWithDifferentWinnersPerTier() {
        var board = List.of("2C", "3D", "7H", "9S", "KD");

        var settlement = potResolver.settle(
                List.of(
                        potPlayer("guest-1", "Seat1", 0, 50, true, true, "AS", "AD"),
                        potPlayer("guest-2", "Seat2", 1, 100, true, true, "QS", "QD"),
                        potPlayer("guest-3", "Seat3", 2, 200, true, true, "JS", "JD"),
                        potPlayer("guest-4", "Seat4", 3, 500, true, true, "TS", "TD"),
                        potPlayer("guest-5", "Seat5", 4, 500, true, true, "4C", "5C")
                ),
                board,
                0
        );

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
    }

    @Test
    void splitsBoardOnlyPotAndAwardsOddChipByDealerPriority() {
        var settlement = potResolver.settle(
                List.of(
                        potPlayer("guest-1", "Seat1", 0, 1, true, true, "2H", "3H"),
                        potPlayer("guest-2", "Seat2", 1, 1, true, true, "4H", "5H"),
                        potPlayer("guest-3", "Seat3", 2, 1, false, false, "AS", "AD")
                ),
                List.of("TC", "JD", "QS", "KH", "AC"),
                1
        );

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(3);
            assertThat(pot.payouts()).extracting("guestId").containsExactly("guest-2", "guest-1");
            assertThat(pot.payouts()).extracting("amount").containsExactly(2, 1);
        });
        assertThat(settlement.showdownHands()).extracting("guestId").containsExactly("guest-1", "guest-2");
        assertThat(settlement.showdownHands()).extracting("handLabel").containsExactly("Straight", "Straight");
    }

    @Test
    void excludesFoldedPlayerEvenWhenFoldedCardsWouldHaveWon() {
        var settlement = potResolver.settle(
                List.of(
                        potPlayer("guest-1", "FoldedAces", 0, 100, false, false, "AS", "AD"),
                        potPlayer("guest-2", "Queens", 1, 100, true, false, "QS", "QD"),
                        potPlayer("guest-3", "Jacks", 2, 100, true, false, "JS", "JD")
                ),
                List.of("2C", "3D", "7H", "9S", "KD"),
                0
        );

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(300);
            assertThat(pot.payouts()).singleElement().satisfies(payout -> {
                assertThat(payout.guestId()).isEqualTo("guest-2");
                assertThat(payout.amount()).isEqualTo(300);
            });
        });
        assertThat(settlement.showdownHands()).extracting("guestId").containsExactly("guest-2", "guest-3");
    }

    @Test
    void refundsUnmatchedOverbetAboveHighestPayableTier() {
        var settlement = potResolver.settle(
                List.of(
                        potPlayer("guest-1", "Overbettor", 0, 1_000, true, true, "AS", "AD"),
                        potPlayer("guest-2", "ShortStack", 1, 100, true, true, "QS", "QD")
                ),
                List.of("2C", "3D", "7H", "9S", "KD"),
                0
        );

        assertThat(settlement.showdownPots()).singleElement().satisfies(pot -> {
            assertThat(pot.amount()).isEqualTo(200);
            assertThat(pot.payouts()).singleElement().satisfies(payout -> {
                assertThat(payout.guestId()).isEqualTo("guest-1");
                assertThat(payout.amount()).isEqualTo(200);
            });
        });
        assertThat(settlement.stackCredits()).containsEntry("guest-1", 1_100);
        assertThat(settlement.stackCredits()).doesNotContainKey("guest-2");
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
}
