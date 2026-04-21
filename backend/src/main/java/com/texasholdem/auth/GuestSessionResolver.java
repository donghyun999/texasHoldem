package com.texasholdem.auth;

import com.texasholdem.tournament.domain.GuestSession;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.Nullable;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Component
public class GuestSessionResolver {

    private static final String GUEST_TOKEN_HEADER = "X-Guest-Token";
    private final GuestTokenService guestTokenService;

    public GuestSessionResolver(GuestTokenService guestTokenService) {
        this.guestTokenService = guestTokenService;
    }

    public void establishGuestSession(HttpServletRequest request, GuestSession guestSession) {
        var session = request.getSession(true);
        establishGuestIdentity(session, guestSession.guestId(), guestSession.nickname());
    }

    public void establishGuestIdentity(Map<String, Object> sessionAttributes, String guestId, @Nullable String nickname) {
        if (sessionAttributes == null) {
            return;
        }
        sessionAttributes.put(GuestSessionAttributes.GUEST_ID, guestId);
        if (nickname != null && !nickname.trim().isBlank()) {
            sessionAttributes.put(GuestSessionAttributes.GUEST_NICKNAME, nickname);
        }
    }

    public void establishGuestIdentity(HttpSession session, String guestId, @Nullable String nickname) {
        if (session == null) {
            return;
        }
        session.setAttribute(GuestSessionAttributes.GUEST_ID, guestId);
        if (nickname != null && !nickname.trim().isBlank()) {
            session.setAttribute(GuestSessionAttributes.GUEST_NICKNAME, nickname);
        }
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
        var tokenGuestId = resolveGuestIdFromRawToken(extractBearerToken(request.getHeader(HttpHeaders.AUTHORIZATION)));
        if (tokenGuestId != null) {
            return tokenGuestId;
        }

        tokenGuestId = resolveGuestIdFromRawToken(request.getHeader(GUEST_TOKEN_HEADER));
        if (tokenGuestId != null) {
            return tokenGuestId;
        }

        var session = request.getSession(false);
        if (session == null) {
            return null;
        }
        return normalize(attributeAsString(session, GuestSessionAttributes.GUEST_ID));
    }

    @Nullable
    private String currentGuestId(SimpMessageHeaderAccessor accessor) {
        var tokenGuestId = resolveGuestIdFromRawToken(extractBearerToken(accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION)));
        if (tokenGuestId != null) {
            return tokenGuestId;
        }

        tokenGuestId = resolveGuestIdFromRawToken(accessor.getFirstNativeHeader(GUEST_TOKEN_HEADER));
        if (tokenGuestId != null) {
            return tokenGuestId;
        }

        var sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes == null) {
            return null;
        }
        return normalize(attributeAsString(sessionAttributes, GuestSessionAttributes.GUEST_ID));
    }

    public void establishGuestIdentity(SimpMessageHeaderAccessor accessor, String guestId, @Nullable String nickname) {
        var sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes == null) {
            sessionAttributes = new HashMap<>();
            accessor.setSessionAttributes(sessionAttributes);
        }
        establishGuestIdentity(sessionAttributes, guestId, nickname);
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
    private String extractBearerToken(@Nullable String authorizationHeader) {
        var normalizedHeader = normalize(authorizationHeader);
        if (normalizedHeader == null || !normalizedHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return null;
        }
        return normalize(normalizedHeader.substring(7));
    }

    @Nullable
    private String resolveGuestIdFromRawToken(@Nullable String rawToken) {
        var normalizedToken = normalize(rawToken);
        if (normalizedToken == null) {
            return null;
        }
        return normalize(guestTokenService.resolveGuestId(normalizedToken));
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
