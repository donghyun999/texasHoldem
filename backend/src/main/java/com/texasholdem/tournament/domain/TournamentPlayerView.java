package com.texasholdem.tournament.domain;

public record TournamentPlayerView(
        String guestId,
        String nickname,
        int seatIndex,
        PlayerStatus status,
        int stack,
        boolean owner,
        boolean connected,
        boolean participating,
        boolean acting
) {
}
