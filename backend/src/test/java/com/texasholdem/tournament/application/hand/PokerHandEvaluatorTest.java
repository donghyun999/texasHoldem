package com.texasholdem.tournament.application.hand;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PokerHandEvaluatorTest {

    private final PokerHandEvaluator evaluator = new PokerHandEvaluator();

    @Test
    void describesPocketPairPreflopAsOnePair() {
        assertThat(evaluator.describeCurrentHand(List.of(), List.of("QS", "QH"))).isEqualTo("One Pair");
    }

    @Test
    void describesUnpairedPreflopHandAsHighCard() {
        assertThat(evaluator.describeCurrentHand(List.of(), List.of("AS", "KD"))).isEqualTo("High Card");
    }

    @Test
    void describesPostflopMadeHandUsingFiveCardEvaluator() {
        assertThat(evaluator.describeCurrentHand(List.of("AH", "7D", "2C"), List.of("AS", "KD"))).isEqualTo("One Pair");
    }
}
