package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Function;

final class TournamentCommandSupport {

    private static final Logger log = LoggerFactory.getLogger(TournamentCommandSupport.class);

    private final ConcurrentMap<String, TournamentState> tournaments;
    private final TournamentIdentityFactory identityFactory;
    private final TournamentSnapshotFactory snapshotFactory;
    private final TournamentEventFactory eventFactory;
    private final TournamentStateAccess stateAccess;
    private final TournamentHandEngine handEngine;
    private final TournamentCommandLock commandLock;
    private final TournamentStateStore stateStore;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActivePlayers;
    private final long waitingIdleTtlMillis;
    private final long inHandIdleTtlMillis;
    private final long hardTtlMillis;
    private final long commandLockSlowThresholdMillis;

    TournamentCommandSupport(
            ConcurrentMap<String, TournamentState> tournaments,
            TournamentIdentityFactory identityFactory,
            TournamentSnapshotFactory snapshotFactory,
            TournamentEventFactory eventFactory,
            TournamentStateAccess stateAccess,
            TournamentHandEngine handEngine,
            TournamentCommandLock commandLock,
            TournamentStateStore stateStore,
            ApplicationEventPublisher eventPublisher,
            int maxActivePlayers,
            long waitingIdleTtlMillis,
            long inHandIdleTtlMillis,
            long hardTtlMillis,
            long commandLockSlowThresholdMillis
    ) {
        this.tournaments = tournaments;
        this.identityFactory = identityFactory;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.handEngine = handEngine;
        this.commandLock = commandLock;
        this.stateStore = stateStore;
        this.eventPublisher = eventPublisher;
        this.maxActivePlayers = maxActivePlayers;
        this.waitingIdleTtlMillis = waitingIdleTtlMillis;
        this.inHandIdleTtlMillis = inHandIdleTtlMillis;
        this.hardTtlMillis = hardTtlMillis;
        this.commandLockSlowThresholdMillis = commandLockSlowThresholdMillis;
    }

    GuestSession registerGuest(String nickname) {
        return identityFactory.registerGuest(nickname);
    }

    String normalizeNickname(String nickname) {
        return identityFactory.normalizeNickname(nickname);
    }

    String normalizeRoomName(String roomName) {
        return identityFactory.normalizeRoomName(roomName);
    }

    String normalizeRoomPassword(String roomPassword) {
        return identityFactory.normalizeRoomPassword(roomPassword);
    }

    String hashRoomPassword(String roomPassword) {
        return identityFactory.hashRoomPassword(roomPassword);
    }

    String resolveTournamentCode(String requestedCode) {
        return identityFactory.resolveTournamentCode(requestedCode, this::isTournamentCodeReserved);
    }

    boolean matchesRoomPassword(String roomPassword, String storedRoomPassword) {
        return identityFactory.matchesRoomPassword(roomPassword, storedRoomPassword);
    }

    String resolveRoomName(String requestedRoomName, String fallbackCode) {
        var normalizedRoomName = normalizeRoomName(requestedRoomName);
        return normalizedRoomName.isBlank() ? fallbackCode : normalizedRoomName;
    }

