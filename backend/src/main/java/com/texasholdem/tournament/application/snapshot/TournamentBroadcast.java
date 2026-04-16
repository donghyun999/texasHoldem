package com.texasholdem.tournament.application.snapshot;

import com.texasholdem.tournament.domain.TournamentEvent;

import java.util.List;

public record TournamentBroadcast(
        List<TournamentEvent> events
) {

    // Freezes each broadcast bundle so publishers always see a stable event order.
    public TournamentBroadcast {
        if (events == null || events.isEmpty()) {
            throw new IllegalArgumentException("Tournament broadcast must contain at least one event");
        }
        events = List.copyOf(events);
    }

    // Returns the compatibility event that existing callers already expect.
    public TournamentEvent primaryEvent() {
        return events.get(events.size() - 1);
    }
}
