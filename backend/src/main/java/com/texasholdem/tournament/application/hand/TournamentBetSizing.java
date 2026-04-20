package com.texasholdem.tournament.application.hand;

import com.texasholdem.tournament.application.state.TournamentPlayerState;
import com.texasholdem.tournament.application.state.TournamentRules;
import com.texasholdem.tournament.application.state.TournamentState;

public final class TournamentBetSizing {

    private TournamentBetSizing() {
    }

    public static int chipsToCall(TournamentState tournament, TournamentPlayerState player) {
        return Math.max(0, tournament.currentBet - player.roundContribution);
    }

    public static int minimumBringIn(TournamentRules rules, TournamentState tournament) {
        return rules.bigBlindFor(tournament.levelIndex);
    }

    public static int minimumRaiseIncrement(TournamentRules rules, TournamentState tournament) {
        return Math.max(tournament.lastFullRaiseSize, minimumBringIn(rules, tournament));
    }

    public static int minimumTotalContributionForFullRaise(TournamentRules rules, TournamentState tournament) {
        return tournament.currentBet == 0
                ? minimumBringIn(rules, tournament)
                : tournament.currentBet + minimumRaiseIncrement(rules, tournament);
    }

    public static boolean canMakeFullRaise(TournamentRules rules, TournamentState tournament, TournamentPlayerState player) {
        return player.stack > 0
                && player.roundContribution + player.stack >= minimumTotalContributionForFullRaise(rules, tournament);
    }
}
