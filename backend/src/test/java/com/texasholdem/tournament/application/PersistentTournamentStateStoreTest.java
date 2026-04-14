package com.texasholdem.tournament.application;

import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
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

    // Verifies that restart recovery also sees persisted finished tournaments waiting for cleanup.
    @Test
    void findsPendingFinishedCleanupsForRestartRecovery() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        var waitingTournament = new TournamentState("WAIT1");
        var finishedTournament = new TournamentState("DONE1");
        finishedTournament.status = TournamentStatus.FINISHED;
        finishedTournament.finishedCleanupAtEpochMilli = 654_321L;
        var missingDeadlineTournament = new TournamentState("DONE2");
        missingDeadlineTournament.status = TournamentStatus.FINISHED;

        when(repository.findAll()).thenReturn(List.of(
                new TournamentStateEntity("WAIT1", "waiting"),
                new TournamentStateEntity("DONE1", "finished"),
                new TournamentStateEntity("DONE2", "missing-deadline")
        ));
        when(mapper.read("waiting")).thenReturn(waitingTournament);
        when(mapper.read("finished")).thenReturn(finishedTournament);
        when(mapper.read("missing-deadline")).thenReturn(missingDeadlineTournament);

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findPendingFinishedCleanups())
                .containsExactly(new TournamentStateStore.PendingFinishedCleanup("DONE1", 654_321L));
    }

    // Verifies that only public waiting rooms are surfaced in newest-first order for the home lobby.
    @Test
    void findsPublicWaitingTournamentsForLobbyList() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        var newestPublicWaiting = new TournamentState("PUB2");
        newestPublicWaiting.visibility = TournamentVisibility.PUBLIC;
        newestPublicWaiting.status = TournamentStatus.WAITING;
        newestPublicWaiting.players.add(TournamentPlayerState.owner("guest-2", "NewestOwner", 0));
        newestPublicWaiting.players.add(new TournamentPlayerState("guest-3", "Player3", 1));
        var olderPublicWaiting = new TournamentState("PUB1");
        olderPublicWaiting.visibility = TournamentVisibility.PUBLIC;
        olderPublicWaiting.status = TournamentStatus.WAITING;
        olderPublicWaiting.players.add(TournamentPlayerState.owner("guest-1", "OlderOwner", 0));
        var privateWaiting = new TournamentState("PRIV1");
        privateWaiting.visibility = TournamentVisibility.PRIVATE;
        privateWaiting.status = TournamentStatus.WAITING;
        privateWaiting.players.add(TournamentPlayerState.owner("guest-4", "PrivateOwner", 0));
        var publicInHand = new TournamentState("HAND1");
        publicInHand.visibility = TournamentVisibility.PUBLIC;
        publicInHand.status = TournamentStatus.IN_HAND;
        publicInHand.players.add(TournamentPlayerState.owner("guest-5", "InHandOwner", 0));

        var newestEntity = new TournamentStateEntity("PUB2", "pub2");
        var olderEntity = new TournamentStateEntity("PUB1", "pub1");
        var privateEntity = new TournamentStateEntity("PRIV1", "priv1");
        var inHandEntity = new TournamentStateEntity("HAND1", "hand1");
        ReflectionTestUtils.setField(newestEntity, "updatedAt", LocalDateTime.now().minusMinutes(1));
        ReflectionTestUtils.setField(olderEntity, "updatedAt", LocalDateTime.now().minusMinutes(10));
        ReflectionTestUtils.setField(privateEntity, "updatedAt", LocalDateTime.now().minusMinutes(2));
        ReflectionTestUtils.setField(inHandEntity, "updatedAt", LocalDateTime.now().minusMinutes(3));

        when(repository.findAll()).thenReturn(List.of(olderEntity, newestEntity, privateEntity, inHandEntity));
        when(mapper.read("pub1")).thenReturn(olderPublicWaiting);
        when(mapper.read("pub2")).thenReturn(newestPublicWaiting);
        when(mapper.read("priv1")).thenReturn(privateWaiting);
        when(mapper.read("hand1")).thenReturn(publicInHand);

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findPublicWaitingTournaments(6))
                .extracting(summary -> List.of(
                        summary.code(),
                        summary.visibility(),
                        summary.status(),
                        summary.currentPlayers(),
                        summary.maxPlayers(),
                        summary.ownerNickname()
                ))
                .containsExactly(
                        List.of("PUB2", TournamentVisibility.PUBLIC, TournamentStatus.WAITING, 2, 6, "NewestOwner"),
                        List.of("PUB1", TournamentVisibility.PUBLIC, TournamentStatus.WAITING, 1, 6, "OlderOwner")
                );
    }

    // Verifies that waiting and in-hand tournaments can be identified as stale from updated_at timestamps.
    @Test
    void findsStaleTournamentCodesFromUpdatedAtTtlPolicy() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        var waitingTournament = new TournamentState("WAIT1");
        waitingTournament.status = TournamentStatus.WAITING;
        var inHandTournament = new TournamentState("HAND1");
        inHandTournament.status = TournamentStatus.IN_HAND;
        var freshTournament = new TournamentState("FRESH1");
        freshTournament.status = TournamentStatus.WAITING;
        var finishedTournament = new TournamentState("DONE1");
        finishedTournament.status = TournamentStatus.FINISHED;

        var staleWaitingEntity = new TournamentStateEntity("WAIT1", "waiting");
        var staleInHandEntity = new TournamentStateEntity("HAND1", "in-hand");
        var freshEntity = new TournamentStateEntity("FRESH1", "fresh");
        var finishedEntity = new TournamentStateEntity("DONE1", "finished");
        ReflectionTestUtils.setField(staleWaitingEntity, "updatedAt", LocalDateTime.now().minusMinutes(45));
        ReflectionTestUtils.setField(staleInHandEntity, "updatedAt", LocalDateTime.now().minusHours(3));
        ReflectionTestUtils.setField(freshEntity, "updatedAt", LocalDateTime.now().minusMinutes(5));
        ReflectionTestUtils.setField(finishedEntity, "updatedAt", LocalDateTime.now().minusDays(2));

        when(repository.findAll()).thenReturn(List.of(staleWaitingEntity, staleInHandEntity, freshEntity, finishedEntity));
        when(mapper.read("waiting")).thenReturn(waitingTournament);
        when(mapper.read("in-hand")).thenReturn(inHandTournament);
        when(mapper.read("fresh")).thenReturn(freshTournament);
        when(mapper.read("finished")).thenReturn(finishedTournament);

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findStaleTournamentCodes(System.currentTimeMillis(), 30 * 60 * 1_000L, 2 * 60 * 60 * 1_000L, 24 * 60 * 60 * 1_000L))
                .containsExactly("WAIT1", "HAND1", "DONE1");
    }
}
