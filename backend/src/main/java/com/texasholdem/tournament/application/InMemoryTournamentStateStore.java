package com.texasholdem.tournament.application;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

final class InMemoryTournamentStateStore implements TournamentStateStore {

    private final Map<String, String> payloads = new ConcurrentHashMap<>();
    private final TournamentStatePersistenceMapper mapper;

    // Keeps test persistence behavior aligned with the production JSON mapping path.
    InMemoryTournamentStateStore(TournamentStatePersistenceMapper mapper) {
        this.mapper = mapper;
    }

    // Tells whether a tournament code is already stored in the backing map.
    @Override
    public boolean exists(String code) {
        return payloads.containsKey(code);
    }

    // Serializes and stores one tournament state in the backing map.
    @Override
    public void save(TournamentState tournament) {
        payloads.put(tournament.code, mapper.write(tournament));
    }

    // Deserializes one persisted tournament state from the backing map.
    @Override
    public TournamentState load(String code) {
        var payload = payloads.get(code);
        return payload == null ? null : mapper.read(payload);
    }

    // Scans stored tournament payloads for one unfinished seat held by the guest.
    @Override
    public String findActiveTournamentCodeByGuestId(String guestId) {
        return payloads.values().stream()
                .map(mapper::read)
                .filter(tournament -> tournament.status != com.texasholdem.tournament.domain.TournamentStatus.FINISHED)
                .filter(tournament -> tournament.players.stream().anyMatch(player -> player.guestId.equals(guestId)))
                .map(tournament -> tournament.code)
                .findFirst()
                .orElse(null);
    }

    // Removes one tournament from the backing map.
    @Override
    public void delete(String code) {
        payloads.remove(code);
    }
}
