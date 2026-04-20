package com.texasholdem.tournament.application.state;

import com.texasholdem.tournament.application.hand.BettingRound;
import com.texasholdem.tournament.domain.PotView;
import com.texasholdem.tournament.domain.ShowdownHandView;
import com.texasholdem.tournament.domain.ShowdownPotView;
import com.texasholdem.tournament.domain.TournamentPauseReason;
import com.texasholdem.tournament.domain.TournamentStatus;
import com.texasholdem.tournament.domain.TournamentVisibility;

import java.util.ArrayList;
import java.util.List;

public final class TournamentState {

    public final String code;
    public String roomName = "";
    public String roomPassword = "";
    public TournamentVisibility visibility = TournamentVisibility.PRIVATE;
    public final List<TournamentPlayerState> players = new ArrayList<>();
    public long handNumber = 0;
    public long stateVersion = 0;
    public TournamentStatus status = TournamentStatus.WAITING;
    public int levelIndex = 0;
    public long levelActivatedAtEpochSecond = 0;
    public int mainPot = 0;
    public List<PotView> sidePots = new ArrayList<>();
    public BettingRound round = BettingRound.PRE_FLOP;
    public int currentBet = 0;
    public int lastFullRaiseSize = 0;
    public List<String> boardCards = new ArrayList<>();
    public List<String> hiddenBoardCards = new ArrayList<>();
    public Integer dealerSeat;
    public Integer smallBlindSeat;
    public Integer bigBlindSeat;
    public Integer actingSeat;
    public boolean paused = false;
    public TournamentPauseReason pauseReason;
    public long levelPausedRemainingSeconds = 0;
    public long actionDeadlineAtEpochMilli = 0;
    public long handResultEndsAtEpochMilli = 0;
    public long finishedCleanupAtEpochMilli = 0;
    public List<ShowdownPotView> showdownPots = new ArrayList<>();
    public List<ShowdownHandView> showdownHands = new ArrayList<>();
    public List<String> recentlyBustedGuestIds = new ArrayList<>();
    public List<String> availableActions = new ArrayList<>();
    public String tableMessage = "";

    // Initializes a new mutable tournament container for one code.
    public TournamentState(String code) {
        this.code = code;
    }
}
