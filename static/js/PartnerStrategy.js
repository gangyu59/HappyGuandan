window.PartnerStrategy = {
  shouldPass: function ({
    playerIndex,
    candidateCards,
    candidateType,
    lastPlayerIndex,
    lastCards,
    lastType,
    cardRules,
    cardPower
  }) {
    if (lastPlayerIndex == null) return false;

    const isSameTeam = (playerIndex % 2 === lastPlayerIndex % 2);
    if (!isSameTeam) return false;

    if (playerIndex === lastPlayerIndex) return false;

    const ranks = cardRules.getCardRanks();
    const sortedLast = cardRules.sortCards(lastCards);
    const sortedMine = cardRules.sortCards(candidateCards);

    const lastMax = ranks[sortedLast[0].value];
    const myMax = ranks[sortedMine[0].value];

    const lowTypeThresholds = {
      single: ranks['Q'],
      pair: ranks['10'],
      triplet: ranks['9'],
      straight: ranks['10'], // 顺子尾最大值
      triplet_with_pair: ranks['9']
    };

    if (lowTypeThresholds[lastType]) {
      const threshold = lowTypeThresholds[lastType];
      if (lastMax <= threshold && myMax <= threshold) {
        return false; // ✅ 顺队友的小牌
      }
    }

    // 其它情况（包括大牌型、小牌型中大牌）默认 pass
    return true;
  }
};