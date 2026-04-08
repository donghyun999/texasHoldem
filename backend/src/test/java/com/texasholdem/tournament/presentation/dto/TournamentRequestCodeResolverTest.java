package com.texasholdem.tournament.presentation.dto;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TournamentRequestCodeResolverTest {

    @Test
    void usesPathCodeWhenRestBodyOmitsIt() {
        assertThat(TournamentRequestCodeResolver.resolve(null, "smk1234")).isEqualTo("SMK1234");
    }

    @Test
    void usesBodyCodeForWebsocketStylePayload() {
        assertThat(TournamentRequestCodeResolver.resolve("smk1234", null)).isEqualTo("SMK1234");
    }

    @Test
    void rejectsMismatchedBodyAndPathCodes() {
        assertThatThrownBy(() -> TournamentRequestCodeResolver.resolve("AAA111", "BBB222"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Tournament code mismatch");
    }
}
