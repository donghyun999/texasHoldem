package com.texasholdem.tournament.domain;

public record ActiveTournamentSession(
        String guestId,
        String tournamentCode,
        String roomName,
        TournamentStatus status
) {
}
