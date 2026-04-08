package com.texasholdem.tournament.application;

import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.util.List;

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
                .filter(tournament -> tournament.status != TournamentStatus.FINISHED)
                .filter(tournament -> tournament.players.stream().anyMatch(player -> player.guestId.equals(guestId)))
                .map(tournament -> tournament.code)
                .findFirst()
                .orElse(null);
    }

    // Counts every guest seat that still belongs to a non-finished tournament.
    @Override
    public int countActiveGuests() {
        return (int) repository.findAll().stream()
                .map(TournamentStateEntity::getPayload)
                .map(mapper::read)
                .filter(tournament -> tournament.status != TournamentStatus.FINISHED)
                .flatMap(tournament -> tournament.players.stream())
                .map(player -> player.guestId)
                .distinct()
                .count();
    }

    // Finds delayed hand-result transitions that should be rescheduled after a restart.
    @Override
    public List<PendingHandResult> findPendingHandResults() {
        return repository.findAll().stream()
                .map(TournamentStateEntity::getPayload)
                .map(mapper::read)
                .filter(tournament -> tournament.status == TournamentStatus.HAND_RESULT)
                .filter(tournament -> tournament.handResultEndsAtEpochMilli > 0)
                .map(tournament -> new PendingHandResult(tournament.code, tournament.handResultEndsAtEpochMilli))
                .toList();
    }

    // Finds delayed finished cleanups that should be rescheduled after a restart.
    @Override
    public List<PendingFinishedCleanup> findPendingFinishedCleanups() {
        return repository.findAll().stream()
                .map(TournamentStateEntity::getPayload)
                .map(mapper::read)
                .filter(tournament -> tournament.status == TournamentStatus.FINISHED)
                .filter(tournament -> tournament.finishedCleanupAtEpochMilli > 0)
                .map(tournament -> new PendingFinishedCleanup(tournament.code, tournament.finishedCleanupAtEpochMilli))
                .toList();
    }

    // Deletes one persisted tournament aggregate from the database.
    @Override
    public void delete(String code) {
        repository.deleteById(code);
    }
}
