package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;

public record GameActionMessage(
        @NotBlank
        String code,
        @NotBlank
        String action,
        Integer amount
) {
}
