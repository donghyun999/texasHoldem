package com.texasholdem.websocket;

import com.texasholdem.tournament.application.TournamentBroadcast;
import com.texasholdem.tournament.domain.TournamentEvent;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public class TournamentTopicPublisher {

    private final SimpMessagingTemplate messagingTemplate;

    // Wraps tournament topic fan-out behind one reusable broker helper.
    public TournamentTopicPublisher(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // Publishes one tournament event to the canonical uppercase topic destination.
    public void publish(String code, TournamentEvent event) {
        messagingTemplate.convertAndSend("/topic/tournament." + code.trim().toUpperCase(), event);
    }

    // Publishes one ordered event bundle so taxonomy aliases share the same canonical topic.
    public void publish(String code, TournamentBroadcast broadcast) {
        for (var event : broadcast.events()) {
            publish(code, event);
        }
    }
}
