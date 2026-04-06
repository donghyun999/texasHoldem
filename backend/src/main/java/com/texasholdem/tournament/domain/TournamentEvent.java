package com.texasholdem.tournament.domain;

import java.util.Map;

public record TournamentEvent(
        String eventType,
        TournamentSnapshot snapshot,
        Map<String, Object> payload
) {
}
