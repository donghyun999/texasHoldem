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
            case "BET", "RAISE" -> applyWager(tournament, player, normalizedAction, amount);
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
        if (TournamentBetSizing.chipsToCall(tournament, player) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose call, raise, or fold.");
        }
        player.awaitingAction = false;
        player.raiseRightsAvailable = false;
        return 0;
    }

    // Matches the current bet and allows short all-in calls when the stack is not enough.
    private int applyCall(TournamentState tournament, TournamentPlayerState player) {
        var chipsToCall = TournamentBetSizing.chipsToCall(tournament, player);
        if (chipsToCall <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to call.");
        }
        var paid = contribute(player, chipsToCall);
        player.awaitingAction = false;
        player.raiseRightsAvailable = false;
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
        return paid;
    }

    // Raises the round bet to a target contribution and reopens action for others.
    private int applyWager(TournamentState tournament, TournamentPlayerState player, String action, Integer amount) {
        if ("BET".equals(action) && tournament.currentBet > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bet is only available before the round has a wager.");
        }
        if ("RAISE".equals(action) && tournament.currentBet == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise is only available after a wager exists.");
        }
        if (!player.raiseRightsAvailable) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player does not currently have raise rights.");
        }

        var targetContribution = resolveRaiseTarget(tournament, amount);
        var minimumTargetContribution = TournamentBetSizing.minimumTotalContributionForFullRaise(rules, tournament);
        if (targetContribution <= tournament.currentBet) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise must be above the current bet.");
        }
        if (targetContribution < minimumTargetContribution) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Raise must be at least " + minimumTargetContribution + "."
            );
        }

        var additionalChips = targetContribution - player.roundContribution;
        if (additionalChips <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player already satisfies that raise target.");
        }
        if (additionalChips > player.stack) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Raise amount exceeds the remaining stack.");
        }

        var previousBet = tournament.currentBet;
        var paid = contribute(player, additionalChips);
        tournament.currentBet = player.roundContribution;
        tournament.lastFullRaiseSize = player.roundContribution - previousBet;
        player.awaitingAction = false;
        player.raiseRightsAvailable = false;
        offerResponseToChangedBet(tournament, player.seatIndex, true);
        if (player.stack == 0) {
            player.status = PlayerStatus.ALL_IN;
        }
        return paid;
    }

    // Pushes the remaining stack and reopens action only when the shove increases the bet.
    private int applyAllIn(TournamentState tournament, TournamentPlayerState player) {
        if (player.stack <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No chips remaining.");
        }

        var previousBet = tournament.currentBet;
        var minimumRaiseIncrement = TournamentBetSizing.minimumRaiseIncrement(rules, tournament);
        var paid = contribute(player, player.stack);
        player.status = PlayerStatus.ALL_IN;
        player.awaitingAction = false;
        player.raiseRightsAvailable = false;
        if (player.roundContribution > previousBet) {
            var wagerIncrease = player.roundContribution - previousBet;
            tournament.currentBet = player.roundContribution;
            if (wagerIncrease >= minimumRaiseIncrement) {
                tournament.lastFullRaiseSize = wagerIncrease;
                offerResponseToChangedBet(tournament, player.seatIndex, true);
            } else {
                offerResponseToChangedBet(tournament, player.seatIndex, false);
            }
        }
        return paid;
    }

    // Folds the hand and removes the player from further action.
    private int applyFold(TournamentPlayerState player) {
        player.status = PlayerStatus.FOLDED;
        player.awaitingAction = false;
        player.raiseRightsAvailable = false;
        return 0;
    }

    // Marks which active players still owe a response after the table price changes.
    private void offerResponseToChangedBet(TournamentState tournament, int actorSeat, boolean reopenRaiseRights) {
        for (var candidate : tournament.players) {
            if (candidate.status != PlayerStatus.ACTIVE || candidate.seatIndex == actorSeat) {
                candidate.awaitingAction = false;
                continue;
            }
            candidate.awaitingAction = candidate.roundContribution < tournament.currentBet;
            if (reopenRaiseRights) {
                candidate.raiseRightsAvailable = candidate.awaitingAction;
            }
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
        return TournamentBetSizing.minimumTotalContributionForFullRaise(rules, tournament);
    }
}
