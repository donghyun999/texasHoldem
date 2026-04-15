package com.texasholdem.tournament.application;

import java.util.function.Supplier;

interface TournamentCommandLock {

    // Executes one tournament-scoped operation while holding the shared command lock.
    <T> T withLock(String tournamentCode, Supplier<T> action);

    // Executes one tournament-scoped side-effect while holding the shared command lock.
    default void withLock(String tournamentCode, Runnable action) {
        withLock(tournamentCode, () -> {
            action.run();
            return null;
        });
    }
}
