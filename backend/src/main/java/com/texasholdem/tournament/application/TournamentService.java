package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.ActiveTournamentSession;
import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.PublicTournamentSummary;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
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
    private final TournamentHandProgressManager handProgressManager;
    private final TournamentStateStore stateStore;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActivePlayers;
    private final long waitingIdleTtlMillis;
    private final long inHandIdleTtlMillis;
    private final long hardTtlMillis;

    // Wires the tournament orchestrator to the focused lifecycle and hand collaborators.
    public TournamentService(
            TournamentIdentityFactory identityFactory,
            TournamentSnapshotFactory snapshotFactory,
            TournamentEventFactory eventFactory,
            TournamentStateAccess stateAccess,
            TournamentLobbyManager lobbyManager,
            TournamentConnectionManager connectionManager,
            TournamentHandEngine handEngine,
            TournamentHandProgressManager handProgressManager,
            TournamentStateStore stateStore,
            ApplicationEventPublisher eventPublisher,
            @Value("${app.tournament.max-active-players:50}") int maxActivePlayers,
            @Value("${app.tournament.waiting-idle-ttl-seconds:1800}") long waitingIdleTtlSeconds,
            @Value("${app.tournament.in-hand-idle-ttl-seconds:7200}") long inHandIdleTtlSeconds,
            @Value("${app.tournament.action-timeout-seconds:20}") long actionTimeoutSeconds,
            @Value("${app.tournament.hard-ttl-seconds:86400}") long hardTtlSeconds
    ) {
        this.identityFactory = identityFactory;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.lobbyManager = lobbyManager;
        this.connectionManager = connectionManager;
        this.handEngine = handEngine;
        this.handProgressManager = handProgressManager;
        this.stateStore = stateStore;
        this.eventPublisher = eventPublisher;
        this.maxActivePlayers = maxActivePlayers;
        this.waitingIdleTtlMillis = ttlToMillis(waitingIdleTtlSeconds);
        this.inHandIdleTtlMillis = ttlToMillis(inHandIdleTtlSeconds);
        this.hardTtlMillis = ttlToMillis(hardTtlSeconds);
    }

    // Issues a lightweight guest identity for the tournament flow.
    public GuestSession registerGuest(String nickname) {
        return identityFactory.registerGuest(nickname);
    }

    // Clears stale persisted tournaments once the app is ready to serve traffic.
    @EventListener(ApplicationReadyEvent.class)
    void cleanupStaleTournamentsOnStartup() {
        cleanupStaleTournaments();
    }

    // Returns the active non-finished tournament already occupied by the guest, when one exists.
    public ActiveTournamentSession findActiveTournament(String guestId) {
        cleanupStaleTournaments();
        var activeTournamentCode = stateStore.findActiveTournamentCodeByGuestId(guestId);
        if (activeTournamentCode == null) {
            return null;
        }

        var tournament = requireTournament(activeTournamentCode);
        synchronized (tournament) {
            return new ActiveTournamentSession(guestId, tournament.code, tournament.status);
        }
    }

    // Lists public waiting rooms that are currently joinable from the home lobby.
    public java.util.List<PublicTournamentSummary> listPublicWaitingTournaments() {
        cleanupStaleTournaments();
        return stateStore.findPublicWaitingTournaments(stateAccess.maxSeats());
    }

    // Creates a waiting tournament and seats the owner immediately.
    public TournamentSnapshot createTournament(String guestId, String nickname) {
        return createTournament(guestId, nickname, null, TournamentVisibility.PRIVATE);
    }

    // Creates a waiting tournament and optionally reserves the caller-supplied code.
    public TournamentSnapshot createTournament(String guestId, String nickname, String requestedCode) {
        return createTournament(guestId, nickname, requestedCode, TournamentVisibility.PRIVATE);
    }

    // Creates a waiting tournament with one public or private lobby policy.
    public TournamentSnapshot createTournament(
            String guestId,
            String nickname,
            String requestedCode,
            TournamentVisibility visibility
    ) {
        cleanupStaleTournaments();
        ensureGuestNotInAnotherTournament(guestId, null);
        ensureCapacityForNewGuest();
        var code = identityFactory.resolveTournamentCode(requestedCode, currentCode ->
                isTournamentCodeReserved(currentCode)
        );
        var tournament = lobbyManager.createTournament(
                code,
                guestId,
                nickname,
                visibility == null ? TournamentVisibility.PRIVATE : visibility
        );
        tournaments.put(code, tournament);
        saveTournamentState(tournament);
        return snapshotFactory.toSnapshot(tournament, guestId);
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
        cleanupStaleTournaments();
        ensureGuestNotInAnotherTournament(guestId, code);
        ensureCapacityForNewGuest();
        var tournament = requireTournament(code);
        synchronized (tournament) {
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament, guestId);
        }
    }

    // Seats a guest and returns the broadcast bundle so waiting-room subscribers can refresh immediately.
    public TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname) {
        cleanupStaleTournaments();
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

    // Restores an AFK player to manual control for future turns without changing chips or seat ownership.
    public TournamentBroadcast returnPlayerToPlay(String code, String guestId) {
        var tournament = requireTournament(code);
        synchronized (tournament) {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var player = stateAccess.requirePlayer(tournament, guestId);
            if (!player.connected) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player must reconnect before returning to play");
            }
            if (!player.afk) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Player is already active");
            }

            player.afk = false;
            if (tournament.status == TournamentStatus.IN_HAND) {
                handProgressManager.resumePausedHandIfPossible(tournament, player);
            } else {
                tournament.tableMessage = stateAccess.combineMessages(player.nickname + " returned to play.", tournament.tableMessage);
            }
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "playerReturned",
                    tournament,
                    Map.of("guestId", guestId, "afk", false),
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

    // Auto-applies one AFK timeout action when the acting player misses the current decision window.
    TournamentBroadcast autoTimeoutActingPlayer(String code, long expectedDeadlineEpochMilli) {
        var tournament = findTournament(code);
        if (tournament == null) {
            return null;
        }

        synchronized (tournament) {
            if (tournament.status != TournamentStatus.IN_HAND
                    || tournament.actionDeadlineAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.actionDeadlineAtEpochMilli == 0
                    || tournament.actionDeadlineAtEpochMilli > Instant.now().toEpochMilli()
                    || tournament.actingSeat == null) {
                return null;
            }

            var actingPlayer = stateAccess.requireSeatPlayer(tournament, tournament.actingSeat);
            if (actingPlayer.status != PlayerStatus.ACTIVE || !actingPlayer.connected || actingPlayer.afk) {
                return null;
            }

            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            actingPlayer.afk = true;
            var automaticAction = beforeSnapshot.availableActions().contains("CHECK") ? "CHECK" : "FOLD";
            var result = handEngine.applyAutomaticAction(
                    tournament,
                    actingPlayer,
                    automaticAction,
                    automaticAction.equals("CHECK")
                            ? actingPlayer.nickname + " timed out, became AFK, and was auto-checked."
                            : actingPlayer.nickname + " timed out, became AFK, and was auto-folded."
            );
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "actionApplied",
                    tournament,
                    Map.of(
                            "guestId", actingPlayer.guestId,
                            "action", result.action(),
                            "amount", result.amount(),
                            "reason", "timeout",
                            "afk", true
                    ),
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
        tournament.stateVersion++;
        stateStore.save(tournament);
        publishStateChange(tournament);
    }

    // Broadcasts the latest transition metadata so result auto-advance can schedule or cancel safely.
    private void publishStateChange(TournamentState tournament) {
        eventPublisher.publishEvent(new TournamentStateChangedEvent(
                tournament.code,
                tournament.status,
                tournament.actionDeadlineAtEpochMilli,
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

    // Deletes stale waiting and abandoned in-hand tournaments whose update timestamp exceeded the TTL policy.
    void cleanupStaleTournaments() {
        if (waitingIdleTtlMillis <= 0 && inHandIdleTtlMillis <= 0 && hardTtlMillis <= 0) {
            return;
        }

        var staleCodes = stateStore.findStaleTournamentCodes(
                Instant.now().toEpochMilli(),
                waitingIdleTtlMillis,
                inHandIdleTtlMillis,
                hardTtlMillis
        );
        staleCodes.forEach(code -> {
            tournaments.remove(code);
            stateStore.delete(code);
        });
    }

    private long ttlToMillis(long ttlSeconds) {
        return ttlSeconds <= 0 ? 0 : ttlSeconds * 1_000L;
    }
}
