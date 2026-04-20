package com.texasholdem.tournament.application.hand;

import com.texasholdem.tournament.application.state.*;
import com.texasholdem.tournament.domain.PlayerStatus;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TournamentBettingActionManagerTest {

    @Test
    void rejectsRaiseBelowLastFullRaiseSize() {
        var rules = new TournamentRules();
        var manager = new TournamentBettingActionManager(rules);
        var tournament = new TournamentState("TEST1");
        tournament.levelIndex = 0;
        tournament.currentBet = 60;
        tournament.lastFullRaiseSize = 60;

        var player = activePlayer("guest-1", 0, 200, 60);
        player.raiseRightsAvailable = true;

        assertThatThrownBy(() -> manager.applyAction(tournament, player, "RAISE", 100))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("at least 120");
    }

    @Test
    void shortAllInKeepsPreviousPlayersFromReopeningRaiseRights() {
        var rules = new TournamentRules();
        var manager = new TournamentBettingActionManager(rules);
        var stateAccess = new TournamentStateAccess(rules);
        var tournament = new TournamentState("TEST2");
        tournament.levelIndex = 0;
        tournament.currentBet = 100;
        tournament.lastFullRaiseSize = 80;

        var bettor = activePlayer("guest-1", 0, 400, 100);
        bettor.awaitingAction = false;
        bettor.raiseRightsAvailable = false;

        var caller = activePlayer("guest-2", 1, 400, 100);
        caller.awaitingAction = false;
        caller.raiseRightsAvailable = false;

        var shover = activePlayer("guest-3", 2, 30, 100);
        shover.awaitingAction = true;
        shover.raiseRightsAvailable = true;

        var pendingPlayer = activePlayer("guest-4", 3, 400, 20);
        pendingPlayer.awaitingAction = true;
        pendingPlayer.raiseRightsAvailable = true;

        tournament.players.addAll(List.of(bettor, caller, shover, pendingPlayer));

        var result = manager.applyAction(tournament, shover, "ALL_IN", null);

        assertThat(result.action()).isEqualTo("ALL_IN");
        assertThat(result.amount()).isEqualTo(30);
        assertThat(tournament.currentBet).isEqualTo(130);
        assertThat(tournament.lastFullRaiseSize).isEqualTo(80);
        assertThat(bettor.awaitingAction).isTrue();
        assertThat(caller.awaitingAction).isTrue();
        assertThat(pendingPlayer.awaitingAction).isTrue();
        assertThat(bettor.raiseRightsAvailable).isFalse();
        assertThat(caller.raiseRightsAvailable).isFalse();
        assertThat(pendingPlayer.raiseRightsAvailable).isTrue();
        assertThat(stateAccess.buildAvailableActions(tournament, bettor)).containsExactly("FOLD", "CALL", "ALL_IN");
        assertThat(stateAccess.buildAvailableActions(tournament, pendingPlayer)).containsExactly("FOLD", "CALL", "RAISE", "ALL_IN");
        assertThat(shover.status).isEqualTo(PlayerStatus.ALL_IN);
    }

    private TournamentPlayerState activePlayer(String guestId, int seatIndex, int stack, int roundContribution) {
        var player = new TournamentPlayerState(guestId, guestId, seatIndex);
        player.participating = true;
        player.status = PlayerStatus.ACTIVE;
        player.stack = stack;
        player.roundContribution = roundContribution;
        player.totalContribution = roundContribution;
        return player;
    }
}
