package com.texasholdem.tournament.application.state;

import com.texasholdem.auth.GuestTokenService;
import com.texasholdem.tournament.domain.GuestSession;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;

@Component
public final class TournamentIdentityFactory {

    private static final BCryptPasswordEncoder ROOM_PASSWORD_ENCODER = new BCryptPasswordEncoder();
    private final GuestTokenService guestTokenService;

    public TournamentIdentityFactory(GuestTokenService guestTokenService) {
        this.guestTokenService = guestTokenService;
    }

    // Issues a normalized guest session for the tournament flow.
    public GuestSession registerGuest(String nickname) {
        var guestId = nextGuestId();
        return new GuestSession(
                guestId,
                normalizeNickname(nickname),
                guestTokenService.issueToken(guestId)
        );
    }

    // Trims user-facing nicknames before persisting them in memory.
    public String normalizeNickname(String nickname) {
        return nickname == null ? "" : nickname.trim();
    }

    // Trims room titles before they are stored or compared.
    public String normalizeRoomName(String roomName) {
        return roomName == null ? "" : roomName.trim();
    }

    // Trims room passwords while preserving case-sensitive comparisons.
    public String normalizeRoomPassword(String roomPassword) {
        return roomPassword == null ? "" : roomPassword.trim();
    }

    // Hashes one private-room password before it is persisted.
    public String hashRoomPassword(String roomPassword) {
        var normalizedRoomPassword = normalizeRoomPassword(roomPassword);
        return normalizedRoomPassword.isBlank() ? "" : ROOM_PASSWORD_ENCODER.encode(normalizedRoomPassword);
    }

    // Verifies one raw room password against its persisted hash.
    public boolean matchesRoomPassword(String roomPassword, String encodedRoomPassword) {
        var normalizedRoomPassword = normalizeRoomPassword(roomPassword);
        if (encodedRoomPassword == null || encodedRoomPassword.isBlank()) {
            return normalizedRoomPassword.isBlank();
        }
        return !normalizedRoomPassword.isBlank() && ROOM_PASSWORD_ENCODER.matches(normalizedRoomPassword, encodedRoomPassword);
    }

    // Resolves an optional caller-supplied code or generates one when omitted.
    public String resolveTournamentCode(String requestedCode, Predicate<String> alreadyExists) {
        var normalizedRequestedCode = normalizeTournamentCode(requestedCode);
        if (normalizedRequestedCode.isBlank()) {
            return nextTournamentCode(alreadyExists);
        }
        if (!normalizedRequestedCode.matches("[A-Z0-9]{3,10}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "토너먼트 코드는 3~10자의 영문 대문자 또는 숫자여야 합니다."
            );
        }
        if (alreadyExists.test(normalizedRequestedCode)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 토너먼트 코드입니다.");
        }
        return normalizedRequestedCode;
    }

    // Generates a short room code that does not collide with current tournaments.
    public String nextTournamentCode(Predicate<String> alreadyExists) {
        while (true) {
            var code = randomCode(5);
            if (!alreadyExists.test(code)) {
                return code;
            }
        }
    }

    // Creates a stable guest id suitable for local persistence on the client.
    private String nextGuestId() {
        return "guest-" + UUID.randomUUID().toString().substring(0, 8);
    }

    // Normalizes caller input before the code is used as a persistence key.
    private String normalizeTournamentCode(String code) {
        return code == null ? "" : code.trim().toUpperCase();
    }

    // Builds an uppercase code using a typo-resistant alphabet.
    private String randomCode(int length) {
        var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var builder = new StringBuilder(length);
        for (var index = 0; index < length; index++) {
            builder.append(alphabet.charAt(ThreadLocalRandom.current().nextInt(alphabet.length())));
        }
        return builder.toString();
    }
}
