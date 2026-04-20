const RANKS = "23456789TJQKA";

type ParsedCard = {
  rank: number;
  suit: string;
};

export function describeSelfHandLabel(boardCards: string[], holeCards: string[]) {
  if (holeCards.length !== 2) {
    return null;
  }

  if (boardCards.length < 3) {
    return parseCard(holeCards[0]).rank === parseCard(holeCards[1]).rank
      ? `${rankLabel(parseCard(holeCards[0]).rank)} 원페어`
      : `${rankLabel(Math.max(parseCard(holeCards[0]).rank, parseCard(holeCards[1]).rank))} 하이카드`;
  }

  return describeScore(evaluateScore(boardCards, holeCards));
}

function evaluateScore(boardCards: string[], holeCards: string[]) {
  const cards = [...boardCards, ...holeCards].map(parseCard);
  let bestScore = 0;

  for (let first = 0; first < cards.length - 4; first += 1) {
    for (let second = first + 1; second < cards.length - 3; second += 1) {
      for (let third = second + 1; third < cards.length - 2; third += 1) {
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            bestScore = Math.max(
              bestScore,
              evaluateFiveCardScore([cards[first], cards[second], cards[third], cards[fourth], cards[fifth]]),
            );
          }
        }
      }
    }
  }

  return bestScore;
}

function describeScore(score: number) {
  const firstRank = valueAt(score, 0);
  const secondRank = valueAt(score, 1);

  switch (category(score)) {
    case 8:
      return `${rankLabel(firstRank)} 스트레이트 플러시`;
    case 7:
      return `${rankLabel(firstRank)} 포카드`;
    case 6:
      return `${rankLabel(firstRank)}, ${rankLabel(secondRank)} 풀하우스`;
    case 5:
      return `${rankLabel(firstRank)} 플러시`;
    case 4:
      return `${rankLabel(firstRank)} 스트레이트`;
    case 3:
      return `${rankLabel(firstRank)} 트리플`;
    case 2:
      return `${rankLabel(firstRank)}, ${rankLabel(secondRank)} 투페어`;
    case 1:
      return `${rankLabel(firstRank)} 원페어`;
    default:
      return `${rankLabel(firstRank)} 하이카드`;
  }
}

function evaluateFiveCardScore(cards: ParsedCard[]) {
  const rankCounts = new Map<number, number>();
  let flush = true;
  const firstSuit = cards[0].suit;

  for (const card of cards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    flush = flush && card.suit === firstSuit;
  }

  const sortedRanks = [...rankCounts.keys()].sort((left, right) => right - left);
  const straightHigh = resolveStraightHigh(sortedRanks);
  const groupedRanks = [...rankCounts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return right[0] - left[0];
  });

  if (flush && straightHigh > 0) {
    return buildScore(8, [straightHigh]);
  }

  if (groupedRanks[0][1] === 4) {
    return buildScore(7, [groupedRanks[0][0], groupedRanks[1][0]]);
  }

  if (groupedRanks[0][1] === 3 && groupedRanks[1][1] === 2) {
    return buildScore(6, [groupedRanks[0][0], groupedRanks[1][0]]);
  }

  if (flush) {
    return buildScore(
      5,
      [...cards].map((card) => card.rank).sort((left, right) => right - left),
    );
  }

  if (straightHigh > 0) {
    return buildScore(4, [straightHigh]);
  }

  if (groupedRanks[0][1] === 3) {
    return buildScore(3, [groupedRanks[0][0], groupedRanks[1][0], groupedRanks[2][0]]);
  }

  if (groupedRanks[0][1] === 2 && groupedRanks[1][1] === 2) {
    return buildScore(2, [
      Math.max(groupedRanks[0][0], groupedRanks[1][0]),
      Math.min(groupedRanks[0][0], groupedRanks[1][0]),
      groupedRanks[2][0],
    ]);
  }

  if (groupedRanks[0][1] === 2) {
    return buildScore(1, [groupedRanks[0][0], groupedRanks[1][0], groupedRanks[2][0], groupedRanks[3][0]]);
  }

  return buildScore(0, sortedRanks);
}

function resolveStraightHigh(ranks: number[]) {
  if (ranks.length !== 5) {
    return 0;
  }

  const ordered = [...ranks].sort((left, right) => left - right);
  if (ordered.join(",") === "2,3,4,5,14") {
    return 5;
  }

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== ordered[index - 1] + 1) {
      return 0;
    }
  }

  return ordered[ordered.length - 1];
}

function buildScore(categoryValue: number, values: number[]) {
  let score = categoryValue;

  for (let index = 0; index < 5; index += 1) {
    score <<= 4;
    if (index < values.length) {
      score |= values[index];
    }
  }

  return score;
}

function category(score: number) {
  return score >> 20;
}

function valueAt(score: number, index: number) {
  return (score >> (16 - index * 4)) & 0xf;
}

function rankLabel(rank: number) {
  switch (rank) {
    case 14:
      return "A";
    case 13:
      return "K";
    case 12:
      return "Q";
    case 11:
      return "J";
    default:
      return rank === 0 ? "" : String(rank);
  }
}

function parseCard(card: string): ParsedCard {
  return {
    rank: RANKS.indexOf(card[0]) + 2,
    suit: card[1],
  };
}