    String requirePrivateRoomPassword(String roomPassword) {
        var normalizedRoomPassword = normalizeRoomPassword(roomPassword);
        if (normalizedRoomPassword.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "\ubc29 \ube44\ubc00\ubc88\ud638\uac00 \ud544\uc694\ud569\ub2c8\ub2e4.");
        }
        return hashRoomPassword(normalizedRoomPassword);
    }

    TournamentState requireTournament(String code) {
        var tournament = refreshTournament(normalizeCode(code));
        if (tournament == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "\ud1a0\ub108\uba3c\ud2b8\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
        }
        return tournament;
    }

    TournamentState findTournament(String code) {
        return refreshTournament(normalizeCode(code));
    }

    void registerTournament(TournamentState tournament) {
        tournaments.put(tournament.code, tournament);
    }

    void deleteTournament(String code) {
        var normalizedCode = normalizeCode(code);
        tournaments.remove(normalizedCode);
        stateStore.delete(normalizedCode);
    }

    void ensureGuestNotInAnotherTournament(String guestId, String allowedCode) {
        var activeTournamentCode = stateStore.findActiveTournamentCodeByGuestId(guestId);
        if (activeTournamentCode == null) {
            return;
        }
        if (allowedCode != null && activeTournamentCode.equalsIgnoreCase(allowedCode.trim())) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "\uc774\ubbf8 \ub2e4\ub978 \ud1a0\ub108\uba3c\ud2b8\uc5d0 \ucc38\uc5ec \uc911\uc785\ub2c8\ub2e4.");
    }

    void ensureRoomNameNotInAnotherTournament(String roomName, String allowedCode) {
        var activeTournamentCode = stateStore.findActiveTournamentCodeByRoomName(roomName);
        if (activeTournamentCode == null) {
            return;
        }
        if (allowedCode != null && activeTournamentCode.equalsIgnoreCase(allowedCode.trim())) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "\uc774\ubbf8 \uc0ac\uc6a9 \uc911\uc778 \ubc29 \uc774\ub984\uc785\ub2c8\ub2e4.");
    }

    void ensureCapacityForNewGuest() {
        if (maxActivePlayers <= 0) {
            return;
        }
        if (stateStore.countActiveGuests() < maxActivePlayers) {
            return;
        }
        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "\ud1a0\ub108\uba3c\ud2b8 \uc11c\ubc84 \uc218\uc6a9 \uc778\uc6d0\uc774 \uac00\ub4dd \ucc3c\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud558\uc138\uc694."
        );
    }

    boolean isTournamentCodeReserved(String code) {
        var normalizedCode = normalizeCode(code);
        var inMemoryTournament = tournaments.get(normalizedCode);
        if (inMemoryTournament != null) {
            return inMemoryTournament.status != TournamentStatus.FINISHED;
        }

        var persistedTournament = stateStore.load(normalizedCode);
        return persistedTournament != null && persistedTournament.status != TournamentStatus.FINISHED;
    }

    void validateJoinPassword(TournamentState tournament, String roomPassword) {
        if (tournament.visibility != TournamentVisibility.PRIVATE) {
            return;
        }
        if (!matchesRoomPassword(roomPassword, tournament.roomPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "\ube44\ubc00\ubc88\ud638\uac00 \uc77c\uce58\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.");
        }
    }

    void saveTournamentState(TournamentState tournament) {
        tournament.stateVersion++;
        stateStore.save(tournament);
        publishStateChange(tournament);
    }

    void publishStateChange(TournamentState tournament) {
        eventPublisher.publishEvent(new TournamentStateChangedEvent(
                tournament.code,
                tournament.status,
                tournament.actionDeadlineAtEpochMilli,
                tournament.handResultEndsAtEpochMilli,
                tournament.finishedCleanupAtEpochMilli
        ));
    }

    TournamentBroadcast advanceExpiredHandResultIfNeeded(
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

    TournamentBroadcast advanceExpiredHandResultForBroadcastIfNeeded(
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

    TournamentBroadcast advanceResultState(TournamentState tournament, TournamentSnapshot beforeSnapshot) {
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

    TournamentBroadcast mergeBroadcasts(TournamentBroadcast first, TournamentBroadcast second) {
        if (first == null) {
            return second;
        }
        var mergedEvents = new java.util.ArrayList<>(first.events());
        mergedEvents.addAll(second.events());
        return new TournamentBroadcast(mergedEvents);
    }

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
        staleCodes.forEach(this::deleteTournament);
    }

    <T> T withLockedTournament(String operationName, String code, Function<TournamentState, T> action) {
        var normalizedCode = normalizeCode(code);
        var waitStartedAt = System.nanoTime();
        final long[] acquiredAtHolder = new long[1];
        return commandLock.withLock(normalizedCode, () -> {
            acquiredAtHolder[0] = System.nanoTime();
            var tournament = requireTournament(normalizedCode);
            synchronized (tournament) {
                try {
                    return action.apply(tournament);
                } finally {
                    logSlowTournamentCommand(operationName, normalizedCode, waitStartedAt, acquiredAtHolder[0]);
                }
            }
        });
    }

    <T> T withLockedTournamentIfPresent(String operationName, String code, Function<TournamentState, T> action) {
        var normalizedCode = normalizeCode(code);
        var waitStartedAt = System.nanoTime();
        final long[] acquiredAtHolder = new long[1];
        return commandLock.withLock(normalizedCode, () -> {
            acquiredAtHolder[0] = System.nanoTime();
            var tournament = findTournament(normalizedCode);
            if (tournament == null) {
                logSlowTournamentCommand(operationName, normalizedCode, waitStartedAt, acquiredAtHolder[0]);
                return null;
            }
            synchronized (tournament) {
                try {
                    return action.apply(tournament);
                } finally {
                    logSlowTournamentCommand(operationName, normalizedCode, waitStartedAt, acquiredAtHolder[0]);
                }
            }
        });
    }

    private String normalizeCode(String code) {
        return code.trim().toUpperCase();
    }

    private TournamentState refreshTournament(String normalizedCode) {
        var tournament = stateStore.load(normalizedCode);
        if (tournament == null) {
            tournaments.remove(normalizedCode);
            return null;
        }
        tournaments.put(normalizedCode, tournament);
        return tournament;
    }

    private void logSlowTournamentCommand(
            String operationName,
            String normalizedCode,
            long waitStartedAt,
            long acquiredAt
    ) {
        if (commandLockSlowThresholdMillis <= 0) {
            return;
        }

        var finishedAt = System.nanoTime();
        var waitedMs = nanosToMillis(acquiredAt - waitStartedAt);
        var heldMs = nanosToMillis(finishedAt - acquiredAt);
        var totalMs = waitedMs + heldMs;
        if (totalMs < commandLockSlowThresholdMillis) {
            return;
        }

        log.warn(
                "Slow tournament command lock path: operation={}, code={}, waitedMs={}, heldMs={}, totalMs={}",
                operationName,
                normalizedCode,
                waitedMs,
                heldMs,
                totalMs
        );
    }

    private long nanosToMillis(long nanos) {
        return nanos <= 0 ? 0 : nanos / 1_000_000L;
    }
}
