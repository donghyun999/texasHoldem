package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentPlayerView;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Component
final class TournamentSnapshotFactory {

    private final TournamentRules rules;

    // Wires snapshot assembly to the shared tournament rules.
    TournamentSnapshotFactory(TournamentRules rules) {
        this.rules = rules;
    }

    // Converts mutable in-memory state into the API snapshot contract.
    TournamentSnapshot toSnapshot(TournamentState tournament) {
        var currentLevel = rules.currentLevel(tournament.levelIndex);
        var nextLevel = rules.nextLevel(tournament.levelIndex);
        var now = Instant.now().getEpochSecond();
        var levelEndsAt = tournament.levelActivatedAtEpochSecond == 0
                ? now + currentLevel.durationSeconds()
                : tournament.levelActivatedAtEpochSecond + currentLevel.durationSeconds();
        var secondsUntilNextLevel = Math.max(0, levelEndsAt - now);

        return new TournamentSnapshot(
                tournament.code,
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
                tournament.players.stream()
                        .sorted(Comparator.comparingInt(player -> player.seatIndex))
                        .map(this::toView)
                        .collect(Collectors.toList()),
                List.copyOf(tournament.showdownPots),
                List.copyOf(tournament.availableActions),
                tournament.tableMessage
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
                player.owner,
                player.connected,
                player.participating,
                player.acting
        );
    }
}
