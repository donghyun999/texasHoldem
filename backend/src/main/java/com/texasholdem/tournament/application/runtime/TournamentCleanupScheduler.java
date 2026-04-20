package com.texasholdem.tournament.application.runtime;

import com.texasholdem.tournament.application.command.TournamentCleanupService;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

@Component
public final class TournamentCleanupScheduler {

    private final TournamentCleanupService cleanupService;
    private final AtomicBoolean cleanupRunning = new AtomicBoolean(false);

    public TournamentCleanupScheduler(TournamentCleanupService cleanupService) {
        this.cleanupService = cleanupService;
    }

    @EventListener(ApplicationReadyEvent.class)
    void cleanupOnStartup() {
        cleanupService.cleanupStaleTournamentsNow();
    }

    @Scheduled(fixedDelayString = "${app.tournament.cleanup-fixed-delay-ms:30000}")
    void cleanupPeriodically() {
        runCleanupIfIdle();
    }

    @PreDestroy
    void shutdown() {
        cleanupRunning.set(false);
    }

    private void runCleanupIfIdle() {
        if (!cleanupRunning.compareAndSet(false, true)) {
            return;
        }
        try {
            cleanupService.cleanupStaleTournamentsIfDue();
        } finally {
            cleanupRunning.set(false);
        }
    }
}
