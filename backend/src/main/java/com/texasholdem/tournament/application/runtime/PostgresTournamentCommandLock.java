package com.texasholdem.tournament.application.runtime;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;

@Component
public final class PostgresTournamentCommandLock implements TournamentCommandLock {

    private static final long FNV64_OFFSET_BASIS = 0xcbf29ce484222325L;
    private static final long FNV64_PRIME = 0x100000001b3L;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    // Wraps tournament mutations in one PostgreSQL advisory-lock transaction.
    public PostgresTournamentCommandLock(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.transactionTemplate.setReadOnly(false);
    }

    @Override
    public <T> T withLock(String tournamentCode, Supplier<T> action) {
        return transactionTemplate.execute(status -> {
            acquireLock(tournamentCode);
            return action.get();
        });
    }

    private void acquireLock(String tournamentCode) {
        var lockKey = hashTournamentCode(tournamentCode);
        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                statement.setLong(1, lockKey);
                statement.execute();
            }
            return null;
        });
    }

    private long hashTournamentCode(String tournamentCode) {
        var hash = FNV64_OFFSET_BASIS;
        for (var value : tournamentCode.getBytes(StandardCharsets.UTF_8)) {
            hash ^= value & 0xffL;
            hash *= FNV64_PRIME;
        }
        return hash;
    }
}
