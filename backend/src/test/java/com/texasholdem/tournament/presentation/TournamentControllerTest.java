package com.texasholdem.tournament.presentation;

import com.texasholdem.auth.GuestSessionAttributes;
import com.texasholdem.auth.GuestSessionResolver;
import com.texasholdem.tournament.application.command.TournamentService;
import com.texasholdem.tournament.application.snapshot.TournamentBroadcast;
import com.texasholdem.tournament.domain.TournamentEvent;
import com.texasholdem.tournament.domain.TournamentVisibility;
import com.texasholdem.websocket.TournamentTopicPublisher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TournamentController.class)
@Import(GuestSessionResolver.class)
class TournamentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TournamentService tournamentService;

    @MockBean
    private TournamentTopicPublisher topicPublisher;

    @Test
    void getTournamentUsesSessionIdentityWhenQueryParamIsMissing() throws Exception {
        when(tournamentService.getTournament("ABCD1", "guest-1"))
                .thenReturn(null);

        var session = new MockHttpSession();
        session.setAttribute(GuestSessionAttributes.GUEST_ID, "guest-1");

        mockMvc.perform(get("/api/v1/tournaments/ABCD1")
                        .session(session))
                .andExpect(status().isOk());

        verify(tournamentService).getTournament("ABCD1", "guest-1");
    }

    @Test
    void getTournamentAllowsAnonymousSnapshotFetch() throws Exception {
        when(tournamentService.getTournament("ABCD1", null))
                .thenReturn(null);

        mockMvc.perform(get("/api/v1/tournaments/ABCD1"))
                .andExpect(status().isOk());

        verify(tournamentService).getTournament("ABCD1", null);
    }

    @Test
    void createTournamentUsesSessionGuestIdentity() throws Exception {
        when(tournamentService.createTournament("guest-session", "Owner", "Friday", null, TournamentVisibility.PUBLIC))
                .thenReturn(null);

        var session = new MockHttpSession();
        session.setAttribute(GuestSessionAttributes.GUEST_ID, "guest-session");

        mockMvc.perform(post("/api/v1/tournaments")
                        .session(session)
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"nickname":"Owner","roomName":"Friday","visibility":"PUBLIC"}
                                """))
                .andExpect(status().isOk());

        verify(tournamentService).createTournament("guest-session", "Owner", "Friday", null, TournamentVisibility.PUBLIC);
    }

    @Test
    void createTournamentRejectsMissingGuestSession() throws Exception {
        mockMvc.perform(post("/api/v1/tournaments")
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"nickname":"Owner","roomName":"Friday","visibility":"PUBLIC"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(status().reason("Guest session is required."));
    }

    @Test
    void joinTournamentUsesSessionGuestIdentity() throws Exception {
        when(tournamentService.joinTournamentBroadcast("ABCD1", "guest-session", "Player2", null))
                .thenReturn(new TournamentBroadcast(java.util.List.of(
                        new TournamentEvent("tournamentSnapshot", null, java.util.Map.of())
                )));

        var session = new MockHttpSession();
        session.setAttribute(GuestSessionAttributes.GUEST_ID, "guest-session");

        mockMvc.perform(post("/api/v1/tournaments/ABCD1/join")
                        .session(session)
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"nickname":"Player2"}
                                """))
                .andExpect(status().isOk());

        verify(tournamentService).joinTournamentBroadcast("ABCD1", "guest-session", "Player2", null);
    }

    @Test
    void joinTournamentRejectsMissingGuestSession() throws Exception {
                mockMvc.perform(post("/api/v1/tournaments/ABCD1/join")
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"nickname":"Player2"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(status().reason("Guest session is required."));
    }
}
