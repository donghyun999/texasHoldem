package com.texasholdem.tournament.application.state;

import com.texasholdem.tournament.domain.PlayerStatus;

import java.util.ArrayList;
import java.util.List;

public final class TournamentPlayerState {

    public final String guestId;
    public final String nickname;
    public final int seatIndex;
    public int stack = 0;
    public PlayerStatus status = PlayerStatus.SEATED;
    public boolean owner = false;
    public boolean connected = true;
    public boolean afk = false;
    public boolean participating = false;
    public boolean acting = false;
    public int totalContribution = 0;
    public int roundContribution = 0;
    public boolean awaitingAction = false;
    public boolean raiseRightsAvailable = false;
    public List<String> holeCards = new ArrayList<>();

    // Stores mutable player state for the in-memory tournament model.
    public TournamentPlayerState(String guestId, String nickname, int seatIndex) {
        this.guestId = guestId;
        this.nickname = nickname;
        this.seatIndex = seatIndex;
    }

    // Tells whether the player is still eligible to win a pot this hand.
    public boolean isEligibleForPot() {
        return participating && status != PlayerStatus.FOLDED && status != PlayerStatus.BUSTED_OUT;
    }

    // Tells whether the player is still part of the current hand state.
    public boolean isInHand() {
        return participating && status != PlayerStatus.FOLDED && status != PlayerStatus.BUSTED_OUT;
    }

    // Marks the creating player as the table owner.
    public static TournamentPlayerState owner(String guestId, String nickname, int seatIndex) {
        var player = new TournamentPlayerState(guestId, nickname, seatIndex);
        player.owner = true;
        return player;
    }
}
