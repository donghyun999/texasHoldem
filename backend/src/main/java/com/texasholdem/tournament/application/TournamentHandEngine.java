package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Component
final class TournamentHandEngine {

    private static final long HAND_RESULT_DURATION_MILLIS = 5_000L;
    private final TournamentRules rules;
    private final TournamentStateAccess stateAccess;
    private final TournamentPotResolver potResolver;

    // Wires the hand engine to the shared rule set, state helpers, and pot resolver.
    TournamentHandEngine(
            TournamentRules rules,
            TournamentStateAccess stateAccess,
            TournamentPotResolver potResolver
    ) {
        this.rules = rules;
        this.stateAccess = stateAccess;
        this.potResolver = potResolver;
    }

    // Opens a new hand from the current surviving participant set.
    void openNextHand(TournamentState tournament, String prefixMessage) {
        preparePlayersForNextHand(tournament);
        if (stateAccess.countRemainingParticipants(tournament) <= 1) {
            finishTournament(tournament, buildChampionMessage(tournament, prefixMessage));
            return;
        }

        var levelMessage = advanceBlindLevelIfNeeded(tournament);
        tournament.status = TournamentStatus.IN_HAND;
        tournament.round = BettingRound.PRE_FLOP;
        tournament.currentBet = 0;
        tournament.boardCards = new ArrayList<>();
        tournament.hiddenBoardCards = new ArrayList<>(rules.defaultBoardRunout());
        tournament.sidePots = new ArrayList<>();
        tournament.mainPot = 0;
        tournament.handResultEndsAtEpochMilli = 0;
        tournament.showdownPots = new ArrayList<>();
        assignDealerAndBlinds(tournament);
        dealHoleCards(tournament);
        resetHandState(tournament);
        applyBlind(tournament, tournament.smallBlindSeat, rules.currentLevel(tournament.levelIndex).smallBlind());
        applyBlind(tournament, tournament.bigBlindSeat, rules.currentLevel(tournament.levelIndex).bigBlind());
        tournament.currentBet = tournament.players.stream()
                .filter(TournamentPlayerState::isInHand)
                .mapToInt(player -> player.roundContribution)
                .max()
                .orElse(0);
        markAwaitingPlayers(tournament);
        refreshPots(tournament);
        if (stateAccess.countPlayersAbleToAct(tournament) == 0) {
            revealFullBoard(tournament);
            finishHand(tournament, stateAccess.combineMessages(
                    prefixMessage,
                    levelMessage,
                    "All remaining players are all-in. Showdown is ready."
            ));
            settleCompletedHand(tournament);
            return;
        }

        var startSeat = stateAccess.nextAwaitingSeatAfter(
                tournament,
                tournament.bigBlindSeat == null ? -1 : tournament.bigBlindSeat
        );
        activateSeat(tournament, startSeat, stateAccess.combineMessages(prefixMessage, levelMessage, "Preflop action is open."));
    }

    // Applies one accepted table action and advances the hand state.
    TournamentActionResult applyAction(TournamentState tournament, String guestId, String action, Integer amount) {
        if (tournament.status != TournamentStatus.IN_HAND) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is not currently in hand");
        }

        var player = stateAccess.requirePlayer(tournament, guestId);
        if (!player.acting || player.status != PlayerStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player cannot act right now");
        }

