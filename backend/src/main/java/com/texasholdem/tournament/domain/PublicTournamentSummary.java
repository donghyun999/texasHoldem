package com.texasholdem.tournament.domain;

public record PublicTournamentSummary(
        String code,
        String roomName,
        TournamentVisibility visibility,
        TournamentStatus status,
        int currentPlayers,
        int maxPlayers,
        String ownerNickname
) {
}
