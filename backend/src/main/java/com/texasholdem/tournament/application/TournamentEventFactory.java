package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentPlayerView;
import com.texasholdem.tournament.domain.TournamentSnapshot;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
final class TournamentEventFactory {

    private final TournamentSnapshotFactory snapshotFactory;

    // Wires event assembly to the shared snapshot factory.
    TournamentEventFactory(TournamentSnapshotFactory snapshotFactory) {
        this.snapshotFactory = snapshotFactory;
    }

    // Wraps a fresh tournament snapshot with an event name and payload.
    TournamentEvent create(String eventType, TournamentState tournament, Map<String, Object> payload) {
        return new TournamentEvent(eventType, snapshotFactory.toSnapshot(tournament), payload);
    }

    // Builds the full websocket broadcast bundle, including spec-aligned alias events.
    TournamentBroadcast createBroadcast(
            String primaryEventType,
            TournamentState tournament,
            Map<String, Object> payload,
            TournamentSnapshot beforeSnapshot
    ) {
        var afterSnapshot = snapshotFactory.toSnapshot(tournament);
        var events = new ArrayList<TournamentEvent>();
        events.addAll(buildSupplementalEvents(primaryEventType, beforeSnapshot, afterSnapshot));
        events.add(new TournamentEvent(primaryEventType, afterSnapshot, payload));
        return new TournamentBroadcast(events);
    }

    // Builds the ready event payload in the established websocket shape.
    Map<String, Object> readyPayload(String guestId, boolean ready) {
        return Map.of(
                "guestId", guestId,
                "ready", ready
        );
    }

    // Builds the participant-count payload used when a hand starts.
    Map<String, Object> participantsPayload(int participants) {
        return Map.of("participants", participants);
    }

    // Builds the accepted action payload for one table command.
    Map<String, Object> actionPayload(String guestId, String action, int amount) {
        return Map.of(
                "guestId", guestId,
                "action", action,
                "amount", amount
        );
    }

    // Builds the disconnect and reconnect payload in one shared shape.
    Map<String, Object> connectionPayload(TournamentConnectionChange change) {
        var payload = new HashMap<String, Object>();
        payload.put("guestId", change.guestId());
        payload.put("connected", change.connected());
        payload.put("removed", change.removed());
        if (change.ownerGuestId() != null) {
            payload.put("ownerGuestId", change.ownerGuestId());
        }
        return payload;
    }

    // Builds the snapshot refresh payload used when reconnect restores live state.
    private Map<String, Object> snapshotPayload(String reason) {
        return Map.of("reason", reason);
    }

    // Builds the blind-level payload when a new hand crosses a level boundary.
    private Map<String, Object> levelPayload(TournamentSnapshot snapshot) {
        return Map.of(
                "level", snapshot.currentLevel().level(),
                "smallBlind", snapshot.currentLevel().smallBlind(),
                "bigBlind", snapshot.currentLevel().bigBlind()
        );
    }

    // Builds the pot-update payload from the latest aggregate and showdown views.
    private Map<String, Object> potsPayload(TournamentSnapshot snapshot) {
        return Map.of(
                "mainPot", snapshot.mainPot(),
                "sidePotCount", snapshot.sidePots().size(),
                "showdownPotCount", snapshot.showdownPots().size()
        );
    }

    // Builds the settled pot list shared by showdown, hand-end, and final-result payloads.
    private List<Map<String, Object>> settledPotsPayload(TournamentSnapshot snapshot) {
        return snapshot.showdownPots().stream()
                .map(pot -> Map.<String, Object>of(
                        "id", pot.id(),
                        "type", pot.type(),
                        "amount", pot.amount(),
                        "winnerGuestIds", pot.payouts().stream().map(payout -> payout.guestId()).toList(),
                        "split", pot.payouts().size() > 1,
                        "payouts", pot.payouts().stream()
                                .map(payout -> Map.<String, Object>of(
                                        "guestId", payout.guestId(),
                                        "nickname", payout.nickname(),
                                        "amount", payout.amount()
                                ))
                                .toList()
                ))
                .toList();
    }

    // Builds the showdown-hand label list preserved for result UI rendering.
    private List<Map<String, Object>> showdownHandsPayload(TournamentSnapshot snapshot) {
        return snapshot.showdownHands().stream()
                .map(hand -> Map.<String, Object>of(
                        "guestId", hand.guestId(),
                        "nickname", hand.nickname(),
                        "handLabel", hand.handLabel(),
                        "holeCards", hand.holeCards()
                ))
                .toList();
    }

