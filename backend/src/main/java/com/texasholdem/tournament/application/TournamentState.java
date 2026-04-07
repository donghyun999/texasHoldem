package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownPotView;
import com.texasholdem.tournament.domain.TournamentStatus;

import java.util.ArrayList;
import java.util.List;

final class TournamentState {

    final String code;
    final List<TournamentPlayerState> players = new ArrayList<>();
    TournamentStatus status = TournamentStatus.WAITING;
    int levelIndex = 0;
    long levelActivatedAtEpochSecond = 0;
    int mainPot = 0;
    List<PotView> sidePots = new ArrayList<>();
    BettingRound round = BettingRound.PRE_FLOP;
    int currentBet = 0;
    List<String> boardCards = new ArrayList<>();
    List<String> hiddenBoardCards = new ArrayList<>();
    Integer dealerSeat;
    Integer smallBlindSeat;
    Integer bigBlindSeat;
    Integer actingSeat;
    long handResultEndsAtEpochMilli = 0;
    List<ShowdownPotView> showdownPots = new ArrayList<>();
    List<String> availableActions = new ArrayList<>();
    String tableMessage = "";

    // Initializes a new mutable tournament container for one code.
    TournamentState(String code) {
        this.code = code;
    }
}
