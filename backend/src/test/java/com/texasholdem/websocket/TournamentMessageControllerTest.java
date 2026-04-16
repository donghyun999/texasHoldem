package com.texasholdem.websocket;

import com.texasholdem.auth.GuestSessionAttributes;
import com.texasholdem.auth.GuestSessionResolver;
import com.texasholdem.tournament.application.command.TournamentService;
import com.texasholdem.tournament.application.snapshot.TournamentBroadcast;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.presentation.dto.GameActionMessage;
import com.texasholdem.tournament.presentation.dto.TournamentReadyMessage;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;

import java.util.HashMap;
import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TournamentMessageControllerTest {

    private final TournamentService tournamentService = mock(TournamentService.class);
    private final TournamentTopicPublisher topicPublisher = mock(TournamentTopicPublisher.class);
    private final GuestSessionResolver guestSessionResolver = new GuestSessionResolver();
    private final TournamentMessageController controller =
            new TournamentMessageController(tournamentService, topicPublisher, guestSessionResolver);

    @Test
    void readyUsesWebsocketSessionIdentityWhenPayloadGuestIdIsOmitted() {
        var accessor = accessorWithGuest("guest-ws");
        var broadcast = broadcast();
        when(tournamentService.changeReady("ABCD1", "guest-ws", true)).thenReturn(broadcast);

        controller.ready(new TournamentReadyMessage("ABCD1", null, true), accessor);

        verify(tournamentService).changeReady("ABCD1", "guest-ws", true);
        verify(topicPublisher).publish("ABCD1", broadcast);
    }

    @Test
    void actionUsesWebsocketSessionIdentityWhenPayloadGuestIdIsOmitted() {
        var accessor = accessorWithGuest("guest-ws");
        var broadcast = broadcast();
        when(tournamentService.applyAction("ABCD1", "guest-ws", "FOLD", null)).thenReturn(broadcast);

        controller.action(new GameActionMessage("ABCD1", null, "FOLD", null), accessor);

        verify(tournamentService).applyAction("ABCD1", "guest-ws", "FOLD", null);
        verify(topicPublisher).publish("ABCD1", broadcast);
    }

    private SimpMessageHeaderAccessor accessorWithGuest(String guestId) {
        var accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        accessor.setSessionAttributes(new HashMap<>(Map.of(
                GuestSessionAttributes.GUEST_ID, guestId,
                GuestSessionAttributes.GUEST_NICKNAME, "Neo"
        )));
        return accessor;
    }

    private TournamentBroadcast broadcast() {
        return new TournamentBroadcast(java.util.List.of(new TournamentEvent("snapshot", null, Map.of())));
    }
}
