package com.texasholdem.tournament.domain;

import java.util.List;

public record TournamentSnapshot(
        String code,
        long handNumber,
        long stateVersion,
        SnapshotAudience snapshotAudience,
        String viewerGuestId,
        boolean viewerHoleCardsIncluded,
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
        long actionDeadlineAtEpochMilli,
        long actionTimeoutSeconds,
        List<TournamentPlayerView> players,
        List<ShowdownPotView> showdownPots,
        List<ShowdownHandView> showdownHands,
        List<String> recentlyBustedGuestIds,
        List<String> availableActions,
        int chipsToCall,
        int minimumRaiseTo,
        String tableMessage,
        List<String> selfHoleCards
) {
}
