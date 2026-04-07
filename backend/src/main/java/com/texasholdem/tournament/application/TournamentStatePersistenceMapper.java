package com.texasholdem.tournament.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownPotView;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
final class TournamentStatePersistenceMapper {

    private final ObjectMapper objectMapper;

    // Wires JSON serialization for the mutable in-memory tournament aggregate.
    TournamentStatePersistenceMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
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
                tournament.status,
                tournament.levelIndex,
                tournament.levelActivatedAtEpochSecond,
                tournament.mainPot,
                List.copyOf(tournament.sidePots),
                tournament.round,
                tournament.currentBet,
                List.copyOf(tournament.boardCards),
                List.copyOf(tournament.hiddenBoardCards),
                tournament.dealerSeat,
                tournament.smallBlindSeat,
                tournament.bigBlindSeat,
                tournament.actingSeat,
                tournament.handResultEndsAtEpochMilli,
                tournament.players.stream().map(this::toPayload).toList(),
                List.copyOf(tournament.showdownPots),
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
                List.copyOf(player.holeCards)
        );
    }

    // Rehydrates the mutable tournament aggregate from the persistence DTO tree.
    private TournamentState fromPayload(PersistedTournamentState payload) {
        var tournament = new TournamentState(payload.code());
        tournament.status = payload.status();
        tournament.levelIndex = payload.levelIndex();
        tournament.levelActivatedAtEpochSecond = payload.levelActivatedAtEpochSecond();
        tournament.mainPot = payload.mainPot();
        tournament.sidePots = new ArrayList<>(payload.sidePots());
        tournament.round = payload.round();
        tournament.currentBet = payload.currentBet();
        tournament.boardCards = new ArrayList<>(payload.boardCards());
        tournament.hiddenBoardCards = new ArrayList<>(payload.hiddenBoardCards());
        tournament.dealerSeat = payload.dealerSeat();
        tournament.smallBlindSeat = payload.smallBlindSeat();
        tournament.bigBlindSeat = payload.bigBlindSeat();
        tournament.actingSeat = payload.actingSeat();
        tournament.handResultEndsAtEpochMilli = payload.handResultEndsAtEpochMilli();
        tournament.showdownPots = new ArrayList<>(payload.showdownPots());
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
        player.holeCards = new ArrayList<>(payload.holeCards());
        return player;
    }

    private record PersistedTournamentState(
            String code,
            TournamentStatus status,
            int levelIndex,
            long levelActivatedAtEpochSecond,
            int mainPot,
            List<PotView> sidePots,
            BettingRound round,
            int currentBet,
            List<String> boardCards,
            List<String> hiddenBoardCards,
            Integer dealerSeat,
            Integer smallBlindSeat,
            Integer bigBlindSeat,
            Integer actingSeat,
            long handResultEndsAtEpochMilli,
            List<PersistedTournamentPlayerState> players,
            List<ShowdownPotView> showdownPots,
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
            List<String> holeCards
    ) {
    }
}
