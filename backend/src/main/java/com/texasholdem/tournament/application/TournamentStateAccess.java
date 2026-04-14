package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentPauseReason;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
final class TournamentStateAccess {

    private final TournamentRules rules;

    // Wires state navigation helpers to the shared tournament rules.
    TournamentStateAccess(TournamentRules rules) {
        this.rules = rules;
    }

    // Rejects mutations that are only valid in the waiting room.
    void requireWaiting(TournamentState tournament) {
        if (tournament.status != TournamentStatus.WAITING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tournament is not accepting waiting-room changes");
        }
    }

    // Locates a player or fails with a request-scoped error.
    TournamentPlayerState requirePlayer(TournamentState tournament, String guestId) {
        var player = findPlayer(tournament, guestId);
        if (player == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Player is not part of this tournament");
        }
        return player;
    }

    // Looks up a player by guest identifier inside a tournament.
    TournamentPlayerState findPlayer(TournamentState tournament, String guestId) {
        return tournament.players.stream()
                .filter(player -> player.guestId.equals(guestId))
                .findFirst()
                .orElse(null);
    }

    // Resolves a seated player by seat index inside one tournament hand.
    TournamentPlayerState requireSeatPlayer(TournamentState tournament, int seatIndex) {
        return tournament.players.stream()
                .filter(candidate -> candidate.seatIndex == seatIndex)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Seat player not found"));
    }

    // Finds the lowest unused seat index in the six-seat layout.
    int nextSeatIndex(List<TournamentPlayerState> players) {
        for (var seat = 0; seat < rules.maxSeats(); seat++) {
            var currentSeat = seat;
            var occupied = players.stream().anyMatch(player -> player.seatIndex == currentSeat);
            if (!occupied) {
                return seat;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No seat is available");
    }

    // Exposes the seat cap so read models can stay aligned with live tournament rules.
    int maxSeats() {
        return rules.maxSeats();
    }

    // Counts the entrants still alive in the overall tournament.
    long countRemainingParticipants(TournamentState tournament) {
        return tournament.players.stream()
                .filter(player -> player.participating && player.stack > 0)
                .count();
    }

    // Counts the players that still have a claim on the pot after folds are removed.
    long countContestingPlayers(TournamentState tournament) {
        return tournament.players.stream()
                .filter(TournamentPlayerState::isEligibleForPot)
                .count();
    }

    // Counts the players that still have chips and legal action available this hand.
    long countPlayersAbleToAct(TournamentState tournament) {
        return tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE)
                .count();
    }

    // Returns whether every still-active player is currently marked AFK.
    boolean allActivePlayersAreAfk(TournamentState tournament) {
        var activePlayers = tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE)
                .toList();
        return !activePlayers.isEmpty() && activePlayers.stream().allMatch(player -> player.afk);
    }

    // Returns the sorted seat list for every remaining tournament entrant.
    List<Integer> remainingSeats(TournamentState tournament) {
        return tournament.players.stream()
                .filter(player -> player.participating && player.stack > 0)
                .map(player -> player.seatIndex)
                .sorted()
                .toList();
    }

    // Finds the next surviving seat around the ring.
    int nextSeatFrom(List<Integer> seats, int currentSeat) {
        return seats.stream()
                .filter(seat -> seat > currentSeat)
                .findFirst()
                .orElse(seats.get(0));
    }

