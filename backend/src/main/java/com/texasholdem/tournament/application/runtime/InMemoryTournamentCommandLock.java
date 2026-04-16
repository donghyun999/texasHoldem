package com.texasholdem.tournament.application.runtime;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

public final class InMemoryTournamentCommandLock implements TournamentCommandLock {

    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    public InMemoryTournamentCommandLock() {
    }

    @Override
    public <T> T withLock(String tournamentCode, Supplier<T> action) {
        var lock = locks.computeIfAbsent(tournamentCode, ignored -> new ReentrantLock());
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }
}
