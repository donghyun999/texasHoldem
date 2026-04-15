package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

final class TournamentConnectionCommandFlow {

    private final TournamentCommandSupport support;
    private final TournamentSnapshotFactory snapshotFactory;
    private final TournamentEventFactory eventFactory;
    private final TournamentStateAccess stateAccess;
    private final TournamentConnectionManager connectionManager;
    private final TournamentHandProgressManager handProgressManager;

    TournamentConnectionCommandFlow(
            TournamentCommandSupport support,
            TournamentSnapshotFactory snapshotFactory,
            TournamentEventFactory eventFactory,
            TournamentStateAccess stateAccess,
            TournamentConnectionManager connectionManager,
            TournamentHandProgressManager handProgressManager
    ) {
        this.support = support;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.connectionManager = connectionManager;
        this.handProgressManager = handProgressManager;
    }

    TournamentBroadcast disconnectPlayer(String code, String guestId) {
        return support.withLockedTournament("disconnectPlayer", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var expiredHandResultBroadcast = support.advanceExpiredHandResultForBroadcastIfNeeded(tournament, beforeSnapshot);
            var normalizedBeforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var change = connectionManager.disconnect(tournament, guestId);
            if (change.deleteTournament()) {
                support.deleteTournament(tournament.code);
            } else {
                support.saveTournamentState(tournament);
            }
            return support.mergeBroadcasts(
                    expiredHandResultBroadcast,
                    eventFactory.createBroadcast(
                            "playerDisconnected",
                            tournament,
                            eventFactory.connectionPayload(change),
                            normalizedBeforeSnapshot
                    )
            );
        });
    }

    TournamentBroadcast reconnectPlayer(String code, String guestId) {
        return support.withLockedTournament("reconnectPlayer", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var expiredHandResultBroadcast = support.advanceExpiredHandResultForBroadcastIfNeeded(tournament, beforeSnapshot);
            var normalizedBeforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var change = connectionManager.reconnect(tournament, guestId);
            support.saveTournamentState(tournament);
            return support.mergeBroadcasts(
                    expiredHandResultBroadcast,
                    eventFactory.createBroadcast(
                            "playerReconnected",
                            tournament,
                            eventFactory.connectionPayload(change),
                            normalizedBeforeSnapshot
                    )
            );
        });
    }

    TournamentBroadcast returnPlayerToPlay(String code, String guestId) {
        return support.withLockedTournament("returnPlayerToPlay", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var player = stateAccess.requirePlayer(tournament, guestId);
            if (!player.connected) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "\ud50c\ub808\uc774\uc5b4\ub294 \uba3c\uc800 \ub2e4\uc2dc \uc5f0\uacb0\ub418\uc5b4\uc57c \ud569\ub2c8\ub2e4."
                );
            }
            if (!player.afk) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "\ud50c\ub808\uc774\uc5b4\ub294 \uc774\ubbf8 \ud65c\uc131 \uc0c1\ud0dc\uc785\ub2c8\ub2e4."
                );
            }

            player.afk = false;
            if (tournament.status == TournamentStatus.IN_HAND) {
                handProgressManager.resumePausedHandIfPossible(tournament, player);
            } else {
                tournament.tableMessage = stateAccess.combineMessages(player.nickname + " returned to play.", tournament.tableMessage);
            }
            support.saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "playerReturned",
                    tournament,
                    Map.of("guestId", guestId, "afk", false),
                    beforeSnapshot
            );
        });
    }
}
