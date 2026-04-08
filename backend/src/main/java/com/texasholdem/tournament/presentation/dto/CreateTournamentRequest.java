package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateTournamentRequest(
        @NotBlank
        @Size(max = 40)
        String guestId,
        @NotBlank
        @Size(max = 20)
        String nickname,
        @Size(min = 3, max = 10)
        @Pattern(regexp = "[A-Za-z0-9]+")
        String code
) {
}
