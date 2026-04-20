package com.texasholdem.tournament.application.hand;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public final class PokerHandEvaluator {

    private static final String RANKS = "23456789TJQKA";

    // Describes the viewer's best made hand for live UI display across every street.
    public String describeCurrentHand(List<String> boardCards, List<String> holeCards) {
        if (holeCards == null || holeCards.size() != 2) {
            return null;
        }

        if (boardCards == null || boardCards.size() < 3) {
            return isPocketPair(holeCards)
                    ? rankLabel(parseCard(holeCards.get(0)).rank()) + " 원페어"
                    : rankLabel(highestHoleRank(holeCards)) + " 하이카드";
        }

        return describeDetailed(evaluate(boardCards, holeCards));
    }

    // Scores the best five-card hand from a board plus one player's hole cards.
    long evaluate(List<String> boardCards, List<String> holeCards) {
        var cards = new ArrayList<Card>();
        for (var card : boardCards) {
            cards.add(parseCard(card));
        }
        for (var card : holeCards) {
            cards.add(parseCard(card));
        }

        var bestScore = 0L;
        for (var first = 0; first < cards.size() - 4; first++) {
            for (var second = first + 1; second < cards.size() - 3; second++) {
                for (var third = second + 1; third < cards.size() - 2; third++) {
                    for (var fourth = third + 1; fourth < cards.size() - 1; fourth++) {
                        for (var fifth = fourth + 1; fifth < cards.size(); fifth++) {
                            var score = evaluateFiveCardScore(List.of(
                                    cards.get(first),
                                    cards.get(second),
                                    cards.get(third),
                                    cards.get(fourth),
                                    cards.get(fifth)
                            ));
                            if (score > bestScore) {
                                bestScore = score;
                            }
                        }
                    }
                }
            }
        }
        return bestScore;
    }

    // Maps one packed showdown score back into the user-facing hand-class label.
    String describe(long score) {
        return switch (category(score)) {
            case 8 -> "Straight Flush";
            case 7 -> "Four of a Kind";
            case 6 -> "Full House";
            case 5 -> "Flush";
            case 4 -> "Straight";
            case 3 -> "Three of a Kind";
            case 2 -> "Two Pair";
            case 1 -> "One Pair";
            default -> "High Card";
        };
    }

    private String describeDetailed(long score) {
        var firstRank = valueAt(score, 0);
        var secondRank = valueAt(score, 1);

        return switch (category(score)) {
            case 8 -> rankLabel(firstRank) + " 스트레이트 플러시";
            case 7 -> rankLabel(firstRank) + " 포카드";
            case 6 -> rankLabel(firstRank) + ", " + rankLabel(secondRank) + " 풀하우스";
            case 5 -> rankLabel(firstRank) + " 플러시";
            case 4 -> rankLabel(firstRank) + " 스트레이트";
            case 3 -> rankLabel(firstRank) + " 트리플";
            case 2 -> rankLabel(firstRank) + ", " + rankLabel(secondRank) + " 투페어";
            case 1 -> rankLabel(firstRank) + " 원페어";
            default -> rankLabel(firstRank) + " 하이카드";
        };
    }

    // Scores one exact five-card poker hand category with ordered kicker values.
    private long evaluateFiveCardScore(List<Card> cards) {
        var rankCounts = new HashMap<Integer, Integer>();
        var flush = true;
        var firstSuit = cards.get(0).suit();
        for (var card : cards) {
            rankCounts.merge(card.rank(), 1, Integer::sum);
            flush = flush && card.suit() == firstSuit;
        }

        var sortedRanks = rankCounts.keySet().stream()
                .sorted(Comparator.reverseOrder())
                .toList();
        var straightHigh = straightHigh(sortedRanks);
        var groupedRanks = rankCounts.entrySet().stream()
                .sorted(Comparator.<Map.Entry<Integer, Integer>>comparingInt(Map.Entry::getValue)
                        .reversed()
                        .thenComparing(Map.Entry::getKey, Comparator.reverseOrder()))
                .toList();

        if (flush && straightHigh > 0) {
            return buildScore(8, straightHigh);
        }
        if (groupedRanks.get(0).getValue() == 4) {
            return buildScore(7, groupedRanks.get(0).getKey(), groupedRanks.get(1).getKey());
        }
        if (groupedRanks.get(0).getValue() == 3 && groupedRanks.get(1).getValue() == 2) {
            return buildScore(6, groupedRanks.get(0).getKey(), groupedRanks.get(1).getKey());
        }
        if (flush) {
            return buildScore(5, cards.stream()
                    .map(Card::rank)
                    .sorted(Comparator.reverseOrder())
                    .mapToInt(Integer::intValue)
                    .toArray());
        }
        if (straightHigh > 0) {
            return buildScore(4, straightHigh);
        }
        if (groupedRanks.get(0).getValue() == 3) {
            return buildScore(
                    3,
                    groupedRanks.get(0).getKey(),
                    groupedRanks.get(1).getKey(),
                    groupedRanks.get(2).getKey()
            );
        }
        if (groupedRanks.get(0).getValue() == 2 && groupedRanks.get(1).getValue() == 2) {
            return buildScore(
                    2,
                    Math.max(groupedRanks.get(0).getKey(), groupedRanks.get(1).getKey()),
                    Math.min(groupedRanks.get(0).getKey(), groupedRanks.get(1).getKey()),
                    groupedRanks.get(2).getKey()
            );
        }
        if (groupedRanks.get(0).getValue() == 2) {
            return buildScore(
                    1,
                    groupedRanks.get(0).getKey(),
                    groupedRanks.get(1).getKey(),
                    groupedRanks.get(2).getKey(),
                    groupedRanks.get(3).getKey()
            );
        }
        return buildScore(0, sortedRanks.stream().mapToInt(Integer::intValue).toArray());
    }

    // Detects the high card of a straight, including the ace-low wheel.
    private int straightHigh(List<Integer> ranks) {
        if (ranks.size() != 5) {
            return 0;
        }
        var ordered = new ArrayList<>(ranks);
        ordered.sort(Comparator.naturalOrder());
        if (ordered.equals(List.of(2, 3, 4, 5, 14))) {
            return 5;
        }
        for (var index = 1; index < ordered.size(); index++) {
            if (ordered.get(index) != ordered.get(index - 1) + 1) {
                return 0;
            }
        }
        return ordered.get(ordered.size() - 1);
    }

    // Packs the category and kicker ranks into one comparable value.
    private long buildScore(int category, int... values) {
        var score = (long) category;
        for (var index = 0; index < 5; index++) {
            score <<= 4;
            if (index < values.length) {
                score |= values[index];
            }
        }
        return score;
    }

    // Extracts the hand category nibble from the packed showdown score.
    private int category(long score) {
        return (int) (score >> 20);
    }

    private int valueAt(long score, int index) {
        return (int) ((score >> (16 - (index * 4))) & 0xF);
    }

    private boolean isPocketPair(List<String> holeCards) {
        return parseCard(holeCards.get(0)).rank() == parseCard(holeCards.get(1)).rank();
    }

    private int highestHoleRank(List<String> holeCards) {
        return Math.max(parseCard(holeCards.get(0)).rank(), parseCard(holeCards.get(1)).rank());
    }

    private String rankLabel(int rank) {
        return switch (rank) {
            case 14 -> "A";
            case 13 -> "K";
            case 12 -> "Q";
            case 11 -> "J";
            default -> rank == 0 ? "" : Integer.toString(rank);
        };
    }

    // Parses a compact rank-suit card string into numeric form.
    private Card parseCard(String card) {
        var rank = RANKS.indexOf(card.charAt(0)) + 2;
        if (rank < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported card rank: " + card);
        }
        return new Card(rank, card.charAt(1));
    }

    // Stores the numeric representation used during hand evaluation.
    private record Card(int rank, char suit) {
    }
}
