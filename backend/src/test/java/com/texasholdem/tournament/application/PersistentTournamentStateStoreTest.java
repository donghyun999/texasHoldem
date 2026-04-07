package com.texasholdem.tournament.application;

import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

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
}
