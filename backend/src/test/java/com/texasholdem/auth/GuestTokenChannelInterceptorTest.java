package com.texasholdem.auth;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;

import static org.assertj.core.api.Assertions.assertThat;

class GuestTokenChannelInterceptorTest {

    private final GuestTokenService guestTokenService = new GuestTokenService("test-guest-token-secret");
    private final GuestSessionResolver guestSessionResolver = new GuestSessionResolver(guestTokenService);
    private final GuestTokenChannelInterceptor interceptor = new GuestTokenChannelInterceptor(guestSessionResolver);

    @Test
    void storesGuestIdentityIntoWebsocketSessionAttributesOnConnect() {
        var accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.addNativeHeader("Authorization", "Bearer " + guestTokenService.issueToken("guest-connect"));
        accessor.setLeaveMutable(true);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        var intercepted = interceptor.preSend(message, null);
        var interceptedAccessor = MessageHeaderAccessor.getAccessor(intercepted, StompHeaderAccessor.class);

        assertThat(interceptedAccessor).isNotNull();
        assertThat(interceptedAccessor.getSessionAttributes())
                .containsEntry(GuestSessionAttributes.GUEST_ID, "guest-connect");
    }
}
