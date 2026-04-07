package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PlayerStatus;
import com.texasholdem.tournament.domain.TournamentStatus;
import org.springframework.stereotype.Component;

import java.util.Comparator;

@Component
final class TournamentOwnershipManager {

    // Clears the departing owner flag and moves it to the next eligible player when possible.
    TournamentPlayerState clearAndReassignOwnerIfNeeded(TournamentState tournament, TournamentPlayerState player) {
        if (!player.owner) {
            return null;
        }
        player.owner = false;
        var delegatedOwner = findOwnerCandidate(tournament, player.guestId);
        if (delegatedOwner != null) {
            delegatedOwner.owner = true;
        }
        return delegatedOwner;
    }

    // Backfills the owner role after reconnect if the tournament temporarily had no controller.
    TournamentPlayerState assignOwnerIfMissing(TournamentState tournament) {
        var existingOwner = tournament.players.stream()
                .filter(player -> player.owner)
                .findFirst()
                .orElse(null);
        if (existingOwner != null) {
            return null;
        }

        var delegatedOwner = findOwnerCandidate(tournament, null);
        if (delegatedOwner != null) {
            delegatedOwner.owner = true;
        }
        return delegatedOwner;
    }

    // Chooses the next owner from the lowest eligible connected seat.
    private TournamentPlayerState findOwnerCandidate(TournamentState tournament, String excludedGuestId) {
        return tournament.players.stream()
                .filter(player -> excludedGuestId == null || !player.guestId.equals(excludedGuestId))
                .filter(player -> player.connected)
                .filter(player -> tournament.status == TournamentStatus.WAITING
                        || player.stack > 0 && player.status != PlayerStatus.BUSTED_OUT)
                .sorted(Comparator.comparingInt(player -> player.seatIndex))
                .findFirst()
                .orElse(null);
    }

    // Builds a compact owner-transfer message when a new controller was assigned.
    String buildOwnerDelegationMessage(TournamentPlayerState delegatedOwner) {
        if (delegatedOwner == null) {
            return "";
        }
        return delegatedOwner.nickname + " is now the owner.";
    }
}
