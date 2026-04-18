package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record JoinPrivateTournamentRequest(
        @NotBlank
        @Size(max = 20)
        String nickname,
        @NotBlank
        @Size(max = 40)
        String roomName,
        @Size(max = 40)
        String password
) {
}
