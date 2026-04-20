package com.texasholdem.tournament.application.command;

import com.texasholdem.tournament.application.persistence.TournamentStateStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

@Component
public final class TournamentCleanupService {

    private static final Logger log = LoggerFactory.getLogger(TournamentCleanupService.class);

    private final TournamentStateStore stateStore;
    private final long waitingIdleTtlMillis;
    private final long inHandIdleTtlMillis;
    private final long hardTtlMillis;
    private final long cleanupMinIntervalMillis;
    private final AtomicLong lastCleanupRunAtMillis = new AtomicLong(0);

    public TournamentCleanupService(
            TournamentStateStore stateStore,
            TournamentServiceProperties properties,
            @Value("${app.tournament.cleanup-min-interval-ms:15000}") long cleanupMinIntervalMillis
    ) {
        this.stateStore = stateStore;
        this.waitingIdleTtlMillis = properties.waitingIdleTtlMillis();
        this.inHandIdleTtlMillis = properties.inHandIdleTtlMillis();
        this.hardTtlMillis = properties.hardTtlMillis();
        this.cleanupMinIntervalMillis = Math.max(0, cleanupMinIntervalMillis);
    }

    public void cleanupStaleTournamentsIfDue() {
        if (!shouldRunCleanup(Instant.now().toEpochMilli())) {
            return;
        }
        cleanupStaleTournamentsNow();
    }

    public void cleanupStaleTournamentsNow() {
        if (waitingIdleTtlMillis <= 0 && inHandIdleTtlMillis <= 0 && hardTtlMillis <= 0) {
            return;
        }

        lastCleanupRunAtMillis.set(Instant.now().toEpochMilli());
        var staleCodes = stateStore.findStaleTournamentCodes(
                Instant.now().toEpochMilli(),
                waitingIdleTtlMillis,
                inHandIdleTtlMillis,
                hardTtlMillis
        );
        if (staleCodes.isEmpty()) {
            return;
        }

        log.info(
                "Tournament cleanup removed {} stale tournaments. sampleCodes={}",
                staleCodes.size(),
                staleCodes.stream().limit(5).toList()
        );
        staleCodes.forEach(stateStore::delete);
    }

    private boolean shouldRunCleanup(long nowEpochMilli) {
        if (cleanupMinIntervalMillis <= 0) {
            return true;
        }
        var lastRunAt = lastCleanupRunAtMillis.get();
        if (lastRunAt > 0 && nowEpochMilli - lastRunAt < cleanupMinIntervalMillis) {
            return false;
        }
        return lastCleanupRunAtMillis.compareAndSet(lastRunAt, nowEpochMilli);
    }
}
