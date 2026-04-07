package com.texasholdem.tournament.application;

import java.util.List;

interface TournamentStateStore {

    record PendingHandResult(
            String code,
            long handResultEndsAtEpochMilli
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

    // Lists persisted hand-result tournaments whose delayed transition must survive a restart.
    List<PendingHandResult> findPendingHandResults();

    // Removes one tournament completely from durable storage.
    void delete(String code);
}
