package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentEvent;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
final class TournamentEventFactory {

    private final TournamentSnapshotFactory snapshotFactory;

    // Wires event assembly to the shared snapshot factory.
    TournamentEventFactory(TournamentSnapshotFactory snapshotFactory) {
        this.snapshotFactory = snapshotFactory;
    }

    // Wraps a fresh tournament snapshot with an event name and payload.
    TournamentEvent create(String eventType, TournamentState tournament, Map<String, Object> payload) {
        return new TournamentEvent(eventType, snapshotFactory.toSnapshot(tournament), payload);
    }

    // Builds the ready event payload in the established websocket shape.
    Map<String, Object> readyPayload(String guestId, boolean ready) {
        return Map.of(
                "guestId", guestId,
                "ready", ready
        );
    }

    // Builds the participant-count payload used when a hand starts.
    Map<String, Object> participantsPayload(int participants) {
        return Map.of("participants", participants);
    }

    // Builds the accepted action payload for one table command.
    Map<String, Object> actionPayload(String guestId, String action, int amount) {
        return Map.of(
                "guestId", guestId,
                "action", action,
                "amount", amount
        );
    }

    // Builds the disconnect and reconnect payload in one shared shape.
    Map<String, Object> connectionPayload(TournamentConnectionChange change) {
        var payload = new HashMap<String, Object>();
        payload.put("guestId", change.guestId());
        payload.put("connected", change.connected());
        payload.put("removed", change.removed());
        if (change.ownerGuestId() != null) {
            payload.put("ownerGuestId", change.ownerGuestId());
        }
        return payload;
    }
}
