package com.texasholdem.auth;

import com.texasholdem.tournament.domain.GuestSession;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GuestSessionResolverTest {

    private final GuestSessionResolver resolver = new GuestSessionResolver();

    @Test
    void establishesAndResolvesGuestSession() {
        var request = new MockHttpServletRequest();

        resolver.establishGuestSession(request, new GuestSession("guest-1", "Neo"));

        assertThat(resolver.requireGuestId(request)).isEqualTo("guest-1");
        assertThat(resolveAttribute(request, GuestSessionAttributes.GUEST_NICKNAME)).isEqualTo("Neo");
    }

    @Test
    void prefersSessionIdentityAndRejectsMismatchedLegacyIdentity() {
        var request = requestWithSession("guest-1", "Neo");

        assertThat(resolver.resolveGuestId(request, "guest-1")).isEqualTo("guest-1");
        assertThatThrownBy(() -> resolver.resolveGuestId(request, "guest-2"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Guest identity mismatch.");
    }

    @Test
    void fallsBackToLegacyGuestIdWhenSessionIsMissing() {
        assertThat(resolver.resolveGuestId(new MockHttpServletRequest(), "guest-legacy"))
                .isEqualTo("guest-legacy");
    }

    @Test
    void resolvesGuestIdFromWebsocketSessionAttributes() {
        var accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        accessor.setSessionAttributes(new HashMap<>(java.util.Map.of(
                GuestSessionAttributes.GUEST_ID, "guest-ws",
                GuestSessionAttributes.GUEST_NICKNAME, "Neo"
        )));

        assertThat(resolver.requireGuestId(accessor)).isEqualTo("guest-ws");
        assertThat(resolver.resolveGuestId(accessor, null)).isEqualTo("guest-ws");
    }

    private MockHttpServletRequest requestWithSession(String guestId, String nickname) {
        var request = new MockHttpServletRequest();
        var session = new MockHttpSession();
        session.setAttribute(GuestSessionAttributes.GUEST_ID, guestId);
        session.setAttribute(GuestSessionAttributes.GUEST_NICKNAME, nickname);
        request.setSession(session);
        return request;
    }

    private Object resolveAttribute(HttpServletRequest request, String attributeName) {
        return request.getSession(false).getAttribute(attributeName);
    }
}
