package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class TournamentService {

    private final ConcurrentMap<String, TournamentState> tournaments = new ConcurrentHashMap<>();
    private final TournamentIdentityFactory identityFactory;
    private final TournamentSnapshotFactory snapshotFactory;
    private final TournamentEventFactory eventFactory;
    private final TournamentStateAccess stateAccess;
    private final TournamentLobbyManager lobbyManager;
    private final TournamentConnectionManager connectionManager;
    private final TournamentHandEngine handEngine;
    private final TournamentStateStore stateStore;
    private final ApplicationEventPublisher eventPublisher;

    // Wires the tournament orchestrator to the focused lifecycle and hand collaborators.
    public TournamentService(
            TournamentIdentityFactory identityFactory,
            TournamentSnapshotFactory snapshotFactory,
            TournamentEventFactory eventFactory,
            TournamentStateAccess stateAccess,
            TournamentLobbyManager lobbyManager,
            TournamentConnectionManager connectionManager,
            TournamentHandEngine handEngine,
            TournamentStateStore stateStore,
            ApplicationEventPublisher eventPublisher
    ) {
        this.identityFactory = identityFactory;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.lobbyManager = lobbyManager;
        this.connectionManager = connectionManager;
        this.handEngine = handEngine;
        this.stateStore = stateStore;
        this.eventPublisher = eventPublisher;
    }

    // Issues a lightweight guest identity for the tournament flow.
    public GuestSession registerGuest(String nickname) {
        return identityFactory.registerGuest(nickname);
    }

    // Creates a waiting tournament and seats the owner immediately.
    public TournamentSnapshot createTournament(String guestId, String nickname) {
        ensureGuestNotInAnotherTournament(guestId, null);
        var code = identityFactory.nextTournamentCode(currentCode ->
                tournaments.containsKey(currentCode) || stateStore.exists(currentCode)
        );
        var tournament = lobbyManager.createTournament(code, guestId, nickname);
        tournaments.put(code, tournament);
        saveTournamentState(tournament);
        return snapshotFactory.toSnapshot(tournament);
    }

    // Returns the latest server-side snapshot for a tournament code.
    public TournamentSnapshot getTournament(String code) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            advanceExpiredHandResultIfNeeded(tournament, snapshotFactory.toSnapshot(tournament));
            publishStateChange(tournament);
            return snapshotFactory.toSnapshot(tournament);
        }
    }

    // Seats a guest into the next available seat while the tournament is waiting.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname) {
        ensureGuestNotInAnotherTournament(guestId, code);
        var tournament = requireTournament(code);
        synchronized (tournament) {
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament);
        }
    }

    // Toggles the ready flag for a seated player before the tournament starts.
    public TournamentBroadcast changeReady(String code, String guestId, boolean ready) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            lobbyManager.changeReady(tournament, guestId, ready);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast("readyChanged", tournament, eventFactory.readyPayload(guestId, ready), beforeSnapshot);
        }
    }

    // Applies explicit disconnect handling for waiting-room exits and active-hand fallbacks.
    public TournamentBroadcast disconnectPlayer(String code, String guestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var change = connectionManager.disconnect(tournament, guestId);
            if (change.deleteTournament()) {
                tournaments.remove(tournament.code);
                stateStore.delete(tournament.code);
            } else {
                saveTournamentState(tournament);
            }
            return eventFactory.createBroadcast(
                    "playerDisconnected",
                    tournament,
                    eventFactory.connectionPayload(change),
                    beforeSnapshot
            );
        }
    }

    // Restores a disconnected player into the current tournament snapshot without changing chips.
    public TournamentBroadcast reconnectPlayer(String code, String guestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var change = connectionManager.reconnect(tournament, guestId);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "playerReconnected",
                    tournament,
                    eventFactory.connectionPayload(change),
                    beforeSnapshot
            );
        }
    }

    // Converts ready players into active participants and opens the first hand.
    public TournamentBroadcast startTournament(String code, String guestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var expiredEvent = advanceExpiredHandResultIfNeeded(tournament, beforeSnapshot);
            if (expiredEvent != null) {
                return expiredEvent;
            }
            lobbyManager.requireOwner(tournament, guestId);
            if (tournament.status == TournamentStatus.HAND_RESULT) {
                handEngine.openNextHand(tournament, "Next hand started.");
                saveTournamentState(tournament);
                return eventFactory.createBroadcast(
                        "handStarted",
                        tournament,
                        eventFactory.participantsPayload((int) stateAccess.countRemainingParticipants(tournament)),
                        beforeSnapshot
                );
            }

            var participants = lobbyManager.startTournament(tournament, guestId);
            handEngine.openNextHand(tournament, "Tournament started.");
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "handStarted",
                    tournament,
                    eventFactory.participantsPayload(participants),
                    beforeSnapshot
            );
        }
    }

    // Applies a betting action, updates contributions, and advances the hand state.
    public TournamentBroadcast applyAction(String code, String guestId, String action, Integer amount) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var result = handEngine.applyAction(tournament, guestId, action, amount);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "actionApplied",
                    tournament,
                    eventFactory.actionPayload(guestId, result.action(), result.amount()),
                    beforeSnapshot
            );
        }
    }

    // Advances one expired hand-result state into the next live hand for async transitions.
    TournamentBroadcast autoAdvanceHandResult(String code, long expectedDeadlineEpochMilli) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            if (tournament.status != TournamentStatus.HAND_RESULT
                    || tournament.handResultEndsAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.handResultEndsAtEpochMilli > Instant.now().toEpochMilli()) {
                return null;
            }

            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            handEngine.openNextHand(tournament, "Next hand started.");
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "handStarted",
                    tournament,
                    eventFactory.participantsPayload((int) stateAccess.countRemainingParticipants(tournament)),
                    beforeSnapshot
            );
        }
    }

    // Resolves a tournament code into its mutable state container.
    private TournamentState requireTournament(String code) {
        var normalizedCode = code.trim().toUpperCase();
        var tournament = tournaments.computeIfAbsent(normalizedCode, stateStore::load);
        if (tournament == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tournament not found");
        }
        return tournament;
    }

    // Rejects cross-tournament creates and joins while the guest still occupies another live tournament.
    private void ensureGuestNotInAnotherTournament(String guestId, String allowedCode) {
        var activeTournamentCode = stateStore.findActiveTournamentCodeByGuestId(guestId);
        if (activeTournamentCode == null) {
            return;
        }
        if (allowedCode != null && activeTournamentCode.equalsIgnoreCase(allowedCode.trim())) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Guest is already participating in another tournament");
    }

    // Persists one tournament mutation and emits the scheduling hint used by auto-advance listeners.
    private void saveTournamentState(TournamentState tournament) {
        stateStore.save(tournament);
        publishStateChange(tournament);
    }

    // Broadcasts the latest transition metadata so result auto-advance can schedule or cancel safely.
    private void publishStateChange(TournamentState tournament) {
        eventPublisher.publishEvent(new TournamentStateChangedEvent(
                tournament.code,
                tournament.status,
                tournament.handResultEndsAtEpochMilli
        ));
    }

    // Converts an already-expired result state into the next hand before stale snapshots leak back out.
    private TournamentBroadcast advanceExpiredHandResultIfNeeded(
            TournamentState tournament,
            TournamentSnapshot beforeSnapshot
    ) {
        if (tournament.status != TournamentStatus.HAND_RESULT
                || tournament.handResultEndsAtEpochMilli == 0
                || tournament.handResultEndsAtEpochMilli > Instant.now().toEpochMilli()) {
            return null;
        }

        handEngine.openNextHand(tournament, "Next hand started.");
        saveTournamentState(tournament);
        return eventFactory.createBroadcast(
                "handStarted",
                tournament,
                eventFactory.participantsPayload((int) stateAccess.countRemainingParticipants(tournament)),
                beforeSnapshot
        );
    }
}
