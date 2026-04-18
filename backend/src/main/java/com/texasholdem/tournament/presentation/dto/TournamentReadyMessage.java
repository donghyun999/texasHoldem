package com.texasholdem.tournament.presentation.dto;

public record TournamentReadyMessage(
        String code,
        boolean ready
) {
    public String resolveCode(String fallbackCode) {
        return TournamentRequestCodeResolver.resolve(code, fallbackCode);
    }
}
