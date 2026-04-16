package com.texasholdem.persistence;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TournamentStateJpaRepository extends JpaRepository<TournamentStateEntity, String> {

    @Query(value = """
            select code
            from tournament_state
            where coalesce(payload::jsonb ->> 'status', '') <> 'FINISHED'
              and payload::jsonb @> jsonb_build_object(
                'players',
                jsonb_build_array(jsonb_build_object('guestId', :guestId))
              )
            limit 1
            """, nativeQuery = true)
    String findActiveTournamentCodeByGuestId(@Param("guestId") String guestId);

    @Query(value = """
            select code
            from tournament_state
            where coalesce(payload::jsonb ->> 'status', '') <> 'FINISHED'
              and lower(
                case
                    when coalesce(payload::jsonb ->> 'roomName', '') = '' then code
                    else payload::jsonb ->> 'roomName'
                end
              ) = lower(:roomName)
            limit 1
            """, nativeQuery = true)
    String findActiveTournamentCodeByRoomName(@Param("roomName") String roomName);

    @Query(value = """
            select coalesce(count(distinct player ->> 'guestId'), 0::bigint)
            from tournament_state state
            cross join lateral jsonb_array_elements(coalesce(state.payload::jsonb -> 'players', '[]'::jsonb)) player
            where coalesce(state.payload::jsonb ->> 'status', '') <> 'FINISHED'
            """, nativeQuery = true)
    long countActiveGuests();

    @Query(value = """
            select *
            from tournament_state
            where coalesce(payload::jsonb ->> 'status', '') = 'WAITING'
              and jsonb_array_length(coalesce(payload::jsonb -> 'players', '[]'::jsonb)) > 0
              and jsonb_array_length(coalesce(payload::jsonb -> 'players', '[]'::jsonb)) < :maxPlayers
            order by created_at desc
            """, nativeQuery = true)
    List<TournamentStateEntity> findWaitingTournamentRows(@Param("maxPlayers") int maxPlayers);

    @Query(value = """
            select
                code as code,
                (payload::jsonb ->> 'handResultEndsAtEpochMilli')::bigint as handResultEndsAtEpochMilli
            from tournament_state
            where coalesce(payload::jsonb ->> 'status', '') = 'HAND_RESULT'
              and coalesce((payload::jsonb ->> 'handResultEndsAtEpochMilli')::bigint, 0) > 0
            """, nativeQuery = true)
    List<PendingHandResultProjection> findPendingHandResults();

    @Query(value = """
            select
                code as code,
                (payload::jsonb ->> 'actionDeadlineAtEpochMilli')::bigint as actionDeadlineAtEpochMilli
            from tournament_state
            where coalesce(payload::jsonb ->> 'status', '') = 'IN_HAND'
              and coalesce((payload::jsonb ->> 'actionDeadlineAtEpochMilli')::bigint, 0) > 0
            """, nativeQuery = true)
    List<PendingActionTimeoutProjection> findPendingActionTimeouts();

    @Query(value = """
            select
                code as code,
                (payload::jsonb ->> 'finishedCleanupAtEpochMilli')::bigint as finishedCleanupAtEpochMilli
            from tournament_state
            where coalesce(payload::jsonb ->> 'status', '') = 'FINISHED'
              and coalesce((payload::jsonb ->> 'finishedCleanupAtEpochMilli')::bigint, 0) > 0
            """, nativeQuery = true)
    List<PendingFinishedCleanupProjection> findPendingFinishedCleanups();

    interface PendingHandResultProjection {
        String getCode();

        Long getHandResultEndsAtEpochMilli();
    }

    interface PendingActionTimeoutProjection {
        String getCode();

        Long getActionDeadlineAtEpochMilli();
    }

    interface PendingFinishedCleanupProjection {
        String getCode();

        Long getFinishedCleanupAtEpochMilli();
    }

    @Query(value = """
            select code
            from tournament_state
            where
                (:hardTtlMillis > 0 and updated_at <= to_timestamp(:hardCutoffEpochMilli / 1000.0))
                or (
                    :waitingIdleTtlMillis > 0
                    and coalesce(payload::jsonb ->> 'status', '') = 'WAITING'
                    and updated_at <= to_timestamp(:waitingCutoffEpochMilli / 1000.0)
                )
                or (
                    :inHandIdleTtlMillis > 0
                    and coalesce(payload::jsonb ->> 'status', '') = 'IN_HAND'
                    and updated_at <= to_timestamp(:inHandCutoffEpochMilli / 1000.0)
                )
            """, nativeQuery = true)
    List<String> findStaleTournamentCodes(
            @Param("waitingIdleTtlMillis") long waitingIdleTtlMillis,
            @Param("inHandIdleTtlMillis") long inHandIdleTtlMillis,
            @Param("hardTtlMillis") long hardTtlMillis,
            @Param("waitingCutoffEpochMilli") long waitingCutoffEpochMilli,
            @Param("inHandCutoffEpochMilli") long inHandCutoffEpochMilli,
            @Param("hardCutoffEpochMilli") long hardCutoffEpochMilli
    );
}
