package com.texasholdem.tournament.application.command;

import com.texasholdem.tournament.application.persistence.TournamentStateStore;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class TournamentCleanupServiceTest {

    @Test
    void skipsRepeatedCleanupWithinMinimumInterval() {
        var stateStore = mock(TournamentStateStore.class);
        when(stateStore.findStaleTournamentCodes(anyLong(), anyLong(), anyLong(), anyLong()))
                .thenReturn(List.of("STALE1"));
        var service = new TournamentCleanupService(
                stateStore,
                new TournamentServiceProperties(1_800, 7_200, 86_400),
                60_000
        );

        service.cleanupStaleTournamentsIfDue();
        service.cleanupStaleTournamentsIfDue();

        verify(stateStore).findStaleTournamentCodes(anyLong(), anyLong(), anyLong(), anyLong());
        verify(stateStore).delete("STALE1");
        verifyNoMoreInteractions(stateStore);
    }

    @Test
    void forceCleanupRunsRegardlessOfMinimumInterval() {
        var stateStore = mock(TournamentStateStore.class);
        when(stateStore.findStaleTournamentCodes(anyLong(), anyLong(), anyLong(), anyLong()))
                .thenReturn(List.of());
        var service = new TournamentCleanupService(
                stateStore,
                new TournamentServiceProperties(1_800, 7_200, 86_400),
                60_000
        );

        service.cleanupStaleTournamentsNow();

        verify(stateStore).findStaleTournamentCodes(anyLong(), anyLong(), anyLong(), anyLong());
        verifyNoMoreInteractions(stateStore);
    }
}
