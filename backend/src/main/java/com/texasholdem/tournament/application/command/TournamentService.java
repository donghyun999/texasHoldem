package com.texasholdem.tournament.application.command;

import com.texasholdem.tournament.application.hand.*;
import com.texasholdem.tournament.application.state.*;
import com.texasholdem.tournament.application.persistence.*;
import com.texasholdem.tournament.application.runtime.*;
import com.texasholdem.tournament.application.snapshot.*;
import com.texasholdem.tournament.domain.ActiveTournamentSession;
import com.texasholdem.tournament.domain.GuestSession;
import com.texasholdem.tournament.domain.PublicTournamentSummary;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

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
    private final TournamentCommandLock commandLock;
    private final TournamentStateStore stateStore;
    private final ApplicationEventPublisher eventPublisher;
    private final int maxActivePlayers;
    private final long commandLockSlowThresholdMillis;
    private final TournamentCommandSupport commandSupport;
    private final TournamentLobbyCommandFlow lobbyCommandFlow;
    private final TournamentConnectionCommandFlow connectionCommandFlow;
    private final TournamentHandCommandFlow handCommandFlow;

    // Wires the tournament orchestrator to focused lifecycle and command flows.
    @Autowired
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
            TournamentCleanupService cleanupService,
            TournamentServiceProperties properties,
            @Value("${app.tournament.max-active-players:50}") int maxActivePlayers,
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
        this.commandLockSlowThresholdMillis = Math.max(0, commandLockSlowThresholdMillis);
        this.commandSupport = new TournamentCommandSupport(
                tournaments,
                identityFactory,
                snapshotFactory,
                eventFactory,
                stateAccess,
                handEngine,
                commandLock,
                stateStore,
                eventPublisher,
                cleanupService,
                maxActivePlayers,
                properties.waitingIdleTtlMillis(),
                properties.inHandIdleTtlMillis(),
                properties.hardTtlMillis(),
                this.commandLockSlowThresholdMillis
        );
        this.lobbyCommandFlow = new TournamentLobbyCommandFlow(
                commandSupport,
                snapshotFactory,
                eventFactory,
                stateAccess,
                lobbyManager,
                stateStore,
                handEngine
        );
        this.connectionCommandFlow = new TournamentConnectionCommandFlow(
                commandSupport,
                snapshotFactory,
                eventFactory,
                stateAccess,
                connectionManager,
                handProgressManager
        );
        this.handCommandFlow = new TournamentHandCommandFlow(
                commandSupport,
                snapshotFactory,
                eventFactory,
                stateAccess,
                handEngine
        );
    }

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
            int maxActivePlayers,
            long waitingIdleTtlSeconds,
            long inHandIdleTtlSeconds,
            long cleanupMinIntervalMillis,
            long hardTtlSeconds,
            long commandLockSlowThresholdMillis
    ) {
        this(
                identityFactory,
                snapshotFactory,
                eventFactory,
                stateAccess,
                lobbyManager,
                connectionManager,
                handEngine,
                handProgressManager,
                commandLock,
                stateStore,
                eventPublisher,
                new TournamentCleanupService(
                        stateStore,
                        new TournamentServiceProperties(
                                waitingIdleTtlSeconds,
                                inHandIdleTtlSeconds,
                                hardTtlSeconds
                        ),
                        cleanupMinIntervalMillis
                ),
                new TournamentServiceProperties(
                        waitingIdleTtlSeconds,
                        inHandIdleTtlSeconds,
                        hardTtlSeconds
                ),
                maxActivePlayers,
                commandLockSlowThresholdMillis
        );
    }

    // Issues a lightweight guest identity for the tournament flow.
    public GuestSession registerGuest(String nickname) {
        return commandSupport.registerGuest(nickname);
    }

    // Returns the active non-finished tournament already occupied by the guest, when one exists.
    public ActiveTournamentSession findActiveTournament(String guestId) {
        commandSupport.cleanupStaleTournamentsIfDue();
        var activeTournamentCode = stateStore.findActiveTournamentCodeByGuestId(guestId);
        if (activeTournamentCode == null) {
            return null;
        }

        var tournament = commandSupport.requireTournament(activeTournamentCode);
        synchronized (tournament) {
            return new ActiveTournamentSession(guestId, tournament.code, tournament.roomName, tournament.status);
        }
    }

    // Lists public waiting rooms that are currently joinable from the home lobby.
    public java.util.List<PublicTournamentSummary> listPublicWaitingTournaments() {
        commandSupport.cleanupStaleTournamentsIfDue();
        return stateStore.findPublicWaitingTournaments(stateAccess.maxSeats());
    }

    // Creates a waiting tournament and seats the owner immediately.
    public TournamentSnapshot createTournament(String guestId, String nickname) {
        return lobbyCommandFlow.createTournament(guestId, nickname);
    }

    // Creates a waiting tournament and optionally reserves the caller-supplied code.
    public TournamentSnapshot createTournament(String guestId, String nickname, String requestedCode) {
        return lobbyCommandFlow.createTournament(guestId, nickname, requestedCode);
    }

    // Creates a waiting tournament with one public or private lobby policy.
    public TournamentSnapshot createTournament(
            String guestId,
            String nickname,
            String requestedCode,
            TournamentVisibility visibility
    ) {
        return lobbyCommandFlow.createTournament(guestId, nickname, requestedCode, visibility);
    }

    // Creates a waiting tournament using one player-facing room title and optional private-room password.
    public TournamentSnapshot createTournament(
            String guestId,
            String nickname,
            String roomName,
            String roomPassword,
            TournamentVisibility visibility
    ) {
        return lobbyCommandFlow.createTournament(guestId, nickname, roomName, roomPassword, visibility);
    }

    // Returns the latest server-side snapshot for a tournament code.
    public TournamentSnapshot getTournament(String code) {
        return getTournament(code, null);
    }

    // Returns the latest server-side snapshot for a tournament code and optional viewing guest.
    public TournamentSnapshot getTournament(String code, String viewerGuestId) {
        return commandSupport.withLockedTournament("getTournament", code, tournament -> {
            commandSupport.advanceExpiredHandResultIfNeeded(tournament, snapshotFactory.toSnapshot(tournament));
            commandSupport.publishStateChange(tournament);
            return snapshotFactory.toSnapshot(tournament, viewerGuestId);
        });
    }

    // Seats a guest into the next available seat while the tournament is waiting.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname) {
        return lobbyCommandFlow.joinTournament(code, guestId, nickname);
    }

    // Seats a guest into the next available seat while validating private-room password requirements.
    public TournamentSnapshot joinTournament(String code, String guestId, String nickname, String roomPassword) {
        return lobbyCommandFlow.joinTournament(code, guestId, nickname, roomPassword);
    }

    // Seats a guest into one private waiting room located by title and guarded by its password.
    public TournamentSnapshot joinPrivateTournament(String roomName, String roomPassword, String guestId, String nickname) {
        return lobbyCommandFlow.joinPrivateTournament(roomName, roomPassword, guestId, nickname);
    }

    // Seats a guest and returns the broadcast bundle so waiting-room subscribers can refresh immediately.
    public TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname) {
        return lobbyCommandFlow.joinTournamentBroadcast(code, guestId, nickname);
    }

    // Seats a guest and returns the broadcast bundle so waiting-room subscribers can refresh immediately.
    public TournamentBroadcast joinTournamentBroadcast(String code, String guestId, String nickname, String roomPassword) {
        return lobbyCommandFlow.joinTournamentBroadcast(code, guestId, nickname, roomPassword);
    }

    // Toggles the ready flag for a seated player before the tournament starts.
    public TournamentBroadcast changeReady(String code, String guestId, boolean ready) {
        return lobbyCommandFlow.changeReady(code, guestId, ready);
    }

    // Applies explicit disconnect handling for waiting-room exits and active-hand fallbacks.
    public TournamentBroadcast disconnectPlayer(String code, String guestId) {
        return connectionCommandFlow.disconnectPlayer(code, guestId);
    }

    // Restores a disconnected player into the current tournament snapshot without changing chips.
    public TournamentBroadcast reconnectPlayer(String code, String guestId) {
        return connectionCommandFlow.reconnectPlayer(code, guestId);
    }

    // Restores an AFK player to manual control for future turns without changing chips or seat ownership.
    public TournamentBroadcast returnPlayerToPlay(String code, String guestId) {
        return connectionCommandFlow.returnPlayerToPlay(code, guestId);
    }

    // Converts ready players into active participants and opens the first hand.
    public TournamentBroadcast startTournament(String code, String guestId) {
        return lobbyCommandFlow.startTournament(code, guestId);
    }

    // Applies a betting action, updates contributions, and advances the hand state.
    public TournamentBroadcast applyAction(String code, String guestId, String action, Integer amount) {
        return handCommandFlow.applyAction(code, guestId, action, amount);
    }

    // Auto-applies one AFK timeout action when the acting player misses the current decision window.
    public TournamentBroadcast autoTimeoutActingPlayer(String code, long expectedDeadlineEpochMilli) {
        return handCommandFlow.autoTimeoutActingPlayer(code, expectedDeadlineEpochMilli);
    }

    // Advances one expired hand-result state into the next live hand for async transitions.
    public TournamentBroadcast autoAdvanceHandResult(String code, long expectedDeadlineEpochMilli) {
        return handCommandFlow.autoAdvanceHandResult(code, expectedDeadlineEpochMilli);
    }

    // Deletes one finished tournament once its short result-retention window expires.
    public boolean cleanupFinishedTournament(String code, long expectedDeadlineEpochMilli) {
        return handCommandFlow.cleanupFinishedTournament(code, expectedDeadlineEpochMilli);
    }
}
