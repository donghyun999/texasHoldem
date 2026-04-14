package com.texasholdem.tournament.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownHandView;
import com.texasholdem.tournament.domain.ShowdownPotView;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
final class TournamentStatePersistenceMapper {

    private final ObjectMapper objectMapper;
    private final TournamentRules rules;

    // Wires JSON serialization for the mutable in-memory tournament aggregate.
    TournamentStatePersistenceMapper(ObjectMapper objectMapper, TournamentRules rules) {
        this.objectMapper = objectMapper;
        this.rules = rules;
    }

    // Serializes one mutable tournament state into a durable JSON payload.
    String write(TournamentState tournament) {
        try {
            return objectMapper.writeValueAsString(toPayload(tournament));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize tournament state " + tournament.code, exception);
        }
    }

    // Deserializes one durable JSON payload back into mutable tournament state.
    TournamentState read(String payload) {
        try {
            return fromPayload(objectMapper.readValue(payload, PersistedTournamentState.class));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize tournament state", exception);
        }
    }

    // Converts the mutable aggregate into a persistence-safe DTO tree.
    private PersistedTournamentState toPayload(TournamentState tournament) {
        return new PersistedTournamentState(
                tournament.code,
                tournament.handNumber,
                tournament.stateVersion,
                tournament.status,
                tournament.levelIndex,
                tournament.levelActivatedAtEpochSecond,
                tournament.mainPot,
                List.copyOf(tournament.sidePots),
                tournament.round,
                tournament.currentBet,
                tournament.lastFullRaiseSize,
                List.copyOf(tournament.boardCards),
                List.copyOf(tournament.hiddenBoardCards),
                tournament.dealerSeat,
                tournament.smallBlindSeat,
                tournament.bigBlindSeat,
                tournament.actingSeat,
                tournament.actionDeadlineAtEpochMilli,
                tournament.handResultEndsAtEpochMilli,
                tournament.finishedCleanupAtEpochMilli,
                tournament.players.stream().map(this::toPayload).toList(),
                List.copyOf(tournament.showdownPots),
                List.copyOf(tournament.showdownHands),
                List.copyOf(tournament.recentlyBustedGuestIds),
                List.copyOf(tournament.availableActions),
                tournament.tableMessage
        );
    }

    // Converts one mutable player state into the persistence-safe DTO shape.
    private PersistedTournamentPlayerState toPayload(TournamentPlayerState player) {
        return new PersistedTournamentPlayerState(
                player.guestId,
                player.nickname,
                player.seatIndex,
                player.stack,
                player.status,
                player.owner,
                player.connected,
                player.participating,
                player.acting,
                player.totalContribution,
                player.roundContribution,
                player.awaitingAction,
                player.raiseRightsAvailable,
                player.afk,
                List.copyOf(player.holeCards)
        );
    }

    // Rehydrates the mutable tournament aggregate from the persistence DTO tree.
    private TournamentState fromPayload(PersistedTournamentState payload) {
        var tournament = new TournamentState(payload.code());
        tournament.handNumber = payload.handNumber();
        tournament.stateVersion = payload.stateVersion();
        tournament.status = payload.status();
        tournament.levelIndex = payload.levelIndex();
        tournament.levelActivatedAtEpochSecond = payload.levelActivatedAtEpochSecond();
        tournament.mainPot = payload.mainPot();
        tournament.sidePots = new ArrayList<>(payload.sidePots());
        tournament.round = payload.round();
        tournament.currentBet = payload.currentBet();
        tournament.lastFullRaiseSize = payload.lastFullRaiseSize() == null
                ? inferLastFullRaiseSize(payload)
                : payload.lastFullRaiseSize();
        tournament.boardCards = new ArrayList<>(payload.boardCards());
        tournament.hiddenBoardCards = new ArrayList<>(payload.hiddenBoardCards());
        tournament.dealerSeat = payload.dealerSeat();
        tournament.smallBlindSeat = payload.smallBlindSeat();
        tournament.bigBlindSeat = payload.bigBlindSeat();
        tournament.actingSeat = payload.actingSeat();
        tournament.actionDeadlineAtEpochMilli = payload.actionDeadlineAtEpochMilli() == null
                ? 0
                : payload.actionDeadlineAtEpochMilli();
        tournament.handResultEndsAtEpochMilli = payload.handResultEndsAtEpochMilli();
        tournament.finishedCleanupAtEpochMilli = payload.finishedCleanupAtEpochMilli() == null
                ? 0
                : payload.finishedCleanupAtEpochMilli();
        tournament.showdownPots = new ArrayList<>(payload.showdownPots());
        tournament.showdownHands = payload.showdownHands() == null
                ? new ArrayList<>()
                : new ArrayList<>(payload.showdownHands());
        tournament.recentlyBustedGuestIds = payload.recentlyBustedGuestIds() == null
                ? new ArrayList<>()
                : new ArrayList<>(payload.recentlyBustedGuestIds());
        tournament.availableActions = new ArrayList<>(payload.availableActions());
        tournament.tableMessage = payload.tableMessage();
        payload.players().stream()
                .map(this::fromPayload)
                .forEach(tournament.players::add);
        return tournament;
    }

