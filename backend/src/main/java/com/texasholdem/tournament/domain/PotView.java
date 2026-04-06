package com.texasholdem.tournament.domain;

import java.util.List;

public record PotView(
        String id,
        String type,
        int amount,
        List<String> eligibleGuestIds
) {
}
