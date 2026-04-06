package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;

public record TournamentReadyMessage(
        @NotBlank
        String code,
        @NotBlank
        String guestId,
        boolean ready
) {
}