    // Builds the showdown payload once the server exposes fully revealed settlement state.
    private Map<String, Object> showdownPayload(TournamentSnapshot snapshot) {
        return Map.of(
                "boardCards", snapshot.boardCards(),
                "showdownPotCount", snapshot.showdownPots().size(),
                "showdownHands", showdownHandsPayload(snapshot),
                "pots", settledPotsPayload(snapshot)
        );
    }

    // Builds the hand-local busted-player detail preserved on result snapshots for reconnect-safe rendering.
    private List<Map<String, Object>> recentlyBustedPlayersPayload(TournamentSnapshot snapshot) {
        var recentlyBustedGuestIds = Set.copyOf(snapshot.recentlyBustedGuestIds());
        return snapshot.players().stream()
                .filter(player -> recentlyBustedGuestIds.contains(player.guestId()))
                .map(player -> Map.<String, Object>of(
                        "guestId", player.guestId(),
                        "nickname", player.nickname(),
                        "seatIndex", player.seatIndex(),
                        "finalStack", player.stack()
                ))
                .toList();
    }

    // Builds the hand-end payload from the terminal hand snapshot state.
    private Map<String, Object> handEndedPayload(TournamentSnapshot snapshot) {
        return Map.of(
                "status", snapshot.status().name(),
                "showdown", isShowdownSnapshot(snapshot),
                "boardCards", snapshot.boardCards(),
                "mainPot", snapshot.mainPot(),
                "sidePotCount", snapshot.sidePots().size(),
                "showdownPotCount", snapshot.showdownPots().size(),
                "showdownHands", showdownHandsPayload(snapshot),
                "pots", settledPotsPayload(snapshot),
                "recentlyBustedGuestIds", snapshot.recentlyBustedGuestIds(),
                "recentlyBustedPlayers", recentlyBustedPlayersPayload(snapshot)
        );
    }

    // Builds the busted-player payload from the newly eliminated participant set.
    private Map<String, Object> bustedPayload(List<TournamentPlayerView> bustedPlayers) {
        return Map.of(
                "guestIds", bustedPlayers.stream().map(TournamentPlayerView::guestId).toList(),
                "nicknames", bustedPlayers.stream().map(TournamentPlayerView::nickname).toList(),
                "players", bustedPlayers.stream()
                        .map(player -> Map.<String, Object>of(
                                "guestId", player.guestId(),
                                "nickname", player.nickname(),
                                "seatIndex", player.seatIndex(),
                                "finalStack", player.stack()
                        ))
                        .toList()
        );
    }

    // Builds the tournament-finished payload around the current winner, when one remains.
    Map<String, Object> tournamentFinishedPayload(TournamentSnapshot snapshot) {
        var winner = snapshot.players().stream()
                .filter(player -> player.participating() && player.stack() > 0)
                .findFirst()
                .orElse(null);
        if (winner == null) {
            return Map.of();
        }
        return Map.of(
                "winnerGuestId", winner.guestId(),
                "winnerNickname", winner.nickname(),
                "winnerStack", winner.stack(),
                "boardCards", snapshot.boardCards(),
                "showdownPotCount", snapshot.showdownPots().size(),
                "showdownHands", showdownHandsPayload(snapshot),
                "pots", settledPotsPayload(snapshot),
                "recentlyBustedGuestIds", snapshot.recentlyBustedGuestIds(),
                "recentlyBustedPlayers", recentlyBustedPlayersPayload(snapshot)
        );
    }

    // Derives the supplemental event list needed to satisfy the websocket taxonomy without changing snapshots.
    private List<TournamentEvent> buildSupplementalEvents(
            String primaryEventType,
            TournamentSnapshot beforeSnapshot,
            TournamentSnapshot afterSnapshot
    ) {
        var supplementalEvents = new ArrayList<TournamentEvent>();
        if ("playerReconnected".equals(primaryEventType)) {
            supplementalEvents.add(new TournamentEvent(
                    "tournamentSnapshot",
                    afterSnapshot,
                    snapshotPayload("playerReconnected")
            ));
        }
        if (levelChanged(beforeSnapshot, afterSnapshot)) {
            supplementalEvents.add(new TournamentEvent("levelChanged", afterSnapshot, levelPayload(afterSnapshot)));
        }
        if (shouldEmitPotsUpdated(primaryEventType) && potsChanged(beforeSnapshot, afterSnapshot)) {
            supplementalEvents.add(new TournamentEvent("potsUpdated", afterSnapshot, potsPayload(afterSnapshot)));
        }
        if (showdownStarted(beforeSnapshot, afterSnapshot)) {
            supplementalEvents.add(new TournamentEvent("showdownStarted", afterSnapshot, showdownPayload(afterSnapshot)));
        }
        if (handEnded(beforeSnapshot, afterSnapshot)) {
            supplementalEvents.add(new TournamentEvent("handEnded", afterSnapshot, handEndedPayload(afterSnapshot)));
        }
        var bustedPlayers = newlyBustedPlayers(beforeSnapshot, afterSnapshot);
        if (!bustedPlayers.isEmpty()) {
            supplementalEvents.add(new TournamentEvent("playerBusted", afterSnapshot, bustedPayload(bustedPlayers)));
        }
        if (!"tournamentFinished".equals(primaryEventType) && tournamentFinished(beforeSnapshot, afterSnapshot)) {
            supplementalEvents.add(new TournamentEvent(
                    "tournamentFinished",
                    afterSnapshot,
                    tournamentFinishedPayload(afterSnapshot)
            ));
        }
        return supplementalEvents;
    }

