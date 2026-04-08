package com.texasholdem.tournament.presentation.dto;

public record TournamentConnectionMessage(
        String code,
        @jakarta.validation.constraints.NotBlank
        String guestId
) {
    public String resolveCode(String fallbackCode) {
        return TournamentRequestCodeResolver.resolve(code, fallbackCode);
    }
}
