package com.texasholdem.tournament.domain;

public record PublicTournamentSummary(
        String code,
        TournamentVisibility visibility,
        TournamentStatus status,
        int currentPlayers,
        int maxPlayers,
        String ownerNickname
) {
}
