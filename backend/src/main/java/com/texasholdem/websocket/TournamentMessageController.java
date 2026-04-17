package com.texasholdem.websocket;

import com.texasholdem.tournament.application.command.TournamentService;
import com.texasholdem.auth.GuestSessionResolver;
import com.texasholdem.tournament.presentation.dto.GameActionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentConnectionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentReadyMessage;
import com.texasholdem.tournament.presentation.dto.TournamentStartMessage;
import jakarta.validation.Valid;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

@Controller
public class TournamentMessageController {

    private final TournamentService tournamentService;
    private final TournamentTopicPublisher topicPublisher;
    private final GuestSessionResolver guestSessionResolver;

    // Wires tournament message mappings to the application service and broker.
    public TournamentMessageController(
            TournamentService tournamentService,
            TournamentTopicPublisher topicPublisher,
            GuestSessionResolver guestSessionResolver
    ) {
        this.tournamentService = tournamentService;
        this.topicPublisher = topicPublisher;
        this.guestSessionResolver = guestSessionResolver;
    }

    // Broadcasts ready-state updates into the tournament topic.
    @MessageMapping("/tournament.ready")
    public void ready(@Valid @Payload TournamentReadyMessage message, SimpMessageHeaderAccessor accessor) {
        var code = message.resolveCode(null);
        var broadcast = tournamentService.changeReady(code, guestSessionResolver.requireResolvedGuestId(accessor, message.guestId()), message.ready());
        topicPublisher.publish(code, broadcast);
    }

    // Broadcasts the disconnection fallback snapshot for one tournament player.
    @MessageMapping("/tournament.disconnect")
    public void disconnect(@Valid @Payload TournamentConnectionMessage message, SimpMessageHeaderAccessor accessor) {
        var code = message.resolveCode(null);
        var broadcast = tournamentService.disconnectPlayer(code, guestSessionResolver.requireResolvedGuestId(accessor, message.guestId()));
        topicPublisher.publish(code, broadcast);
    }

    // Broadcasts the reconnect snapshot for one tournament player.
    @MessageMapping("/tournament.reconnect")
    public void reconnect(@Valid @Payload TournamentConnectionMessage message, SimpMessageHeaderAccessor accessor) {
        var code = message.resolveCode(null);
        var broadcast = tournamentService.reconnectPlayer(code, guestSessionResolver.requireResolvedGuestId(accessor, message.guestId()));
        topicPublisher.publish(code, broadcast);
    }

    // Broadcasts the AFK return snapshot so the player can resume manual actions.
    @MessageMapping("/tournament.return-to-play")
    public void returnToPlay(@Valid @Payload TournamentConnectionMessage message, SimpMessageHeaderAccessor accessor) {
        var code = message.resolveCode(null);
        var broadcast = tournamentService.returnPlayerToPlay(code, guestSessionResolver.requireResolvedGuestId(accessor, message.guestId()));
        topicPublisher.publish(code, broadcast);
    }

    // Broadcasts the hand-start snapshot when the owner starts the tournament.
    @MessageMapping("/tournament.start")
    public void start(@Valid @Payload TournamentStartMessage message, SimpMessageHeaderAccessor accessor) {
        var code = message.resolveCode(null);
        var broadcast = tournamentService.startTournament(code, guestSessionResolver.requireResolvedGuestId(accessor, message.guestId()));
        topicPublisher.publish(code, broadcast);
    }

    // Broadcasts the accepted in-hand action event for the current actor.
    @MessageMapping("/game.action")
    public void action(@Valid @Payload GameActionMessage message, SimpMessageHeaderAccessor accessor) {
        var broadcast = tournamentService.applyAction(
                message.code(),
                guestSessionResolver.requireResolvedGuestId(accessor, message.guestId()),
                message.action(),
                message.amount()
        );
        topicPublisher.publish(message.code(), broadcast);
    }
}
