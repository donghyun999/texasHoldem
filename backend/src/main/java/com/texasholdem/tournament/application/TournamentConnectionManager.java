package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
final class TournamentConnectionManager {

    private final TournamentStateAccess stateAccess;
    private final TournamentOwnershipManager ownershipManager;
    private final TournamentHandEngine handEngine;

    // Wires connection transitions to ownership and hand-resolution collaborators.
    TournamentConnectionManager(
            TournamentStateAccess stateAccess,
            TournamentOwnershipManager ownershipManager,
            TournamentHandEngine handEngine
    ) {
        this.stateAccess = stateAccess;
        this.ownershipManager = ownershipManager;
        this.handEngine = handEngine;
    }

    // Removes or marks one player disconnected depending on the current tournament state.
    TournamentConnectionChange disconnect(TournamentState tournament, String guestId) {
        if (tournament.status == TournamentStatus.WAITING) {
            return disconnectWaitingPlayer(tournament, guestId);
        }

        var player = stateAccess.requirePlayer(tournament, guestId);
        if (!player.connected) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player is already disconnected");
        }

        player.connected = false;
        var delegatedOwner = ownershipManager.clearAndReassignOwnerIfNeeded(tournament, player);
        if (tournament.status == TournamentStatus.IN_HAND && player.status == PlayerStatus.ACTIVE) {
            var wasActing = player.acting;
            player.acting = false;
            handEngine.applyForcedFold(tournament, player, wasActing);
            tournament.tableMessage = stateAccess.combineMessages(
                    player.nickname + " disconnected and was folded.",
                    ownershipManager.buildOwnerDelegationMessage(delegatedOwner),
                    tournament.tableMessage
            );
        } else {
            tournament.tableMessage = stateAccess.combineMessages(
                    player.nickname + " disconnected.",
                    ownershipManager.buildOwnerDelegationMessage(delegatedOwner)
            );
        }

        return new TournamentConnectionChange(
                guestId,
                false,
                false,
                delegatedOwner == null ? null : delegatedOwner.guestId,
                false
        );
    }

    // Restores one disconnected player into the current tournament snapshot.
    TournamentConnectionChange reconnect(TournamentState tournament, String guestId) {
        var player = stateAccess.requirePlayer(tournament, guestId);
        if (player.connected) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player is already connected");
        }

        player.connected = true;
        var delegatedOwner = ownershipManager.assignOwnerIfMissing(tournament);
        tournament.tableMessage = stateAccess.combineMessages(
                player.nickname + " reconnected.",
                ownershipManager.buildOwnerDelegationMessage(delegatedOwner)
        );
        return new TournamentConnectionChange(
                guestId,
                true,
                false,
                delegatedOwner == null ? null : delegatedOwner.guestId,
                false
        );
    }

    // Removes a waiting-room player immediately and reassigns ownership when needed.
    private TournamentConnectionChange disconnectWaitingPlayer(TournamentState tournament, String guestId) {
        var player = stateAccess.requirePlayer(tournament, guestId);
        tournament.players.remove(player);
        var delegatedOwner = ownershipManager.clearAndReassignOwnerIfNeeded(tournament, player);
        tournament.tableMessage = stateAccess.combineMessages(
                player.nickname + " left the waiting room.",
                ownershipManager.buildOwnerDelegationMessage(delegatedOwner)
        );
        return new TournamentConnectionChange(
                guestId,
                false,
                true,
                delegatedOwner == null ? null : delegatedOwner.guestId,
                tournament.players.isEmpty()
        );
    }
}
