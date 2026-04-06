package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;

public record TournamentStartMessage(
        @NotBlank
        String code,
        @NotBlank
        String guestId
) {
}
