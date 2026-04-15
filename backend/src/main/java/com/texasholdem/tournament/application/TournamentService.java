package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.ActiveTournamentSession;
import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.PublicTournamentSummary;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.function.Function;

@Service
public class TournamentService {

    private static final Logger log = LoggerFactory.getLogger(TournamentService.class);

    private final ConcurrentMap<String, TournamentState> tournaments = new ConcurrentHashMap<>();
    private final TournamentIdentityFactory identityFactory;
    private final TournamentSnapshotFactory snapshotFactory;
    private final TournamentEventFactory eventFactory;
    private final TournamentStateAccess stateAccess;
    private final TournamentLobbyManager lobbyManager;
    private final TournamentConnectionManager connectionManager;
    private final TournamentHandEngine handEngine;
    private final TournamentHandProgressManager handProgressManager;
    private final TournamentCommandLock commandLock;
    private final TournamentStateStore stateStore;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActivePlayers;
    private final long waitingIdleTtlMillis;
    private final long inHandIdleTtlMillis;
    private final long hardTtlMillis;
    private final long commandLockSlowThresholdMillis;

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
            TournamentCommandLock commandLock,
            TournamentStateStore stateStore,
            ApplicationEventPublisher eventPublisher,
            @Value("${app.tournament.max-active-players:50}") int maxActivePlayers,
            @Value("${app.tournament.waiting-idle-ttl-seconds:1800}") long waitingIdleTtlSeconds,
            @Value("${app.tournament.in-hand-idle-ttl-seconds:7200}") long inHandIdleTtlSeconds,
            @Value("${app.tournament.action-timeout-seconds:20}") long actionTimeoutSeconds,
            @Value("${app.tournament.hard-ttl-seconds:86400}") long hardTtlSeconds,
            @Value("${app.tournament.command-lock-slow-threshold-ms:150}") long commandLockSlowThresholdMillis
    ) {
        this.identityFactory = identityFactory;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.lobbyManager = lobbyManager;
        this.connectionManager = connectionManager;
        this.handEngine = handEngine;
        this.handProgressManager = handProgressManager;
        this.commandLock = commandLock;
        this.stateStore = stateStore;
        this.eventPublisher = eventPublisher;
        this.maxActivePlayers = maxActivePlayers;
        this.waitingIdleTtlMillis = ttlToMillis(waitingIdleTtlSeconds);
        this.inHandIdleTtlMillis = ttlToMillis(inHandIdleTtlSeconds);
        this.hardTtlMillis = ttlToMillis(hardTtlSeconds);
        this.commandLockSlowThresholdMillis = Math.max(0, commandLockSlowThresholdMillis);
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
            return new ActiveTournamentSession(guestId, tournament.code, tournament.roomName, tournament.status);
        }
    }

    // Lists public waiting rooms that are currently joinable from the home lobby.
    public java.util.List<PublicTournamentSummary> listPublicWaitingTournaments() {
        cleanupStaleTournaments();
        return stateStore.findPublicWaitingTournaments(stateAccess.maxSeats());
    }

    // Creates a waiting tournament and seats the owner immediately.
    public TournamentSnapshot createTournament(String guestId, String nickname) {
        return createTournamentInternal(guestId, nickname, null, null, null, TournamentVisibility.PRIVATE);
    }

    // Creates a waiting tournament and optionally reserves the caller-supplied code.
    public TournamentSnapshot createTournament(String guestId, String nickname, String requestedCode) {
        return createTournamentInternal(guestId, nickname, requestedCode, requestedCode, null, TournamentVisibility.PRIVATE);
    }

    // Creates a waiting tournament with one public or private lobby policy.
    public TournamentSnapshot createTournament(
            String guestId,
            String nickname,
            String requestedCode,
            TournamentVisibility visibility
    ) {
        return createTournamentInternal(guestId, nickname, requestedCode, requestedCode, null, visibility);
    }

    // Creates a waiting tournament using one player-facing room title and optional private-room password.
    public TournamentSnapshot createTournament(
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
                        ? requirePrivateRoomPassword(roomPassword)
                        : "",
                effectiveVisibility
        );
    }

    private TournamentSnapshot createTournamentInternal(
            String guestId,
            String nickname,
            String requestedCode,
            String requestedRoomName,
            String requestedRoomPassword,
            TournamentVisibility visibility
    ) {
        cleanupStaleTournaments();
        ensureGuestNotInAnotherTournament(guestId, null);
        ensureCapacityForNewGuest();
        var code = identityFactory.resolveTournamentCode(requestedCode, currentCode ->
                isTournamentCodeReserved(currentCode)
        );
        var roomName = resolveRoomName(requestedRoomName, code);
        ensureRoomNameNotInAnotherTournament(roomName, null);
        var tournament = lobbyManager.createTournament(
                code,
                roomName,
                identityFactory.normalizeRoomPassword(requestedRoomPassword),
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
        return withLockedTournament("getTournament", code, tournament -> {
            advanceExpiredHandResultIfNeeded(tournament, snapshotFactory.toSnapshot(tournament));
            publishStateChange(tournament);
            return snapshotFactory.toSnapshot(tournament, viewerGuestId);
        });
    }

    // Seats a guest into the next available seat while the tournament is waiting.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname) {
        return joinTournament(code, guestId, nickname, null);
    }

    // Seats a guest into the next available seat while validating private-room password requirements.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname, String roomPassword) {
        cleanupStaleTournaments();
        ensureGuestNotInAnotherTournament(guestId, code);
        ensureCapacityForNewGuest();
        return withLockedTournament("joinTournament", code, tournament -> {
            validateJoinPassword(tournament, roomPassword);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament, guestId);
        });
    }

    // Seats a guest into one private waiting room located by title and guarded by its password.
    public TournamentSnapshot joinPrivateTournament(String roomName, String roomPassword, String guestId, String nickname) {
        cleanupStaleTournaments();
        var normalizedRoomName = identityFactory.normalizeRoomName(roomName);
        if (normalizedRoomName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "방 이름을 입력하세요.");
        }

        var tournamentCode = stateStore.findActiveTournamentCodeByRoomName(normalizedRoomName);
        if (tournamentCode == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "잠금 테이블을 찾을 수 없습니다.");
        }

        ensureGuestNotInAnotherTournament(guestId, tournamentCode);
        ensureCapacityForNewGuest();
        return withLockedTournament("joinPrivateTournament", tournamentCode, tournament -> {
            if (tournament.visibility != TournamentVisibility.PRIVATE || tournament.status != TournamentStatus.WAITING) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "잠금 테이블을 찾을 수 없습니다.");
            }
            if (!resolveRoomName(tournament.roomName, tournament.code).equalsIgnoreCase(normalizedRoomName)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "잠금 테이블을 찾을 수 없습니다.");
            }
            validateJoinPassword(tournament, roomPassword);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return snapshotFactory.toSnapshot(tournament, guestId);
        });
    }

    // Seats a guest and returns the broadcast bundle so waiting-room subscribers can refresh immediately.
    public TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname) {
        return joinTournamentBroadcast(code, guestId, nickname, null);
    }

    // Seats a guest and returns the broadcast bundle so waiting-room subscribers can refresh immediately.
    public TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname, String roomPassword) {
        cleanupStaleTournaments();
        ensureGuestNotInAnotherTournament(guestId, code);
        ensureCapacityForNewGuest();
        return withLockedTournament("joinTournamentBroadcast", code, tournament -> {
            validateJoinPassword(tournament, roomPassword);
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            lobbyManager.joinTournament(tournament, guestId, nickname);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "tournamentSnapshot",
                    tournament,
                    Map.of("reason", "playerJoined"),
                    beforeSnapshot
            );
        });
    }

    // Toggles the ready flag for a seated player before the tournament starts.
    public TournamentBroadcast changeReady(String code, String guestId, boolean ready) {
        return withLockedTournament("changeReady", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            lobbyManager.changeReady(tournament, guestId, ready);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast("readyChanged", tournament, eventFactory.readyPayload(guestId, ready), beforeSnapshot);
        });
    }

    // Applies explicit disconnect handling for waiting-room exits and active-hand fallbacks.
    public TournamentBroadcast disconnectPlayer(String code, String guestId) {
        return withLockedTournament("disconnectPlayer", code, tournament -> {
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
        });
    }

    // Restores a disconnected player into the current tournament snapshot without changing chips.
    public TournamentBroadcast reconnectPlayer(String code, String guestId) {
        return withLockedTournament("reconnectPlayer", code, tournament -> {
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
        });
    }

    // Restores an AFK player to manual control for future turns without changing chips or seat ownership.
    public TournamentBroadcast returnPlayerToPlay(String code, String guestId) {
        return withLockedTournament("returnPlayerToPlay", code, tournament -> {
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
        });
    }

    // Converts ready players into active participants and opens the first hand.
    public TournamentBroadcast startTournament(String code, String guestId) {
        return withLockedTournament("startTournament", code, tournament -> {
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
        });
    }

    // Applies a betting action, updates contributions, and advances the hand state.
    public TournamentBroadcast applyAction(String code, String guestId, String action, Integer amount) {
        return withLockedTournament("applyAction", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var result = handEngine.applyAction(tournament, guestId, action, amount);
            saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "actionApplied",
                    tournament,
                    eventFactory.actionPayload(guestId, result.action(), result.amount()),
                    beforeSnapshot
            );
        });
    }

    // Auto-applies one AFK timeout action when the acting player misses the current decision window.
    TournamentBroadcast autoTimeoutActingPlayer(String code, long expectedDeadlineEpochMilli) {
        return withLockedTournamentIfPresent("autoTimeoutActingPlayer", code, tournament -> {
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
        });
    }

    // Advances one expired hand-result state into the next live hand for async transitions.
    TournamentBroadcast autoAdvanceHandResult(String code, long expectedDeadlineEpochMilli) {
        return withLockedTournament("autoAdvanceHandResult", code, tournament -> {
            if (tournament.status != TournamentStatus.HAND_RESULT
                    || tournament.handResultEndsAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.handResultEndsAtEpochMilli > Instant.now().toEpochMilli()) {
                return null;
            }

            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            return advanceResultState(tournament, beforeSnapshot);
        });
    }

    // Deletes one finished tournament once its short result-retention window expires.
    boolean cleanupFinishedTournament(String code, long expectedDeadlineEpochMilli) {
        return withLockedTournamentIfPresent("cleanupFinishedTournament", code, tournament -> {
            if (tournament.status != TournamentStatus.FINISHED
                    || tournament.finishedCleanupAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.finishedCleanupAtEpochMilli == 0
                    || tournament.finishedCleanupAtEpochMilli > Instant.now().toEpochMilli()) {
                return false;
            }

            tournaments.remove(tournament.code, tournament);
            stateStore.delete(tournament.code);
            return true;
        });
    }

    // Resolves a tournament code into its mutable state container.
    private TournamentState requireTournament(String code) {
        var tournament = refreshTournament(normalizeCode(code));
        if (tournament == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "토너먼트를 찾을 수 없습니다.");
        }
        return tournament;
    }

    // Resolves a tournament code into its mutable state container when it still exists.
    private TournamentState findTournament(String code) {
        return refreshTournament(normalizeCode(code));
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
        throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 다른 토너먼트에 참여 중입니다.");
    }

    // Rejects room-title collisions while another non-finished tournament is already using the same name.
    private void ensureRoomNameNotInAnotherTournament(String roomName, String allowedCode) {
        var activeTournamentCode = stateStore.findActiveTournamentCodeByRoomName(roomName);
        if (activeTournamentCode == null) {
            return;
        }
        if (allowedCode != null && activeTournamentCode.equalsIgnoreCase(allowedCode.trim())) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 방 이름입니다.");
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
                "토너먼트 서버 수용 인원이 가득 찼습니다. 잠시 후 다시 시도하세요."
        );
    }

    // Treats finished tournaments as reusable so the same public code can host a later tournament.
    private boolean isTournamentCodeReserved(String code) {
        var normalizedCode = normalizeCode(code);
        var inMemoryTournament = tournaments.get(normalizedCode);
        if (inMemoryTournament != null) {
            return inMemoryTournament.status != TournamentStatus.FINISHED;
        }

        var persistedTournament = stateStore.load(normalizedCode);
        return persistedTournament != null && persistedTournament.status != TournamentStatus.FINISHED;
    }

    private String resolveRoomName(String requestedRoomName, String fallbackCode) {
        var normalizedRoomName = identityFactory.normalizeRoomName(requestedRoomName);
        return normalizedRoomName.isBlank() ? fallbackCode : normalizedRoomName;
    }

    private boolean passwordMatches(TournamentState tournament, String roomPassword) {
        return identityFactory.matchesRoomPassword(roomPassword, tournament.roomPassword);
    }

    private String requirePrivateRoomPassword(String roomPassword) {
        var normalizedRoomPassword = identityFactory.normalizeRoomPassword(roomPassword);
        if (normalizedRoomPassword.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "잠금 테이블은 비밀번호가 필요합니다.");
        }
        return identityFactory.hashRoomPassword(normalizedRoomPassword);
    }

    private void validateJoinPassword(TournamentState tournament, String roomPassword) {
        if (tournament.visibility != TournamentVisibility.PRIVATE) {
            return;
        }
        if (!passwordMatches(tournament, roomPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비밀번호가 일치하지 않습니다.");
        }
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

    private <T> T withLockedTournament(String operationName, String code, Function<TournamentState, T> action) {
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

    private <T> T withLockedTournamentIfPresent(String operationName, String code, Function<TournamentState, T> action) {
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
