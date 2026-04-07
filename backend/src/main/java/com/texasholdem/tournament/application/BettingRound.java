package com.texasholdem.tournament.application;

enum BettingRound {
    PRE_FLOP(0, "Preflop action is open."),
    FLOP(3, "Flop action is open."),
    TURN(4, "Turn action is open."),
    RIVER(5, "River action is open.");

    private final int visibleBoardCards;
    private final String openMessage;

    // Stores the board size and message for a betting street transition.
    BettingRound(int visibleBoardCards, String openMessage) {
        this.visibleBoardCards = visibleBoardCards;
        this.openMessage = openMessage;
    }

    // Moves the hand to the next betting street.
    BettingRound next() {
        return switch (this) {
            case PRE_FLOP -> FLOP;
            case FLOP -> TURN;
            case TURN, RIVER -> RIVER;
        };
    }

    // Returns how many board cards should be visible for this street.
    int visibleBoardCards() {
        return visibleBoardCards;
    }

    // Returns the table message for a newly opened street.
    String openMessage() {
        return openMessage;
    }
}
