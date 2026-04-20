package com.texasholdem.tournament.application.hand;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Component
public final class ShuffledTournamentDeckFactory implements TournamentDeckFactory {

    private static final String RANKS = "23456789TJQKA";
    private static final String SUITS = "CDHS";

    private final SecureRandom secureRandom = new SecureRandom();

    @Override
    public List<String> createDeck(int playersToDeal) {
        var deck = new ArrayList<String>(52);
        for (var rankIndex = 0; rankIndex < RANKS.length(); rankIndex++) {
            for (var suitIndex = 0; suitIndex < SUITS.length(); suitIndex++) {
                deck.add("" + RANKS.charAt(rankIndex) + SUITS.charAt(suitIndex));
            }
        }
        Collections.shuffle(deck, secureRandom);
        return deck;
    }
}
