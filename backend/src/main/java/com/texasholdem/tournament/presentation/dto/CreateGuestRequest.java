package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateGuestRequest(
        @NotBlank
        @Size(max = 20)
        String nickname
) {
}
