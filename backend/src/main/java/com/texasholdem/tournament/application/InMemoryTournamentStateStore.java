package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PublicTournamentSummary;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

final class InMemoryTournamentStateStore implements TournamentStateStore {

    private final Map<String, StoredPayload> payloads = new ConcurrentHashMap<>();
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
        payloads.compute(tournament.code, (code, existingPayload) -> new StoredPayload(
                mapper.write(tournament),
                existingPayload == null ? Instant.now().toEpochMilli() : existingPayload.createdAtEpochMilli(),
                Instant.now().toEpochMilli()
        ));
    }

    // Deserializes one persisted tournament state from the backing map.
    @Override
    public TournamentState load(String code) {
        var storedPayload = payloads.get(code);
        return storedPayload == null ? null : mapper.read(storedPayload.payload());
    }

    // Scans stored tournament payloads for one unfinished seat held by the guest.
    @Override
    public String findActiveTournamentCodeByGuestId(String guestId) {
        return payloads.values().stream()
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.status != TournamentStatus.FINISHED)
                .filter(tournament -> tournament.players.stream().anyMatch(player -> player.guestId.equals(guestId)))
                .map(tournament -> tournament.code)
                .findFirst()
                .orElse(null);
    }

    // Scans stored tournament payloads for one unfinished room-title match.
    @Override
    public String findActiveTournamentCodeByRoomName(String roomName) {
        return payloads.values().stream()
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.status != TournamentStatus.FINISHED)
                .filter(tournament -> resolveRoomName(tournament).equalsIgnoreCase(roomName))
                .map(tournament -> tournament.code)
                .findFirst()
                .orElse(null);
    }

    // Counts every guest seat that still belongs to a non-finished tournament.
    @Override
    public int countActiveGuests() {
        return (int) payloads.values().stream()
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.status != TournamentStatus.FINISHED)
                .flatMap(tournament -> tournament.players.stream())
                .map(player -> player.guestId)
                .distinct()
                .count();
    }

    // Lists in-memory public waiting rooms in newest-first order for tests and local flows.
    @Override
    public List<PublicTournamentSummary> findPublicWaitingTournaments(int maxPlayers) {
        return payloads.values().stream()
                .sorted(Comparator.comparingLong(StoredPayload::createdAtEpochMilli).reversed())
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.visibility == TournamentVisibility.PUBLIC)
                .filter(tournament -> tournament.status == TournamentStatus.WAITING)
                .filter(tournament -> !tournament.players.isEmpty())
                .filter(tournament -> tournament.players.size() < maxPlayers)
                .map(tournament -> new PublicTournamentSummary(
                        tournament.code,
                        resolveRoomName(tournament),
                        tournament.visibility,
                        tournament.status,
                        tournament.players.size(),
                        maxPlayers,
                        tournament.players.stream()
                                .filter(player -> player.owner)
                                .map(player -> player.nickname)
                                .findFirst()
                                .orElse("")
                ))
                .toList();
    }

    // Lists in-memory hand-result tournaments whose delayed transition should be recovered.
    @Override
    public List<PendingHandResult> findPendingHandResults() {
        return payloads.values().stream()
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.status == TournamentStatus.HAND_RESULT)
                .filter(tournament -> tournament.handResultEndsAtEpochMilli > 0)
                .map(tournament -> new PendingHandResult(tournament.code, tournament.handResultEndsAtEpochMilli))
                .toList();
    }

    // Lists in-memory in-hand action deadlines whose timeout transitions should be recovered.
    @Override
    public List<PendingActionTimeout> findPendingActionTimeouts() {
        return payloads.values().stream()
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.status == TournamentStatus.IN_HAND)
                .filter(tournament -> tournament.actionDeadlineAtEpochMilli > 0)
                .map(tournament -> new PendingActionTimeout(tournament.code, tournament.actionDeadlineAtEpochMilli))
                .toList();
    }

    // Lists in-memory finished tournaments whose delayed cleanup should be recovered.
    @Override
    public List<PendingFinishedCleanup> findPendingFinishedCleanups() {
        return payloads.values().stream()
                .map(StoredPayload::payload)
                .map(mapper::read)
                .filter(tournament -> tournament.status == TournamentStatus.FINISHED)
                .filter(tournament -> tournament.finishedCleanupAtEpochMilli > 0)
                .map(tournament -> new PendingFinishedCleanup(tournament.code, tournament.finishedCleanupAtEpochMilli))
                .toList();
    }

    // Finds stale in-memory tournaments using the same idle-TTL rules as the persistent store.
    @Override
    public List<String> findStaleTournamentCodes(
            long nowEpochMilli,
            long waitingIdleTtlMillis,
            long inHandIdleTtlMillis,
            long hardTtlMillis
    ) {
        return payloads.entrySet().stream()
                .filter(entry -> isStale(
                        mapper.read(entry.getValue().payload()),
                        entry.getValue().updatedAtEpochMilli(),
                        nowEpochMilli,
                        waitingIdleTtlMillis,
                        inHandIdleTtlMillis,
                        hardTtlMillis
                ))
                .map(Map.Entry::getKey)
                .toList();
    }

    // Removes one tournament from the backing map.
    @Override
    public void delete(String code) {
        payloads.remove(code);
    }

    // Overrides one stored update timestamp so tests can model stale persisted tournaments.
    void touch(String code, long updatedAtEpochMilli) {
        payloads.computeIfPresent(code, (currentCode, storedPayload) ->
                new StoredPayload(
                        storedPayload.payload(),
                        storedPayload.createdAtEpochMilli(),
                        updatedAtEpochMilli
                )
        );
    }

    private boolean isStale(
            TournamentState tournament,
            long updatedAtEpochMilli,
            long nowEpochMilli,
            long waitingIdleTtlMillis,
            long inHandIdleTtlMillis,
            long hardTtlMillis
    ) {
        var ageMillis = Math.max(0, nowEpochMilli - updatedAtEpochMilli);
        if (hardTtlMillis > 0 && ageMillis >= hardTtlMillis) {
            return true;
        }
        if (tournament.status == TournamentStatus.WAITING && waitingIdleTtlMillis > 0 && ageMillis >= waitingIdleTtlMillis) {
            return true;
        }
        return tournament.status == TournamentStatus.IN_HAND
                && inHandIdleTtlMillis > 0
                && ageMillis >= inHandIdleTtlMillis;
    }

    private String resolveRoomName(TournamentState tournament) {
        return tournament.roomName == null || tournament.roomName.isBlank() ? tournament.code : tournament.roomName;
    }

    private record StoredPayload(String payload, long createdAtEpochMilli, long updatedAtEpochMilli) {
    }
}
