package com.texasholdem.tournament.domain;

public record TournamentPlayerView(
        String guestId,
        String nickname,
        int seatIndex,
        PlayerStatus status,
        int stack,
        int roundContribution,
        boolean owner,
        boolean connected,
        boolean afk,
        boolean participating,
        boolean acting
) {
}
