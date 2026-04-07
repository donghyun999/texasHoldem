package com.texasholdem.tournament.application;

import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersistentTournamentStateStoreTest {

    // Verifies that each persisted tournament snapshot carries a fresh storage timestamp.
    @Test
    void stampsUpdatedAtWhenSavingTournamentState() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(mapper.write(any(TournamentState.class))).thenReturn("{\"code\":\"ABCDE\"}");
        when(repository.save(any(TournamentStateEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var store = new PersistentTournamentStateStore(repository, mapper);
        var tournament = new TournamentState("ABCDE");

        store.save(tournament);

        var entityCaptor = ArgumentCaptor.forClass(TournamentStateEntity.class);
        verify(repository).save(entityCaptor.capture());
        var savedEntity = entityCaptor.getValue();
        assertThat(savedEntity.getCode()).isEqualTo("ABCDE");
        assertThat(savedEntity.getPayload()).isEqualTo("{\"code\":\"ABCDE\"}");
        assertThat(savedEntity.getUpdatedAt()).isNotNull();
    }

    // Verifies that restart recovery only sees persisted hand-result tournaments with a deadline.
    @Test
    void findsPendingHandResultsForRestartRecovery() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        var waitingTournament = new TournamentState("WAIT1");
        var pendingTournament = new TournamentState("PEND1");
        pendingTournament.status = TournamentStatus.HAND_RESULT;
        pendingTournament.handResultEndsAtEpochMilli = 123_456L;
        var expiredWithoutDeadlineTournament = new TournamentState("MISS1");
        expiredWithoutDeadlineTournament.status = TournamentStatus.HAND_RESULT;

        when(repository.findAll()).thenReturn(List.of(
                new TournamentStateEntity("WAIT1", "waiting"),
                new TournamentStateEntity("PEND1", "pending"),
                new TournamentStateEntity("MISS1", "missing-deadline")
        ));
        when(mapper.read("waiting")).thenReturn(waitingTournament);
        when(mapper.read("pending")).thenReturn(pendingTournament);
        when(mapper.read("missing-deadline")).thenReturn(expiredWithoutDeadlineTournament);

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findPendingHandResults())
                .containsExactly(new TournamentStateStore.PendingHandResult("PEND1", 123_456L));
    }
}
