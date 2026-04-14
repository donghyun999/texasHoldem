package com.texasholdem.tournament.domain;

import java.util.List;

public record ShowdownHandView(
        String guestId,
        String nickname,
        String handLabel,
        List<String> holeCards
) {
}
