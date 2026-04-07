package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
final class TournamentHandResultManager {

    private static final long HAND_RESULT_DURATION_MILLIS = 5_000L;

    private final TournamentStateAccess stateAccess;
    private final TournamentPotResolver potResolver;

    // Wires the result manager to tournament state helpers and showdown settlement logic.
    TournamentHandResultManager(
            TournamentStateAccess stateAccess,
            TournamentPotResolver potResolver
    ) {
        this.stateAccess = stateAccess;
        this.potResolver = potResolver;
    }

    // Settles the completed hand, updates bust-outs, and appends the result summary.
    void settleCompletedHand(TournamentState tournament) {
        var settlement = potResolver.settle(
                tournament.players.stream().map(this::toPotState).toList(),
                tournament.hiddenBoardCards,
                tournament.dealerSeat
        );
        for (var player : tournament.players) {
            player.stack += settlement.stackCredits().getOrDefault(player.guestId, 0);
        }
        tournament.showdownPots = new ArrayList<>(settlement.showdownPots());

        var bustedPlayers = markBustedPlayers(tournament);
        var summary = buildCompletionMessage(tournament, settlement, bustedPlayers);
        if (stateAccess.countRemainingParticipants(tournament) <= 1) {
            moveToFinished(tournament, buildChampionMessage(tournament, stateAccess.combineMessages(tournament.tableMessage, summary)));
            return;
        }
        tournament.tableMessage = stateAccess.combineMessages(tournament.tableMessage, summary);
    }

    // Builds the terminal winner message once only one participant still has chips.
    String buildChampionMessage(TournamentState tournament, String prefixMessage) {
        var champion = tournament.players.stream()
                .filter(player -> player.participating && player.stack > 0)
                .findFirst()
                .orElse(null);
        if (champion == null) {
            return prefixMessage == null || prefixMessage.isBlank()
                    ? "Tournament finished."
                    : prefixMessage.trim();
        }
        return stateAccess.combineMessages(prefixMessage, champion.nickname + " wins the tournament.");
    }

    // Clears action affordances and moves the tournament into the terminal state.
    void moveToFinished(TournamentState tournament, String tableMessage) {
        tournament.status = TournamentStatus.FINISHED;
        tournament.actingSeat = null;
        tournament.handResultEndsAtEpochMilli = 0;
        tournament.availableActions = new ArrayList<>();
        stateAccess.setActingPlayer(tournament, null);
        tournament.tableMessage = tableMessage;
    }

    // Moves the tournament into hand-result state and clears action affordances.
    void moveToHandResult(TournamentState tournament, String tableMessage) {
        tournament.status = TournamentStatus.HAND_RESULT;
        tournament.actingSeat = null;
        tournament.handResultEndsAtEpochMilli = Instant.now().toEpochMilli() + HAND_RESULT_DURATION_MILLIS;
        tournament.availableActions = new ArrayList<>();
        stateAccess.setActingPlayer(tournament, null);
        tournament.tableMessage = tableMessage;
    }

    // Marks every zero-stack participant as busted out after a settlement step.
    private List<TournamentPlayerState> markBustedPlayers(TournamentState tournament) {
        var bustedPlayers = new ArrayList<TournamentPlayerState>();
        for (var player : tournament.players) {
            if (!player.participating || player.stack > 0) {
                continue;
            }
            player.stack = 0;
            player.participating = false;
            player.status = PlayerStatus.BUSTED_OUT;
            player.acting = false;
            bustedPlayers.add(player);
        }
        return bustedPlayers;
    }

    // Builds the settlement summary shown in the result state after a finished hand.
    private String buildCompletionMessage(
            TournamentState tournament,
            TournamentPotResolver.Settlement settlement,
            List<TournamentPlayerState> bustedPlayers
    ) {
        var fragments = new ArrayList<String>();
        settlement.potAwards().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .forEach(entry -> fragments.add(stateAccess.requirePlayer(tournament, entry.getKey()).nickname + " won " + entry.getValue() + "."));
        if (!bustedPlayers.isEmpty()) {
            fragments.add(bustedPlayers.stream()
                    .map(player -> player.nickname + " busted out.")
                    .collect(Collectors.joining(" ")));
        }
        return String.join(" ", fragments);
    }

    // Converts mutable player state into the pure data structure used for pot resolution.
    private TournamentPotResolver.PlayerPotState toPotState(TournamentPlayerState player) {
        return new TournamentPotResolver.PlayerPotState(
                player.guestId,
                player.nickname,
                player.seatIndex,
                player.totalContribution,
                player.isEligibleForPot(),
                List.copyOf(player.holeCards)
        );
    }
}
