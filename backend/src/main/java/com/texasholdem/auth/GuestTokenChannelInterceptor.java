package com.texasholdem.auth;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

@Component
public class GuestTokenChannelInterceptor implements ChannelInterceptor {

    private final GuestSessionResolver guestSessionResolver;

    public GuestTokenChannelInterceptor(GuestSessionResolver guestSessionResolver) {
        this.guestSessionResolver = guestSessionResolver;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.CONNECT) {
            return message;
        }

        var guestId = guestSessionResolver.resolveGuestId(accessor);
        if (guestId != null) {
            guestSessionResolver.establishGuestIdentity(accessor, guestId, null);
        }

        return message;
    }
}
