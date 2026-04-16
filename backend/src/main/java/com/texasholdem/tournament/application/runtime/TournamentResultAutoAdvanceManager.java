package com.texasholdem.tournament.application.runtime;

import com.texasholdem.tournament.application.command.TournamentService;
import com.texasholdem.tournament.application.persistence.TournamentStateStore;
import com.texasholdem.tournament.application.snapshot.*;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.websocket.TournamentTopicPublisher;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public final class TournamentResultAutoAdvanceManager {

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final ConcurrentMap<String, ScheduledTransition> scheduledTransitions = new ConcurrentHashMap<>();
    private final TournamentService tournamentService;
    private final TournamentTopicPublisher topicPublisher;
    private final TournamentStateStore stateStore;

    // Wires hand-result auto-advance to the tournament service and broker publisher.
    TournamentResultAutoAdvanceManager(
            TournamentService tournamentService,
            TournamentTopicPublisher topicPublisher,
            TournamentStateStore stateStore
    ) {
        this.tournamentService = tournamentService;
        this.topicPublisher = topicPublisher;
        this.stateStore = stateStore;
    }

    // Schedules or cancels one result-state transition whenever tournament state changes are published.
    @EventListener
    void onTournamentStateChanged(TournamentStateChangedEvent event) {
        var transitionKind = transitionKind(event);
        if (transitionKind == null) {
            cancel(event.code());
            return;
        }
        var deadlineEpochMilli = transitionDeadline(event, transitionKind);

        var current = scheduledTransitions.get(event.code());
        if (current != null
                && current.kind() == transitionKind
                && current.deadlineEpochMilli() == deadlineEpochMilli) {
            return;
        }

        cancel(event.code());
        var scheduledTransition = new ScheduledTransition(transitionKind, deadlineEpochMilli);
        scheduledTransitions.put(event.code(), scheduledTransition);
        var delayMillis = Math.max(0, deadlineEpochMilli - System.currentTimeMillis());
        var future = scheduler.schedule(
                () -> runTransition(event.code(), transitionKind, deadlineEpochMilli),
                delayMillis,
                TimeUnit.MILLISECONDS
        );
        scheduledTransition.attachFuture(future);
    }

    // Replays persisted hand-result transitions so auto-advance survives service restarts.
    @EventListener(ApplicationReadyEvent.class)
    void recoverPendingHandResults() {
        stateStore.findPendingActionTimeouts().forEach(pendingActionTimeout ->
                onTournamentStateChanged(new TournamentStateChangedEvent(
                        pendingActionTimeout.code(),
                        TournamentStatus.IN_HAND,
                        pendingActionTimeout.actionDeadlineAtEpochMilli(),
                        0,
                        0
                ))
        );
        stateStore.findPendingHandResults().forEach(pendingHandResult ->
                onTournamentStateChanged(new TournamentStateChangedEvent(
                        pendingHandResult.code(),
                        TournamentStatus.HAND_RESULT,
                        0,
                        pendingHandResult.handResultEndsAtEpochMilli(),
                        0
                ))
        );
        stateStore.findPendingFinishedCleanups().forEach(pendingCleanup ->
                onTournamentStateChanged(new TournamentStateChangedEvent(
                        pendingCleanup.code(),
                        TournamentStatus.FINISHED,
                        0,
                        0,
                        pendingCleanup.finishedCleanupAtEpochMilli()
                ))
        );
    }

    // Stops any queued transition when the service shuts down.
    @PreDestroy
    void shutdown() {
        scheduledTransitions.values().forEach(transition -> transition.future().cancel(false));
        scheduler.shutdownNow();
    }

    // Runs one delayed transition and broadcasts the fresh snapshot when the result timer expires.
    private void runTransition(String code, TransitionKind transitionKind, long deadlineEpochMilli) {
        var scheduled = scheduledTransitions.get(code);
        if (scheduled == null
                || scheduled.kind() != transitionKind
                || scheduled.deadlineEpochMilli() != deadlineEpochMilli) {
            return;
        }

        scheduledTransitions.remove(code, scheduled);
        if (transitionKind == TransitionKind.ACTION_TIMEOUT) {
            var broadcast = tournamentService.autoTimeoutActingPlayer(code, deadlineEpochMilli);
            if (broadcast != null) {
                topicPublisher.publish(code, broadcast);
            }
            return;
        }
        if (transitionKind == TransitionKind.HAND_RESULT) {
            var broadcast = tournamentService.autoAdvanceHandResult(code, deadlineEpochMilli);
            if (broadcast != null) {
                topicPublisher.publish(code, broadcast);
            }
            return;
        }

        tournamentService.cleanupFinishedTournament(code, deadlineEpochMilli);
    }

    // Cancels one existing delayed transition when the tournament leaves result state.
    private void cancel(String code) {
        var existing = scheduledTransitions.remove(code);
        if (existing != null && existing.future() != null) {
            existing.future().cancel(false);
        }
    }

    private TransitionKind transitionKind(TournamentStateChangedEvent event) {
        if (event.status() == TournamentStatus.IN_HAND && event.actionDeadlineAtEpochMilli() > 0) {
            return TransitionKind.ACTION_TIMEOUT;
        }
        if (event.status() == TournamentStatus.HAND_RESULT && event.handResultEndsAtEpochMilli() > 0) {
            return TransitionKind.HAND_RESULT;
        }
        if (event.status() == TournamentStatus.FINISHED && event.finishedCleanupAtEpochMilli() > 0) {
            return TransitionKind.FINISHED_CLEANUP;
        }
        return null;
    }

    private long transitionDeadline(TournamentStateChangedEvent event, TransitionKind transitionKind) {
        if (transitionKind == TransitionKind.ACTION_TIMEOUT) {
            return event.actionDeadlineAtEpochMilli();
        }
        return transitionKind == TransitionKind.HAND_RESULT
                ? event.handResultEndsAtEpochMilli()
                : event.finishedCleanupAtEpochMilli();
    }

    private static final class ScheduledTransition {

        private final TransitionKind kind;
        private final long deadlineEpochMilli;
        private volatile ScheduledFuture<?> future;

        private ScheduledTransition(TransitionKind kind, long deadlineEpochMilli) {
            this.kind = kind;
            this.deadlineEpochMilli = deadlineEpochMilli;
        }

        TransitionKind kind() {
            return kind;
        }

        long deadlineEpochMilli() {
            return deadlineEpochMilli;
        }

        ScheduledFuture<?> future() {
            return future;
        }

        void attachFuture(ScheduledFuture<?> future) {
            this.future = future;
        }
    }

    private enum TransitionKind {
        ACTION_TIMEOUT,
        HAND_RESULT,
        FINISHED_CLEANUP
    }
}
