package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

@Component
final class TournamentBettingActionManager {

    private final TournamentRules rules;

    // Wires betting action rules to the shared blind and stack configuration.
    TournamentBettingActionManager(TournamentRules rules) {
        this.rules = rules;
    }

    // Applies one player action against the current betting round state.
    TournamentActionResult applyAction(
            TournamentState tournament,
            TournamentPlayerState player,
            String action,
            Integer amount
    ) {
        var normalizedAction = action.trim().toUpperCase(Locale.ROOT);
        var contribution = switch (normalizedAction) {
            case "CHECK" -> applyCheck(tournament, player);
            case "CALL" -> applyCall(tournament, player);
            case "BET", "RAISE" -> applyRaise(tournament, player, amount);
            case "ALL_IN" -> applyAllIn(tournament, player);
            case "FOLD" -> applyFold(player);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported action: " + normalizedAction);
        };
        return new TournamentActionResult(normalizedAction, contribution);
    }

    // Folds the hand and removes the player from further action.
    void applyForcedFold(TournamentPlayerState player) {
        applyFold(player);
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
}