        var normalizedAction = action.trim().toUpperCase(Locale.ROOT);
        var contribution = applyPlayerAction(tournament, player, normalizedAction, amount);
        player.acting = false;
        refreshPots(tournament);
        advanceAfterProgress(
                tournament,
                player.seatIndex,
                player.nickname + " applied " + normalizedAction + ".",
                false
        );
        return new TournamentActionResult(normalizedAction, contribution);
    }

    // Applies the forced-fold branch used when an active player disconnects.
    void applyForcedFold(TournamentState tournament, TournamentPlayerState player, boolean wasActing) {
        applyFold(player);
        refreshPots(tournament);
        advanceAfterProgress(tournament, player.seatIndex, null, !wasActing);
    }

    // Restores surviving entrants to an active hand state and drops busted players.
    private void preparePlayersForNextHand(TournamentState tournament) {
        for (var player : tournament.players) {
            player.acting = false;
            player.awaitingAction = false;
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

    // Deals two hidden cards to each surviving player from a deterministic deck.
    private void dealHoleCards(TournamentState tournament) {
        var deck = buildDealDeck(tournament.hiddenBoardCards);
        var orderedSeats = buildDealOrder(tournament);
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

    // Builds the fixed deck after removing the predetermined board runout.
    private List<String> buildDealDeck(List<String> boardCards) {
        var ranks = "23456789TJQKA";
        var suits = "CDHS";
        var deck = new ArrayList<String>();
        for (var rankIndex = 0; rankIndex < ranks.length(); rankIndex++) {
            for (var suitIndex = 0; suitIndex < suits.length(); suitIndex++) {
                var card = "" + ranks.charAt(rankIndex) + suits.charAt(suitIndex);
                if (!boardCards.contains(card)) {
                    deck.add(card);
                }
            }
        }
        return deck;
    }

    // Clears hand-local counters before blinds and player actions are applied.
    private void resetHandState(TournamentState tournament) {
        for (var player : tournament.players) {
            player.totalContribution = 0;
            player.roundContribution = 0;
            player.awaitingAction = false;
        }
    }

    // Pulls the blind amount from a specific player and updates all-in status if needed.
    private void applyBlind(TournamentState tournament, Integer seatIndex, int blindAmount) {
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

    // Applies one player action against the current betting round state.
    private int applyPlayerAction(
            TournamentState tournament,
            TournamentPlayerState player,
            String normalizedAction,
            Integer amount
    ) {
        return switch (normalizedAction) {
            case "CHECK" -> applyCheck(tournament, player);
            case "CALL" -> applyCall(tournament, player);
            case "BET", "RAISE" -> applyRaise(tournament, player, amount);
            case "ALL_IN" -> applyAllIn(tournament, player);
            case "FOLD" -> applyFold(player);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported action: " + normalizedAction);
        };
    }

    // Validates a zero-cost action when the player has matched the current bet.
    private int applyCheck(TournamentState tournament, TournamentPlayerState player) {
        if (chipsToCall(tournament, player) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player must call, raise, or fold");
        }
        player.awaitingAction = false;
        return 0;
    }

    // Matches the current bet and allows short all-in calls when the stack is not enough.
    private int applyCall(TournamentState tournament, TournamentPlayerState player) {
        var chipsToCall = chipsToCall(tournament, player);
        if (chipsToCall <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to call");
        }
        var paid = contribute(player, chipsToCall);
        player.awaitingAction = false;
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
        return paid;
    }

    // Raises the round bet to a target contribution and reopens action for others.
    private int applyRaise(TournamentState tournament, TournamentPlayerState player, Integer amount) {
        var targetContribution = resolveRaiseTarget(tournament, amount);
        if (targetContribution <= tournament.currentBet) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise must increase the current bet");
        }

        var additionalChips = targetContribution - player.roundContribution;
        if (additionalChips <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise target is already satisfied");
        }
        if (additionalChips > player.stack) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise exceeds the remaining stack");
        }

        var paid = contribute(player, additionalChips);
        tournament.currentBet = player.roundContribution;
        player.awaitingAction = false;
        reopenAction(tournament, player.seatIndex);
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
        return paid;
    }

    // Pushes the remaining stack and reopens action only when the shove increases the bet.
    private int applyAllIn(TournamentState tournament, TournamentPlayerState player) {
        if (player.stack <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player has no chips left");
        }

        var previousBet = tournament.currentBet;
        var paid = contribute(player, player.stack);
        player.status = PlayerStatus.ALL_IN;
        player.awaitingAction = false;
        if (player.roundContribution > previousBet) {
            tournament.currentBet = player.roundContribution;
            reopenAction(tournament, player.seatIndex);
        }
        return paid;
    }

    // Folds the hand and removes the player from further action.
    private int applyFold(TournamentPlayerState player) {
        player.status = PlayerStatus.FOLDED;
        player.awaitingAction = false;
        return 0;
    }

    // Reopens action for remaining active players after a new highest bet appears.
    private void reopenAction(TournamentState tournament, int actorSeat) {
        for (var candidate : tournament.players) {
            candidate.awaitingAction = candidate.status == PlayerStatus.ACTIVE && candidate.seatIndex != actorSeat;
        }
    }

    // Chooses the target round contribution for bet and raise actions.
    private int resolveRaiseTarget(TournamentState tournament, Integer amount) {
        if (amount != null) {
            return amount;
        }
        return tournament.currentBet == 0
                ? rules.bigBlindFor(tournament.levelIndex)
                : tournament.currentBet + rules.bigBlindFor(tournament.levelIndex);
    }

    // Returns how many chips the player still needs to match the current round bet.
    private int chipsToCall(TournamentState tournament, TournamentPlayerState player) {
        return Math.max(0, tournament.currentBet - player.roundContribution);
    }

    // Refreshes the main pot and side pots from all matched contribution tiers.
    private void refreshPots(TournamentState tournament) {
        var overview = potResolver.describePots(tournament.players.stream()
                .map(this::toPotState)
                .toList());
        tournament.mainPot = overview.mainPot();
        tournament.sidePots = new ArrayList<>(overview.sidePots());
    }

    // Resolves the next actor, street transition, or hand-result state after progress.
    private void advanceAfterProgress(
            TournamentState tournament,
            int referenceSeat,
            String tableMessage,
            boolean preserveCurrentActingSeat
    ) {
        if (stateAccess.countContestingPlayers(tournament) <= 1) {
            finishHand(tournament, "One player remains.");
            settleCompletedHand(tournament);
            return;
        }
        if (stateAccess.countPlayersAbleToAct(tournament) == 0) {
            revealFullBoard(tournament);
            finishHand(tournament, "All remaining players are all-in. Showdown is ready.");
            settleCompletedHand(tournament);
            return;
        }

        if (preserveCurrentActingSeat && tournament.actingSeat != null) {
            var actingPlayer = stateAccess.requireSeatPlayer(tournament, tournament.actingSeat);
            if (actingPlayer.status == PlayerStatus.ACTIVE) {
                activateSeat(tournament, tournament.actingSeat, tableMessage);
                return;
            }
        }

        var nextSeat = stateAccess.nextAwaitingSeatAfter(tournament, referenceSeat);
        if (nextSeat != null) {
            activateSeat(tournament, nextSeat, tableMessage);
            return;
        }

        advanceRoundOrFinish(tournament);
    }

    // Advances the board when a betting round is closed or finishes the hand on the river.
    private void advanceRoundOrFinish(TournamentState tournament) {
        if (tournament.round == BettingRound.RIVER) {
            revealFullBoard(tournament);
            finishHand(tournament, "River action is closed. Showdown is ready.");
            settleCompletedHand(tournament);
            return;
        }

        tournament.round = tournament.round.next();
        resetRoundContributions(tournament);
        tournament.currentBet = 0;
        revealBoardForRound(tournament);
        if (stateAccess.countPlayersAbleToAct(tournament) <= 1) {
            revealFullBoard(tournament);
            finishHand(tournament, "Further betting is closed. Showdown is ready.");
            settleCompletedHand(tournament);
            return;
        }

        markAwaitingPlayers(tournament);
        var startSeat = stateAccess.nextActiveSeatAfter(tournament, tournament.dealerSeat == null ? -1 : tournament.dealerSeat);
        activateSeat(tournament, startSeat, tournament.round.openMessage());
    }

    // Settles the finished hand, marks bust-outs, and leaves the table ready for the next hand.
    private void settleCompletedHand(TournamentState tournament) {
        var settlement = potResolver.settle(
                tournament.players.stream().map(this::toPotState).toList(),
                tournament.hiddenBoardCards,
                tournament.dealerSeat
        );
        for (var player : tournament.players) {
            player.stack += settlement.stackCredits().getOrDefault(player.guestId, 0);
        }
        tournament.showdownPots = new ArrayList<>(settlement.showdownPots());

        var bustedPlayers = markBustedPlayers(tournament);
        var summary = buildCompletionMessage(tournament, settlement, bustedPlayers);
        if (stateAccess.countRemainingParticipants(tournament) <= 1) {
            finishTournament(tournament, buildChampionMessage(tournament, stateAccess.combineMessages(tournament.tableMessage, summary)));
            return;
        }
        tournament.tableMessage = stateAccess.combineMessages(tournament.tableMessage, summary);
    }

    // Marks every zero-stack participant as busted out after a settlement step.
    private List<TournamentPlayerState> markBustedPlayers(TournamentState tournament) {
        var bustedPlayers = new ArrayList<TournamentPlayerState>();
        for (var player : tournament.players) {
            if (!player.participating || player.stack > 0) {
                continue;
            }
            player.stack = 0;
            player.participating = false;
            player.status = PlayerStatus.BUSTED_OUT;
            player.acting = false;
            bustedPlayers.add(player);
        }
        return bustedPlayers;
    }

    // Builds the settlement summary shown in the result state after a finished hand.
    private String buildCompletionMessage(
            TournamentState tournament,
            TournamentPotResolver.Settlement settlement,
            List<TournamentPlayerState> bustedPlayers
    ) {
        var fragments = new ArrayList<String>();
        settlement.potAwards().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .forEach(entry -> fragments.add(stateAccess.requirePlayer(tournament, entry.getKey()).nickname + " won " + entry.getValue() + "."));
        if (!bustedPlayers.isEmpty()) {
            fragments.add(bustedPlayers.stream()
                    .map(player -> player.nickname + " busted out.")
                    .collect(Collectors.joining(" ")));
        }
        return String.join(" ", fragments);
    }

    // Builds the terminal winner message once only one participant still has chips.
    private String buildChampionMessage(TournamentState tournament, String prefixMessage) {
        var champion = tournament.players.stream()
                .filter(player -> player.participating && player.stack > 0)
                .findFirst()
                .orElse(null);
        if (champion == null) {
            return prefixMessage == null || prefixMessage.isBlank()
                    ? "Tournament finished."
                    : prefixMessage.trim();
        }
        return stateAccess.combineMessages(prefixMessage, champion.nickname + " wins the tournament.");
    }

    // Clears action affordances and moves the tournament into the terminal state.
    private void finishTournament(TournamentState tournament, String tableMessage) {
        tournament.status = TournamentStatus.FINISHED;
        tournament.actingSeat = null;
        tournament.handResultEndsAtEpochMilli = 0;
        tournament.availableActions = new ArrayList<>();
        stateAccess.setActingPlayer(tournament, null);
        tournament.tableMessage = tableMessage;
    }

    // Clears round-local contributions once a street is complete.
    private void resetRoundContributions(TournamentState tournament) {
        for (var player : tournament.players) {
            player.roundContribution = 0;
            player.awaitingAction = false;
        }
    }

    // Marks every active player with chips as pending action in the current round.
    private void markAwaitingPlayers(TournamentState tournament) {
        for (var player : tournament.players) {
            player.awaitingAction = player.status == PlayerStatus.ACTIVE;
        }
    }

    // Reveals the current number of board cards for the active betting round.
    private void revealBoardForRound(TournamentState tournament) {
        var visibleCards = tournament.round.visibleBoardCards();
        tournament.boardCards = new ArrayList<>(tournament.hiddenBoardCards.subList(0, visibleCards));
    }

    // Reveals all board cards when no further betting action is possible.
    private void revealFullBoard(TournamentState tournament) {
        tournament.boardCards = new ArrayList<>(tournament.hiddenBoardCards);
    }

    // Moves the tournament into hand-result state and clears action affordances.
    private void finishHand(TournamentState tournament, String tableMessage) {
        tournament.status = TournamentStatus.HAND_RESULT;
        tournament.actingSeat = null;
        tournament.handResultEndsAtEpochMilli = Instant.now().toEpochMilli() + HAND_RESULT_DURATION_MILLIS;
        tournament.availableActions = new ArrayList<>();
        stateAccess.setActingPlayer(tournament, null);
        tournament.tableMessage = tableMessage;
    }

    // Converts mutable player state into the pure data structure used for pot resolution.
    private TournamentPotResolver.PlayerPotState toPotState(TournamentPlayerState player) {
        return new TournamentPotResolver.PlayerPotState(
                player.guestId,
                player.nickname,
                player.seatIndex,
                player.totalContribution,
                player.isEligibleForPot(),
                List.copyOf(player.holeCards)
        );
    }

    // Auto-folds any disconnected acting player so the table cannot stall between reconnects.
    private void resolveDisconnectedActors(TournamentState tournament) {
        while (tournament.status == TournamentStatus.IN_HAND && tournament.actingSeat != null) {
            var actingPlayer = stateAccess.requireSeatPlayer(tournament, tournament.actingSeat);
            if (actingPlayer.connected || actingPlayer.status != PlayerStatus.ACTIVE) {
                return;
            }

            actingPlayer.acting = false;
            applyFold(actingPlayer);
            refreshPots(tournament);
            advanceAfterProgress(tournament, actingPlayer.seatIndex, null, false);
            tournament.tableMessage = stateAccess.combineMessages(
                    actingPlayer.nickname + " is disconnected and was auto-folded.",
                    tournament.tableMessage
            );
        }
    }

    // Activates one acting seat, recalculates actions, and resolves disconnected actors.
    private void activateSeat(TournamentState tournament, Integer seatIndex, String tableMessage) {
        tournament.actingSeat = seatIndex;
        stateAccess.setActingPlayer(tournament, seatIndex);
        tournament.availableActions = seatIndex == null
                ? new ArrayList<>()
                : new ArrayList<>(stateAccess.buildAvailableActions(tournament, stateAccess.requireSeatPlayer(tournament, seatIndex)));
        if (tableMessage != null && !tableMessage.isBlank()) {
            tournament.tableMessage = tableMessage;
        }
        resolveDisconnectedActors(tournament);
    }
}
