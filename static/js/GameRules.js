window.gameRules = {
  validPlay: function({ playerIndex, selected, type, lastPlay, cardRules, cardPower }) {
    if (!type || !selected || selected.length === 0) return false;

    const isBomb = cardRules.isBomb(selected);
    const isStraightFlush = cardRules.getCardType(selected) === 'straight_flush';
    const isSuperBomb = cardRules.getCardType(selected) === 'super_bomb';
    const isBigBomb = cardRules.getCardType(selected) === 'big_bomb';

    // ✅ 桌面无牌：可以出任何合法牌
    if (!lastPlay || !lastPlay.cards || lastPlay.cards.length === 0) {
      return true;
    }

    const lastPlayer = lastPlay.player;
    const lastCards = lastPlay.cards;
    const lastType = lastPlay.type;
    const lastIsBomb = cardRules.isBomb(lastCards);
    const lastIsStraightFlush = cardRules.getCardType(lastCards) === 'straight_flush';
    const lastIsSuperBomb = cardRules.getCardType(lastCards) === 'super_bomb';
    const lastIsBigBomb = cardRules.getCardType(lastCards) === 'big_bomb';

    // ✅ 轮到自己继续出牌（前一轮所有人pass）
    if (lastPlayer === playerIndex) {
      return true;
    }

    // ✅ 同类型压制（非炸弹类型），必须牌型相同且更大
    if (!isBomb && !isStraightFlush && !isBigBomb && !isSuperBomb) {
      if (type !== lastType) return false;
      return cardPower.compareSameType(selected, lastCards, type, cardRules) > 0;
    }

    // ✅ 炸弹/同花顺等压制规则：
    const myRank = cardPower.getTypeRank(type, selected);
    const lastRank = cardPower.getTypeRank(lastType, lastCards);

    // 同花顺可以压5张及以下的炸弹
    if (isStraightFlush && lastType === 'bomb' && lastCards.length <= 5) {
      return true;
    }

    // 炸弹以下不能压同花顺、大炸弹、超级炸弹
    if (!isBomb && !isStraightFlush && !isBigBomb && !isSuperBomb) {
      return false;
    }

    // 任何炸弹/同花顺可以压非炸弹
    if (!lastIsBomb && !lastIsStraightFlush && !lastIsBigBomb && !lastIsSuperBomb) {
      return true;
    }

    // 超级炸弹可以压任何牌
    if (isSuperBomb) return true;

    // 同类特殊牌型（炸弹/同花顺/大炸弹）之间比较
    if (myRank > lastRank) {
      return true;
    }

    return false;
  }
};