    // Detects blind-level changes between the previous and current snapshots.
    private boolean levelChanged(TournamentSnapshot beforeSnapshot, TournamentSnapshot afterSnapshot) {
        return beforeSnapshot.currentLevel().level() != afterSnapshot.currentLevel().level();
    }

    // Detects any pot-view mutation, including showdown payout detail becoming visible.
    private boolean potsChanged(TournamentSnapshot beforeSnapshot, TournamentSnapshot afterSnapshot) {
        return beforeSnapshot.mainPot() != afterSnapshot.mainPot()
                || !beforeSnapshot.sidePots().equals(afterSnapshot.sidePots())
                || !beforeSnapshot.showdownPots().equals(afterSnapshot.showdownPots());
    }

    // Limits pot-update aliases to transitions that actually mutate betting or settlement state.
    private boolean shouldEmitPotsUpdated(String primaryEventType) {
        return "actionApplied".equals(primaryEventType) || "playerDisconnected".equals(primaryEventType);
    }

    // Detects when a live hand resolves through a real showdown path rather than a simple fold-out.
    private boolean showdownStarted(TournamentSnapshot beforeSnapshot, TournamentSnapshot afterSnapshot) {
        return beforeSnapshot.status() == TournamentStatus.IN_HAND
                && isShowdownSnapshot(afterSnapshot);
    }

    // Detects when one in-hand snapshot closes into a result or finished snapshot.
    private boolean handEnded(TournamentSnapshot beforeSnapshot, TournamentSnapshot afterSnapshot) {
        return beforeSnapshot.status() == TournamentStatus.IN_HAND
                && afterSnapshot.status() != TournamentStatus.IN_HAND;
    }

    // Detects when the overall tournament moves into its finished terminal state.
    private boolean tournamentFinished(TournamentSnapshot beforeSnapshot, TournamentSnapshot afterSnapshot) {
        return beforeSnapshot.status() != TournamentStatus.FINISHED
                && afterSnapshot.status() == TournamentStatus.FINISHED;
    }

    // Counts the players still represented in a showdown settlement, including busted losers.
    private long countShowdownParticipants(TournamentSnapshot snapshot) {
        return snapshot.players().stream()
                .filter(player -> player.status() != com.texasholdem.tournament.domain.PlayerStatus.FOLDED)
                .filter(player -> player.participating()
                        || player.status() == com.texasholdem.tournament.domain.PlayerStatus.BUSTED_OUT)
                .count();
    }

    // Detects whether a settled result snapshot came from a real board showdown instead of a fold-out.
    private boolean isShowdownSnapshot(TournamentSnapshot snapshot) {
        return !snapshot.showdownPots().isEmpty()
                && snapshot.boardCards().size() == 5
                && countShowdownParticipants(snapshot) > 1;
    }

    // Finds players whose snapshot status changed into BUSTED_OUT during the latest transition.
    private List<TournamentPlayerView> newlyBustedPlayers(
            TournamentSnapshot beforeSnapshot,
            TournamentSnapshot afterSnapshot
    ) {
        var previousPlayers = beforeSnapshot.players().stream()
                .collect(Collectors.toMap(TournamentPlayerView::guestId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        return afterSnapshot.players().stream()
                .filter(player -> player.status() == com.texasholdem.tournament.domain.PlayerStatus.BUSTED_OUT)
                .filter(player -> {
                    var previousPlayer = previousPlayers.get(player.guestId());
                    return previousPlayer == null
                            || previousPlayer.status() != com.texasholdem.tournament.domain.PlayerStatus.BUSTED_OUT;
                })
                .toList();
    }
}
