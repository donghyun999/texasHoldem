package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.GuestSession;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Predicate;

@Component
final class TournamentIdentityFactory {

    // Issues a normalized guest session for the tournament flow.
    GuestSession registerGuest(String nickname) {
        return new GuestSession(nextGuestId(), normalizeNickname(nickname));
    }

    // Trims user-facing nicknames before persisting them in memory.
    String normalizeNickname(String nickname) {
        return nickname == null ? "" : nickname.trim();
    }

    // Trims room titles before they are stored or compared.
    String normalizeRoomName(String roomName) {
        return roomName == null ? "" : roomName.trim();
    }

    // Trims room passwords while preserving case-sensitive comparisons.
    String normalizeRoomPassword(String roomPassword) {
        return roomPassword == null ? "" : roomPassword.trim();
    }

    // Resolves an optional caller-supplied code or generates one when omitted.
    String resolveTournamentCode(String requestedCode, Predicate<String> alreadyExists) {
        var normalizedRequestedCode = normalizeTournamentCode(requestedCode);
        if (normalizedRequestedCode.isBlank()) {
            return nextTournamentCode(alreadyExists);
        }
        if (!normalizedRequestedCode.matches("[A-Z0-9]{3,10}")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Tournament code must be 3 to 10 letters or digits"
            );
        }
        if (alreadyExists.test(normalizedRequestedCode)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tournament code already exists");
        }
        return normalizedRequestedCode;
    }

    // Generates a short room code that does not collide with current tournaments.
    String nextTournamentCode(Predicate<String> alreadyExists) {
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
