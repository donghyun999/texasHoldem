package com.texasholdem.tournament.application.hand;

import com.texasholdem.tournament.application.command.TournamentActionResult;
import com.texasholdem.tournament.application.state.TournamentPlayerState;
import com.texasholdem.tournament.application.state.TournamentState;
import com.texasholdem.tournament.application.state.TournamentStateAccess;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public final class TournamentHandEngine {

    private final TournamentStateAccess stateAccess;
    private final TournamentHandSetupManager handSetupManager;
    private final TournamentBettingActionManager bettingActionManager;
    private final TournamentHandResultManager handResultManager;
    private final TournamentHandProgressManager handProgressManager;

    // Wires the hand engine to focused setup, betting, result, and turn-progress collaborators.
    public TournamentHandEngine(
            TournamentStateAccess stateAccess,
            TournamentHandSetupManager handSetupManager,
            TournamentBettingActionManager bettingActionManager,
            TournamentHandResultManager handResultManager,
            TournamentHandProgressManager handProgressManager
    ) {
        this.stateAccess = stateAccess;
        this.handSetupManager = handSetupManager;
        this.bettingActionManager = bettingActionManager;
        this.handResultManager = handResultManager;
        this.handProgressManager = handProgressManager;
    }

    private String describeActionEvent(String action) {
        return switch (action) {
            case "CHECK" -> "checked";
            case "CALL" -> "called";
            case "BET" -> "bet";
            case "RAISE" -> "raised";
            case "ALL_IN" -> "went all in";
            case "FOLD" -> "folded";
            default -> action;
        };
    }

    // Opens a new hand from the current surviving participant set.
    public void openNextHand(TournamentState tournament, String prefixMessage) {
        handSetupManager.preparePlayersForNextHand(tournament);
        if (stateAccess.countRemainingParticipants(tournament) <= 1) {
            handResultManager.moveToFinished(tournament, handResultManager.buildChampionMessage(tournament, prefixMessage));
            return;
        }

        var levelMessage = handSetupManager.initializeHand(tournament);
        handProgressManager.refreshPots(tournament);
        if (stateAccess.countPlayersAbleToAct(tournament) == 0) {
            handSetupManager.revealFullBoard(tournament);
            handResultManager.moveToHandResult(tournament, stateAccess.combineMessages(
                    prefixMessage,
                    levelMessage,
                    "All remaining players are all-in. Showdown is ready."
            ));
            handResultManager.settleCompletedHand(tournament);
            return;
        }

        handProgressManager.activatePreflopAction(
                tournament,
                stateAccess.combineMessages(prefixMessage, levelMessage, "Preflop action is open.")
        );
    }

    // Applies one accepted table action and advances the hand state.
    public TournamentActionResult applyAction(TournamentState tournament, String guestId, String action, Integer amount) {
        if (tournament.status != TournamentStatus.IN_HAND) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is not currently in hand");
        }
        if (tournament.paused) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is paused until the current actor returns");
        }

        var player = stateAccess.requirePlayer(tournament, guestId);
        if (player.afk) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player is AFK and must return before acting");
        }
        return applyActionInternal(
                tournament,
                player,
                action,
                amount,
                player.nickname + " " + describeActionEvent(action) + "."
        );
    }

    // Applies one server-driven automatic action such as an AFK timeout branch.
    public TournamentActionResult applyAutomaticAction(
            TournamentState tournament,
            TournamentPlayerState player,
            String action,
            String tableMessage
    ) {
        return applyActionInternal(tournament, player, action, null, tableMessage);
    }

    private TournamentActionResult applyActionInternal(
            TournamentState tournament,
            TournamentPlayerState player,
            String action,
            Integer amount,
            String tableMessage
    ) {
        if (!player.acting || player.status != PlayerStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player cannot act right now");
        }

        var result = bettingActionManager.applyAction(tournament, player, action, amount);
        player.acting = false;
        handProgressManager.refreshPots(tournament);
        handProgressManager.advanceAfterProgress(
                tournament,
                player.seatIndex,
                tableMessage,
                false
        );
        return result;
    }

    // Applies the forced-fold branch used when an active player disconnects.
    public void applyForcedFold(TournamentState tournament, TournamentPlayerState player, boolean wasActing) {
        handProgressManager.applyForcedFoldAndAdvance(tournament, player, !wasActing);
    }

    // Completes a final pending hand-result window once no further hands can start.
    public void finalizePendingTournamentResult(TournamentState tournament) {
        handResultManager.finalizePendingTournamentResult(tournament);
    }
}
