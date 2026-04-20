package com.texasholdem.auth;

import com.texasholdem.tournament.domain.GuestSession;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.lang.Nullable;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Component
public class GuestSessionResolver {

    public void establishGuestSession(HttpServletRequest request, GuestSession guestSession) {
        var session = request.getSession(true);
        session.setAttribute(GuestSessionAttributes.GUEST_ID, guestSession.guestId());
        session.setAttribute(GuestSessionAttributes.GUEST_NICKNAME, guestSession.nickname());
    }

    @Nullable
    public String resolveGuestId(HttpServletRequest request) {
        return currentGuestId(request);
    }

    public String requireGuestId(HttpServletRequest request) {
        var guestId = currentGuestId(request);
        if (guestId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Guest session is required.");
        }
        return guestId;
    }

    @Nullable
    public String resolveGuestId(SimpMessageHeaderAccessor accessor) {
        return currentGuestId(accessor);
    }

    public String requireGuestId(SimpMessageHeaderAccessor accessor) {
        var guestId = currentGuestId(accessor);
        if (guestId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Guest session is required.");
        }
        return guestId;
    }

    @Nullable
    private String currentGuestId(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null) {
            return null;
        }
        return normalize(attributeAsString(session, GuestSessionAttributes.GUEST_ID));
    }

    @Nullable
    private String currentGuestId(SimpMessageHeaderAccessor accessor) {
        var sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes == null) {
            return null;
        }
        return normalize(attributeAsString(sessionAttributes, GuestSessionAttributes.GUEST_ID));
    }

    @Nullable
    private String attributeAsString(HttpSession session, String attributeName) {
        var attribute = session.getAttribute(attributeName);
        return attribute instanceof String stringValue ? stringValue : null;
    }

    @Nullable
    private String attributeAsString(Map<String, Object> sessionAttributes, String attributeName) {
        var attribute = sessionAttributes.get(attributeName);
        return attribute instanceof String stringValue ? stringValue : null;
    }

    @Nullable
    private String normalize(@Nullable String value) {
        if (value == null) {
            return null;
        }
        var trimmedValue = value.trim();
        return trimmedValue.isBlank() ? null : trimmedValue;
    }
}
