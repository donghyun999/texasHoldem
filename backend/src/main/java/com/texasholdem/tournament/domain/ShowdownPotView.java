package com.texasholdem.tournament.domain;

import java.util.List;

public record ShowdownPotView(
        String id,
        String type,
        int amount,
        List<ShowdownPayoutView> payouts
) {
}
