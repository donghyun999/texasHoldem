package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.ActiveTournamentSession;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;
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
    private final int maxActivePlayers;

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
            ApplicationEventPublisher eventPublisher,
            @Value("${app.tournament.max-active-players:50}") int maxActivePlayers
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
        this.maxActivePlayers = maxActivePlayers;
    }

    // Issues a lightweight guest identity for the tournament flow.
    public GuestSession registerGuest(String nickname) {
        return identityFactory.registerGuest(nickname);
    }

    // Returns the active non-finished tournament already occupied by the guest, when one exists.
    public ActiveTournamentSession findActiveTournament(String guestId) {
        var activeTournamentCode = stateStore.findActiveTournamentCodeByGuestId(guestId);
        if (activeTournamentCode == null) {
            return null;
        }

        var tournament = requireTournament(activeTournamentCode);
        synchronized (tournament) {
            return new ActiveTournamentSession(guestId, tournament.code, tournament.status);
        }
    }

    // Creates a waiting tournament and seats the owner immediately.
    public TournamentSnapshot createTournament(String guestId, String nickname) {
        return createTournament(guestId, nickname, null);
    }

    // Creates a waiting tournament and optionally reserves the caller-supplied code.
    public TournamentSnapshot createTournament(String guestId, String nickname, String requestedCode) {
        ensureGuestNotInAnotherTournament(guestId, null);
        ensureCapacityForNewGuest();
        var code = identityFactory.resolveTournamentCode(requestedCode, currentCode ->
                isTournamentCodeReserved(currentCode)
        );
        var tournament = lobbyManager.createTournament(code, guestId, nickname);
        tournaments.put(code, tournament);
        saveTournamentState(tournament);
        return snapshotFactory.toSnapshot(tournament);
    }

    // Returns the latest server-side snapshot for a tournament code.
    public TournamentSnapshot getTournament(String code) {
        return getTournament(code, null);
    }

    // Returns the latest server-side snapshot for a tournament code and optional viewing guest.
    public TournamentSnapshot getTournament(String code, String viewerGuestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            advanceExpiredHandResultIfNeeded(tournament, snapshotFactory.toSnapshot(tournament));
            publishStateChange(tournament);
            return snapshotFactory.toSnapshot(tournament, viewerGuestId);
        }
    }

    // Seats a guest into the next available seat while the tournament is waiting.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname) {
        ensureGuestNotInAnotherTournament(guestId, code);
        ensureCapacityForNewGuest();
        var tournament = requireTournament(code);
        synchronized (tournament) {
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament);
        }
    }

    // Seats a guest and returns the broadcast bundle so waiting-room subscribers can refresh immediately.
    public TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname) {
        ensureGuestNotInAnotherTournament(guestId, code);
        ensureCapacityForNewGuest();
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "tournamentSnapshot",
                    tournament,
                    Map.of("reason", "playerJoined"),
                    beforeSnapshot
            );
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
            var expiredHandResultBroadcast = advanceExpiredHandResultForBroadcastIfNeeded(tournament, beforeSnapshot);
            var normalizedBeforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var change = connectionManager.disconnect(tournament, guestId);
            if (change.deleteTournament()) {
                tournaments.remove(tournament.code);
                stateStore.delete(tournament.code);
            } else {
                saveTournamentState(tournament);
            }
            return mergeBroadcasts(
                    expiredHandResultBroadcast,
                    eventFactory.createBroadcast(
                    "playerDisconnected",
                    tournament,
                    eventFactory.connectionPayload(change),
                    normalizedBeforeSnapshot
                    )
            );
        }
    }

    // Restores a disconnected player into the current tournament snapshot without changing chips.
    public TournamentBroadcast reconnectPlayer(String code, String guestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var expiredHandResultBroadcast = advanceExpiredHandResultForBroadcastIfNeeded(tournament, beforeSnapshot);
            var normalizedBeforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var change = connectionManager.reconnect(tournament, guestId);
            saveTournamentState(tournament);
            return mergeBroadcasts(
                    expiredHandResultBroadcast,
                    eventFactory.createBroadcast(
                    "playerReconnected",
                    tournament,
                    eventFactory.connectionPayload(change),
                    normalizedBeforeSnapshot
                    )
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
                if (stateAccess.countRemainingParticipants(tournament) <= 1) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is waiting to finish");
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
            return advanceResultState(tournament, beforeSnapshot);
        }
    }

    // Deletes one finished tournament once its short result-retention window expires.
    boolean cleanupFinishedTournament(String code, long expectedDeadlineEpochMilli) {
        var tournament = findTournament(code);
        if (tournament == null) {
            return false;
        }

        synchronized (tournament) {
            if (tournament.status != TournamentStatus.FINISHED
                    || tournament.finishedCleanupAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.finishedCleanupAtEpochMilli == 0
                    || tournament.finishedCleanupAtEpochMilli > Instant.now().toEpochMilli()) {
                return false;
            }

            tournaments.remove(tournament.code, tournament);
            stateStore.delete(tournament.code);
            return true;
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

    // Resolves a tournament code into its mutable state container when it still exists.
    private TournamentState findTournament(String code) {
        var normalizedCode = code.trim().toUpperCase();
        return tournaments.computeIfAbsent(normalizedCode, stateStore::load);
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

    // Rejects new tournament entries once the configured active-player cap is reached.
    private void ensureCapacityForNewGuest() {
        if (maxActivePlayers <= 0) {
            return;
        }
        if (stateStore.countActiveGuests() < maxActivePlayers) {
            return;
        }
        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Tournament service is at capacity. Please try again later."
        );
    }

    // Treats finished tournaments as reusable so the same public code can host a later tournament.
    private boolean isTournamentCodeReserved(String code) {
        var inMemoryTournament = tournaments.get(code);
        if (inMemoryTournament != null) {
            return inMemoryTournament.status != TournamentStatus.FINISHED;
        }

        var persistedTournament = stateStore.load(code);
        return persistedTournament != null && persistedTournament.status != TournamentStatus.FINISHED;
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
                tournament.handResultEndsAtEpochMilli,
                tournament.finishedCleanupAtEpochMilli
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

        return advanceResultState(tournament, beforeSnapshot);
    }

    // Converts one expired result window into the next hand when a reconnect or disconnect hits stale state.
    private TournamentBroadcast advanceExpiredHandResultForBroadcastIfNeeded(
            TournamentState tournament,
            TournamentSnapshot beforeSnapshot
    ) {
        if (tournament.status != TournamentStatus.HAND_RESULT
                || tournament.handResultEndsAtEpochMilli == 0
                || tournament.handResultEndsAtEpochMilli > Instant.now().toEpochMilli()) {
            return null;
        }

        return advanceResultState(tournament, beforeSnapshot);
    }

    // Advances an expired result window either into the next hand or into the final finished state.
    private TournamentBroadcast advanceResultState(TournamentState tournament, TournamentSnapshot beforeSnapshot) {
        if (stateAccess.countRemainingParticipants(tournament) <= 1) {
            handEngine.finalizePendingTournamentResult(tournament);
            var finishedSnapshot = snapshotFactory.toSnapshot(tournament);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "tournamentFinished",
                    tournament,
                    eventFactory.tournamentFinishedPayload(finishedSnapshot),
                    beforeSnapshot
            );
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

    // Merges sequential broadcast bundles so one reconnect/disconnect can surface stale-result recovery first.
    private TournamentBroadcast mergeBroadcasts(TournamentBroadcast first, TournamentBroadcast second) {
        if (first == null) {
            return second;
        }
        var mergedEvents = new java.util.ArrayList<>(first.events());
        mergedEvents.addAll(second.events());
        return new TournamentBroadcast(mergedEvents);
    }
}
