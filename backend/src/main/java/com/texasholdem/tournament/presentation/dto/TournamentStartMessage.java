package com.texasholdem.tournament.presentation.dto;

public record TournamentStartMessage(
        String code,
        String guestId
) {
    public String resolveCode(String fallbackCode) {
        return TournamentRequestCodeResolver.resolve(code, fallbackCode);
    }
}