    // Rehydrates one mutable tournament player from the persistence DTO shape.
    private TournamentPlayerState fromPayload(PersistedTournamentPlayerState payload) {
        var player = new TournamentPlayerState(payload.guestId(), payload.nickname(), payload.seatIndex());
        player.stack = payload.stack();
        player.status = payload.status();
        player.owner = payload.owner();
        player.connected = payload.connected();
        player.participating = payload.participating();
        player.acting = payload.acting();
        player.totalContribution = payload.totalContribution();
        player.roundContribution = payload.roundContribution();
        player.awaitingAction = payload.awaitingAction();
        player.raiseRightsAvailable = payload.raiseRightsAvailable() == null
                ? payload.awaitingAction()
                : payload.raiseRightsAvailable();
        player.afk = payload.afk() != null && payload.afk();
        player.holeCards = new ArrayList<>(payload.holeCards());
        return player;
    }

    // Older payloads do not track the last full raise size, so fall back to the biggest observed jump.
    private int inferLastFullRaiseSize(PersistedTournamentState payload) {
        var distinctPositiveContributions = payload.players().stream()
                .map(PersistedTournamentPlayerState::roundContribution)
                .filter(contribution -> contribution > 0)
                .distinct()
                .sorted()
                .toList();
        if (distinctPositiveContributions.size() >= 2) {
            var lastIndex = distinctPositiveContributions.size() - 1;
            return Math.max(
                    rules.bigBlindFor(payload.levelIndex()),
                    distinctPositiveContributions.get(lastIndex) - distinctPositiveContributions.get(lastIndex - 1)
            );
        }
        if (payload.currentBet() > 0) {
            return Math.max(rules.bigBlindFor(payload.levelIndex()), payload.currentBet());
        }
        return rules.bigBlindFor(payload.levelIndex());
    }

    private record PersistedTournamentState(
            String code,
            long handNumber,
            long stateVersion,
            TournamentStatus status,
            int levelIndex,
            long levelActivatedAtEpochSecond,
            int mainPot,
            List<PotView> sidePots,
            BettingRound round,
            int currentBet,
            Integer lastFullRaiseSize,
            List<String> boardCards,
            List<String> hiddenBoardCards,
            Integer dealerSeat,
            Integer smallBlindSeat,
            Integer bigBlindSeat,
            Integer actingSeat,
            Long actionDeadlineAtEpochMilli,
            long handResultEndsAtEpochMilli,
            Long finishedCleanupAtEpochMilli,
            List<PersistedTournamentPlayerState> players,
            List<ShowdownPotView> showdownPots,
            List<ShowdownHandView> showdownHands,
            List<String> recentlyBustedGuestIds,
            List<String> availableActions,
            String tableMessage
    ) {
    }

    private record PersistedTournamentPlayerState(
            String guestId,
            String nickname,
            int seatIndex,
            int stack,
            PlayerStatus status,
            boolean owner,
            boolean connected,
            boolean participating,
            boolean acting,
            int totalContribution,
            int roundContribution,
            boolean awaitingAction,
            Boolean raiseRightsAvailable,
            Boolean afk,
            List<String> holeCards
    ) {
    }
}
