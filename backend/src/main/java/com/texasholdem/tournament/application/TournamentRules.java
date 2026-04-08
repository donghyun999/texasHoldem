package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.BlindLevel;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
final class TournamentRules {

    private static final int MAX_SEATS = 6;
    private static final int STARTING_STACK = 1_000;
    private static final List<BlindLevel> DEFAULT_LEVELS = List.of(
            new BlindLevel(1, 10, 20, 300),
            new BlindLevel(2, 15, 30, 300),
            new BlindLevel(3, 25, 50, 300),
            new BlindLevel(4, 50, 100, 300),
            new BlindLevel(5, 75, 150, 300),
            new BlindLevel(6, 100, 200, 300)
    );

    // Returns the seat cap for one single-table tournament.
    int maxSeats() {
        return MAX_SEATS;
    }

    // Returns the starting stack assigned when the tournament begins.
    int startingStack() {
        return STARTING_STACK;
    }

    // Returns the configured blind level ladder for the tournament.
    List<BlindLevel> levels() {
        return DEFAULT_LEVELS;
    }

    // Returns the active blind level for one internal level index.
    BlindLevel currentLevel(int levelIndex) {
        return DEFAULT_LEVELS.get(levelIndex);
    }

    // Returns the next visible blind level for the snapshot contract.
    BlindLevel nextLevel(int levelIndex) {
        return DEFAULT_LEVELS.get(Math.min(levelIndex + 1, DEFAULT_LEVELS.size() - 1));
    }

    // Returns the default big blind size used for implicit bet and raise targets.
    int bigBlindFor(int levelIndex) {
        return currentLevel(levelIndex).bigBlind();
    }
}
