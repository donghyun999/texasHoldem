package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
final class TournamentHandProgressManager {

    private final TournamentStateAccess stateAccess;
    private final TournamentPotResolver potResolver;
    private final TournamentHandSetupManager handSetupManager;
    private final TournamentBettingActionManager bettingActionManager;
    private final TournamentHandResultManager handResultManager;

    // Wires hand progression to pot refresh, turn activation, and result transitions.
    TournamentHandProgressManager(
            TournamentStateAccess stateAccess,
            TournamentPotResolver potResolver,
            TournamentHandSetupManager handSetupManager,
            TournamentBettingActionManager bettingActionManager,
            TournamentHandResultManager handResultManager
    ) {
        this.stateAccess = stateAccess;
        this.potResolver = potResolver;
        this.handSetupManager = handSetupManager;
        this.bettingActionManager = bettingActionManager;
        this.handResultManager = handResultManager;
    }

    // Refreshes the main pot and side pots from all matched contribution tiers.
    void refreshPots(TournamentState tournament) {
        var overview = potResolver.describePots(tournament.players.stream()
                .map(this::toPotState)
                .toList());
        tournament.mainPot = overview.mainPot();
        tournament.sidePots = new ArrayList<>(overview.sidePots());
    }

    // Activates the first preflop actor after one fresh hand setup step.
    void activatePreflopAction(TournamentState tournament, String tableMessage) {
        var startSeat = stateAccess.nextAwaitingSeatAfter(
                tournament,
                tournament.bigBlindSeat == null ? -1 : tournament.bigBlindSeat
        );
        activateSeat(tournament, startSeat, tableMessage);
    }

    // Resolves the next actor, street transition, or hand-result state after progress.
    void advanceAfterProgress(
            TournamentState tournament,
            int referenceSeat,
            String tableMessage,
            boolean preserveCurrentActingSeat
    ) {
        if (stateAccess.countContestingPlayers(tournament) <= 1) {
            handResultManager.moveToHandResult(tournament, "One player remains.");
            handResultManager.settleCompletedHand(tournament);
            return;
        }
        if (stateAccess.countPlayersAbleToAct(tournament) == 0) {
            handSetupManager.revealFullBoard(tournament);
            handResultManager.moveToHandResult(tournament, "All remaining players are all-in. Showdown is ready.");
            handResultManager.settleCompletedHand(tournament);
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

    // Applies a disconnect fold and advances the hand without leaving stale turn state behind.
    void applyForcedFoldAndAdvance(TournamentState tournament, TournamentPlayerState player, boolean preserveCurrentActingSeat) {
        bettingActionManager.applyForcedFold(player);
        refreshPots(tournament);
        advanceAfterProgress(tournament, player.seatIndex, null, preserveCurrentActingSeat);
    }

    // Advances the board when a betting round is closed or finishes the hand on the river.
    private void advanceRoundOrFinish(TournamentState tournament) {
        if (tournament.round == BettingRound.RIVER) {
            handSetupManager.revealFullBoard(tournament);
            handResultManager.moveToHandResult(tournament, "River action is closed. Showdown is ready.");
            handResultManager.settleCompletedHand(tournament);
            return;
        }

        handSetupManager.openNextRound(tournament);
        if (stateAccess.countPlayersAbleToAct(tournament) <= 1) {
            handSetupManager.revealFullBoard(tournament);
            handResultManager.moveToHandResult(tournament, "Further betting is closed. Showdown is ready.");
            handResultManager.settleCompletedHand(tournament);
            return;
        }

        var startSeat = stateAccess.nextActiveSeatAfter(tournament, tournament.dealerSeat == null ? -1 : tournament.dealerSeat);
        activateSeat(tournament, startSeat, tournament.round.openMessage());
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

    // Auto-folds any disconnected acting player so the table cannot stall between reconnects.
    private void resolveDisconnectedActors(TournamentState tournament) {
        while (tournament.status == TournamentStatus.IN_HAND && tournament.actingSeat != null) {
            var actingPlayer = stateAccess.requireSeatPlayer(tournament, tournament.actingSeat);
            if (actingPlayer.connected || actingPlayer.status != PlayerStatus.ACTIVE) {
                return;
            }

            actingPlayer.acting = false;
            bettingActionManager.applyForcedFold(actingPlayer);
            refreshPots(tournament);
            advanceAfterProgress(tournament, actingPlayer.seatIndex, null, false);
            tournament.tableMessage = stateAccess.combineMessages(
                    actingPlayer.nickname + " is disconnected and was auto-folded.",
                    tournament.tableMessage
            );
        }
    }

    // Converts mutable player state into the pure data structure used for pot snapshots.
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
}
