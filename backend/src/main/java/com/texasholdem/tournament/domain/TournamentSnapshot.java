package com.texasholdem.tournament.domain;

import java.util.List;

public record TournamentSnapshot(
        String code,
        TournamentStatus status,
        BlindLevel currentLevel,
        BlindLevel nextLevel,
        long levelEndsAtEpochSecond,
        long secondsUntilNextLevel,
        int mainPot,
        List<PotView> sidePots,
        List<String> boardCards,
        Integer dealerSeat,
        Integer smallBlindSeat,
        Integer bigBlindSeat,
        Integer actingSeat,
        List<TournamentPlayerView> players,
        List<ShowdownPotView> showdownPots,
        List<String> recentlyBustedGuestIds,
        List<String> availableActions,
        String tableMessage,
        List<String> selfHoleCards
) {
}
