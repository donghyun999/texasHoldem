package com.texasholdem.tournament.presentation.dto;

public record TournamentStartMessage(
        String code
) {
    public String resolveCode(String fallbackCode) {
        return TournamentRequestCodeResolver.resolve(code, fallbackCode);
    }
}
