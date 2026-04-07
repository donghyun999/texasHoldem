package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.GuestSession;
import org.springframework.stereotype.Component;

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
