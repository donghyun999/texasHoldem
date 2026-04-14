package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentStatus;

record TournamentStateChangedEvent(
        String code,
        TournamentStatus status,
        long actionDeadlineAtEpochMilli,
        long handResultEndsAtEpochMilli,
        long finishedCleanupAtEpochMilli
) {
}
