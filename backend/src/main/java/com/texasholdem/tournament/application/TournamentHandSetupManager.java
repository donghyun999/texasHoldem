package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
final class TournamentHandSetupManager {

    private final TournamentRules rules;
    private final TournamentStateAccess stateAccess;
    private final TournamentDeckFactory deckFactory;

    // Wires hand setup to the shared tournament rules and seat navigation helpers.
    TournamentHandSetupManager(
            TournamentRules rules,
            TournamentStateAccess stateAccess,
            TournamentDeckFactory deckFactory
    ) {
        this.rules = rules;
        this.stateAccess = stateAccess;
        this.deckFactory = deckFactory;
    }

    // Restores surviving entrants to an active hand state and drops busted players.
    void preparePlayersForNextHand(TournamentState tournament) {
        for (var player : tournament.players) {
            player.acting = false;
            player.awaitingAction = false;
            player.raiseRightsAvailable = false;
            player.totalContribution = 0;
            player.roundContribution = 0;
            player.holeCards = new ArrayList<>();
            if (!player.participating) {
                player.status = player.status == PlayerStatus.BUSTED_OUT ? PlayerStatus.BUSTED_OUT : PlayerStatus.SEATED;
                continue;
            }
            if (player.stack <= 0) {
                player.stack = 0;
                player.participating = false;
                player.status = PlayerStatus.BUSTED_OUT;
                continue;
            }
            player.status = PlayerStatus.ACTIVE;
        }
    }

    // Opens a fresh preflop state, posts blinds, and returns any blind-level transition message.
    String initializeHand(TournamentState tournament) {
        var levelMessage = advanceBlindLevelIfNeeded(tournament);
        tournament.handNumber++;
        tournament.status = TournamentStatus.IN_HAND;
        tournament.round = BettingRound.PRE_FLOP;
        tournament.currentBet = 0;
        tournament.lastFullRaiseSize = rules.bigBlindFor(tournament.levelIndex);
        tournament.boardCards = new ArrayList<>();
        tournament.hiddenBoardCards = new ArrayList<>();
        tournament.sidePots = new ArrayList<>();
        tournament.mainPot = 0;
        tournament.handResultEndsAtEpochMilli = 0;
        tournament.finishedCleanupAtEpochMilli = 0;
        tournament.showdownPots = new ArrayList<>();
        tournament.showdownHands = new ArrayList<>();
        tournament.recentlyBustedGuestIds = new ArrayList<>();
        assignDealerAndBlinds(tournament);
        var orderedSeats = buildDealOrder(tournament);
        var deck = deckFactory.createDeck(orderedSeats.size());
        dealHoleCards(tournament, orderedSeats, deck);
        tournament.hiddenBoardCards = drawCards(deck, 5);
        resetHandState(tournament);
        postBlind(tournament, tournament.smallBlindSeat, rules.currentLevel(tournament.levelIndex).smallBlind());
        postBlind(tournament, tournament.bigBlindSeat, rules.currentLevel(tournament.levelIndex).bigBlind());
        tournament.currentBet = tournament.players.stream()
                .filter(TournamentPlayerState::isInHand)
                .mapToInt(player -> player.roundContribution)
                .max()
                .orElse(0);
        markAwaitingPlayers(tournament);
        return levelMessage;
    }

    // Advances the board and resets round-local state for the next betting street.
    void openNextRound(TournamentState tournament) {
        tournament.round = tournament.round.next();
        resetRoundContributions(tournament);
        tournament.currentBet = 0;
        tournament.lastFullRaiseSize = rules.bigBlindFor(tournament.levelIndex);
        revealBoardForRound(tournament);
        markAwaitingPlayers(tournament);
    }

    // Reveals all board cards when no further betting action is possible.
    void revealFullBoard(TournamentState tournament) {
        tournament.boardCards = new ArrayList<>(tournament.hiddenBoardCards);
    }

    // Advances the blind level only on a hand boundary when enough time has elapsed.
    private String advanceBlindLevelIfNeeded(TournamentState tournament) {
        var changed = false;
        var now = Instant.now().getEpochSecond();
        while (tournament.levelIndex < rules.levels().size() - 1) {
            var duration = rules.currentLevel(tournament.levelIndex).durationSeconds();
            if (now < tournament.levelActivatedAtEpochSecond + duration) {
                break;
            }
            tournament.levelActivatedAtEpochSecond += duration;
            tournament.levelIndex++;
            changed = true;
        }

        if (!changed) {
            return "";
        }
        var level = rules.currentLevel(tournament.levelIndex);
        return "Level " + level.level() + " blinds are " + level.smallBlind() + "/" + level.bigBlind() + ".";
    }

