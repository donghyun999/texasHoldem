package com.texasholdem.websocket;

import com.texasholdem.tournament.application.TournamentService;
import com.texasholdem.tournament.presentation.dto.GameActionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentConnectionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentReadyMessage;
import com.texasholdem.tournament.presentation.dto.TournamentStartMessage;
import jakarta.validation.Valid;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

@Controller
public class TournamentMessageController {

    private final TournamentService tournamentService;
    private final TournamentTopicPublisher topicPublisher;

    // Wires tournament message mappings to the application service and broker.
    public TournamentMessageController(
            TournamentService tournamentService,
            TournamentTopicPublisher topicPublisher
    ) {
        this.tournamentService = tournamentService;
        this.topicPublisher = topicPublisher;
    }

    // Broadcasts ready-state updates into the tournament topic.
    @MessageMapping("/tournament.ready")
    public void ready(@Valid @Payload TournamentReadyMessage message) {
        var broadcast = tournamentService.changeReady(message.code(), message.guestId(), message.ready());
        topicPublisher.publish(message.code(), broadcast);
    }

    // Broadcasts the disconnection fallback snapshot for one tournament player.
    @MessageMapping("/tournament.disconnect")
    public void disconnect(@Valid @Payload TournamentConnectionMessage message) {
        var broadcast = tournamentService.disconnectPlayer(message.code(), message.guestId());
        topicPublisher.publish(message.code(), broadcast);
    }

    // Broadcasts the reconnect snapshot for one tournament player.
    @MessageMapping("/tournament.reconnect")
    public void reconnect(@Valid @Payload TournamentConnectionMessage message) {
        var broadcast = tournamentService.reconnectPlayer(message.code(), message.guestId());
        topicPublisher.publish(message.code(), broadcast);
    }

    // Broadcasts the hand-start snapshot when the owner starts the tournament.
    @MessageMapping("/tournament.start")
    public void start(@Valid @Payload TournamentStartMessage message) {
        var broadcast = tournamentService.startTournament(message.code(), message.guestId());
        topicPublisher.publish(message.code(), broadcast);
    }

    // Broadcasts the accepted in-hand action event for the current actor.
    @MessageMapping("/game.action")
    public void action(@Valid @Payload GameActionMessage message) {
        var broadcast = tournamentService.applyAction(message.code(), message.guestId(), message.action(), message.amount());
        topicPublisher.publish(message.code(), broadcast);
    }
}
