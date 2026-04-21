package com.texasholdem.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

@Component
public class GuestTokenService {

    private static final String TOKEN_VERSION = "v1";
    private final byte[] signingKey;

    public GuestTokenService(
            @Value("${app.auth.guest-token-secret:texas-holdem-dev-guest-token-secret}") String signingSecret
    ) {
        this.signingKey = signingSecret.getBytes(StandardCharsets.UTF_8);
    }

    public String issueToken(String guestId) {
        var normalizedGuestId = normalizeGuestId(guestId);
        var signature = sign(signaturePayload(normalizedGuestId));
        return TOKEN_VERSION
                + "."
                + encode(normalizedGuestId.getBytes(StandardCharsets.UTF_8))
                + "."
                + encode(signature);
    }

    @Nullable
    public String resolveGuestId(String token) {
        if (token == null) {
            return null;
        }

        var normalizedToken = token.trim();
        if (normalizedToken.isBlank()) {
            return null;
        }

        var parts = normalizedToken.split("\\.");
        if (parts.length != 3 || !TOKEN_VERSION.equals(parts[0])) {
            return null;
        }

        try {
            var guestId = new String(decode(parts[1]), StandardCharsets.UTF_8);
            var normalizedGuestId = normalizeGuestId(guestId);
            var expectedSignature = sign(signaturePayload(normalizedGuestId));
            var providedSignature = decode(parts[2]);
            return MessageDigest.isEqual(expectedSignature, providedSignature) ? normalizedGuestId : null;
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private String normalizeGuestId(String guestId) {
        return guestId == null ? "" : guestId.trim();
    }

    private String signaturePayload(String guestId) {
        return TOKEN_VERSION + ":" + guestId;
    }

    private byte[] sign(String payload) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not issue guest token.", exception);
        }
    }

    private String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private byte[] decode(String value) {
        return Base64.getUrlDecoder().decode(value);
    }
}
