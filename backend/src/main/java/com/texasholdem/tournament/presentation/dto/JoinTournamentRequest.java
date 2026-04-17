package com.texasholdem.tournament.presentation.dto;

import jakarta.validation.constraints.Size;

public record JoinTournamentRequest(
        @Size(max = 40)
        String guestId,
        @jakarta.validation.constraints.NotBlank
        @Size(max = 20)
        String nickname,
        @Size(max = 40)
        String password
) {
}
