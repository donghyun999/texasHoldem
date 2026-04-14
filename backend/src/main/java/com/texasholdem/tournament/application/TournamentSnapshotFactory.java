package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.SnapshotAudience;
import com.texasholdem.tournament.domain.TournamentPlayerView;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Component
final class TournamentSnapshotFactory {

    private final TournamentRules rules;
    private final long actionTimeoutSeconds;

    // Wires snapshot assembly to the shared tournament rules.
    TournamentSnapshotFactory(
            TournamentRules rules,
            @Value("${app.tournament.action-timeout-seconds:20}") long actionTimeoutSeconds
    ) {
        this.rules = rules;
        this.actionTimeoutSeconds = Math.max(0, actionTimeoutSeconds);
    }

    // Converts mutable in-memory state into the API snapshot contract.
    TournamentSnapshot toSnapshot(TournamentState tournament) {
        return toSnapshot(tournament, null);
    }

    // Converts mutable in-memory state into the API snapshot contract for one viewing guest.
    TournamentSnapshot toSnapshot(TournamentState tournament, String viewerGuestId) {
        var normalizedViewerGuestId = normalizeViewerGuestId(viewerGuestId);
        var viewerHoleCards = viewerHoleCards(tournament, normalizedViewerGuestId);
        var viewerChipsToCall = viewerChipsToCall(tournament, normalizedViewerGuestId);
        var viewerMinimumRaiseTo = viewerMinimumRaiseTo(tournament, normalizedViewerGuestId);
        var currentLevel = rules.currentLevel(tournament.levelIndex);
        var nextLevel = rules.nextLevel(tournament.levelIndex);
        long levelEndsAt;
        long secondsUntilNextLevel;
        if (tournament.paused) {
            levelEndsAt = 0;
            secondsUntilNextLevel = Math.max(0, tournament.levelPausedRemainingSeconds);
        } else {
            var now = Instant.now().getEpochSecond();
            levelEndsAt = tournament.levelActivatedAtEpochSecond == 0
                    ? now + currentLevel.durationSeconds()
                    : tournament.levelActivatedAtEpochSecond + currentLevel.durationSeconds();
            secondsUntilNextLevel = Math.max(0, levelEndsAt - now);
        }

        return new TournamentSnapshot(
                tournament.code,
                tournament.visibility,
                tournament.handNumber,
                tournament.stateVersion,
                normalizedViewerGuestId == null ? SnapshotAudience.PUBLIC : SnapshotAudience.VIEWER,
                normalizedViewerGuestId,
                !viewerHoleCards.isEmpty(),
                tournament.status,
                currentLevel,
                nextLevel,
                levelEndsAt,
                secondsUntilNextLevel,
                tournament.mainPot,
                List.copyOf(tournament.sidePots),
                List.copyOf(tournament.boardCards),
                tournament.dealerSeat,
                tournament.smallBlindSeat,
                tournament.bigBlindSeat,
                tournament.actingSeat,
                tournament.paused,
                tournament.pauseReason,
                tournament.actionDeadlineAtEpochMilli,
                actionTimeoutSeconds,
                tournament.players.stream()
                        .sorted(Comparator.comparingInt(player -> player.seatIndex))
                        .map(this::toView)
                        .collect(Collectors.toList()),
                List.copyOf(tournament.showdownPots),
                List.copyOf(tournament.showdownHands),
                List.copyOf(tournament.recentlyBustedGuestIds),
                List.copyOf(tournament.availableActions),
                viewerChipsToCall,
                viewerMinimumRaiseTo,
                tournament.tableMessage,
                viewerHoleCards
        );
    }

    // Converts one mutable player state into the snapshot-facing player view.
    private TournamentPlayerView toView(TournamentPlayerState player) {
        return new TournamentPlayerView(
                player.guestId,
                player.nickname,
                player.seatIndex,
                player.status,
                player.stack,
                player.roundContribution,
                player.owner,
                player.connected,
                player.afk,
                player.participating,
                player.acting
        );
    }

    // Exposes only the viewing player's own hole cards, never opponents' hidden cards.
    private List<String> viewerHoleCards(TournamentState tournament, String viewerGuestId) {
        if (viewerGuestId == null) {
            return List.of();
        }

        return tournament.players.stream()
                .filter(player -> player.guestId.equals(viewerGuestId))
                .findFirst()
                .map(player -> List.copyOf(player.holeCards))
                .orElseGet(List::of);
    }

    private int viewerChipsToCall(TournamentState tournament, String viewerGuestId) {
        if (viewerGuestId == null) {
            return 0;
        }

        return tournament.players.stream()
                .filter(player -> player.guestId.equals(viewerGuestId))
                .findFirst()
                .map(player -> TournamentBetSizing.chipsToCall(tournament, player))
                .orElse(0);
    }

    private int viewerMinimumRaiseTo(TournamentState tournament, String viewerGuestId) {
        if (viewerGuestId == null) {
            return 0;
        }

        return tournament.players.stream()
                .filter(player -> player.guestId.equals(viewerGuestId))
                .findFirst()
                .map(player -> TournamentBetSizing.minimumTotalContributionForFullRaise(rules, tournament))
                .orElse(0);
    }

    private String normalizeViewerGuestId(String viewerGuestId) {
        if (viewerGuestId == null || viewerGuestId.isBlank()) {
            return null;
        }
        return viewerGuestId.trim();
    }
}
