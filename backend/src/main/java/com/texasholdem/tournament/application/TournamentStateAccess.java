package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

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

        var chipsToCall = Math.max(0, tournament.currentBet - player.roundContribution);
        var actions = new ArrayList<String>();
        if (chipsToCall > 0) {
            actions.add("FOLD");
            actions.add("CALL");
            if (player.stack > chipsToCall) {
                actions.add("RAISE");
            }
            actions.add("ALL_IN");
            return actions;
        }

        actions.add("CHECK");
        actions.add(tournament.currentBet == 0 ? "BET" : "RAISE");
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
