package com.texasholdem.tournament.application.snapshot;

import com.texasholdem.tournament.domain.TournamentStatus;

public record TournamentStateChangedEvent(
        String code,
        TournamentStatus status,
        long actionDeadlineAtEpochMilli,
        long handResultEndsAtEpochMilli,
        long finishedCleanupAtEpochMilli
) {
}
