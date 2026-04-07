package com.texasholdem.tournament.application;

record TournamentConnectionChange(
        String guestId,
        boolean connected,
        boolean removed,
        String ownerGuestId,
        boolean deleteTournament
) {
}
