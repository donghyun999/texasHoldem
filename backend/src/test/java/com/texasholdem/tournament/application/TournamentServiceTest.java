package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TournamentServiceTest {

    // Verifies that a waiting-room disconnect removes the player and delegates owner rights by seat order.
    @Test
    void removesWaitingOwnerAndDelegatesOwnership() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner");
        var code = snapshot.code();

        service.joinTournament(code, "guest-2", "Player2");
        var event = service.disconnectPlayer(code, "guest-1").primaryEvent();
        var disconnectedSnapshot = event.snapshot();

        assertThat(disconnectedSnapshot.status()).isEqualTo(TournamentStatus.WAITING);
        assertThat(disconnectedSnapshot.players()).hasSize(1);
        assertThat(requireSnapshotPlayer(disconnectedSnapshot, "guest-2").owner()).isTrue();
        assertThat(event.payload()).containsEntry("removed", true);
        assertThat(event.payload()).containsEntry("ownerGuestId", "guest-2");
    }

    // Verifies that a short-stack shove creates a main pot and side pot from contribution tiers.
    @Test
    void calculatesMainAndSidePotsFromUnevenAllInContributions() {
        var service = createService();
        var code = prepareTournament(service, 3);

        setPlayerStack(service, code, "guest-1", 300);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        service.applyAction(code, "guest-2", "CALL", null);
        service.applyAction(code, "guest-3", "RAISE", 600);
        var event = service.applyAction(code, "guest-2", "CALL", null).primaryEvent();
        var snapshot = event.snapshot();

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(snapshot.mainPot()).isEqualTo(900);
        assertThat(snapshot.sidePots()).hasSize(1);
        assertThat(snapshot.sidePots().get(0).amount()).isEqualTo(600);
        assertThat(snapshot.sidePots().get(0).eligibleGuestIds()).containsExactly("guest-2", "guest-3");
        assertThat(snapshot.boardCards()).containsExactly("AH", "KD", "7C");
        assertThat(snapshot.actingSeat()).isEqualTo(1);
        assertThat(snapshot.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");
    }

    // Verifies that the hand ends immediately when folds leave only one player eligible for the pot.
    @Test
    void endsHandWhenOnlyOnePlayerRemainsAfterFolds() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        var broadcast = service.applyAction(code, "guest-2", "FOLD", null);
        var event = broadcast.primaryEvent();
        var snapshot = event.snapshot();

        assertThat(eventTypes(broadcast)).containsExactly("potsUpdated", "handEnded", "actionApplied");
        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(snapshot.actingSeat()).isNull();
        assertThat(snapshot.availableActions()).isEmpty();
        assertThat(snapshot.mainPot()).isEqualTo(20);
        assertThat(snapshot.sidePots()).isEmpty();
        assertThat(snapshot.showdownPots()).hasSize(1);
        assertThat(snapshot.showdownPots().get(0).amount()).isEqualTo(20);
        assertThat(snapshot.showdownPots().get(0).payouts()).singleElement().satisfies((payout) -> {
            assertThat(payout.guestId()).isEqualTo("guest-3");
            assertThat(payout.amount()).isEqualTo(20);
        });
        assertThat(requireSnapshotPlayer(snapshot, "guest-3").stack()).isEqualTo(1_010);
    }

    // Verifies that an in-hand disconnect auto-folds the player and moves owner control to the survivor.
    @Test
    void autoFoldsDisconnectedActorAndDelegatesOwnerForNextHand() {
        var service = createService();
        var code = prepareTournament(service, 2);

        var event = service.disconnectPlayer(code, "guest-1").primaryEvent();
        var snapshot = event.snapshot();

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").connected()).isFalse();
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").owner()).isFalse();
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").owner()).isTrue();
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").stack()).isEqualTo(1_010);

        var nextHandEvent = service.startTournament(code, "guest-2").primaryEvent();
        assertThat(nextHandEvent.snapshot().status()).isEqualTo(TournamentStatus.IN_HAND);
    }

    // Verifies that disconnecting a non-acting player keeps the current actor in place.
    @Test
    void keepsCurrentActorWhenAnotherActivePlayerDisconnects() {
        var service = createService();
        var code = prepareTournament(service, 3);

        var event = service.disconnectPlayer(code, "guest-2").primaryEvent();
        var snapshot = event.snapshot();

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(snapshot.actingSeat()).isEqualTo(0);
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").connected()).isFalse();
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(snapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
    }

    // Verifies that matched all-ins settle the showdown and finish a heads-up tournament immediately.
    @Test
    void revealsFullBoardWhenAllRemainingPlayersAreAllIn() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var broadcast = service.applyAction(code, "guest-2", "CALL", null);
        var event = broadcast.primaryEvent();
        var snapshot = event.snapshot();

        assertThat(eventTypes(broadcast)).containsExactly(
                "potsUpdated",
                "showdownStarted",
                "handEnded",
                "playerBusted",
                "tournamentFinished",
                "actionApplied"
        );
        assertThat(snapshot.status()).isEqualTo(TournamentStatus.FINISHED);
        assertThat(snapshot.mainPot()).isEqualTo(2_000);
        assertThat(snapshot.sidePots()).isEmpty();
        assertThat(snapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
        assertThat(snapshot.actingSeat()).isNull();
        assertThat(snapshot.availableActions()).isEmpty();
        assertThat(snapshot.showdownPots()).hasSize(1);
        assertThat(snapshot.showdownPots().get(0).amount()).isEqualTo(2_000);
        assertThat(snapshot.showdownPots().get(0).payouts()).singleElement().satisfies((payout) -> {
            assertThat(payout.guestId()).isEqualTo("guest-2");
            assertThat(payout.amount()).isEqualTo(2_000);
        });
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").stack()).isEqualTo(2_000);
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").status()).isEqualTo(PlayerStatus.BUSTED_OUT);
    }

    // Verifies that showdown settlement preserves side-pot splits without breaking the snapshot contract.
    @Test
    void settlesMainAndSidePotsAfterShowdown() {
        var service = createService();
        var code = prepareTournament(service, 3);

        setPlayerStack(service, code, "guest-1", 300);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        service.applyAction(code, "guest-2", "CALL", null);
        service.applyAction(code, "guest-3", "RAISE", 600);
        service.applyAction(code, "guest-2", "CALL", null);
        service.applyAction(code, "guest-2", "CHECK", null);
        service.applyAction(code, "guest-3", "CHECK", null);
        service.applyAction(code, "guest-2", "CHECK", null);
        service.applyAction(code, "guest-3", "CHECK", null);
        service.applyAction(code, "guest-2", "CHECK", null);
        var broadcast = service.applyAction(code, "guest-3", "CHECK", null);
        var event = broadcast.primaryEvent();
        var snapshot = event.snapshot();

        assertThat(eventTypes(broadcast)).containsExactly("potsUpdated", "showdownStarted", "handEnded", "actionApplied");
        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(snapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
        assertThat(snapshot.showdownPots()).hasSize(2);
        assertThat(snapshot.showdownPots().get(0).amount()).isEqualTo(900);
        assertThat(snapshot.showdownPots().get(0).payouts()).hasSize(3);
        assertThat(snapshot.showdownPots().get(0).payouts())
                .extracting(payout -> payout.guestId() + ":" + payout.amount())
                .containsExactlyInAnyOrder("guest-1:300", "guest-2:300", "guest-3:300");
        assertThat(snapshot.showdownPots().get(1).amount()).isEqualTo(600);
        assertThat(snapshot.showdownPots().get(1).payouts())
                .extracting(payout -> payout.guestId() + ":" + payout.amount())
                .containsExactlyInAnyOrder("guest-2:300", "guest-3:300");
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").stack()).isEqualTo(300);
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").stack()).isEqualTo(1_000);
        assertThat(requireSnapshotPlayer(snapshot, "guest-3").stack()).isEqualTo(1_000);
    }

    // Verifies that the owner can open the next hand and pick up the next blind level on the boundary.
    @Test
    void advancesBlindLevelWhenOwnerStartsNextHandFromHandResult() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        service.applyAction(code, "guest-2", "FOLD", null);
        setLevelActivatedAt(service, code, Instant.now().minusSeconds(301).getEpochSecond());

        var broadcast = service.startTournament(code, "guest-1");
        var event = broadcast.primaryEvent();
        var snapshot = event.snapshot();

        assertThat(eventTypes(broadcast)).containsExactly("levelChanged", "handStarted");
        assertThat(snapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(snapshot.currentLevel().level()).isEqualTo(2);
        assertThat(snapshot.currentLevel().smallBlind()).isEqualTo(15);
        assertThat(snapshot.currentLevel().bigBlind()).isEqualTo(30);
        assertThat(snapshot.dealerSeat()).isEqualTo(1);
        assertThat(snapshot.smallBlindSeat()).isEqualTo(2);
        assertThat(snapshot.bigBlindSeat()).isEqualTo(0);
    }

    // Verifies that an expired hand-result snapshot advances into the next hand before stale state is returned.
    @Test
    void advancesExpiredHandResultWhenSnapshotIsRequested() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        service.applyAction(code, "guest-2", "FOLD", null);
        setHandResultDeadline(service, code, Instant.now().minusMillis(1).toEpochMilli());

        var snapshot = service.getTournament(code);

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(snapshot.boardCards()).isEmpty();
        assertThat(snapshot.showdownPots()).isEmpty();
        assertThat(snapshot.actingSeat()).isNotNull();
        assertThat(snapshot.tableMessage()).contains("Next hand started.");
    }

    // Verifies that one guest cannot create or join a second unfinished tournament concurrently.
    @Test
    void blocksGuestFromEnteringAnotherUnfinishedTournament() {
        var service = createService();
        var firstCode = service.createTournament("guest-1", "Owner").code();
        var secondCode = service.createTournament("guest-2", "OtherOwner").code();

        assertThatThrownBy(() -> service.createTournament("guest-1", "OwnerAgain"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already participating");
        assertThatThrownBy(() -> service.joinTournament(secondCode, "guest-1", "Owner"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already participating");

        assertThat(service.getTournament(firstCode).players())
                .extracting(player -> player.guestId())
                .containsExactly("guest-1");
    }

    // Verifies that reconnect restores connectivity and can recover ownership when nobody else is connected.
    @Test
    void restoresDisconnectedPlayerAndBackfillsOwnerWhenNeeded() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.disconnectPlayer(code, "guest-1");
        var disconnectedOwnerEvent = service.disconnectPlayer(code, "guest-2").primaryEvent();
        assertThat(disconnectedOwnerEvent.snapshot().players().stream().noneMatch(player -> player.owner())).isTrue();

        var reconnectBroadcast = service.reconnectPlayer(code, "guest-1");
        var reconnectEvent = reconnectBroadcast.primaryEvent();
        var snapshot = reconnectEvent.snapshot();

        assertThat(eventTypes(reconnectBroadcast)).containsExactly("tournamentSnapshot", "playerReconnected");
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").connected()).isTrue();
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").owner()).isTrue();
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").connected()).isFalse();
    }

    // Verifies that a fresh service instance can restore tournament progress from persisted state.
    @Test
    void restoresPersistedTournamentStateAcrossServiceInstances() {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules);
        var eventFactory = new TournamentEventFactory(snapshotFactory);
        var stateAccess = new TournamentStateAccess(rules);
        var lobbyManager = new TournamentLobbyManager(stateAccess, rules, identityFactory);
        var ownershipManager = new TournamentOwnershipManager();
        var potResolver = new TournamentPotResolver(new PokerHandEvaluator());
        var handEngine = new TournamentHandEngine(rules, stateAccess, potResolver);
        var connectionManager = new TournamentConnectionManager(stateAccess, ownershipManager, handEngine);
        var stateStore = new InMemoryTournamentStateStore(new TournamentStatePersistenceMapper(new ObjectMapper()));
        var firstService = new TournamentService(
                identityFactory,
                snapshotFactory,
                eventFactory,
                stateAccess,
                lobbyManager,
                connectionManager,
                handEngine,
                stateStore,
                event -> {
                }
        );

        var code = prepareTournament(firstService, 3);
        firstService.applyAction(code, "guest-1", "CALL", null);
        var inMemorySnapshot = firstService.getTournament(code);
        var persistedSnapshot = snapshotFactory.toSnapshot(stateStore.load(code));

        assertThat(inMemorySnapshot.mainPot()).isEqualTo(30);
        assertThat(inMemorySnapshot.sidePots()).singleElement().satisfies((pot) -> assertThat(pot.amount()).isEqualTo(20));
        assertThat(persistedSnapshot.mainPot()).isEqualTo(30);
        assertThat(persistedSnapshot.sidePots()).singleElement().satisfies((pot) -> assertThat(pot.amount()).isEqualTo(20));

        var secondService = new TournamentService(
                identityFactory,
                snapshotFactory,
                eventFactory,
                stateAccess,
                lobbyManager,
                connectionManager,
                handEngine,
                stateStore,
                event -> {
                }
        );
        var restoredSnapshot = secondService.getTournament(code);

        assertThat(restoredSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(restoredSnapshot.code()).isEqualTo(code);
        assertThat(restoredSnapshot.mainPot()).isEqualTo(30);
        assertThat(restoredSnapshot.sidePots()).singleElement().satisfies((pot) -> assertThat(pot.amount()).isEqualTo(20));
        assertThat(restoredSnapshot.boardCards()).isEmpty();
        assertThat(restoredSnapshot.actingSeat()).isEqualTo(1);
        assertThat(restoredSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
        assertThat(requireSnapshotPlayer(restoredSnapshot, "guest-1").stack()).isEqualTo(980);

        var resumedActionEvent = secondService.applyAction(code, "guest-2", "CALL", null).primaryEvent();
        var resumedSnapshot = resumedActionEvent.snapshot();

        assertThat(resumedSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(resumedSnapshot.mainPot()).isEqualTo(60);
        assertThat(resumedSnapshot.sidePots()).isEmpty();
        assertThat(resumedSnapshot.actingSeat()).isEqualTo(2);
        assertThat(resumedSnapshot.availableActions()).containsExactly("CHECK", "RAISE", "ALL_IN");
        assertThat(requireSnapshotPlayer(resumedSnapshot, "guest-2").stack()).isEqualTo(980);
    }

    // Verifies that clearing the in-memory cache still reloads and advances the persisted tournament.
    @Test
    void reloadsPersistedTournamentStateAfterInMemoryCacheMiss() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "CALL", null);
        evictTournamentFromCache(service, code);

        var restoredSnapshot = service.getTournament(code);

        assertThat(restoredSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(restoredSnapshot.mainPot()).isEqualTo(30);
        assertThat(restoredSnapshot.sidePots()).singleElement().satisfies((pot) -> assertThat(pot.amount()).isEqualTo(20));
        assertThat(restoredSnapshot.actingSeat()).isEqualTo(1);
        assertThat(restoredSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        var resumedActionEvent = service.applyAction(code, "guest-2", "CALL", null).primaryEvent();
        var resumedSnapshot = resumedActionEvent.snapshot();

        assertThat(resumedSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(resumedSnapshot.mainPot()).isEqualTo(60);
        assertThat(resumedSnapshot.sidePots()).isEmpty();
        assertThat(resumedSnapshot.actingSeat()).isEqualTo(2);
        assertThat(resumedSnapshot.availableActions()).containsExactly("CHECK", "RAISE", "ALL_IN");
    }

    // Creates a started tournament with the requested number of ready players.
    private String prepareTournament(TournamentService service, int players) {
        var ownerId = "guest-1";
        var snapshot = service.createTournament(ownerId, "Owner");
        var code = snapshot.code();
        for (var playerNumber = 2; playerNumber <= players; playerNumber++) {
            service.joinTournament(code, "guest-" + playerNumber, "Player" + playerNumber);
        }
        for (var playerNumber = 1; playerNumber <= players; playerNumber++) {
            service.changeReady(code, "guest-" + playerNumber, true);
        }
        service.startTournament(code, ownerId);
        return code;
    }

    // Builds the same dependency graph that Spring wires for the tournament service.
    private TournamentService createService() {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules);
        var eventFactory = new TournamentEventFactory(snapshotFactory);
        var stateAccess = new TournamentStateAccess(rules);
        var lobbyManager = new TournamentLobbyManager(stateAccess, rules, identityFactory);
        var ownershipManager = new TournamentOwnershipManager();
        var potResolver = new TournamentPotResolver(new PokerHandEvaluator());
        var handEngine = new TournamentHandEngine(rules, stateAccess, potResolver);
        var connectionManager = new TournamentConnectionManager(stateAccess, ownershipManager, handEngine);
        var stateStore = new InMemoryTournamentStateStore(new TournamentStatePersistenceMapper(new ObjectMapper()));
        return new TournamentService(
                identityFactory,
                snapshotFactory,
                eventFactory,
                stateAccess,
                lobbyManager,
                connectionManager,
                handEngine,
                stateStore,
                event -> {
                }
        );
    }

    // Overrides one remaining stack so the test can model an uneven stack tournament hand.
    private void setPlayerStack(TournamentService service, String code, String guestId, int stack) {
        var tournament = requireTournamentState(service, code);
        var player = requirePlayerState(tournament, guestId);
        ReflectionTestUtils.setField(player, "stack", stack);
    }

    // Overrides the active blind-level start timestamp so the next hand crosses a level boundary.
    private void setLevelActivatedAt(TournamentService service, String code, long epochSecond) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "levelActivatedAtEpochSecond", epochSecond);
    }

    // Overrides the result deadline so tests can force the hand-result timeout branch deterministically.
    private void setHandResultDeadline(TournamentService service, String code, long epochMilli) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "handResultEndsAtEpochMilli", epochMilli);
    }

    // Finds one player in a snapshot by guest id so the assertions stay readable.
    private com.texasholdem.tournament.domain.TournamentPlayerView requireSnapshotPlayer(
            TournamentSnapshot snapshot,
            String guestId
    ) {
        return snapshot.players().stream()
                .filter(player -> player.guestId().equals(guestId))
                .findFirst()
                .orElseThrow();
    }

    // Extracts the ordered websocket event names from one broadcast bundle.
    private List<String> eventTypes(TournamentBroadcast broadcast) {
        return broadcast.events().stream()
                .map(TournamentEvent::eventType)
                .toList();
    }

    // Reads the mutable tournament state from the in-memory service map.
    @SuppressWarnings("unchecked")
    private Object requireTournamentState(TournamentService service, String code) {
        var tournaments = (Map<String, Object>) ReflectionTestUtils.getField(service, "tournaments");
        assertThat(tournaments).isNotNull();
        return tournaments.get(code);
    }

    // Clears one cached tournament entry so the next read must hit the persistence store.
    @SuppressWarnings("unchecked")
    private void evictTournamentFromCache(TournamentService service, String code) {
        var tournaments = (Map<String, Object>) ReflectionTestUtils.getField(service, "tournaments");
        assertThat(tournaments).isNotNull();
        tournaments.remove(code);
    }

    // Reads the mutable player state from the tournament's private player list.
    @SuppressWarnings("unchecked")
    private Object requirePlayerState(Object tournament, String guestId) {
        var players = (List<Object>) ReflectionTestUtils.getField(tournament, "players");
        assertThat(players).isNotNull();
        return players.stream()
                .filter(player -> guestId.equals(ReflectionTestUtils.getField(player, "guestId")))
                .findFirst()
                .orElseThrow();
    }
}
