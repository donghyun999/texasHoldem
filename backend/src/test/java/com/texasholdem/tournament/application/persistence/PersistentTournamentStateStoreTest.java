package com.texasholdem.tournament.application.persistence;

import com.texasholdem.tournament.application.state.*;
import com.texasholdem.persistence.TournamentStateEntity;
import com.texasholdem.persistence.TournamentStateJpaRepository;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersistentTournamentStateStoreTest {

    // Verifies that each persisted tournament snapshot carries a fresh storage timestamp.
    @Test
    void stampsUpdatedAtWhenSavingTournamentState() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(mapper.write(any(TournamentState.class))).thenReturn("{\"code\":\"ABCDE\"}");
        when(repository.findById("ABCDE")).thenReturn(Optional.empty());
        when(repository.save(any(TournamentStateEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var store = new PersistentTournamentStateStore(repository, mapper);
        var tournament = new TournamentState("ABCDE");

        store.save(tournament);

        var entityCaptor = ArgumentCaptor.forClass(TournamentStateEntity.class);
        verify(repository).save(entityCaptor.capture());
        var savedEntity = entityCaptor.getValue();
        assertThat(savedEntity.getCode()).isEqualTo("ABCDE");
        assertThat(savedEntity.getPayload()).isEqualTo("{\"code\":\"ABCDE\"}");
        assertThat(savedEntity.getCreatedAt()).isNotNull();
        assertThat(savedEntity.getUpdatedAt()).isNotNull();
    }

    // Verifies that updating an existing row preserves the original creation timestamp.
    @Test
    void preservesCreatedAtWhenSavingExistingTournamentState() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(mapper.write(any(TournamentState.class))).thenReturn("{\"code\":\"ABCDE\",\"status\":\"WAITING\"}");
        var existingEntity = new TournamentStateEntity("ABCDE", "{\"code\":\"ABCDE\"}");
        var originalCreatedAt = LocalDateTime.now().minusMinutes(15);
        ReflectionTestUtils.setField(existingEntity, "createdAt", originalCreatedAt);
        ReflectionTestUtils.setField(existingEntity, "updatedAt", LocalDateTime.now().minusMinutes(5));
        when(repository.findById("ABCDE")).thenReturn(Optional.of(existingEntity));
        when(repository.save(any(TournamentStateEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var store = new PersistentTournamentStateStore(repository, mapper);

        store.save(new TournamentState("ABCDE"));

        var entityCaptor = ArgumentCaptor.forClass(TournamentStateEntity.class);
        verify(repository).save(entityCaptor.capture());
        var savedEntity = entityCaptor.getValue();
        assertThat(savedEntity.getCreatedAt()).isEqualTo(originalCreatedAt);
        assertThat(savedEntity.getPayload()).isEqualTo("{\"code\":\"ABCDE\",\"status\":\"WAITING\"}");
    }

    // Verifies that restart recovery only sees persisted hand-result tournaments with a deadline.
    @Test
    void findsPendingHandResultsForRestartRecovery() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(repository.findPendingHandResults()).thenReturn(List.of(
                pendingHandResult("PEND1", 123_456L)
        ));

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findPendingHandResults())
                .containsExactly(new TournamentStateStore.PendingHandResult("PEND1", 123_456L));
        verify(repository).findPendingHandResults();
        verify(repository, never()).findAll();
    }

    // Verifies that restart recovery also sees persisted finished tournaments waiting for cleanup.
    @Test
    void findsPendingFinishedCleanupsForRestartRecovery() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(repository.findPendingFinishedCleanups()).thenReturn(List.of(
                pendingFinishedCleanup("DONE1", 654_321L)
        ));

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findPendingFinishedCleanups())
                .containsExactly(new TournamentStateStore.PendingFinishedCleanup("DONE1", 654_321L));
        verify(repository).findPendingFinishedCleanups();
        verify(repository, never()).findAll();
    }

    // Verifies that active guest lookup is resolved by a targeted repository query instead of a full scan.
    @Test
    void findsActiveTournamentCodeByGuestIdWithoutFullScan() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(repository.findActiveTournamentCodeByGuestId("guest-1")).thenReturn("ACTIVE1");

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findActiveTournamentCodeByGuestId("guest-1")).isEqualTo("ACTIVE1");
        verify(repository).findActiveTournamentCodeByGuestId("guest-1");
        verify(repository, never()).findAll();
    }

    // Verifies that active room lookup is resolved by a targeted repository query instead of a full scan.
    @Test
    void findsActiveTournamentCodeByRoomNameWithoutFullScan() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(repository.findActiveTournamentCodeByRoomName("Room One")).thenReturn("ROOM1");

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findActiveTournamentCodeByRoomName("Room One")).isEqualTo("ROOM1");
        verify(repository).findActiveTournamentCodeByRoomName("Room One");
        verify(repository, never()).findAll();
    }

    // Verifies that the active-guest count is served by a native count query instead of scanning payloads.
    @Test
    void countsActiveGuestsWithoutFullScan() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(repository.countActiveGuests()).thenReturn(7L);

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.countActiveGuests()).isEqualTo(7);
        verify(repository).countActiveGuests();
        verify(repository, never()).findAll();
    }

    // Verifies that the persisted public lobby list only surfaces public waiting rooms in newest-first order.
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
        ReflectionTestUtils.setField(newestEntity, "createdAt", LocalDateTime.now().minusMinutes(1));
        ReflectionTestUtils.setField(olderEntity, "createdAt", LocalDateTime.now().minusMinutes(10));
        ReflectionTestUtils.setField(privateEntity, "createdAt", LocalDateTime.now().minusMinutes(2));
        ReflectionTestUtils.setField(inHandEntity, "createdAt", LocalDateTime.now().minusMinutes(3));
        ReflectionTestUtils.setField(newestEntity, "updatedAt", LocalDateTime.now().minusMinutes(1));
        ReflectionTestUtils.setField(olderEntity, "updatedAt", LocalDateTime.now().minusMinutes(10));
        ReflectionTestUtils.setField(privateEntity, "updatedAt", LocalDateTime.now().minusMinutes(2));
        ReflectionTestUtils.setField(inHandEntity, "updatedAt", LocalDateTime.now().minusMinutes(3));

        when(repository.findWaitingTournamentRows(6)).thenReturn(List.of(newestEntity, privateEntity, olderEntity));
        when(mapper.read("pub1")).thenReturn(olderPublicWaiting);
        when(mapper.read("pub2")).thenReturn(newestPublicWaiting);
        when(mapper.read("priv1")).thenReturn(privateWaiting);

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
        verify(repository).findWaitingTournamentRows(6);
        verify(repository, never()).findAll();
    }

    // Verifies that restart recovery for in-hand action deadlines uses a targeted projection query.
    @Test
    void findsPendingActionTimeoutsForRestartRecoveryWithoutFullScan() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        when(repository.findPendingActionTimeouts()).thenReturn(List.of(
                pendingActionTimeout("HAND1", 987_654L)
        ));

        var store = new PersistentTournamentStateStore(repository, mapper);

        assertThat(store.findPendingActionTimeouts())
                .containsExactly(new TournamentStateStore.PendingActionTimeout("HAND1", 987_654L));
        verify(repository).findPendingActionTimeouts();
        verify(repository, never()).findAll();
    }

    // Verifies that waiting and in-hand tournaments can be identified as stale from updated_at timestamps.
    @Test
    void findsStaleTournamentCodesFromUpdatedAtTtlPolicy() {
        var repository = mock(TournamentStateJpaRepository.class);
        var mapper = mock(TournamentStatePersistenceMapper.class);
        doReturn(List.of("WAIT1", "HAND1", "DONE1")).when(repository).findStaleTournamentCodes(
                anyLong(),
                anyLong(),
                anyLong(),
                anyLong(),
                anyLong(),
                anyLong()
        );

        var store = new PersistentTournamentStateStore(repository, mapper);

        var waitingTtl = 30 * 60 * 1_000L;
        var inHandTtl = 2 * 60 * 60 * 1_000L;
        var hardTtl = 24 * 60 * 60 * 1_000L;
        var now = System.currentTimeMillis();

        assertThat(store.findStaleTournamentCodes(now, waitingTtl, inHandTtl, hardTtl))
                .containsExactly("WAIT1", "HAND1", "DONE1");

        var ttlCaptor = ArgumentCaptor.forClass(Long.class);
        var cutoffCaptor = ArgumentCaptor.forClass(Long.class);
        verify(repository).findStaleTournamentCodes(
                ttlCaptor.capture(),
                ttlCaptor.capture(),
                ttlCaptor.capture(),
                cutoffCaptor.capture(),
                cutoffCaptor.capture(),
                cutoffCaptor.capture()
        );
        assertThat(ttlCaptor.getAllValues()).containsExactly(waitingTtl, inHandTtl, hardTtl);
        assertThat(cutoffCaptor.getAllValues()).hasSize(3);
        verify(repository, never()).findAll();
    }

    private TournamentStateJpaRepository.PendingHandResultProjection pendingHandResult(String code, long deadline) {
        return new PendingHandResultProjectionStub(code, deadline);
    }

    private TournamentStateJpaRepository.PendingActionTimeoutProjection pendingActionTimeout(String code, long deadline) {
        return new PendingActionTimeoutProjectionStub(code, deadline);
    }

    private TournamentStateJpaRepository.PendingFinishedCleanupProjection pendingFinishedCleanup(String code, long deadline) {
        return new PendingFinishedCleanupProjectionStub(code, deadline);
    }

    private record PendingHandResultProjectionStub(String code, long handResultEndsAtEpochMilli)
            implements TournamentStateJpaRepository.PendingHandResultProjection {
        @Override
        public String getCode() {
            return code;
        }

        @Override
        public Long getHandResultEndsAtEpochMilli() {
            return handResultEndsAtEpochMilli;
        }
    }

    private record PendingActionTimeoutProjectionStub(String code, long actionDeadlineAtEpochMilli)
            implements TournamentStateJpaRepository.PendingActionTimeoutProjection {
        @Override
        public String getCode() {
            return code;
        }

        @Override
        public Long getActionDeadlineAtEpochMilli() {
            return actionDeadlineAtEpochMilli;
        }
    }

    private record PendingFinishedCleanupProjectionStub(String code, long finishedCleanupAtEpochMilli)
            implements TournamentStateJpaRepository.PendingFinishedCleanupProjection {
        @Override
        public String getCode() {
            return code;
        }

        @Override
        public Long getFinishedCleanupAtEpochMilli() {
            return finishedCleanupAtEpochMilli;
        }
    }
}
