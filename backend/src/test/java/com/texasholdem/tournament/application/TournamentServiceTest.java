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
                .hasMessageContaining("Tournament not found");
    }

    // Verifies that caller-supplied codes are reserved and reusable by join requests.
    @Test
    void createsTournamentWithRequestedCode() {
        var service = createService();

        var snapshot = service.createTournament("guest-1", "Owner", "1111");
        var joinedSnapshot = service.joinTournament("1111", "guest-2", "Player2");

        assertThat(snapshot.code()).isEqualTo("1111");
        assertThat(joinedSnapshot.code()).isEqualTo("1111");
        assertThat(joinedSnapshot.players()).hasSize(2);
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
        assertThat(joinedSnapshot.tableMessage()).contains("Player2 joined the tournament.");
    }

    // Verifies that new creates and joins are rejected once the active-player cap is reached.
    @Test
    void rejectsNewEntriesWhenActivePlayerCapacityIsReached() {
        var service = createService(2);
        var firstCode = service.createTournament("guest-1", "Owner").code();
        service.createTournament("guest-2", "OtherOwner");

        assertThatThrownBy(() -> service.createTournament("guest-3", "LateOwner"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("at capacity");
        assertThatThrownBy(() -> service.joinTournament(firstCode, "guest-3", "LatePlayer"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("at capacity");
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
        assertThat(opponentView.selfHoleCards()).hasSize(2);
        assertThat(ownerView.selfHoleCards()).isNotEqualTo(opponentView.selfHoleCards());
        assertThat(anonymousView.selfHoleCards()).isEmpty();
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
    }

    // Verifies that manually reserved codes cannot be claimed twice.
    @Test
    void rejectsDuplicateRequestedTournamentCode() {
        var service = createService();

        service.createTournament("guest-1", "Owner", "111");

        assertThatThrownBy(() -> service.createTournament("guest-2", "Player2", "111"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Tournament code already exists");
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
                .hasMessageContaining("Tournament not found");
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
                .hasMessageContaining("Tournament not found");
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
                .containsExactly(
                        Map.of("guestId", "guest-2", "nickname", "Player2", "handLabel", "Three of a Kind"),
                        Map.of("guestId", "guest-1", "nickname", "Owner", "handLabel", "One Pair")
                );
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
                .containsExactly(
                        Map.of("guestId", "guest-2", "nickname", "Player2", "handLabel", "Three of a Kind"),
                        Map.of("guestId", "guest-1", "nickname", "Owner", "handLabel", "One Pair")
                );
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
                .containsExactly(
                        Map.of("guestId", "guest-2", "nickname", "Player2", "handLabel", "Three of a Kind"),
                        Map.of("guestId", "guest-1", "nickname", "Owner", "handLabel", "One Pair")
                );
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

    // Verifies that reconnect during the result window keeps the settlement summary visible instead of replacing it.
    @Test
    void reconnectKeepsExistingHandResultSummary() {
        var service = createService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        var handResultSnapshot = service.applyAction(code, "guest-2", "FOLD", null).primaryEvent().snapshot();

        assertThat(handResultSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(handResultSnapshot.tableMessage()).contains("won 20");

        service.disconnectPlayer(code, "guest-2");
        var reconnectSnapshot = service.reconnectPlayer(code, "guest-2").primaryEvent().snapshot();

        assertThat(reconnectSnapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(requireSnapshotPlayer(reconnectSnapshot, "guest-2").connected()).isTrue();
        assertThat(reconnectSnapshot.tableMessage()).contains("Player2 reconnected.");
        assertThat(reconnectSnapshot.tableMessage()).contains("won 20");
    }

    // Verifies that a disconnected in-hand player stays offline after reload and can reconnect from persisted state.
    @Test
    void reconnectsDisconnectedPlayerAfterPersistenceReload() {
        var rules = new TournamentRules();
        var identityFactory = new TournamentIdentityFactory();
        var snapshotFactory = new TournamentSnapshotFactory(rules);
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
                handResultManager
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
                },
                50,
                1_800,
                7_200,
                86_400
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
                stateStore,
                event -> {
                },
                50,
                1_800,
                7_200,
                86_400
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
        var handSetupManager = new TournamentHandSetupManager(rules, stateAccess, new FixedTournamentDeckFactory());
        var bettingActionManager = new TournamentBettingActionManager(rules);
        var handResultManager = new TournamentHandResultManager(stateAccess, potResolver);
        var handProgressManager = new TournamentHandProgressManager(
                stateAccess,
                potResolver,
                handSetupManager,
                bettingActionManager,
                handResultManager
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
                },
                50,
                1_800,
                7_200,
                86_400
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
                stateStore,
                event -> {
                },
                50,
                1_800,
                7_200,
                86_400
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
        var snapshotFactory = new TournamentSnapshotFactory(rules);
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
                handResultManager
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
                stateStore,
                event -> {
                },
                maxActivePlayers,
                waitingIdleTtlSeconds,
                inHandIdleTtlSeconds,
                hardTtlSeconds
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

    // Overrides the finished cleanup deadline so tests can force the delayed delete branch deterministically.
    private void setFinishedCleanupDeadline(TournamentService service, String code, long epochMilli) {
        var tournament = requireTournamentState(service, code);
        ReflectionTestUtils.setField(tournament, "finishedCleanupAtEpochMilli", epochMilli);
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
