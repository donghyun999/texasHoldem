package com.texasholdem.tournament.application.command;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class TournamentServiceProperties {

    private final long waitingIdleTtlMillis;
    private final long inHandIdleTtlMillis;
    private final long hardTtlMillis;

    public TournamentServiceProperties(
            @Value("${app.tournament.waiting-idle-ttl-seconds:1800}") long waitingIdleTtlSeconds,
            @Value("${app.tournament.in-hand-idle-ttl-seconds:7200}") long inHandIdleTtlSeconds,
            @Value("${app.tournament.hard-ttl-seconds:86400}") long hardTtlSeconds
    ) {
        this.waitingIdleTtlMillis = ttlToMillis(waitingIdleTtlSeconds);
        this.inHandIdleTtlMillis = ttlToMillis(inHandIdleTtlSeconds);
        this.hardTtlMillis = ttlToMillis(hardTtlSeconds);
    }

    public long waitingIdleTtlMillis() {
        return waitingIdleTtlMillis;
    }

    public long inHandIdleTtlMillis() {
        return inHandIdleTtlMillis;
    }

    public long hardTtlMillis() {
        return hardTtlMillis;
    }

    private static long ttlToMillis(long ttlSeconds) {
        return ttlSeconds <= 0 ? 0 : ttlSeconds * 1_000L;
    }
}
