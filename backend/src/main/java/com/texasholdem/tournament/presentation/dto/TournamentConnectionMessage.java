package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;

public record TournamentConnectionMessage(
        @NotBlank
        String code,
        @NotBlank
        String guestId
) {
}
