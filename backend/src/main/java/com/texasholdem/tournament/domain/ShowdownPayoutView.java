package com.texasholdem.tournament.domain;

public record ShowdownPayoutView(
        String guestId,
        String nickname,
        int amount
) {
}
