package com.texasholdem.tournament.application.command;

import com.texasholdem.tournament.application.hand.*;
import com.texasholdem.tournament.application.state.*;
import com.texasholdem.tournament.application.snapshot.*;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Map;

public final class TournamentHandCommandFlow {

    private static final Logger log = LoggerFactory.getLogger(TournamentHandCommandFlow.class);

    private final TournamentCommandSupport support;
    private final TournamentSnapshotFactory snapshotFactory;
    private final TournamentEventFactory eventFactory;
    private final TournamentStateAccess stateAccess;
    private final TournamentHandEngine handEngine;

    TournamentHandCommandFlow(
            TournamentCommandSupport support,
            TournamentSnapshotFactory snapshotFactory,
            TournamentEventFactory eventFactory,
            TournamentStateAccess stateAccess,
            TournamentHandEngine handEngine
    ) {
        this.support = support;
        this.snapshotFactory = snapshotFactory;
        this.eventFactory = eventFactory;
        this.stateAccess = stateAccess;
        this.handEngine = handEngine;
    }

    TournamentBroadcast applyAction(String code, String guestId, String action, Integer amount) {
        return support.withLockedTournament("applyAction", code, tournament -> {
            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            var result = handEngine.applyAction(tournament, guestId, action, amount);
            support.saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "actionApplied",
                    tournament,
                    eventFactory.actionPayload(guestId, result.action(), result.amount()),
                    beforeSnapshot
            );
        });
    }

    TournamentBroadcast autoTimeoutActingPlayer(String code, long expectedDeadlineEpochMilli) {
        return support.withLockedTournamentIfPresent("autoTimeoutActingPlayer", code, tournament -> {
            if (tournament.status != TournamentStatus.IN_HAND
                    || tournament.actionDeadlineAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.actionDeadlineAtEpochMilli == 0
                    || tournament.actionDeadlineAtEpochMilli > Instant.now().toEpochMilli()
                    || tournament.actingSeat == null) {
                return null;
            }

            var actingPlayer = stateAccess.requireSeatPlayer(tournament, tournament.actingSeat);
            if (actingPlayer.status != PlayerStatus.ACTIVE || !actingPlayer.connected || actingPlayer.afk) {
                return null;
            }

            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            actingPlayer.afk = true;
            var automaticAction = beforeSnapshot.availableActions().contains("CHECK") ? "CHECK" : "FOLD";
            var result = handEngine.applyAutomaticAction(
                    tournament,
                    actingPlayer,
                    automaticAction,
                    automaticAction.equals("CHECK")
                            ? actingPlayer.nickname + " timed out, became AFK, and was auto-checked."
                            : actingPlayer.nickname + " timed out, became AFK, and was auto-folded."
            );
            support.saveTournamentState(tournament);
            return eventFactory.createBroadcast(
                    "actionApplied",
                    tournament,
                    Map.of(
                            "guestId", actingPlayer.guestId,
                            "action", result.action(),
                            "amount", result.amount(),
                            "reason", "timeout",
                            "afk", true
                    ),
                    beforeSnapshot
            );
        });
    }

    TournamentBroadcast autoAdvanceHandResult(String code, long expectedDeadlineEpochMilli) {
        return support.withLockedTournament("autoAdvanceHandResult", code, tournament -> {
            if (tournament.status != TournamentStatus.HAND_RESULT
                    || tournament.handResultEndsAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.handResultEndsAtEpochMilli > Instant.now().toEpochMilli()) {
                return null;
            }

            var beforeSnapshot = snapshotFactory.toSnapshot(tournament);
            return support.advanceResultState(tournament, beforeSnapshot);
        });
    }

    boolean cleanupFinishedTournament(String code, long expectedDeadlineEpochMilli) {
        return support.withLockedTournamentIfPresent("cleanupFinishedTournament", code, tournament -> {
            if (tournament.status != TournamentStatus.FINISHED
                    || tournament.finishedCleanupAtEpochMilli != expectedDeadlineEpochMilli
                    || tournament.finishedCleanupAtEpochMilli == 0
                    || tournament.finishedCleanupAtEpochMilli > Instant.now().toEpochMilli()) {
                return false;
            }

            log.info("Tournament cleanup removed finished tournament {} after result retention window.", tournament.code);
            support.deleteTournament(tournament.code);
            return true;
        });
    }
}
