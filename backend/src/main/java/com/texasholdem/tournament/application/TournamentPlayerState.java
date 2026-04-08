package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;

import java.util.ArrayList;
import java.util.List;

final class TournamentPlayerState {

    final String guestId;
    final String nickname;
    final int seatIndex;
    int stack = 0;
    PlayerStatus status = PlayerStatus.SEATED;
    boolean owner = false;
    boolean connected = true;
    boolean participating = false;
    boolean acting = false;
    int totalContribution = 0;
    int roundContribution = 0;
    boolean awaitingAction = false;
    boolean raiseRightsAvailable = false;
    List<String> holeCards = new ArrayList<>();

    // Stores mutable player state for the in-memory tournament model.
    TournamentPlayerState(String guestId, String nickname, int seatIndex) {
        this.guestId = guestId;
        this.nickname = nickname;
        this.seatIndex = seatIndex;
    }

    // Tells whether the player is still eligible to win a pot this hand.
    boolean isEligibleForPot() {
        return participating && status != PlayerStatus.FOLDED && status != PlayerStatus.BUSTED_OUT;
    }

    // Tells whether the player is still part of the current hand state.
    boolean isInHand() {
        return participating && status != PlayerStatus.FOLDED && status != PlayerStatus.BUSTED_OUT;
    }

    // Marks the creating player as the table owner.
    static TournamentPlayerState owner(String guestId, String nickname, int seatIndex) {
        var player = new TournamentPlayerState(guestId, nickname, seatIndex);
        player.owner = true;
        return player;
    }
}
