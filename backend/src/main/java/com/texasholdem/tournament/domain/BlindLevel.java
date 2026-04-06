package com.texasholdem.tournament.domain;

public record BlindLevel(
        int level,
        int smallBlind,
        int bigBlind,
        int durationSeconds
) {
}
