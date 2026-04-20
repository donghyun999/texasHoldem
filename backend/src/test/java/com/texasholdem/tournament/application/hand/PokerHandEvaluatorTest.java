package com.texasholdem.tournament.application.hand;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PokerHandEvaluatorTest {

    private final PokerHandEvaluator evaluator = new PokerHandEvaluator();

    @Test
    void describesPocketPairPreflopAsOnePair() {
        assertThat(evaluator.describeCurrentHand(List.of(), List.of("QS", "QH"))).isEqualTo("Q 원페어");
    }

    @Test
    void describesUnpairedPreflopHandAsHighCard() {
        assertThat(evaluator.describeCurrentHand(List.of(), List.of("AS", "KD"))).isEqualTo("A 하이카드");
    }

    @Test
    void describesPostflopMadeHandUsingFiveCardEvaluator() {
        assertThat(evaluator.describeCurrentHand(List.of("AH", "7D", "2C"), List.of("AS", "KD"))).isEqualTo("A 원페어");
    }

    @Test
    void describesTwoPairUsingBothPairRanks() {
        assertThat(evaluator.describeCurrentHand(List.of("AH", "KD", "2C", "7S", "2H"), List.of("AS", "KH")))
                .isEqualTo("A, K 투페어");
    }

    @Test
    void describesStraightWithEnglishHighRankLabel() {
        assertThat(evaluator.describeCurrentHand(List.of("TH", "JD", "QC", "2S", "3H"), List.of("AS", "KH")))
                .isEqualTo("A 스트레이트");
    }
}
