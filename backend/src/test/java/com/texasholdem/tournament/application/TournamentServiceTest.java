package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.PublicTournamentSummary;
import com.texasholdem.tournament.domain.SnapshotAudience;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
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

    private static final List<String> FIXED_BOARD_RUNOUT = List.of("AH", "KD", "7C", "4S", "2D");

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

    // Verifies that the service can surface a guest's currently occupied live tournament.
    @Test
    void findsActiveTournamentForGuest() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner");

        var activeTournament = service.findActiveTournament("guest-1");

        assertThat(activeTournament).isNotNull();
        assertThat(activeTournament.guestId()).isEqualTo("guest-1");
        assertThat(activeTournament.tournamentCode()).isEqualTo(snapshot.code());
        assertThat(activeTournament.status()).isEqualTo(TournamentStatus.WAITING);
    }

    // Verifies that guests without a live seat do not report an active tournament.
    @Test
    void returnsNullWhenGuestHasNoActiveTournament() {
        var service = createService();

        assertThat(service.findActiveTournament("missing-guest")).isNull();
    }

    // Verifies that stale waiting tournaments are cleaned before active-seat lookup runs.
    @Test
    void ignoresStaleWaitingTournamentWhenLookingUpActiveTournament() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner");

        touchPersistedTournament(service, snapshot.code(), Instant.now().minusSeconds(31 * 60L).toEpochMilli());

        assertThat(service.findActiveTournament("guest-1")).isNull();
        assertThatThrownBy(() -> service.getTournament(snapshot.code()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("토너먼트를 찾을 수 없습니다.");
    }

    // Verifies that caller-supplied codes are reserved and reusable by join requests.
    @Test
    void createsTournamentWithRequestedCode() {
        var service = createService();

        var snapshot = service.createTournament("guest-1", "Owner", "1111");
        var joinedSnapshot = service.joinTournament("1111", "guest-2", "Player2");

        assertThat(snapshot.code()).isEqualTo("1111");
        assertThat(snapshot.visibility()).isEqualTo(TournamentVisibility.PRIVATE);
        assertThat(joinedSnapshot.code()).isEqualTo("1111");
        assertThat(joinedSnapshot.players()).hasSize(2);
    }

    // Verifies that lobby-facing creates keep a player-friendly room title while the server still generates an internal code.
    @Test
    void createsTournamentWithRoomNameAndGeneratedCode() {
        var service = createService();

        var snapshot = service.createTournament("guest-1", "Owner", "Friday Night Sit & Go", "letmein", TournamentVisibility.PRIVATE);

        assertThat(snapshot.roomName()).isEqualTo("Friday Night Sit & Go");
        assertThat(snapshot.code()).matches("[A-Z0-9]{5}");
        assertThat(snapshot.visibility()).isEqualTo(TournamentVisibility.PRIVATE);
    }

    // Verifies that private-room entry can use the shared title and password instead of a user-entered code.
    @Test
    void joinsPrivateTournamentByRoomNameAndPassword() {
        var service = createService();
        service.createTournament("guest-1", "Owner", "Crew Table", "letmein", TournamentVisibility.PRIVATE);

        var joinedSnapshot = service.joinPrivateTournament("Crew Table", "letmein", "guest-2", "Player2");

        assertThat(joinedSnapshot.roomName()).isEqualTo("Crew Table");
        assertThat(joinedSnapshot.players()).hasSize(2);
        assertThat(joinedSnapshot.players()).extracting(player -> player.nickname()).contains("Player2");
    }

    // Verifies that the main lobby path can join one locked room by selected entry code plus matching password.
    @Test
    void joinsLockedTournamentByCodeWhenPasswordMatches() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner", "Crew Table", "letmein", TournamentVisibility.PRIVATE);

        var joinedSnapshot = service.joinTournament(snapshot.code(), "guest-2", "Player2", "letmein");

        assertThat(joinedSnapshot.code()).isEqualTo(snapshot.code());
        assertThat(joinedSnapshot.roomName()).isEqualTo("Crew Table");
        assertThat(joinedSnapshot.players()).hasSize(2);
        assertThat(joinedSnapshot.players()).extracting(player -> player.nickname()).contains("Player2");
    }

    // Verifies that active room titles stay unique so private-room lookup remains unambiguous.
    @Test
    void rejectsDuplicateActiveRoomName() {
        var service = createService();
        service.createTournament("guest-1", "Owner", "Crew Table", "letmein", TournamentVisibility.PRIVATE);

        assertThatThrownBy(() -> service.createTournament("guest-2", "OtherOwner", "Crew Table", null, TournamentVisibility.PUBLIC))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("이미 사용 중인 방 이름입니다.");
    }

    // Verifies that locked-table passwords are not stored in plain text inside the mutable tournament state.
    @Test
    void storesLockedTablePasswordAsHash() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner", "Crew Table", "letmein", TournamentVisibility.PRIVATE);

        var tournament = requireTournamentState(service, snapshot.code());
        var storedPassword = (String) ReflectionTestUtils.getField(tournament, "roomPassword");

        assertThat(storedPassword).isNotBlank();
        assertThat(storedPassword).isNotEqualTo("letmein");
    }

    // Verifies that waiting tables of either visibility are exposed through the lobby list.
    @Test
    void listsWaitingTournamentsIncludingLockedTables() {
        var service = createService();
        service.createTournament("guest-1", "Owner", "PUB1", TournamentVisibility.PUBLIC);
        service.joinTournament("PUB1", "guest-2", "Player2");
        service.createTournament("guest-3", "PrivateOwner", "PRIV1", TournamentVisibility.PRIVATE);
        service.createTournament("guest-4", "StartedOwner", "PUB2", TournamentVisibility.PUBLIC);
        service.joinTournament("PUB2", "guest-5", "Player5");
        service.changeReady("PUB2", "guest-4", true);
        service.changeReady("PUB2", "guest-5", true);
        service.startTournament("PUB2", "guest-4");

        var summaries = service.listPublicWaitingTournaments();

        assertThat(summaries).extracting(PublicTournamentSummary::code)
                .containsExactly("PRIV1", "PUB1");
        assertThat(summaries).extracting(PublicTournamentSummary::visibility)
                .containsExactly(TournamentVisibility.PRIVATE, TournamentVisibility.PUBLIC);
    }

    // Verifies that locked tables reject joins when the supplied password is missing or wrong.
    @Test
    void rejectsLockedTableJoinWithoutMatchingPassword() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner", "Crew Table", "letmein", TournamentVisibility.PRIVATE);

        assertThatThrownBy(() -> service.joinTournament(snapshot.code(), "guest-2", "Player2"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("비밀번호가 일치하지 않습니다.");
        assertThatThrownBy(() -> service.joinTournament(snapshot.code(), "guest-2", "Player2", "wrong"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("비밀번호가 일치하지 않습니다.");
    }

    // Verifies that full public waiting rooms stay out of the joinable home list.
    @Test
    void excludesFullPublicWaitingTournamentsFromLobbyList() {
        var service = createService();
        service.createTournament("guest-1", "Owner", "FULL1", TournamentVisibility.PUBLIC);
        for (var playerNumber = 2; playerNumber <= 6; playerNumber++) {
            service.joinTournament("FULL1", "guest-" + playerNumber, "Player" + playerNumber);
        }

        var summaries = service.listPublicWaitingTournaments();

        assertThat(summaries).isEmpty();
    }

    // Verifies that full locked waiting rooms also disappear from the joinable lobby list.
    @Test
    void excludesFullLockedWaitingTournamentsFromLobbyList() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner", "Locked Full", "letmein", TournamentVisibility.PRIVATE);
        for (var playerNumber = 2; playerNumber <= 6; playerNumber++) {
            service.joinTournament(snapshot.code(), "guest-" + playerNumber, "Player" + playerNumber, "letmein");
        }

        var summaries = service.listPublicWaitingTournaments();

        assertThat(summaries).isEmpty();
    }

    // Verifies that waiting-room joins no longer reshuffle list order away from creation recency.
    @Test
    void keepsPublicTournamentCreationOrderWhenRoomsUpdate() {
        var service = createService();
        service.createTournament("guest-1", "Owner1", "PUB1", TournamentVisibility.PUBLIC);
        service.createTournament("guest-2", "Owner2", "PUB2", TournamentVisibility.PUBLIC);

        service.joinTournament("PUB1", "guest-3", "Player3");

        var summaries = service.listPublicWaitingTournaments();

        assertThat(summaries).extracting(PublicTournamentSummary::code)
                .containsExactly("PUB2", "PUB1");
    }

    // Verifies that leaving a waiting room clears both active-tournament lookup and the public list entry.
    @Test
    void waitingRoomLeaveClearsActiveTournamentAndRemovesEmptyPublicRoom() {
        var service = createService();
        service.createTournament("guest-1", "Owner", "PUB1", TournamentVisibility.PUBLIC);

        service.disconnectPlayer("PUB1", "guest-1");

        assertThat(service.findActiveTournament("guest-1")).isNull();
        assertThat(service.listPublicWaitingTournaments()).isEmpty();
        assertThatThrownBy(() -> service.getTournament("PUB1"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("토너먼트를 찾을 수 없습니다.");
    }

    // Verifies that a REST join can fan out one fresh snapshot to waiting-room subscribers immediately.
    @Test
    void emitsTournamentSnapshotBroadcastWhenPlayerJoinsWaitingRoom() {
        var service = createService();
        var snapshot = service.createTournament("guest-1", "Owner", "JOIN1");

        var broadcast = service.joinTournamentBroadcast(snapshot.code(), "guest-2", "Player2");
        var joinedSnapshot = broadcast.primaryEvent().snapshot();

        assertThat(eventTypes(broadcast)).containsExactly("tournamentSnapshot");
        assertThat(broadcast.primaryEvent().payload()).containsEntry("reason", "playerJoined");
        assertThat(joinedSnapshot.code()).isEqualTo("JOIN1");
        assertThat(joinedSnapshot.players()).hasSize(2);
        assertThat(joinedSnapshot.tableMessage()).contains("Player2 joined the table.");
    }

    // Verifies that new creates and joins are rejected once the active-player cap is reached.
    @Test
    void rejectsNewEntriesWhenActivePlayerCapacityIsReached() {
        var service = createService(2);
        var firstCode = service.createTournament("guest-1", "Owner").code();
        service.createTournament("guest-2", "OtherOwner");

        assertThatThrownBy(() -> service.createTournament("guest-3", "LateOwner"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("수용 인원이 가득 찼습니다");
        assertThatThrownBy(() -> service.joinTournament(firstCode, "guest-3", "LatePlayer"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("수용 인원이 가득 찼습니다");
    }

    // Verifies that stale waiting tournaments are removed before the capacity cap blocks new creates.
    @Test
    void cleansStaleWaitingTournamentBeforeCapacityCheck() {
        var service = createService(1);
        var staleCode = service.createTournament("guest-1", "Owner").code();

        touchPersistedTournament(service, staleCode, Instant.now().minusSeconds(31 * 60L).toEpochMilli());

        var replacementSnapshot = service.createTournament("guest-2", "NextOwner");

        assertThat(replacementSnapshot.code()).isNotEqualTo(staleCode);
        assertThat(replacementSnapshot.players()).singleElement().satisfies(player ->
                assertThat(player.guestId()).isEqualTo("guest-2")
        );
    }

    // Verifies that stale in-hand tournaments are removed before the capacity cap blocks new creates.
    @Test
    void cleansStaleInHandTournamentBeforeCapacityCheck() {
        var service = createService(2);
        var staleCode = prepareTournament(service, 2);

        touchPersistedTournament(service, staleCode, Instant.now().minusSeconds(2 * 60L * 60L + 60L).toEpochMilli());

        var replacementSnapshot = service.createTournament("guest-3", "FreshOwner");

        assertThat(replacementSnapshot.status()).isEqualTo(TournamentStatus.WAITING);
        assertThat(replacementSnapshot.players()).singleElement().satisfies(player ->
                assertThat(player.guestId()).isEqualTo("guest-3")
        );
    }

    // Verifies that reconnect remains available even when the service is already at the active-player cap.
    @Test
    void allowsReconnectWhenActivePlayerCapacityIsReached() {
        var service = createService(2);
        var code = prepareTournament(service, 2);

        service.disconnectPlayer(code, "guest-2");

        var reconnectSnapshot = service.reconnectPlayer(code, "guest-2").primaryEvent().snapshot();

        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-2").connected()).isTrue();
    }

    // Verifies that a viewer fetch exposes only that player's own hole cards.
    @Test
    void getTournamentIncludesOnlyViewingPlayersHoleCards() {
        var service = createService();
        var code = prepareTournament(service, 2);

        var ownerView = service.getTournament(code, "guest-1");
        var opponentView = service.getTournament(code, "guest-2");
        var anonymousView = service.getTournament(code);

        assertThat(ownerView.selfHoleCards()).hasSize(2);
        assertThat(ownerView.snapshotAudience()).isEqualTo(SnapshotAudience.VIEWER);
        assertThat(ownerView.viewerGuestId()).isEqualTo("guest-1");
        assertThat(ownerView.viewerHoleCardsIncluded()).isTrue();
        assertThat(opponentView.selfHoleCards()).hasSize(2);
        assertThat(opponentView.snapshotAudience()).isEqualTo(SnapshotAudience.VIEWER);
        assertThat(opponentView.viewerGuestId()).isEqualTo("guest-2");
        assertThat(opponentView.viewerHoleCardsIncluded()).isTrue();
        assertThat(ownerView.selfHoleCards()).isNotEqualTo(opponentView.selfHoleCards());
        assertThat(anonymousView.selfHoleCards()).isEmpty();
        assertThat(anonymousView.snapshotAudience()).isEqualTo(SnapshotAudience.PUBLIC);
        assertThat(anonymousView.viewerGuestId()).isNull();
        assertThat(anonymousView.viewerHoleCardsIncluded()).isFalse();
    }

    // Verifies that viewer snapshots expose the exact additional chips needed to call the current bet.
    @Test
    void getTournamentIncludesViewerChipsToCall() {
        var service = createService();
        var code = prepareTournament(service, 3);

        var actingView = service.getTournament(code, "guest-2");
        var bigBlindView = service.getTournament(code, "guest-1");
        var anonymousView = service.getTournament(code);

        assertThat(actingView.chipsToCall()).isEqualTo(10);
        assertThat(bigBlindView.chipsToCall()).isEqualTo(20);
        assertThat(anonymousView.chipsToCall()).isZero();
    }

    // Verifies that snapshots expose stable hand identity and monotonic state identity.
    @Test
    void snapshotsCarryHandNumberAndStateVersion() {
        var service = createService();
        var createdSnapshot = service.createTournament("guest-1", "Owner", "META1");
        var joinedSnapshot = service.joinTournament("META1", "guest-2", "Player2");

        service.changeReady("META1", "guest-1", true);
        var readySnapshot = service.changeReady("META1", "guest-2", true).primaryEvent().snapshot();
        var startedSnapshot = service.startTournament("META1", "guest-1").primaryEvent().snapshot();
        var handResultSnapshot = service.applyAction("META1", "guest-1", "FOLD", null).primaryEvent().snapshot();
        var nextHandSnapshot = service.startTournament("META1", "guest-1").primaryEvent().snapshot();

        assertThat(createdSnapshot.handNumber()).isZero();
        assertThat(joinedSnapshot.handNumber()).isZero();
        assertThat(startedSnapshot.handNumber()).isEqualTo(1);
        assertThat(handResultSnapshot.handNumber()).isEqualTo(1);
        assertThat(nextHandSnapshot.handNumber()).isEqualTo(2);

        assertThat(createdSnapshot.stateVersion()).isPositive();
        assertThat(joinedSnapshot.stateVersion()).isGreaterThan(createdSnapshot.stateVersion());
        assertThat(readySnapshot.stateVersion()).isGreaterThan(joinedSnapshot.stateVersion());
        assertThat(startedSnapshot.stateVersion()).isGreaterThan(readySnapshot.stateVersion());
        assertThat(handResultSnapshot.stateVersion()).isGreaterThan(startedSnapshot.stateVersion());
        assertThat(nextHandSnapshot.stateVersion()).isGreaterThan(handResultSnapshot.stateVersion());
    }

    // Verifies that posted blinds are visible in the snapshot pot before the first action lands.
    @Test
    void showsPostedBlindsInMainPotBeforeFirstAction() {
        var service = createService();
        var code = prepareTournament(service, 3);

        var snapshot = service.getTournament(code);

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(snapshot.mainPot()).isEqualTo(30);
        assertThat(snapshot.sidePots()).isEmpty();
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").roundContribution()).isZero();
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").roundContribution()).isEqualTo(10);
        assertThat(requireSnapshotPlayer(snapshot, "guest-3").roundContribution()).isEqualTo(20);
    }

    // Verifies that manually reserved codes cannot be claimed twice.
    @Test
    void rejectsDuplicateRequestedTournamentCode() {
        var service = createService();

        service.createTournament("guest-1", "Owner", "111");

        assertThatThrownBy(() -> service.createTournament("guest-2", "Player2", "111"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("이미 사용 중인 토너먼트 코드입니다.");
    }

    // Verifies that a finished tournament code can be claimed again for a brand-new tournament.
    @Test
    void allowsReusingRequestedCodeAfterTournamentFinishes() {
        var service = createService();

        service.createTournament("guest-1", "Owner", "222");
        service.joinTournament("222", "guest-2", "Player2");
        service.changeReady("222", "guest-1", true);
        service.changeReady("222", "guest-2", true);
        service.startTournament("222", "guest-1");
        service.applyAction("222", "guest-1", "ALL_IN", null);
        var handResultSnapshot = service.applyAction("222", "guest-2", "CALL", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);

        var expiredDeadline = Instant.now().minusMillis(1).toEpochMilli();
        setHandResultDeadline(service, "222", expiredDeadline);
        var finishedSnapshot = service.autoAdvanceHandResult("222", expiredDeadline).primaryEvent().snapshot();

        assertThat(finishedSnapshot.status()).isEqualTo(TournamentStatus.FINISHED);

        var recreatedSnapshot = service.createTournament("guest-3", "NextOwner", "222");

        assertThat(recreatedSnapshot.code()).isEqualTo("222");
        assertThat(recreatedSnapshot.status()).isEqualTo(TournamentStatus.WAITING);
        assertThat(recreatedSnapshot.players()).singleElement().satisfies(player -> {
            assertThat(player.guestId()).isEqualTo("guest-3");
            assertThat(player.nickname()).isEqualTo("NextOwner");
            assertThat(player.owner()).isTrue();
        });
    }

    // Verifies that finished tournaments are deleted as soon as the last connected player leaves.
    @Test
    void deletesFinishedTournamentWhenLastConnectedPlayerDisconnects() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "CALL", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);

        var expiredDeadline = Instant.now().minusMillis(1).toEpochMilli();
        setHandResultDeadline(service, code, expiredDeadline);
        var finishedSnapshot = service.autoAdvanceHandResult(code, expiredDeadline).primaryEvent().snapshot();

        assertThat(finishedSnapshot.status()).isEqualTo(TournamentStatus.FINISHED);

        service.disconnectPlayer(code, "guest-1");
        service.disconnectPlayer(code, "guest-2");

        assertThatThrownBy(() -> service.getTournament(code))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("토너먼트를 찾을 수 없습니다.");
    }

    // Verifies that finished tournaments are deleted automatically after the short retention window.
    @Test
    void deletesFinishedTournamentAfterCleanupDeadline() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        service.applyAction(code, "guest-2", "CALL", null);

        var expiredResultDeadline = Instant.now().minusMillis(1).toEpochMilli();
        setHandResultDeadline(service, code, expiredResultDeadline);
        var finishedSnapshot = service.autoAdvanceHandResult(code, expiredResultDeadline).primaryEvent().snapshot();

        assertThat(finishedSnapshot.status()).isEqualTo(TournamentStatus.FINISHED);

        var expiredCleanupDeadline = Instant.now().minusMillis(1).toEpochMilli();
        setFinishedCleanupDeadline(service, code, expiredCleanupDeadline);

        assertThat(service.cleanupFinishedTournament(code, expiredCleanupDeadline)).isTrue();
        assertThatThrownBy(() -> service.getTournament(code))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("토너먼트를 찾을 수 없습니다.");
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
        assertThat(snapshot.mainPot()).isEqualTo(30);
        assertThat(snapshot.sidePots()).isEmpty();
        assertThat(snapshot.showdownPots()).hasSize(1);
        assertThat(snapshot.showdownHands()).isEmpty();
        assertThat(snapshot.recentlyBustedGuestIds()).isEmpty();
        assertThat(snapshot.showdownPots().get(0).amount()).isEqualTo(20);
        assertThat(snapshot.showdownPots().get(0).payouts()).singleElement().satisfies((payout) -> {
            assertThat(payout.guestId()).isEqualTo("guest-3");
            assertThat(payout.amount()).isEqualTo(20);
        });
        assertThat(requireSnapshotPlayer(snapshot, "guest-3").stack()).isEqualTo(2_010);
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
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").stack()).isEqualTo(2_010);

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

    // Verifies that one missed decision immediately marks the player AFK and auto-folds when facing a bet.
    @Test
    void marksTimedOutActorAfkAndAutoFoldsWhenCheckIsUnavailable() {
        var service = createService();
        var code = prepareTournament(service, 2);
        var expiredDeadline = Instant.now().minusMillis(1).toEpochMilli();

        setActionDeadline(service, code, expiredDeadline);

        var timeoutBroadcast = service.autoTimeoutActingPlayer(code, expiredDeadline);
        var timeoutEvent = timeoutBroadcast.primaryEvent();
        var snapshot = timeoutEvent.snapshot();

        assertThat(eventTypes(timeoutBroadcast)).contains("actionApplied");
        assertThat(timeoutEvent.payload()).containsEntry("guestId", "guest-1");
        assertThat(timeoutEvent.payload()).containsEntry("action", "FOLD");
        assertThat(timeoutEvent.payload()).containsEntry("reason", "timeout");
        assertThat(timeoutEvent.payload()).containsEntry("afk", true);
        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").afk()).isTrue();
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").connected()).isTrue();
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(snapshot.tableMessage()).contains("won 20.");
    }

    // Verifies that AFK players keep auto-checking until they explicitly return to manual play.
    @Test
    void keepsAfkPlayerOnAutomaticChecksUntilTheyReturnToPlay() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "CALL", null);
        service.applyAction(code, "guest-2", "CALL", null);
        var flopSnapshot = service.applyAction(code, "guest-3", "CHECK", null).primaryEvent().snapshot();
        assertThat(flopSnapshot.actingSeat()).isEqualTo(1);
        assertThat(flopSnapshot.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");

        var expiredDeadline = Instant.now().minusMillis(1).toEpochMilli();
        setActionDeadline(service, code, expiredDeadline);

        var timeoutBroadcast = service.autoTimeoutActingPlayer(code, expiredDeadline);
        var timeoutEvent = timeoutBroadcast.primaryEvent();
        var timeoutSnapshot = timeoutEvent.snapshot();

        assertThat(timeoutEvent.payload()).containsEntry("guestId", "guest-2");
        assertThat(timeoutEvent.payload()).containsEntry("action", "CHECK");
        assertThat(timeoutEvent.payload()).containsEntry("reason", "timeout");
        assertThat(requireSnapshotPlayer(timeoutSnapshot, "guest-2").afk()).isTrue();
        assertThat(timeoutSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(timeoutSnapshot.actingSeat()).isEqualTo(2);

        service.applyAction(code, "guest-3", "CHECK", null);
        var turnSnapshot = service.applyAction(code, "guest-1", "CHECK", null).primaryEvent().snapshot();

        assertThat(requireSnapshotPlayer(turnSnapshot, "guest-2").afk()).isTrue();
        assertThat(turnSnapshot.actingSeat()).isEqualTo(2);
        assertThat(turnSnapshot.tableMessage()).contains("Player2 is AFK and was auto-checked.");

        var returnBroadcast = service.returnPlayerToPlay(code, "guest-2");
        var returnSnapshot = returnBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(returnBroadcast)).containsExactly("playerReturned");
        assertThat(returnBroadcast.primaryEvent().payload()).containsEntry("guestId", "guest-2");
        assertThat(returnBroadcast.primaryEvent().payload()).containsEntry("afk", false);
        assertThat(requireSnapshotPlayer(returnSnapshot, "guest-2").afk()).isFalse();
        assertThat(returnSnapshot.tableMessage()).contains("Player2 returned to play.");

        service.applyAction(code, "guest-3", "CHECK", null);
        var riverSnapshot = service.applyAction(code, "guest-1", "CHECK", null).primaryEvent().snapshot();

        assertThat(riverSnapshot.actingSeat()).isEqualTo(1);
        assertThat(requireSnapshotPlayer(riverSnapshot, "guest-2").afk()).isFalse();
        assertThat(riverSnapshot.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");

        var afterManualReturnAction = service.applyAction(code, "guest-2", "CHECK", null).primaryEvent().snapshot();

        assertThat(afterManualReturnAction.actingSeat()).isEqualTo(2);
        assertThat(requireSnapshotPlayer(afterManualReturnAction, "guest-2").afk()).isFalse();
    }

    // Verifies that matched all-ins settle the showdown and hold the final result before finishing.
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
                "actionApplied"
        );
        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(snapshot.mainPot()).isEqualTo(4_000);
        assertThat(snapshot.sidePots()).isEmpty();
        assertThat(snapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
        assertThat(snapshot.actingSeat()).isNull();
        assertThat(snapshot.availableActions()).isEmpty();
        assertThat(snapshot.showdownPots()).hasSize(1);
        assertThat(snapshot.showdownHands())
                .extracting(hand -> hand.guestId() + ":" + hand.handLabel())
                .containsExactly("guest-2:Three of a Kind", "guest-1:One Pair");
        assertThat(snapshot.recentlyBustedGuestIds()).containsExactly("guest-1");
        assertThat(snapshot.showdownPots().get(0).amount()).isEqualTo(4_000);
        assertThat(snapshot.showdownPots().get(0).payouts()).singleElement().satisfies((payout) -> {
            assertThat(payout.guestId()).isEqualTo("guest-2");
            assertThat(payout.amount()).isEqualTo(4_000);
        });
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").stack()).isEqualTo(4_000);
        assertThat(requireSnapshotPlayer(snapshot, "guest-1").status()).isEqualTo(PlayerStatus.BUSTED_OUT);
        assertThat(snapshot.tableMessage()).contains("Player2 won 4000.");
        assertThat(snapshot.tableMessage()).contains("Player2 wins the tournament.");
    }

    // Verifies that showdown/result broadcasts expose enough payload detail for result rendering and logging.
    @Test
    void emitsDetailedResultPayloadsForFinalHandShowdown() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var broadcast = service.applyAction(code, "guest-2", "CALL", null);

        var showdownStarted = requireEvent(broadcast, "showdownStarted");
        assertThat(showdownStarted.payload()).containsEntry("boardCards", List.of("AH", "KD", "7C", "4S", "2D"));
        assertThat(showdownStarted.payload()).containsEntry("showdownPotCount", 1);
        assertThat(showdownHandsPayload(showdownStarted))
                .extracting(
                        hand -> hand.get("guestId") + ":" + hand.get("nickname") + ":" + hand.get("handLabel")
                )
                .containsExactly("guest-2:Player2:Three of a Kind", "guest-1:Owner:One Pair");
        assertThat(showdownHandsPayload(showdownStarted))
                .allSatisfy(hand -> assertThat((List<?>) hand.get("holeCards")).hasSize(2));
        assertThat(showdownPotsPayload(showdownStarted)).singleElement().satisfies((pot) -> {
            assertThat(pot).containsEntry("type", "MAIN");
            assertThat(pot).containsEntry("amount", 4_000);
            assertThat(pot).containsEntry("split", false);
            assertThat(pot.get("winnerGuestIds")).isEqualTo(List.of("guest-2"));
            assertThat(pot.get("payouts")).isEqualTo(List.of(Map.of(
                    "guestId", "guest-2",
                    "nickname", "Player2",
                    "amount", 4_000
            )));
        });

        var handEnded = requireEvent(broadcast, "handEnded");
        assertThat(handEnded.payload()).containsEntry("status", "HAND_RESULT");
        assertThat(handEnded.payload()).containsEntry("showdown", true);
        assertThat(handEnded.payload()).containsEntry("boardCards", List.of("AH", "KD", "7C", "4S", "2D"));
        assertThat(handEnded.payload()).containsEntry("mainPot", 4_000);
        assertThat(handEnded.payload()).containsEntry("sidePotCount", 0);
        assertThat(handEnded.payload()).containsEntry("showdownPotCount", 1);
        assertThat(handEnded.payload()).containsEntry("recentlyBustedGuestIds", List.of("guest-1"));
        assertThat(showdownHandsPayload(handEnded))
                .extracting(
                        hand -> hand.get("guestId") + ":" + hand.get("nickname") + ":" + hand.get("handLabel")
                )
                .containsExactly("guest-2:Player2:Three of a Kind", "guest-1:Owner:One Pair");
        assertThat(showdownHandsPayload(handEnded))
                .allSatisfy(hand -> assertThat((List<?>) hand.get("holeCards")).hasSize(2));
        assertThat(recentlyBustedPlayersPayload(handEnded)).singleElement().satisfies((player) -> {
            assertThat(player).containsEntry("guestId", "guest-1");
            assertThat(player).containsEntry("nickname", "Owner");
            assertThat(player).containsEntry("seatIndex", 0);
            assertThat(player).containsEntry("finalStack", 0);
        });
        assertThat(showdownPotsPayload(handEnded)).singleElement().satisfies((pot) -> {
            assertThat(pot).containsEntry("type", "MAIN");
            assertThat(pot).containsEntry("amount", 4_000);
        });

        var playerBusted = requireEvent(broadcast, "playerBusted");
        assertThat(playerBusted.payload()).containsEntry("guestIds", List.of("guest-1"));
        assertThat(playerBusted.payload()).containsEntry("nicknames", List.of("Owner"));
        assertThat(bustedPlayersPayload(playerBusted)).singleElement().satisfies((player) -> {
            assertThat(player).containsEntry("guestId", "guest-1");
            assertThat(player).containsEntry("nickname", "Owner");
            assertThat(player).containsEntry("seatIndex", 0);
            assertThat(player).containsEntry("finalStack", 0);
        });
    }

    // Verifies that the final hand remains visible briefly before auto-transitioning into FINISHED.
    @Test
    void autoAdvancesFinalHandResultIntoFinishedTournament() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "CALL", null).primaryEvent().snapshot();
        var expiredDeadline = Instant.now().minusMillis(1).toEpochMilli();

        setHandResultDeadline(service, code, expiredDeadline);
        var finishedBroadcast = service.autoAdvanceHandResult(code, expiredDeadline);
        var finishedSnapshot = finishedBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(finishedBroadcast)).containsExactly("tournamentFinished");
        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(finishedSnapshot.status()).isEqualTo(TournamentStatus.FINISHED);
        assertThat(finishedSnapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
        assertThat(finishedSnapshot.showdownPots()).hasSize(1);
        assertThat(finishedSnapshot.showdownHands())
                .extracting(hand -> hand.guestId() + ":" + hand.handLabel())
                .containsExactly("guest-2:Three of a Kind", "guest-1:One Pair");
        assertThat(finishedSnapshot.recentlyBustedGuestIds()).containsExactly("guest-1");

        var tournamentFinished = requireEvent(finishedBroadcast, "tournamentFinished");
        assertThat(tournamentFinished.payload()).containsEntry("winnerGuestId", "guest-2");
        assertThat(tournamentFinished.payload()).containsEntry("winnerNickname", "Player2");
        assertThat(tournamentFinished.payload()).containsEntry("winnerStack", 4_000);
        assertThat(tournamentFinished.payload()).containsEntry("boardCards", List.of("AH", "KD", "7C", "4S", "2D"));
        assertThat(tournamentFinished.payload()).containsEntry("showdownPotCount", 1);
        assertThat(tournamentFinished.payload()).containsEntry("recentlyBustedGuestIds", List.of("guest-1"));
        assertThat(showdownHandsPayload(tournamentFinished))
                .extracting(
                        hand -> hand.get("guestId") + ":" + hand.get("nickname") + ":" + hand.get("handLabel")
                )
                .containsExactly("guest-2:Player2:Three of a Kind", "guest-1:Owner:One Pair");
        assertThat(showdownHandsPayload(tournamentFinished))
                .allSatisfy(hand -> assertThat((List<?>) hand.get("holeCards")).hasSize(2));
        assertThat(recentlyBustedPlayersPayload(tournamentFinished)).singleElement().satisfies((player) -> {
            assertThat(player).containsEntry("guestId", "guest-1");
            assertThat(player).containsEntry("nickname", "Owner");
            assertThat(player).containsEntry("seatIndex", 0);
            assertThat(player).containsEntry("finalStack", 0);
        });
        assertThat(showdownPotsPayload(tournamentFinished)).singleElement().satisfies((pot) -> {
            assertThat(pot).containsEntry("type", "MAIN");
            assertThat(pot).containsEntry("amount", 4_000);
            assertThat(pot.get("winnerGuestIds")).isEqualTo(List.of("guest-2"));
        });
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
        assertThat(snapshot.showdownHands()).hasSize(3);
        assertThat(snapshot.showdownHands())
                .extracting(hand -> hand.handLabel())
                .containsOnly("One Pair");
        assertThat(snapshot.recentlyBustedGuestIds()).isEmpty();
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
        assertThat(requireSnapshotPlayer(snapshot, "guest-2").stack()).isEqualTo(2_000);
        assertThat(requireSnapshotPlayer(snapshot, "guest-3").stack()).isEqualTo(2_000);
    }

    // Verifies that a short all-in changes the call price without reopening raises for players who already acted.
    @Test
    void shortAllInDoesNotReopenRaiseForPriorActors() {
        var service = createService();
        var code = prepareTournament(service, 4);

        setPlayerStack(service, code, "guest-2", 120);

        service.applyAction(code, "guest-4", "RAISE", 100);
        service.applyAction(code, "guest-1", "CALL", null);
        var afterShortAllIn = service.applyAction(code, "guest-2", "ALL_IN", null).primaryEvent().snapshot();

        assertThat(afterShortAllIn.actingSeat()).isEqualTo(2);
        assertThat(afterShortAllIn.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        var afterBigBlindCall = service.applyAction(code, "guest-3", "CALL", null).primaryEvent().snapshot();

        assertThat(afterBigBlindCall.actingSeat()).isEqualTo(3);
        assertThat(afterBigBlindCall.availableActions()).containsExactly("FOLD", "CALL", "ALL_IN");

        var afterOriginalRaiserCall = service.applyAction(code, "guest-4", "CALL", null).primaryEvent().snapshot();

        assertThat(afterOriginalRaiserCall.actingSeat()).isEqualTo(0);
        assertThat(afterOriginalRaiserCall.availableActions()).containsExactly("FOLD", "CALL", "ALL_IN");
    }

    // Verifies that a new postflop betting round resets the minimum wager size back to the big blind.
    @Test
    void resetsMinimumWagerSizeToBigBlindOnPostflopStreet() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "RAISE", 120);
        service.applyAction(code, "guest-2", "CALL", null);
        var flopSnapshot = service.applyAction(code, "guest-3", "CALL", null).primaryEvent().snapshot();

        assertThat(flopSnapshot.boardCards()).containsExactly("AH", "KD", "7C");
        assertThat(flopSnapshot.actingSeat()).isEqualTo(1);
        assertThat(flopSnapshot.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");

        assertThatThrownBy(() -> service.applyAction(code, "guest-2", "BET", 10))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("at least 20");

        var afterRejectedBet = service.getTournament(code);
        assertThat(afterRejectedBet.actingSeat()).isEqualTo(1);
        assertThat(afterRejectedBet.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");

        var afterValidBet = service.applyAction(code, "guest-2", "BET", 30).primaryEvent().snapshot();

        assertThat(afterValidBet.actingSeat()).isEqualTo(2);
        assertThat(afterValidBet.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
    }

    // Verifies that a short postflop all-in keeps prior actors closed and survives persistence reloads.
    @Test
    void restoresShortAllInRaiseRightsStateAcrossPersistenceReloads() {
        var service = createService();
        var code = prepareTournament(service, 4);

        service.applyAction(code, "guest-4", "CALL", null);
        service.applyAction(code, "guest-1", "CALL", null);
        service.applyAction(code, "guest-2", "CALL", null);
        var flopSnapshot = service.applyAction(code, "guest-3", "CHECK", null).primaryEvent().snapshot();

        assertThat(flopSnapshot.actingSeat()).isEqualTo(1);
        assertThat(flopSnapshot.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");

        setPlayerStack(service, code, "guest-3", 15);

        service.applyAction(code, "guest-2", "CHECK", null);
        var afterShortAllIn = service.applyAction(code, "guest-3", "ALL_IN", null).primaryEvent().snapshot();

        assertThat(afterShortAllIn.actingSeat()).isEqualTo(3);
        assertThat(afterShortAllIn.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        evictTournamentFromCache(service, code);
        var restoredPendingSnapshot = service.getTournament(code);

        assertThat(restoredPendingSnapshot.actingSeat()).isEqualTo(3);
        assertThat(restoredPendingSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        service.applyAction(code, "guest-4", "CALL", null);
        var afterPriorPendingCall = service.applyAction(code, "guest-1", "CALL", null).primaryEvent().snapshot();

        assertThat(afterPriorPendingCall.actingSeat()).isEqualTo(1);
        assertThat(afterPriorPendingCall.availableActions()).containsExactly("FOLD", "CALL", "ALL_IN");

        evictTournamentFromCache(service, code);
        var restoredPriorActorSnapshot = service.getTournament(code);

        assertThat(restoredPriorActorSnapshot.actingSeat()).isEqualTo(1);
        assertThat(restoredPriorActorSnapshot.availableActions()).containsExactly("FOLD", "CALL", "ALL_IN");
    }

    // Verifies that dealt community cards survive persistence reloads and keep opening in the original order.
    @Test
    void restoresBoardRunoutAcrossPersistenceReloads() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "RAISE", 120);
        service.applyAction(code, "guest-2", "CALL", null);
        var flopSnapshot = service.applyAction(code, "guest-3", "CALL", null).primaryEvent().snapshot();

        assertThat(flopSnapshot.boardCards()).containsExactly("AH", "KD", "7C");

        evictTournamentFromCache(service, code);
        var restoredFlopSnapshot = service.getTournament(code);

        assertThat(restoredFlopSnapshot.boardCards()).containsExactly("AH", "KD", "7C");
        assertThat(restoredFlopSnapshot.actingSeat()).isEqualTo(1);
        assertThat(restoredFlopSnapshot.availableActions()).containsExactly("CHECK", "BET", "ALL_IN");

        service.applyAction(code, "guest-2", "CHECK", null);
        service.applyAction(code, "guest-3", "CHECK", null);
        var turnSnapshot = service.applyAction(code, "guest-1", "CHECK", null).primaryEvent().snapshot();

        assertThat(turnSnapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S");

        evictTournamentFromCache(service, code);
        var restoredTurnSnapshot = service.getTournament(code);

        assertThat(restoredTurnSnapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S");

        service.applyAction(code, "guest-2", "CHECK", null);
        service.applyAction(code, "guest-3", "CHECK", null);
        var riverSnapshot = service.applyAction(code, "guest-1", "CHECK", null).primaryEvent().snapshot();

        assertThat(riverSnapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
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
                .hasMessageContaining("이미 다른 토너먼트에 참여 중입니다.");
        assertThatThrownBy(() -> service.joinTournament(secondCode, "guest-1", "Owner"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("이미 다른 토너먼트에 참여 중입니다.");

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

    // Verifies that reconnect during the result window keeps the settlement summary visible instead of replacing it.
    @Test
    void reconnectKeepsExistingHandResultSummary() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "FOLD", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(handResultSnapshot.tableMessage()).contains("won 20.");

        service.disconnectPlayer(code, "guest-2");
        var reconnectSnapshot = service.reconnectPlayer(code, "guest-2").primaryEvent().snapshot();

        assertThat(reconnectSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-2").connected()).isTrue();
        assertThat(reconnectSnapshot.tableMessage()).contains("Player2 reconnected.");
        assertThat(reconnectSnapshot.tableMessage()).contains("won 20.");
    }

    // Verifies that a disconnected in-hand player stays offline after reload and can reconnect from persisted state.
    @Test
    void reconnectsDisconnectedPlayerAfterPersistenceReload() {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules, 20);
        var eventFactory = new TournamentEventFactory(snapshotFactory);
        var stateAccess = new TournamentStateAccess(rules);
        var lobbyManager = new TournamentLobbyManager(stateAccess, rules, identityFactory);
        var ownershipManager = new TournamentOwnershipManager();
        var potResolver = new TournamentPotResolver(new PokerHandEvaluator());
        var handSetupManager = new TournamentHandSetupManager(rules, stateAccess, new FixedTournamentDeckFactory());
        var bettingActionManager = new TournamentBettingActionManager(rules);
        var handResultManager = new TournamentHandResultManager(stateAccess, potResolver);
        var handProgressManager = new TournamentHandProgressManager(
                stateAccess,
                potResolver,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                15
        );
        var handEngine = new TournamentHandEngine(
                stateAccess,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                handProgressManager
        );
        var connectionManager = new TournamentConnectionManager(stateAccess, ownershipManager, handEngine);
        var stateStore = new InMemoryTournamentStateStore(new TournamentStatePersistenceMapper(new ObjectMapper(), rules));
        var commandLock = new InMemoryTournamentCommandLock();
        var firstService = new TournamentService(
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
                event -> {
                },
                50,
                1_800,
                7_200,
                15,
                86_400,
                150
        );

        var code = prepareTournament(firstService, 3);
        firstService.disconnectPlayer(code, "guest-2");

        var persistedSnapshot = snapshotFactory.toSnapshot(stateStore.load(code));
        assertThat(requireSnapshotPlayer(persistedSnapshot, "guest-2").connected()).isFalse();
        assertThat(requireSnapshotPlayer(persistedSnapshot, "guest-2").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(persistedSnapshot.actingSeat()).isEqualTo(0);

        var secondService = new TournamentService(
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
                event -> {
                },
                50,
                1_800,
                7_200,
                15,
                86_400,
                150
        );

        var restoredSnapshot = secondService.getTournament(code);
        assertThat(requireSnapshotPlayer(restoredSnapshot, "guest-2").connected()).isFalse();
        assertThat(requireSnapshotPlayer(restoredSnapshot, "guest-2").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(restoredSnapshot.actingSeat()).isEqualTo(0);
        assertThat(restoredSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        var reconnectBroadcast = secondService.reconnectPlayer(code, "guest-2");
        var reconnectSnapshot = reconnectBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(reconnectBroadcast)).containsExactly("tournamentSnapshot", "playerReconnected");
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-2").connected()).isTrue();
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-2").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(reconnectSnapshot.actingSeat()).isEqualTo(0);
        assertThat(reconnectSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
    }

    // Verifies that disconnecting an already all-in player preserves showdown eligibility through reload and reconnect.
    @Test
    void preservesDisconnectedAllInPlayerAcrossPersistenceReload() {
        var service = createService();
        var code = prepareTournament(service, 3);

        setPlayerStack(service, code, "guest-1", 100);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var disconnectedSnapshot = service.disconnectPlayer(code, "guest-1").primaryEvent().snapshot();

        assertThat(disconnectedSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(requireSnapshotPlayer(disconnectedSnapshot, "guest-1").connected()).isFalse();
        assertThat(requireSnapshotPlayer(disconnectedSnapshot, "guest-1").status()).isEqualTo(PlayerStatus.ALL_IN);
        assertThat(disconnectedSnapshot.actingSeat()).isEqualTo(1);
        assertThat(disconnectedSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        evictTournamentFromCache(service, code);
        var restoredSnapshot = service.getTournament(code);

        assertThat(restoredSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(requireSnapshotPlayer(restoredSnapshot, "guest-1").connected()).isFalse();
        assertThat(requireSnapshotPlayer(restoredSnapshot, "guest-1").status()).isEqualTo(PlayerStatus.ALL_IN);
        assertThat(restoredSnapshot.actingSeat()).isEqualTo(1);
        assertThat(restoredSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");

        var reconnectSnapshot = service.reconnectPlayer(code, "guest-1").primaryEvent().snapshot();

        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-1").connected()).isTrue();
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-1").status()).isEqualTo(PlayerStatus.ALL_IN);
        assertThat(reconnectSnapshot.actingSeat()).isEqualTo(1);
        assertThat(reconnectSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
    }

    // Verifies that reconnecting from a persisted expired hand-result state first advances into the next hand.
    @Test
    void reconnectAdvancesExpiredHandResultAfterPersistenceReload() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "FOLD", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);

        service.disconnectPlayer(code, "guest-3");
        setHandResultDeadline(service, code, Instant.now().minusMillis(1).toEpochMilli());
        persistCurrentTournamentState(service, code);
        evictTournamentFromCache(service, code);

        var reconnectBroadcast = service.reconnectPlayer(code, "guest-3");
        var reconnectSnapshot = reconnectBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(reconnectBroadcast)).containsExactly("handStarted", "tournamentSnapshot", "playerReconnected");
        assertThat(reconnectSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(reconnectSnapshot.boardCards()).isEmpty();
        assertThat(reconnectSnapshot.showdownPots()).isEmpty();
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-3").connected()).isTrue();
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-3").status()).isEqualTo(PlayerStatus.ACTIVE);
        assertThat(reconnectSnapshot.tableMessage()).contains("Player3 reconnected.");
        assertThat(reconnectSnapshot.tableMessage()).contains("Preflop action is open.");
    }

    // Verifies that disconnecting from a persisted expired hand-result state first advances into the next hand.
    @Test
    void disconnectAdvancesExpiredHandResultAfterPersistenceReload() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "FOLD", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);

        setHandResultDeadline(service, code, Instant.now().minusMillis(1).toEpochMilli());
        persistCurrentTournamentState(service, code);
        evictTournamentFromCache(service, code);

        var disconnectBroadcast = service.disconnectPlayer(code, "guest-3");
        var disconnectSnapshot = disconnectBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(disconnectBroadcast)).containsExactly("handStarted", "playerDisconnected");
        assertThat(disconnectSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(disconnectSnapshot.boardCards()).isEmpty();
        assertThat(disconnectSnapshot.showdownPots()).isEmpty();
        assertThat(requireSnapshotPlayer(disconnectSnapshot, "guest-3").connected()).isFalse();
        assertThat(requireSnapshotPlayer(disconnectSnapshot, "guest-3").status()).isEqualTo(PlayerStatus.FOLDED);
        assertThat(disconnectSnapshot.tableMessage()).contains("Player3 disconnected");
        assertThat(disconnectSnapshot.tableMessage()).contains("Preflop action is open.");
    }

    // Verifies that reconnecting after an expired final result normalizes into FINISHED before seat recovery.
    @Test
    void reconnectFinalResultAfterExpiryNormalizesIntoFinishedTournament() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "CALL", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);

        service.disconnectPlayer(code, "guest-2");
        setHandResultDeadline(service, code, Instant.now().minusMillis(1).toEpochMilli());
        persistCurrentTournamentState(service, code);
        evictTournamentFromCache(service, code);

        var reconnectBroadcast = service.reconnectPlayer(code, "guest-2");
        var reconnectSnapshot = reconnectBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(reconnectBroadcast)).containsExactly("tournamentFinished", "tournamentSnapshot", "playerReconnected");
        assertThat(reconnectSnapshot.status()).isEqualTo(TournamentStatus.FINISHED);
        assertThat(reconnectSnapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
        assertThat(reconnectSnapshot.showdownPots()).hasSize(1);
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-2").connected()).isTrue();
        assertThat(reconnectSnapshot.tableMessage()).contains("Player2 wins the tournament.");
        assertThat(reconnectSnapshot.tableMessage()).contains("Player2 reconnected.");
    }

    // Verifies that disconnecting after an expired final result normalizes into FINISHED before seat cleanup.
    @Test
    void disconnectFinalResultAfterExpiryNormalizesIntoFinishedTournament() {
        var service = createService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "CALL", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);

        setHandResultDeadline(service, code, Instant.now().minusMillis(1).toEpochMilli());
        persistCurrentTournamentState(service, code);
        evictTournamentFromCache(service, code);

        var disconnectBroadcast = service.disconnectPlayer(code, "guest-2");
        var disconnectSnapshot = disconnectBroadcast.primaryEvent().snapshot();

        assertThat(eventTypes(disconnectBroadcast)).containsExactly("tournamentFinished", "playerDisconnected");
        assertThat(disconnectSnapshot.status()).isEqualTo(TournamentStatus.FINISHED);
        assertThat(disconnectSnapshot.boardCards()).containsExactlyElementsOf(FIXED_BOARD_RUNOUT);
        assertThat(disconnectSnapshot.showdownPots()).hasSize(1);
        assertThat(requireSnapshotPlayer(disconnectSnapshot, "guest-2").connected()).isFalse();
        assertThat(disconnectSnapshot.tableMessage()).contains("Player2 wins the tournament.");
        assertThat(disconnectSnapshot.tableMessage()).contains("Player2 disconnected.");
    }

    // Verifies that a stale service cache reloads the latest persisted tournament before running one locked command.
    @Test
    void refreshesLatestPersistedTournamentBeforeLockedCommandAcrossServiceInstances() {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules, 20);
        var eventFactory = new TournamentEventFactory(snapshotFactory);
        var stateAccess = new TournamentStateAccess(rules);
        var lobbyManager = new TournamentLobbyManager(stateAccess, rules, identityFactory);
        var ownershipManager = new TournamentOwnershipManager();
        var potResolver = new TournamentPotResolver(new PokerHandEvaluator());
        var handSetupManager = new TournamentHandSetupManager(rules, stateAccess, new FixedTournamentDeckFactory());
        var bettingActionManager = new TournamentBettingActionManager(rules);
        var handResultManager = new TournamentHandResultManager(stateAccess, potResolver);
        var handProgressManager = new TournamentHandProgressManager(
                stateAccess,
                potResolver,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                15
        );
        var handEngine = new TournamentHandEngine(
                stateAccess,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                handProgressManager
        );
        var connectionManager = new TournamentConnectionManager(stateAccess, ownershipManager, handEngine);
        var stateStore = new InMemoryTournamentStateStore(new TournamentStatePersistenceMapper(new ObjectMapper(), rules));
        var commandLock = new InMemoryTournamentCommandLock();
        var firstService = new TournamentService(
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
                event -> {
                },
                50,
                1_800,
                7_200,
                15,
                86_400,
                150
        );
        var secondService = new TournamentService(
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
                event -> {
                },
                50,
                1_800,
                7_200,
                15,
                86_400,
                150
        );

        var createdSnapshot = firstService.createTournament("guest-1", "Owner");
        firstService.joinTournament(createdSnapshot.code(), "guest-2", "Player2");

        secondService.getTournament(createdSnapshot.code());

        firstService.changeReady(createdSnapshot.code(), "guest-1", true);
        firstService.changeReady(createdSnapshot.code(), "guest-2", true);

        var startedSnapshot = secondService.startTournament(createdSnapshot.code(), "guest-1").primaryEvent().snapshot();

        assertThat(startedSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(requireSnapshotPlayer(startedSnapshot, "guest-1").status()).isEqualTo(PlayerStatus.ACTIVE);
        assertThat(requireSnapshotPlayer(startedSnapshot, "guest-2").status()).isEqualTo(PlayerStatus.ACTIVE);
    }

    // Verifies that a fresh service instance can restore tournament progress from persisted state.
    @Test
    void restoresPersistedTournamentStateAcrossServiceInstances() {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules, 20);
        var eventFactory = new TournamentEventFactory(snapshotFactory);
        var stateAccess = new TournamentStateAccess(rules);
        var lobbyManager = new TournamentLobbyManager(stateAccess, rules, identityFactory);
        var ownershipManager = new TournamentOwnershipManager();
        var potResolver = new TournamentPotResolver(new PokerHandEvaluator());
        var handSetupManager = new TournamentHandSetupManager(rules, stateAccess, new FixedTournamentDeckFactory());
        var bettingActionManager = new TournamentBettingActionManager(rules);
        var handResultManager = new TournamentHandResultManager(stateAccess, potResolver);
        var handProgressManager = new TournamentHandProgressManager(
                stateAccess,
                potResolver,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                15
        );
        var handEngine = new TournamentHandEngine(
                stateAccess,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                handProgressManager
        );
        var connectionManager = new TournamentConnectionManager(stateAccess, ownershipManager, handEngine);
        var stateStore = new InMemoryTournamentStateStore(new TournamentStatePersistenceMapper(new ObjectMapper(), rules));
        var commandLock = new InMemoryTournamentCommandLock();
        var firstService = new TournamentService(
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
                event -> {
                },
                50,
                1_800,
                7_200,
                15,
                86_400,
                150
        );

        var code = prepareTournament(firstService, 3);
        firstService.applyAction(code, "guest-1", "CALL", null);
        var inMemorySnapshot = firstService.getTournament(code);
        var persistedSnapshot = snapshotFactory.toSnapshot(stateStore.load(code));

        assertThat(inMemorySnapshot.mainPot()).isEqualTo(50);
        assertThat(inMemorySnapshot.sidePots()).isEmpty();
        assertThat(persistedSnapshot.mainPot()).isEqualTo(50);
        assertThat(persistedSnapshot.sidePots()).isEmpty();

        var secondService = new TournamentService(
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
                event -> {
                },
                50,
                1_800,
                7_200,
                15,
                86_400,
                150
        );
        var restoredSnapshot = secondService.getTournament(code);

        assertThat(restoredSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(restoredSnapshot.code()).isEqualTo(code);
        assertThat(restoredSnapshot.mainPot()).isEqualTo(50);
        assertThat(restoredSnapshot.sidePots()).isEmpty();
        assertThat(restoredSnapshot.boardCards()).isEmpty();
        assertThat(restoredSnapshot.actingSeat()).isEqualTo(1);
        assertThat(restoredSnapshot.availableActions()).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
        assertThat(requireSnapshotPlayer(restoredSnapshot, "guest-1").stack()).isEqualTo(1_980);

        var resumedActionEvent = secondService.applyAction(code, "guest-2", "CALL", null).primaryEvent();
        var resumedSnapshot = resumedActionEvent.snapshot();

        assertThat(resumedSnapshot.status()).isEqualTo(TournamentStatus.IN_HAND);
        assertThat(resumedSnapshot.mainPot()).isEqualTo(60);
        assertThat(resumedSnapshot.sidePots()).isEmpty();
        assertThat(resumedSnapshot.actingSeat()).isEqualTo(2);
        assertThat(resumedSnapshot.availableActions()).containsExactly("CHECK", "RAISE", "ALL_IN");
        assertThat(requireSnapshotPlayer(resumedSnapshot, "guest-2").stack()).isEqualTo(1_980);
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
        assertThat(restoredSnapshot.mainPot()).isEqualTo(50);
        assertThat(restoredSnapshot.sidePots()).isEmpty();
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
        return createService(50);
    }

    // Builds the same dependency graph with a configurable active-player capacity cap.
    private TournamentService createService(int maxActivePlayers) {
        return createService(maxActivePlayers, 1_800, 7_200, 86_400);
    }

    // Builds the same dependency graph with configurable capacity and TTL cleanup settings.
    private TournamentService createService(
            int maxActivePlayers,
            long waitingIdleTtlSeconds,
            long inHandIdleTtlSeconds,
            long hardTtlSeconds
    ) {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules, 20);
        var eventFactory = new TournamentEventFactory(snapshotFactory);
        var stateAccess = new TournamentStateAccess(rules);
        var lobbyManager = new TournamentLobbyManager(stateAccess, rules, identityFactory);
        var ownershipManager = new TournamentOwnershipManager();
        var potResolver = new TournamentPotResolver(new PokerHandEvaluator());
        var handSetupManager = new TournamentHandSetupManager(rules, stateAccess, new FixedTournamentDeckFactory());
        var bettingActionManager = new TournamentBettingActionManager(rules);
        var handResultManager = new TournamentHandResultManager(stateAccess, potResolver);
        var handProgressManager = new TournamentHandProgressManager(
                stateAccess,
                potResolver,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                15
        );
        var handEngine = new TournamentHandEngine(
                stateAccess,
                handSetupManager,
                bettingActionManager,
                handResultManager,
                handProgressManager
        );
        var connectionManager = new TournamentConnectionManager(stateAccess, ownershipManager, handEngine);
        var stateStore = new InMemoryTournamentStateStore(new TournamentStatePersistenceMapper(new ObjectMapper(), rules));
        return new TournamentService(
                identityFactory,
                snapshotFactory,
                eventFactory,
                stateAccess,
                lobbyManager,
                connectionManager,
                handEngine,
                handProgressManager,
                new InMemoryTournamentCommandLock(),
                stateStore,
                event -> {
                },
                maxActivePlayers,
                waitingIdleTtlSeconds,
                inHandIdleTtlSeconds,
                15,
                hardTtlSeconds,
                150
        );
    }

    // Overrides one remaining stack so the test can model an uneven stack tournament hand.
    private void setPlayerStack(TournamentService service, String code, String guestId, int stack) {
        var tournament = requireTournamentState(service, code);
        var player = requirePlayerState(tournament, guestId);
        ReflectionTestUtils.setField(player, "stack", stack);
        persistCurrentTournamentState(service, code);
    }

    // Overrides the active blind-level start timestamp so the next hand crosses a level boundary.
    private void setLevelActivatedAt(TournamentService service, String code, long epochSecond) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "levelActivatedAtEpochSecond", epochSecond);
        persistCurrentTournamentState(service, code);
    }

    // Overrides the result deadline so tests can force the hand-result timeout branch deterministically.
    private void setHandResultDeadline(TournamentService service, String code, long epochMilli) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "handResultEndsAtEpochMilli", epochMilli);
        persistCurrentTournamentState(service, code);
    }

    // Overrides the current action deadline so tests can force one turn timeout deterministically.
    private void setActionDeadline(TournamentService service, String code, long epochMilli) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "actionDeadlineAtEpochMilli", epochMilli);
        persistCurrentTournamentState(service, code);
    }

    // Overrides the finished cleanup deadline so tests can force the delayed delete branch deterministically.
    private void setFinishedCleanupDeadline(TournamentService service, String code, long epochMilli) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "finishedCleanupAtEpochMilli", epochMilli);
        persistCurrentTournamentState(service, code);
    }

    // Persists the currently mutated in-memory tournament so cache-eviction tests can reload the same state.
    private void persistCurrentTournamentState(TournamentService service, String code) {
        var tournament = requireTournamentState(service, code);
        var stateStore = (TournamentStateStore) ReflectionTestUtils.getField(service, "stateStore");
        assertThat(stateStore).isNotNull();
        stateStore.save((TournamentState) tournament);
    }

    // Overrides one persisted update timestamp so stale-cleanup tests can model idle tournaments.
    private void touchPersistedTournament(TournamentService service, String code, long updatedAtEpochMilli) {
        persistCurrentTournamentState(service, code);
        var stateStore = (TournamentStateStore) ReflectionTestUtils.getField(service, "stateStore");
        assertThat(stateStore).isInstanceOf(InMemoryTournamentStateStore.class);
        ((InMemoryTournamentStateStore) stateStore).touch(code, updatedAtEpochMilli);
        evictTournamentFromCache(service, code);
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

    // Locates one named event inside a multi-event websocket broadcast.
    private TournamentEvent requireEvent(TournamentBroadcast broadcast, String eventType) {
        return broadcast.events().stream()
                .filter(event -> event.eventType().equals(eventType))
                .findFirst()
                .orElseThrow();
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

    // Reads the structured showdown payload list from a result event.
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> showdownPotsPayload(TournamentEvent event) {
        return (List<Map<String, Object>>) event.payload().get("pots");
    }

    // Reads the structured showdown-hand payload list from a result event.
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> showdownHandsPayload(TournamentEvent event) {
        return (List<Map<String, Object>>) event.payload().get("showdownHands");
    }

    // Reads the structured busted-player payload list from a result event.
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> bustedPlayersPayload(TournamentEvent event) {
        return (List<Map<String, Object>>) event.payload().get("players");
    }

    // Reads the hand-local busted-player payload list from a result event.
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> recentlyBustedPlayersPayload(TournamentEvent event) {
        return (List<Map<String, Object>>) event.payload().get("recentlyBustedPlayers");
    }

    private static final class FixedTournamentDeckFactory implements TournamentDeckFactory {

        @Override
        public List<String> createDeck(int playersToDeal) {
            var orderedDeckWithoutBoard = buildOrderedDeckWithoutBoard();
            var dealtHoleCards = playersToDeal * 2;
            var deck = new java.util.ArrayList<String>(52);
            deck.addAll(orderedDeckWithoutBoard.subList(0, dealtHoleCards));
            deck.addAll(FIXED_BOARD_RUNOUT);
            deck.addAll(orderedDeckWithoutBoard.subList(dealtHoleCards, orderedDeckWithoutBoard.size()));
            return deck;
        }

        private List<String> buildOrderedDeckWithoutBoard() {
            var ranks = "23456789TJQKA";
            var suits = "CDHS";
            var deck = new java.util.ArrayList<String>(47);
            for (var rankIndex = 0; rankIndex < ranks.length(); rankIndex++) {
                for (var suitIndex = 0; suitIndex < suits.length(); suitIndex++) {
                    var card = "" + ranks.charAt(rankIndex) + suits.charAt(suitIndex);
                    if (!FIXED_BOARD_RUNOUT.contains(card)) {
                        deck.add(card);
                    }
                }
            }
            return deck;
        }
    }
}
