package com.texasholdem.tournament.application.hand;

import java.util.List;

public interface TournamentDeckFactory {

    // Creates one fresh 52-card deck for a new hand before hole cards and board cards are consumed.
    List<String> createDeck(int playersToDeal);
}
