package com.texasholdem.tournament.application.command;

import com.texasholdem.tournament.application.hand.*;
import com.texasholdem.tournament.application.state.*;
import com.texasholdem.tournament.application.persistence.*;
import com.texasholdem.tournament.application.snapshot.*;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

public final class TournamentLobbyCommandFlow {

    private final TournamentCommandSupport support;
    private final TournamentSnapshotFactory snapshotFactory;
    private final TournamentEventFactory eventFactory;
    private final TournamentStateAccess stateAccess;
    private final TournamentLobbyManager lobbyManager;
    private final TournamentStateStore stateStore;
    private final TournamentHandEngine handEngine;

    TournamentLobbyCommandFlow(
            TournamentCommandSupport support,
            TournamentSnapshotFactory snapshotFactory,
            TournamentEventFactory eventFactory,
            TournamentStateAccess stateAccess,
            TournamentLobbyManager lobbyManager,
            TournamentStateStore stateStore,
            TournamentHandEngine handEngine
    ) {
        this.support = support;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.lobbyManager = lobbyManager;
        this.stateStore = stateStore;
        this.handEngine = handEngine;
    }

    TournamentSnapshot createTournament(String guestId, String nickname) {
        return createTournamentInternal(guestId, nickname, null, null, null, TournamentVisibility.PRIVATE);
    }

    TournamentSnapshot createTournament(String guestId, String nickname, String requestedCode) {
        return createTournamentInternal(guestId, nickname, requestedCode, requestedCode, null, TournamentVisibility.PRIVATE);
    }

    TournamentSnapshot createTournament(
            String guestId,
            String nickname,
            String requestedCode,
            TournamentVisibility visibility
    ) {
        return createTournamentInternal(guestId, nickname, requestedCode, requestedCode, null, visibility);
    }

    TournamentSnapshot createTournament(
            String guestId,
            String nickname,
            String roomName,
            String roomPassword,
            TournamentVisibility visibility
    ) {
        var effectiveVisibility = visibility == null ? TournamentVisibility.PRIVATE : visibility;
        return createTournamentInternal(
                guestId,
                nickname,
                null,
                roomName,
                effectiveVisibility == TournamentVisibility.PRIVATE
                        ? support.requirePrivateRoomPassword(roomPassword)
                        : "",
                effectiveVisibility
        );
    }

    TournamentSnapshot joinTournament(String code, String guestId, String nickname) {
        return joinTournament(code, guestId, nickname, null);
    }

    TournamentSnapshot joinTournament(String code, String guestId, String nickname, String roomPassword) {
        support.cleanupStaleTournaments();
        support.ensureGuestNotInAnotherTournament(guestId, code);
        support.ensureCapacityForNewGuest();
        return support.withLockedTournament("joinTournament", code, tournament -> {
            support.validateJoinPassword(tournament, roomPassword);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            support.saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament, guestId);
        });
    }

    TournamentSnapshot joinPrivateTournament(String roomName, String roomPassword, String guestId, String nickname) {
        support.cleanupStaleTournaments();
        var normalizedRoomName = support.normalizeRoomName(roomName);
        if (normalizedRoomName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "\ubc29 \uc774\ub984\uc744 \uc785\ub825\ud558\uc138\uc694.");
        }

        var tournamentCode = stateStore.findActiveTournamentCodeByRoomName(normalizedRoomName);
        if (tournamentCode == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "\uc7a0\uae08 \ud14c\uc774\ube14\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
        }

        support.ensureGuestNotInAnotherTournament(guestId, tournamentCode);
        support.ensureCapacityForNewGuest();
        return support.withLockedTournament("joinPrivateTournament", tournamentCode, tournament -> {
            if (tournament.visibility != TournamentVisibility.PRIVATE || tournament.status != TournamentStatus.WAITING) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "\uc7a0\uae08 \ud14c\uc774\ube14\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
            }
            if (!support.resolveRoomName(tournament.roomName, tournament.code).equalsIgnoreCase(normalizedRoomName)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "\uc7a0\uae08 \ud14c\uc774\ube14\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
            }
            support.validateJoinPassword(tournament, roomPassword);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            support.saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament, guestId);
        });
    }

    TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname) {
        return joinTournamentBroadcast(code, guestId, nickname, null);
    }

    TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname, String roomPassword) {
        support.cleanupStaleTournaments();
        support.ensureGuestNotInAnotherTournament(guestId, code);
        support.ensureCapacityForNewGuest();
        return support.withLockedTournament("joinTournamentBroadcast", code, tournament -> {
            support.validateJoinPassword(tournament, roomPassword);
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            support.saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "tournamentSnapshot",
                    tournament,
                    Map.of("reason", "playerJoined"),
                    beforeSnapshot
            );
        });
    }

    TournamentBroadcast changeReady(String code, String guestId, boolean ready) {
        return support.withLockedTournament("changeReady", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            lobbyManager.changeReady(tournament, guestId, ready);
            support.saveTournamentState(tournament);
            return eventFactory.createBroadcast("readyChanged", tournament, eventFactory.readyPayload(guestId, ready), beforeSnapshot);
        });
    }

    TournamentBroadcast startTournament(String code, String guestId) {
        return support.withLockedTournament("startTournament", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var expiredEvent = support.advanceExpiredHandResultIfNeeded(tournament, beforeSnapshot);
            if (expiredEvent != null) {
                return expiredEvent;
            }
            lobbyManager.requireOwner(tournament, guestId);
            if (tournament.status == TournamentStatus.HAND_RESULT) {
                if (stateAccess.countRemainingParticipants(tournament) <= 1) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "\ud1a0\ub108\uba3c\ud2b8\uac00 \uc885\ub8cc \ucc98\ub9ac \uc911\uc785\ub2c8\ub2e4.");
                }
                handEngine.openNextHand(tournament, "Next hand started.");
                support.saveTournamentState(tournament);
                return eventFactory.createBroadcast(
                        "handStarted",
                        tournament,
                        eventFactory.participantsPayload((int) stateAccess.countRemainingParticipants(tournament)),
                        beforeSnapshot
                );
            }

            var participants = lobbyManager.startTournament(tournament, guestId);
            handEngine.openNextHand(tournament, "Tournament started.");
            support.saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "handStarted",
                    tournament,
                    eventFactory.participantsPayload(participants),
                    beforeSnapshot
            );
        });
    }

    private TournamentSnapshot createTournamentInternal(
            String guestId,
            String nickname,
            String requestedCode,
            String requestedRoomName,
            String requestedRoomPassword,
            TournamentVisibility visibility
    ) {
        support.cleanupStaleTournaments();
        support.ensureGuestNotInAnotherTournament(guestId, null);
        support.ensureCapacityForNewGuest();
        var code = support.resolveTournamentCode(requestedCode);
        var roomName = support.resolveRoomName(requestedRoomName, code);
        support.ensureRoomNameNotInAnotherTournament(roomName, null);
        var tournament = lobbyManager.createTournament(
                code,
                roomName,
                support.normalizeRoomPassword(requestedRoomPassword),
                guestId,
                nickname,
                visibility == null ? TournamentVisibility.PRIVATE : visibility
        );
        support.registerTournament(tournament);
        support.saveTournamentState(tournament);
        return snapshotFactory.toSnapshot(tournament, guestId);
    }
}
