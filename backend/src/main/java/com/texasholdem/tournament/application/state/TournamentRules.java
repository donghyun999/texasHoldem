package com.texasholdem.tournament.application.state;

import com.texasholdem.tournament.domain.BlindLevel;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public final class TournamentRules {

    private static final int DEFAULT_MAX_SEATS = 9;
    private static final int STARTING_STACK = 2_000;
    private static final List<BlindLevel> DEFAULT_LEVELS = List.of(
            new BlindLevel(1, 10, 20, 300),
            new BlindLevel(2, 15, 30, 300),
            new BlindLevel(3, 25, 50, 300),
            new BlindLevel(4, 50, 100, 300),
            new BlindLevel(5, 75, 150, 300),
            new BlindLevel(6, 100, 200, 300)
    );
    private final int maxSeats;

    public TournamentRules() {
        this(DEFAULT_MAX_SEATS);
    }

    public TournamentRules(int maxSeats) {
        if (maxSeats < 2) {
            throw new IllegalArgumentException("Tournament seat cap must be at least 2.");
        }
        this.maxSeats = maxSeats;
    }

    // Returns the seat cap for one single-table tournament.
    public int maxSeats() {
        return maxSeats;
    }

    // Returns the starting stack assigned when the tournament begins.
    public int startingStack() {
        return STARTING_STACK;
    }

    // Returns the configured blind level ladder for the tournament.
    public List<BlindLevel> levels() {
        return DEFAULT_LEVELS;
    }

    // Returns the active blind level for one internal level index.
    public BlindLevel currentLevel(int levelIndex) {
        return DEFAULT_LEVELS.get(levelIndex);
    }

    // Returns the next visible blind level for the snapshot contract.
    public BlindLevel nextLevel(int levelIndex) {
        return DEFAULT_LEVELS.get(Math.min(levelIndex + 1, DEFAULT_LEVELS.size() - 1));
    }

    // Returns the default big blind size used for implicit bet and raise targets.
    public int bigBlindFor(int levelIndex) {
        return currentLevel(levelIndex).bigBlind();
    }
}
