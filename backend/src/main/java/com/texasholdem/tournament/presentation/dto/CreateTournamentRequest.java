package com.texasholdem.tournament.presentation.dto;

import com.texasholdem.tournament.domain.TournamentVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateTournamentRequest(
        @NotBlank
        @Size(max = 20)
        String nickname,
        @NotBlank
        @Size(max = 40)
        String roomName,
        TournamentVisibility visibility,
        @Size(max = 40)
        String password
) {
}
