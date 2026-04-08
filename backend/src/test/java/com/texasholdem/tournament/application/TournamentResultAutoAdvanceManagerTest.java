package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.websocket.TournamentTopicPublisher;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TournamentResultAutoAdvanceManagerTest {

    // Verifies that persisted hand-result states are rescheduled when the service boots again.
    @Test
    void recoversPendingHandResultsOnStartup() {
        var tournamentService = mock(TournamentService.class);
        var topicPublisher = mock(TournamentTopicPublisher.class);
        var stateStore = mock(TournamentStateStore.class);
        var manager = new TournamentResultAutoAdvanceManager(tournamentService, topicPublisher, stateStore);
        var deadline = Instant.now().minusMillis(1).toEpochMilli();
        var broadcast = new TournamentBroadcast(List.of(mock(TournamentEvent.class)));

        when(stateStore.findPendingHandResults()).thenReturn(List.of(
                new TournamentStateStore.PendingHandResult("ABCD1", deadline)
        ));
        when(stateStore.findPendingFinishedCleanups()).thenReturn(List.of());
        when(tournamentService.autoAdvanceHandResult("ABCD1", deadline)).thenReturn(broadcast);

        manager.recoverPendingHandResults();

        await().untilAsserted(() -> {
            verify(tournamentService).autoAdvanceHandResult("ABCD1", deadline);
            verify(topicPublisher).publish(eq("ABCD1"), eq(broadcast));
        });

        manager.shutdown();
    }

    // Verifies that pending recovery ignores tournaments that no longer produce a live broadcast.
    @Test
    void skipsPublishingWhenRecoveredTransitionNoLongerApplies() {
        var tournamentService = mock(TournamentService.class);
        var topicPublisher = mock(TournamentTopicPublisher.class);
        var stateStore = mock(TournamentStateStore.class);
        var manager = new TournamentResultAutoAdvanceManager(tournamentService, topicPublisher, stateStore);
        var deadline = Instant.now().minusMillis(1).toEpochMilli();

        when(stateStore.findPendingHandResults()).thenReturn(List.of(
                new TournamentStateStore.PendingHandResult("ABCD1", deadline)
        ));
        when(stateStore.findPendingFinishedCleanups()).thenReturn(List.of());
        when(tournamentService.autoAdvanceHandResult("ABCD1", deadline)).thenReturn(null);

        manager.recoverPendingHandResults();

        await().untilAsserted(() -> verify(tournamentService).autoAdvanceHandResult("ABCD1", deadline));

        manager.shutdown();
    }

    // Verifies that persisted finished tournaments are rescheduled for cleanup when the service boots again.
    @Test
    void recoversPendingFinishedCleanupsOnStartup() {
        var tournamentService = mock(TournamentService.class);
        var topicPublisher = mock(TournamentTopicPublisher.class);
        var stateStore = mock(TournamentStateStore.class);
        var manager = new TournamentResultAutoAdvanceManager(tournamentService, topicPublisher, stateStore);
        var deadline = Instant.now().minusMillis(1).toEpochMilli();

        when(stateStore.findPendingHandResults()).thenReturn(List.of());
        when(stateStore.findPendingFinishedCleanups()).thenReturn(List.of(
                new TournamentStateStore.PendingFinishedCleanup("DONE1", deadline)
        ));

        manager.recoverPendingHandResults();

        await().untilAsserted(() -> verify(tournamentService).cleanupFinishedTournament("DONE1", deadline));

        manager.shutdown();
    }
}
