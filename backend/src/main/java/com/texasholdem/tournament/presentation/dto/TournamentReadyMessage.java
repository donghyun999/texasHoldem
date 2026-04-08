package com.texasholdem.tournament.presentation.dto;

public record TournamentReadyMessage(
        String code,
        @jakarta.validation.constraints.NotBlank
        String guestId,
        boolean ready
) {
    public String resolveCode(String fallbackCode) {
        return TournamentRequestCodeResolver.resolve(code, fallbackCode);
    }
}
