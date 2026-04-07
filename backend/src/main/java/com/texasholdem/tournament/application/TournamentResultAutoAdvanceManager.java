package com.texasholdem.tournament.application;

import com.texasholdem.websocket.TournamentTopicPublisher;
import jakarta.annotation.PreDestroy;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
final class TournamentResultAutoAdvanceManager {

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final ConcurrentMap<String, ScheduledTransition> scheduledTransitions = new ConcurrentHashMap<>();
    private final TournamentService tournamentService;
    private final TournamentTopicPublisher topicPublisher;

    // Wires hand-result auto-advance to the tournament service and broker publisher.
    TournamentResultAutoAdvanceManager(
            TournamentService tournamentService,
            TournamentTopicPublisher topicPublisher
    ) {
        this.tournamentService = tournamentService;
        this.topicPublisher = topicPublisher;
    }

    // Schedules or cancels one result-state transition whenever tournament state changes are published.
    @EventListener
    void onTournamentStateChanged(TournamentStateChangedEvent event) {
        if (event.status() != com.texasholdem.tournament.domain.TournamentStatus.HAND_RESULT
                || event.handResultEndsAtEpochMilli() <= 0) {
            cancel(event.code());
            return;
        }

        var current = scheduledTransitions.get(event.code());
        if (current != null && current.deadlineEpochMilli() == event.handResultEndsAtEpochMilli()) {
            return;
        }

        cancel(event.code());
        var delayMillis = Math.max(0, event.handResultEndsAtEpochMilli() - System.currentTimeMillis());
        var future = scheduler.schedule(
                () -> advanceTournament(event.code(), event.handResultEndsAtEpochMilli()),
                delayMillis,
                TimeUnit.MILLISECONDS
        );
        scheduledTransitions.put(event.code(), new ScheduledTransition(event.handResultEndsAtEpochMilli(), future));
    }

    // Stops any queued transition when the service shuts down.
    @PreDestroy
    void shutdown() {
        scheduledTransitions.values().forEach(transition -> transition.future().cancel(false));
        scheduler.shutdownNow();
    }

    // Runs one delayed transition and broadcasts the fresh snapshot when the result timer expires.
    private void advanceTournament(String code, long deadlineEpochMilli) {
        var scheduled = scheduledTransitions.get(code);
        if (scheduled == null || scheduled.deadlineEpochMilli() != deadlineEpochMilli) {
            return;
        }

        scheduledTransitions.remove(code, scheduled);
        var event = tournamentService.autoAdvanceHandResult(code, deadlineEpochMilli);
        if (event != null) {
            topicPublisher.publish(code, event);
        }
    }

    // Cancels one existing delayed transition when the tournament leaves result state.
    private void cancel(String code) {
        var existing = scheduledTransitions.remove(code);
        if (existing != null) {
            existing.future().cancel(false);
        }
    }

    private record ScheduledTransition(
            long deadlineEpochMilli,
            ScheduledFuture<?> future
    ) {
    }
}
