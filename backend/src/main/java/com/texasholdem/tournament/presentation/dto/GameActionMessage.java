package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;

public record GameActionMessage(
        @NotBlank
        String code,
        String guestId,
        @NotBlank
        String action,
        Integer amount
) {
}
