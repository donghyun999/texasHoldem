package com.texasholdem.tournament.application;

final class TournamentBetSizing {

    private TournamentBetSizing() {
    }

    static int chipsToCall(TournamentState tournament, TournamentPlayerState player) {
        return Math.max(0, tournament.currentBet - player.roundContribution);
    }

    static int minimumBringIn(TournamentRules rules, TournamentState tournament) {
        return rules.bigBlindFor(tournament.levelIndex);
    }

    static int minimumRaiseIncrement(TournamentRules rules, TournamentState tournament) {
        return Math.max(tournament.lastFullRaiseSize, minimumBringIn(rules, tournament));
    }

    static int minimumTotalContributionForFullRaise(TournamentRules rules, TournamentState tournament) {
        return tournament.currentBet == 0
                ? minimumBringIn(rules, tournament)
                : tournament.currentBet + minimumRaiseIncrement(rules, tournament);
    }

    static boolean canMakeFullRaise(TournamentRules rules, TournamentState tournament, TournamentPlayerState player) {
        return player.stack > 0
                && player.roundContribution + player.stack >= minimumTotalContributionForFullRaise(rules, tournament);
    }
}
