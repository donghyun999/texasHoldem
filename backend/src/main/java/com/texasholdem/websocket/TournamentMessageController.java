package com.texasholdem.websocket;

import com.texasholdem.tournament.application.TournamentService;
import com.texasholdem.tournament.presentation.dto.GameActionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentConnectionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentReadyMessage;
import com.texasholdem.tournament.presentation.dto.TournamentStartMessage;
import jakarta.validation.Valid;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class TournamentMessageController {

    private final TournamentService tournamentService;
    private final SimpMessagingTemplate messagingTemplate;

    // Wires tournament message mappings to the application service and broker.
    public TournamentMessageController(
            TournamentService tournamentService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.tournamentService = tournamentService;
        this.messagingTemplate = messagingTemplate;
    }

    // Broadcasts ready-state updates into the tournament topic.
    @MessageMapping("/tournament.ready")
    public void ready(@Valid @Payload TournamentReadyMessage message) {
        var event = tournamentService.changeReady(message.code(), message.guestId(), message.ready());
        messagingTemplate.convertAndSend("/topic/tournament." + message.code().toUpperCase(), event);
    }

    // Broadcasts the disconnection fallback snapshot for one tournament player.
    @MessageMapping("/tournament.disconnect")
    public void disconnect(@Valid @Payload TournamentConnectionMessage message) {
        var event = tournamentService.disconnectPlayer(message.code(), message.guestId());
        messagingTemplate.convertAndSend("/topic/tournament." + message.code().toUpperCase(), event);
    }

    // Broadcasts the reconnect snapshot for one tournament player.
    @MessageMapping("/tournament.reconnect")
    public void reconnect(@Valid @Payload TournamentConnectionMessage message) {
        var event = tournamentService.reconnectPlayer(message.code(), message.guestId());
        messagingTemplate.convertAndSend("/topic/tournament." + message.code().toUpperCase(), event);
    }

    // Broadcasts the hand-start snapshot when the owner starts the tournament.
    @MessageMapping("/tournament.start")
    public void start(@Valid @Payload TournamentStartMessage message) {
        var event = tournamentService.startTournament(message.code(), message.guestId());
        messagingTemplate.convertAndSend("/topic/tournament." + message.code().toUpperCase(), event);
    }

    // Broadcasts the accepted in-hand action event for the current actor.
    @MessageMapping("/game.action")
    public void action(@Valid @Payload GameActionMessage message) {
        var event = tournamentService.applyAction(message.code(), message.guestId(), message.action(), message.amount());
        messagingTemplate.convertAndSend("/topic/tournament." + message.code().toUpperCase(), event);
    }
}
