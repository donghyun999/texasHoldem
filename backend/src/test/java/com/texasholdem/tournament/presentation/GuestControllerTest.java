package com.texasholdem.tournament.presentation;

import com.texasholdem.auth.GuestSessionAttributes;
import com.texasholdem.auth.GuestSessionResolver;
import com.texasholdem.tournament.application.command.TournamentService;
import com.texasholdem.tournament.domain.ActiveTournamentSession;
import com.texasholdem.tournament.domain.GuestSession;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;

@WebMvcTest(GuestController.class)
@Import(GuestSessionResolver.class)
class GuestControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private TournamentService tournamentService;

    @Test
    void createGuestStoresIdentityInSession() throws Exception {
        when(tournamentService.registerGuest("Neo")).thenReturn(new GuestSession("guest-1", "Neo"));

        mockMvc.perform(post("/api/v1/guests")
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"nickname":"Neo"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.guestId").value("guest-1"))
                .andExpect(jsonPath("$.data.nickname").value("Neo"))
                .andExpect(request().sessionAttribute(GuestSessionAttributes.GUEST_ID, "guest-1"))
                .andExpect(request().sessionAttribute(GuestSessionAttributes.GUEST_NICKNAME, "Neo"));
    }

    @Test
    void resolvesMeActiveTournamentFromSession() throws Exception {
        when(tournamentService.findActiveTournament("guest-1"))
                .thenReturn(new ActiveTournamentSession("guest-1", "ABCD1", "Friday Night", null));

        var session = new MockHttpSession();
        session.setAttribute(GuestSessionAttributes.GUEST_ID, "guest-1");
        session.setAttribute(GuestSessionAttributes.GUEST_NICKNAME, "Neo");

        mockMvc.perform(get("/api/v1/guests/me/active-tournament")
                        .session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.guestId").value("guest-1"))
                .andExpect(jsonPath("$.data.tournamentCode").value("ABCD1"))
                .andExpect(jsonPath("$.data.roomName").value("Friday Night"));

        verify(tournamentService).findActiveTournament("guest-1");
    }
}
