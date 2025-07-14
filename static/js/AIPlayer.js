function AIPlayer(cardRules, cardPower) {
  this.cardRules = cardRules;
  this.cardPower = cardPower;

  this.decidePlay = function (player, lastPlay, lastPlayerIndex) {
    const all = player.cards.slice();
    const grouper = new CardGrouper();
    const grouped = grouper.groupByMinHands(all); // 按最少手数组牌

    const sorted = grouped.slice().reverse(); // 从弱到强排列（留强牌）

    for (let i = 0; i < sorted.length; i++) {
      const group = sorted[i];
      const type = cardRules.getCardType(group);
      if (!type) continue;

      const valid = window.gameRules.validPlay({
        playerIndex: player.index,
        selected: group,
        type,
        lastPlay,
        lastPlayerIndex,
        cardRules,
        cardPower
      });

      if (!valid) continue;

      const shouldPass = window.PartnerStrategy.shouldPass({
        playerIndex: player.index,
        candidateCards: group,
        candidateType: type,
        lastPlayerIndex,
        lastCards: lastPlay?.cards || [],
        lastType: lastPlay?.type || '',
        cardRules,
        cardPower
      });

      if (!shouldPass) return { type, cards: group };

      // ✅ 特殊情况：即将没有该类型中更小牌可出了，提升牌型
      if (shouldUpgradeFromType(player.cards, type, cardRules)) continue;

      return { type, cards: group };
    }

    // ✅ 如果要尝试拆牌
    if (lastPlay && lastPlayerIndex !== player.index) {
      const trySplit = trySplitFromGroups(player.cards, grouped, lastPlay, cardRules, cardPower);
      if (trySplit) return trySplit;
    }

    // ✅ 自己是上家：必须出任意牌
    if (!lastPlay || lastPlayerIndex === player.index) {
      const fallback = sorted[0];
      return {
        type: cardRules.getCardType(fallback),
        cards: fallback
      };
    }

    return { type: 'pass' };
  };
}

// ✅ 如果该类型剩下的全是主牌/王/大牌，可考虑升级为更强牌型
function shouldUpgradeFromType(cards, type, cardRules) {
  const trump = cardRules.trumpValue;
  const ranks = cardRules.getCardRanks();

  const sameTypeCards = cards.filter(c => {
    const t = cardRules.getCardType([c]);
    return t === type;
  });

  if (sameTypeCards.length === 0) return true;

  const isStrong = sameTypeCards.every(c => {
    const val = ranks[c.value];
    const isTrump = c.value === trump || isWildcard(c, trump); // ✅ 用外部函数
    return isTrump || val >= ranks['K'];
  });

  return isStrong;
}

function trySplitFromGroups(cards, groups, lastPlay, cardRules, cardPower) {
  const lastType = lastPlay.type;
  const lastCards = lastPlay.cards;
  if (!lastType || lastType === 'pass') return null;

  // ✅ 如果已有同类型组合，就不拆强牌
  const hasSameType = groups.some(g => cardRules.getCardType(g) === lastType);
  if (hasSameType) return null;

  const valid = (group) => window.gameRules.validPlay({
    playerIndex: -1,
    selected: group,
    type: cardRules.getCardType(group),
    lastPlay,
    lastPlayerIndex: -1,
    cardRules,
    cardPower
  });

  // ✅ 百搭优先拆牌顺序
  const splitOrder = [
    'triplet_with_pair', // 三带二
    'wooden_board',      // 木板
    'steel_plate',       // 钢板
    'triplet',           // 三张
    'pair'               // 对子
  ];

  for (const sourceType of splitOrder) {
    const sourceGroup = groups.find(g => cardRules.getCardType(g) === sourceType);
    if (!sourceGroup) continue;

    const clone = sourceGroup.slice();
    for (let i = 0; i < clone.length; i++) {
      for (let j = i + 1; j <= clone.length; j++) {
        const maybe = clone.slice(i, j);
        if (!maybe.length) continue;

        const type = cardRules.getCardType(maybe);
        if (!type) continue;

        if (valid(maybe)) return { type, cards: maybe };
      }
    }
  }
  return null;
}

AIPlayer.prototype.playTurn = function (game) {
  setTimeout(() => {
    const currentPlayer = game.players[game.currentPlayerIndex];

    // ✅ 根据设置选择决策方式
    let decision;
    if (window.settings.useMLModel && this.decideByML) {
      decision = this.decideByML(currentPlayer, game);
    } else {
      decision = this.decidePlay(currentPlayer, game.lastPlayed, game.lastPlayerIndex);
    }

    // ✅ 记录状态向量与动作向量（用于机器学习训练）
    try {
      if (window.getStateVector && window.getActionVector && window.dataLogger) {
        const stateVec = window.getStateVector(game, currentPlayer);
        const actionVec = window.getActionVector(decision.cards || []);
        window.dataLogger.record(stateVec, actionVec, {
          playerIndex: currentPlayer.index,
          type: decision.type
        });
      }
    } catch (e) {
      console.warn('⚠️ 记录训练数据失败:', e);
    }

    if (decision.type === 'pass') {
      game._updateBoardPlay(currentPlayer.index, [], true);
      game._nextTurn(true);
      return;
    }

    currentPlayer.removeCards(decision.cards);
    game._updateBoardPlay(currentPlayer.index, decision.cards);

    game.lastPlayed = {
      playerIndex: currentPlayer.index,
      type: decision.type,
      cards: decision.cards
    };
    game.lastPlayerIndex = currentPlayer.index;

    if (currentPlayer.cards.length === 0 && !game.finishedPlayers.includes(currentPlayer.index)) {
      game.finishedPlayers.push(currentPlayer.index);
      if (window.overlayRenderer) {
        overlayRenderer.clearPlayerArea(currentPlayer.index);
        const label = ['头游', '二游', '三游', '末游'][game.finishedPlayers.length - 1] || `第${game.finishedPlayers.length}游`;
        overlayRenderer.renderRankLabel(currentPlayer.index, label);
      }
      game.checkGameOver();
    }

    if (currentPlayer.index === 0) {
      game.cardSelector.originalCards = currentPlayer.cards;
      game.cardSelector.selectedCards = [];
      game.cardSelector.render();
      setTimeout(() => game._nextTurn(), 300);
    } else {
      game._nextTurn();
    }
  }, 500);
};

AIPlayer.prototype.decideByML0 = function (player, game) {
  const stateVec = window.getStateVector(game, player);
  const groups = window.cardGrouper.groupByMinHands(player.cards);

  if (!groups || groups.length === 0) return { type: 'pass' };

  let bestScore = -Infinity;
  let bestGroup = null;

  for (let group of groups) {
    const actionVec = window.getActionVector(group.cards || []);
    const combinedVec = stateVec.concat(actionVec);
    const score = this._fakeModelScore(combinedVec);
    if (score > bestScore) {
      bestScore = score;
      bestGroup = group;
    }
  }

  if (!bestGroup || bestScore < 0.1) return { type: 'pass' }; // 模拟阈值
  return {
    type: bestGroup.type,
    cards: bestGroup.cards
  };
};

AIPlayer.prototype._fakeModelScore = function (vec) {
  const weights = this.fakeWeights || Array(vec.length).fill(0).map((_, i) => Math.sin(i) * 0.1); // 模拟假权重
  this.fakeWeights = weights; // 缓存
  return vec.reduce((sum, v, i) => sum + v * weights[i], 0);
};

window.PlayCard = AIPlayer;