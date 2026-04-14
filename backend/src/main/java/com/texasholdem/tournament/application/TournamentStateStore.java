package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PublicTournamentSummary;

import java.util.List;

interface TournamentStateStore {

    record PendingHandResult(
            String code,
            long handResultEndsAtEpochMilli
    ) {
    }

    record PendingActionTimeout(
            String code,
            long actionDeadlineAtEpochMilli
    ) {
    }

    record PendingFinishedCleanup(
            String code,
            long finishedCleanupAtEpochMilli
    ) {
    }

    // Tells whether a tournament code is already reserved in durable storage.
    boolean exists(String code);

    // Persists the latest mutable state for one tournament code.
    void save(TournamentState tournament);

    // Restores one tournament state from durable storage when the cache is cold.
    TournamentState load(String code);

    // Finds another non-finished tournament that already contains the guest.
    String findActiveTournamentCodeByGuestId(String guestId);

    // Counts all guests currently occupying non-finished tournaments.
    int countActiveGuests();

    // Lists public waiting rooms that can be joined from the home lobby.
    List<PublicTournamentSummary> findPublicWaitingTournaments(int maxPlayers);

    // Lists persisted hand-result tournaments whose delayed transition must survive a restart.
    List<PendingHandResult> findPendingHandResults();

    // Lists persisted in-hand action deadlines whose timeout transition must survive a restart.
    List<PendingActionTimeout> findPendingActionTimeouts();

    // Lists persisted finished tournaments whose delayed cleanup must survive a restart.
    List<PendingFinishedCleanup> findPendingFinishedCleanups();

    // Lists stale tournaments whose persisted update timestamp exceeded the configured TTL policy.
    List<String> findStaleTournamentCodes(
            long nowEpochMilli,
            long waitingIdleTtlMillis,
            long inHandIdleTtlMillis,
            long hardTtlMillis
    );

    // Removes one tournament completely from durable storage.
    void delete(String code);
}
