package com.texasholdem.tournament.application.state;

public record TournamentConnectionChange(
        String guestId,
        boolean connected,
        boolean removed,
        String ownerGuestId,
        boolean deleteTournament
) {
}