    // Rotates the dealer button and derives the blind seats from remaining players.
    private void assignDealerAndBlinds(TournamentState tournament) {
        var activeSeats = stateAccess.remainingSeats(tournament);
        tournament.dealerSeat = tournament.dealerSeat == null
                ? activeSeats.get(0)
                : stateAccess.nextSeatFrom(activeSeats, tournament.dealerSeat);
        if (activeSeats.size() == 2) {
            tournament.smallBlindSeat = tournament.dealerSeat;
            tournament.bigBlindSeat = stateAccess.nextSeatFrom(activeSeats, tournament.dealerSeat);
            return;
        }
        tournament.smallBlindSeat = stateAccess.nextSeatFrom(activeSeats, tournament.dealerSeat);
        tournament.bigBlindSeat = stateAccess.nextSeatFrom(activeSeats, tournament.smallBlindSeat);
    }

    // Deals two hidden cards to each surviving player from the current hand deck.
    private void dealHoleCards(TournamentState tournament, List<Integer> orderedSeats, List<String> deck) {
        for (var round = 0; round < 2; round++) {
            for (var seatIndex : orderedSeats) {
                stateAccess.requireSeatPlayer(tournament, seatIndex).holeCards.add(deck.remove(0));
            }
        }
    }

    // Builds the dealing order starting from the seat after the dealer button.
    private List<Integer> buildDealOrder(TournamentState tournament) {
        var activeSeats = stateAccess.remainingSeats(tournament);
        if (tournament.dealerSeat == null) {
            return activeSeats;
        }
        var startSeat = stateAccess.nextSeatFrom(activeSeats, tournament.dealerSeat);
        var orderedSeats = new ArrayList<Integer>();
        var currentSeat = startSeat;
        do {
            orderedSeats.add(currentSeat);
            currentSeat = stateAccess.nextSeatFrom(activeSeats, currentSeat);
        } while (currentSeat != startSeat);
        return orderedSeats;
    }

    // Consumes one contiguous run of cards from the top of the current hand deck.
    private List<String> drawCards(List<String> deck, int count) {
        var cards = new ArrayList<String>(count);
        for (var index = 0; index < count; index++) {
            cards.add(deck.remove(0));
        }
        return cards;
    }

    // Clears hand-local counters before blinds and player actions are applied.
    private void resetHandState(TournamentState tournament) {
        for (var player : tournament.players) {
            player.totalContribution = 0;
            player.roundContribution = 0;
            player.awaitingAction = false;
            player.raiseRightsAvailable = false;
        }
    }

    // Pulls the blind amount from a specific player and updates all-in status if needed.
    private void postBlind(TournamentState tournament, Integer seatIndex, int blindAmount) {
        if (seatIndex == null) {
            return;
        }
        var player = stateAccess.requireSeatPlayer(tournament, seatIndex);
        contribute(player, blindAmount);
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
    }

    // Deducts chips up to the remaining stack and records the hand contributions.
    private int contribute(TournamentPlayerState player, int requestedAmount) {
        if (requestedAmount <= 0 || player.stack <= 0) {
            return 0;
        }
        var paid = Math.min(player.stack, requestedAmount);
        player.stack -= paid;
        player.totalContribution += paid;
        player.roundContribution += paid;
        return paid;
    }

    // Clears round-local contributions once a street is complete.
    private void resetRoundContributions(TournamentState tournament) {
        for (var player : tournament.players) {
            player.roundContribution = 0;
            player.awaitingAction = false;
            player.raiseRightsAvailable = false;
        }
    }

    // Marks every active player with chips as pending action in the current round.
    private void markAwaitingPlayers(TournamentState tournament) {
        for (var player : tournament.players) {
            player.awaitingAction = player.status == PlayerStatus.ACTIVE;
            player.raiseRightsAvailable = player.status == PlayerStatus.ACTIVE;
        }
    }

    // Reveals the current number of board cards for the active betting round.
    private void revealBoardForRound(TournamentState tournament) {
        var visibleCards = tournament.round.visibleBoardCards();
        tournament.boardCards = new ArrayList<>(tournament.hiddenBoardCards.subList(0, visibleCards));
    }
}
