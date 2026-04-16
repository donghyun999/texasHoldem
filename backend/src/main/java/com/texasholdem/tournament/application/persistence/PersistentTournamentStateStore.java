package com.texasholdem.tournament.application.persistence;

import com.texasholdem.tournament.application.state.*;
import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import com.texasholdem.tournament.domain.PublicTournamentSummary;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public final class PersistentTournamentStateStore implements TournamentStateStore {

    private final TournamentStateJpaRepository repository;
    private final TournamentStatePersistenceMapper mapper;

    // Wires durable tournament storage to the JPA repository and state mapper.
    public PersistentTournamentStateStore(
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
        var payload = mapper.write(tournament);
        var entity = repository.findById(tournament.code)
                .map(existingEntity -> {
                    existingEntity.setPayload(payload);
                    return existingEntity;
                })
                .orElseGet(() -> new TournamentStateEntity(tournament.code, payload));
        repository.save(entity);
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
        return repository.findActiveTournamentCodeByGuestId(guestId);
    }

    // Scans persisted tournament payloads for one unfinished room-title match.
    @Override
    public String findActiveTournamentCodeByRoomName(String roomName) {
        return repository.findActiveTournamentCodeByRoomName(roomName);
    }

    // Counts every guest seat that still belongs to a non-finished tournament.
    @Override
    public int countActiveGuests() {
        return Math.toIntExact(repository.countActiveGuests());
    }

    // Lists persisted waiting rooms in newest-first order for the home lobby.
    @Override
    public List<PublicTournamentSummary> findPublicWaitingTournaments(int maxPlayers) {
        return repository.findWaitingTournamentRows(maxPlayers).stream()
                .map(TournamentStateEntity::getPayload)
                .map(mapper::read)
                .map(tournament -> new PublicTournamentSummary(
                        tournament.code,
                        resolveRoomName(tournament),
                        tournament.visibility,
                        tournament.status,
                        tournament.players.size(),
                        maxPlayers,
                        resolveOwnerNickname(tournament)
                ))
                .toList();
    }

    // Finds delayed hand-result transitions that should be rescheduled after a restart.
    @Override
    public List<PendingHandResult> findPendingHandResults() {
        return repository.findPendingHandResults().stream()
                .map(row -> new PendingHandResult(row.getCode(), row.getHandResultEndsAtEpochMilli()))
                .toList();
    }

    // Finds delayed in-hand action deadlines that should be rescheduled after a restart.
    @Override
    public List<PendingActionTimeout> findPendingActionTimeouts() {
        return repository.findPendingActionTimeouts().stream()
                .map(row -> new PendingActionTimeout(row.getCode(), row.getActionDeadlineAtEpochMilli()))
                .toList();
    }

    // Finds delayed finished cleanups that should be rescheduled after a restart.
    @Override
    public List<PendingFinishedCleanup> findPendingFinishedCleanups() {
        return repository.findPendingFinishedCleanups().stream()
                .map(row -> new PendingFinishedCleanup(row.getCode(), row.getFinishedCleanupAtEpochMilli()))
                .toList();
    }

    // Finds stale persisted tournaments using updated_at as the idle-TTL source of truth.
    @Override
    public List<String> findStaleTournamentCodes(
            long nowEpochMilli,
            long waitingIdleTtlMillis,
            long inHandIdleTtlMillis,
            long hardTtlMillis
    ) {
        return repository.findStaleTournamentCodes(
                waitingIdleTtlMillis,
                inHandIdleTtlMillis,
                hardTtlMillis,
                cutoffEpochMilli(nowEpochMilli, waitingIdleTtlMillis),
                cutoffEpochMilli(nowEpochMilli, inHandIdleTtlMillis),
                cutoffEpochMilli(nowEpochMilli, hardTtlMillis)
        );
    }

    // Deletes one persisted tournament aggregate from the database.
    @Override
    public void delete(String code) {
        repository.deleteById(code);
    }

    private String resolveOwnerNickname(TournamentState tournament) {
        return tournament.players.stream()
                .filter(player -> player.owner)
                .map(player -> player.nickname)
                .findFirst()
                .orElse("");
    }

    private String resolveRoomName(TournamentState tournament) {
        return tournament.roomName == null || tournament.roomName.isBlank() ? tournament.code : tournament.roomName;
    }

    private long cutoffEpochMilli(long nowEpochMilli, long ttlMillis) {
        return ttlMillis <= 0 ? Long.MAX_VALUE : Math.max(0, nowEpochMilli - ttlMillis);
    }
}
