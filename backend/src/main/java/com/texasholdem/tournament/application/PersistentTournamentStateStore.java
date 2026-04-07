package com.texasholdem.tournament.application;

import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import org.springframework.stereotype.Component;

@Component
final class PersistentTournamentStateStore implements TournamentStateStore {

    private final TournamentStateJpaRepository repository;
    private final TournamentStatePersistenceMapper mapper;

    // Wires durable tournament storage to the JPA repository and state mapper.
    PersistentTournamentStateStore(
            TournamentStateJpaRepository repository,
            TournamentStatePersistenceMapper mapper
    ) {
        this.repository = repository;
        this.mapper = mapper;
    }

    // Tells whether a tournament code is already persisted in the database.
    @Override
    public boolean exists(String code) {
        return repository.existsById(code);
    }

    // Saves the latest serialized tournament aggregate into the database.
    @Override
    public void save(TournamentState tournament) {
        repository.save(new TournamentStateEntity(tournament.code, mapper.write(tournament)));
    }

    // Reloads one serialized tournament aggregate from the database.
    @Override
    public TournamentState load(String code) {
        return repository.findById(code)
                .map(TournamentStateEntity::getPayload)
                .map(mapper::read)
                .orElse(null);
    }

    // Scans persisted tournament payloads for one unfinished seat held by the guest.
    @Override
    public String findActiveTournamentCodeByGuestId(String guestId) {
        return repository.findAll().stream()
                .map(TournamentStateEntity::getPayload)
                .map(mapper::read)
                .filter(tournament -> tournament.status != com.texasholdem.tournament.domain.TournamentStatus.FINISHED)
                .filter(tournament -> tournament.players.stream().anyMatch(player -> player.guestId.equals(guestId)))
                .map(tournament -> tournament.code)
                .findFirst()
                .orElse(null);
    }

    // Deletes one persisted tournament aggregate from the database.
    @Override
    public void delete(String code) {
        repository.deleteById(code);
    }
}