    // Finds the next player that can still act in the current hand.
    Integer nextActiveSeatAfter(TournamentState tournament, int currentSeat) {
        var activeSeats = tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE)
                .map(player -> player.seatIndex)
                .sorted()
                .toList();
        if (activeSeats.isEmpty()) {
            return null;
        }
        return activeSeats.stream()
                .filter(seat -> seat > currentSeat)
                .findFirst()
                .orElse(activeSeats.get(0));
    }

    // Finds the next player that still owes an action in the current betting round.
    Integer nextAwaitingSeatAfter(TournamentState tournament, int currentSeat) {
        var awaitingSeats = tournament.players.stream()
                .filter(player -> player.status == PlayerStatus.ACTIVE && player.awaitingAction)
                .map(player -> player.seatIndex)
                .sorted()
                .toList();
        if (awaitingSeats.isEmpty()) {
            return null;
        }
        return awaitingSeats.stream()
                .filter(seat -> seat > currentSeat)
                .findFirst()
                .orElse(awaitingSeats.get(0));
    }

    // Returns whether one player can manually continue the current paused hand.
    boolean canManuallyAct(TournamentPlayerState player) {
        return player.status == PlayerStatus.ACTIVE
                && player.awaitingAction
                && player.connected
                && !player.afk;
    }

    // Freezes the current hand and blind clock when every active player is AFK.
    void pauseForAllPlayersAfk(TournamentState tournament) {
        if (!tournament.paused) {
            tournament.levelPausedRemainingSeconds = currentLevelSecondsRemaining(tournament);
        }
        tournament.paused = true;
        tournament.pauseReason = TournamentPauseReason.ALL_PLAYERS_AFK;
        tournament.actionDeadlineAtEpochMilli = 0;
    }

    // Restores the blind clock baseline after one paused hand becomes live again.
    void resumePausedHand(TournamentState tournament) {
        if (!tournament.paused) {
            return;
        }

        var durationSeconds = currentLevelDurationSeconds(tournament);
        tournament.levelActivatedAtEpochSecond = Instant.now().getEpochSecond()
                - Math.max(0, durationSeconds - tournament.levelPausedRemainingSeconds);
        clearPausedHand(tournament);
    }

    // Clears paused metadata when the hand leaves its soft-pause branch.
    void clearPausedHand(TournamentState tournament) {
        tournament.paused = false;
        tournament.pauseReason = null;
        tournament.levelPausedRemainingSeconds = 0;
    }

    // Computes the blind countdown visible to clients for the current level.
    long currentLevelSecondsRemaining(TournamentState tournament) {
        if (tournament.paused) {
            return Math.max(0, tournament.levelPausedRemainingSeconds);
        }

        var durationSeconds = currentLevelDurationSeconds(tournament);
        if (tournament.levelActivatedAtEpochSecond == 0) {
            return durationSeconds;
        }

        var levelEndsAtEpochSecond = tournament.levelActivatedAtEpochSecond + durationSeconds;
        return Math.max(0, levelEndsAtEpochSecond - Instant.now().getEpochSecond());
    }

    // Exposes the configured blind duration for the current level.
    long currentLevelDurationSeconds(TournamentState tournament) {
        return rules.currentLevel(tournament.levelIndex).durationSeconds();
    }

    // Marks a single player as the current actor and clears the rest.
    void setActingPlayer(TournamentState tournament, Integer seatIndex) {
        for (var player : tournament.players) {
            player.acting = seatIndex != null && player.seatIndex == seatIndex && player.status == PlayerStatus.ACTIVE;
        }
    }

    // Builds the action affordances for the current acting player.
    List<String> buildAvailableActions(TournamentState tournament, TournamentPlayerState player) {
        if (player.status != PlayerStatus.ACTIVE || player.stack <= 0) {
            return List.of();
        }

        var chipsToCall = TournamentBetSizing.chipsToCall(tournament, player);
        var actions = new ArrayList<String>();
        if (chipsToCall > 0) {
            actions.add("FOLD");
            actions.add("CALL");
            if (player.raiseRightsAvailable && TournamentBetSizing.canMakeFullRaise(rules, tournament, player)) {
                actions.add("RAISE");
            }
            actions.add("ALL_IN");
            return actions;
        }

        actions.add("CHECK");
        if (player.raiseRightsAvailable && TournamentBetSizing.canMakeFullRaise(rules, tournament, player)) {
            actions.add(tournament.currentBet == 0 ? "BET" : "RAISE");
        }
        actions.add("ALL_IN");
        return actions;
    }

    // Joins message fragments into one compact sentence stream.
    String combineMessages(String... parts) {
        var fragments = new ArrayList<String>();
        for (var part : parts) {
            if (part == null || part.isBlank()) {
                continue;
            }
            fragments.add(part.trim());
        }
        return String.join(" ", fragments);
    }
}
