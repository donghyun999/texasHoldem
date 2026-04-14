package com.texasholdem.tournament.application;

import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownHandView;
import com.texasholdem.tournament.domain.ShowdownPotView;
import com.texasholdem.tournament.domain.TournamentPauseReason;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;

import java.util.ArrayList;
import java.util.List;

final class TournamentState {

    final String code;
    String roomName = "";
    String roomPassword = "";
    TournamentVisibility visibility = TournamentVisibility.PRIVATE;
    final List<TournamentPlayerState> players = new ArrayList<>();
    long handNumber = 0;
    long stateVersion = 0;
    TournamentStatus status = TournamentStatus.WAITING;
    int levelIndex = 0;
    long levelActivatedAtEpochSecond = 0;
    int mainPot = 0;
    List<PotView> sidePots = new ArrayList<>();
    BettingRound round = BettingRound.PRE_FLOP;
    int currentBet = 0;
    int lastFullRaiseSize = 0;
    List<String> boardCards = new ArrayList<>();
    List<String> hiddenBoardCards = new ArrayList<>();
    Integer dealerSeat;
    Integer smallBlindSeat;
    Integer bigBlindSeat;
    Integer actingSeat;
    boolean paused = false;
    TournamentPauseReason pauseReason;
    long levelPausedRemainingSeconds = 0;
    long actionDeadlineAtEpochMilli = 0;
    long handResultEndsAtEpochMilli = 0;
    long finishedCleanupAtEpochMilli = 0;
    List<ShowdownPotView> showdownPots = new ArrayList<>();
    List<ShowdownHandView> showdownHands = new ArrayList<>();
    List<String> recentlyBustedGuestIds = new ArrayList<>();
    List<String> availableActions = new ArrayList<>();
    String tableMessage = "";

    // Initializes a new mutable tournament container for one code.
    TournamentState(String code) {
        this.code = code;
    }
}
