package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TournamentServiceTest {

    // Verifies that a short-stack shove creates a main pot and side pot from contribution tiers.
    @Test
    void calculatesMainAndSidePotsFromUnevenAllInContributions() {
        var service = new TournamentService();
        var code = prepareTournament(service, 3);

        setPlayerStack(service, code, "guest-1", 300);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        service.applyAction(code, "guest-2", "CALL", null);
        service.applyAction(code, "guest-3", "RAISE", 600);
        var event = service.applyAction(code, "guest-2", "CALL", null);
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
        var service = new TournamentService();
        var code = prepareTournament(service, 3);

        service.applyAction(code, "guest-1", "FOLD", null);
        var event = service.applyAction(code, "guest-2", "FOLD", null);
        var snapshot = event.snapshot();

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(snapshot.actingSeat()).isNull();
        assertThat(snapshot.availableActions()).isEmpty();
        assertThat(snapshot.mainPot()).isEqualTo(20);
        assertThat(snapshot.sidePots()).isEmpty();
    }

    // Verifies that matched all-ins move the hand straight to showdown with the full board revealed.
    @Test
    void revealsFullBoardWhenAllRemainingPlayersAreAllIn() {
        var service = new TournamentService();
        var code = prepareTournament(service, 2);

        service.applyAction(code, "guest-1", "ALL_IN", null);
        var event = service.applyAction(code, "guest-2", "CALL", null);
        var snapshot = event.snapshot();

        assertThat(snapshot.status()).isEqualTo(TournamentStatus.HAND_RESULT);
        assertThat(snapshot.mainPot()).isEqualTo(2_000);
        assertThat(snapshot.sidePots()).isEmpty();
        assertThat(snapshot.boardCards()).containsExactly("AH", "KD", "7C", "4S", "2D");
        assertThat(snapshot.actingSeat()).isNull();
        assertThat(snapshot.availableActions()).isEmpty();
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

    // Overrides one remaining stack so the test can model an uneven stack tournament hand.
    private void setPlayerStack(TournamentService service, String code, String guestId, int stack) {
        var tournament = requireTournamentState(service, code);
        var player = requirePlayerState(tournament, guestId);
        ReflectionTestUtils.setField(player, "stack", stack);
    }

    // Reads the mutable tournament state from the in-memory service map.
    @SuppressWarnings("unchecked")
    private Object requireTournamentState(TournamentService service, String code) {
        var tournaments = (Map<String, Object>) ReflectionTestUtils.getField(service, "tournaments");
        assertThat(tournaments).isNotNull();
        return tournaments.get(code);
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
