/* ============================================
   ai.js - AI Player Logic
   Basic strategic AI for Baloot
   ============================================ */

class BalootAI {
    /**
     * Decide whether to bid and what to bid
     * @param {object} game - The game state
     * @param {number} playerIndex - AI player index
     */
    static decideBid(game, playerIndex) {
        const hand = game.hands[playerIndex];
        const faceUpSuit = game.faceUpCard.suitId;
        const options = game.getBiddingOptions();

        // Evaluate hand strength
        const hokmStrength = this.evaluateHokmHand(hand, faceUpSuit);
        const sunStrength = this.evaluateSunHand(hand);

        if (game.biddingRound === 1) {
            // Round 1: stronger threshold to buy
            if (sunStrength >= 6) return { type: 'sun' };
            if (hokmStrength >= 5) return { type: 'hokm', suit: faceUpSuit };
            return { type: 'pass' };
        } else {
            // Round 2: slightly lower threshold
            if (sunStrength >= 5) return { type: 'sun' };

            // Find best hokm suit (not face-up suit)
            let bestSuit = null;
            let bestStrength = 0;
            for (const suit of Object.keys(SUITS)) {
                if (suit === faceUpSuit) continue;
                const str = this.evaluateHokmHand(hand, suit);
                if (str > bestStrength) {
                    bestStrength = str;
                    bestSuit = suit;
                }
            }
            if (bestStrength >= 4 && bestSuit) {
                return { type: 'hokm_choose', suit: bestSuit };
            }

            // Check ashkal option
            if (options.some(o => o.type === 'ashkal') && sunStrength >= 4) {
                return { type: 'ashkal' };
            }

            return { type: 'pass' };
        }
    }

    /**
     * Evaluate hand strength for Hokm with given trump suit
     */
    static evaluateHokmHand(hand, trumpSuit) {
        let strength = 0;
        const trumpCards = hand.filter(c => c.suitId === trumpSuit);

        // Count trump cards
        strength += trumpCards.length * 1.5;

        // High trumps are very strong
        for (const card of trumpCards) {
            if (card.rankId === 'J') strength += 3;
            else if (card.rankId === '9') strength += 2.5;
            else if (card.rankId === 'A') strength += 2;
            else if (card.rankId === '10') strength += 1;
        }

        // Aces in other suits
        const otherAces = hand.filter(c => c.rankId === 'A' && c.suitId !== trumpSuit);
        strength += otherAces.length * 1.5;

        return strength;
    }

    /**
     * Evaluate hand strength for Sun
     */
    static evaluateSunHand(hand) {
        let strength = 0;

        for (const card of hand) {
            if (card.rankId === 'A') strength += 2;
            else if (card.rankId === '10') strength += 1.5;
            else if (card.rankId === 'K') strength += 1;
            else if (card.rankId === 'Q') strength += 0.5;
        }

        // Bonus for suits with multiple high cards
        const suitGroups = {};
        hand.forEach(c => {
            if (!suitGroups[c.suitId]) suitGroups[c.suitId] = [];
            suitGroups[c.suitId].push(c);
        });

        for (const cards of Object.values(suitGroups)) {
            if (cards.length >= 3) {
                const highCards = cards.filter(c => ['A', '10', 'K'].includes(c.rankId));
                if (highCards.length >= 2) strength += 1;
            }
        }

        return strength;
    }

    /**
     * Choose which card to play
     * @param {object} game - The game state
     * @param {number} playerIndex - AI player index
     */
    static chooseCard(game, playerIndex) {
        const hand = game.hands[playerIndex];
        const validCards = game.getValidCardsForCurrentPlayer();
        const trick = game.currentTrick;
        const isLeading = trick.length === 0;
        const partner = (playerIndex + 2) % 4;
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;

        if (validCards.length === 1) return validCards[0];

        if (isLeading) {
            return this.chooseLeadCard(validCards, hand, game, playerIndex);
        } else {
            return this.chooseFollowCard(validCards, hand, game, playerIndex);
        }
    }

    /**
     * Choose a card when leading a trick
     */
    static chooseLeadCard(validCards, hand, game, playerIndex) {
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;

        if (gameType === 'sun') {
            // Lead with high cards (aces first)
            const aces = validCards.filter(c => c.rankId === 'A');
            if (aces.length > 0) return aces[0];

            // Lead from longest suit
            const suitCounts = {};
            validCards.forEach(c => {
                suitCounts[c.suitId] = (suitCounts[c.suitId] || 0) + 1;
            });
            const longestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0][0];
            const suitCards = validCards.filter(c => c.suitId === longestSuit);
            return suitCards.sort((a, b) => b.sunOrder - a.sunOrder)[0];
        } else {
            // Hokm: lead with high non-trump first
            const nonTrump = validCards.filter(c => c.suitId !== hokmSuit);
            if (nonTrump.length > 0) {
                const aces = nonTrump.filter(c => c.rankId === 'A');
                if (aces.length > 0) return aces[0];
                // Lead from short non-trump suit
                const suitCounts = {};
                nonTrump.forEach(c => {
                    suitCounts[c.suitId] = (suitCounts[c.suitId] || 0) + 1;
                });
                const shortestSuit = Object.entries(suitCounts).sort((a, b) => a[1] - b[1])[0][0];
                const suitCards = nonTrump.filter(c => c.suitId === shortestSuit);
                return suitCards.sort((a, b) => b.sunOrder - a.sunOrder)[0];
            }
            // Only trump left, lead highest
            return validCards.sort((a, b) => b.hokmOrder - a.hokmOrder)[0];
        }
    }

    /**
     * Choose a card when following
     */
    static chooseFollowCard(validCards, hand, game, playerIndex) {
        const trick = game.currentTrick;
        const leadSuit = trick[0].card.suitId;
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;
        const partner = (playerIndex + 2) % 4;

        // Check if partner is currently winning
        const tempTrick = [...trick];
        const currentWinner = determineTrickWinner(tempTrick, gameType, hokmSuit);
        const partnerWinning = currentWinner.playerIndex === partner;

        const followingSuit = validCards[0].suitId === leadSuit;

        if (followingSuit) {
            if (partnerWinning) {
                // Partner winning, play low
                return validCards.sort((a, b) => a.sunOrder - b.sunOrder)[0];
            }
            // Try to win: play the lowest card that beats current winner
            const winnerStrength = getCardStrength(currentWinner.card, gameType, hokmSuit, leadSuit);
            const beatingCards = validCards.filter(c =>
                getCardStrength(c, gameType, hokmSuit, leadSuit) > winnerStrength
            ).sort((a, b) => {
                const sa = getCardStrength(a, gameType, hokmSuit, leadSuit);
                const sb = getCardStrength(b, gameType, hokmSuit, leadSuit);
                return sa - sb;
            });
            if (beatingCards.length > 0) return beatingCards[0];
            // Can't win, play lowest
            return validCards.sort((a, b) => a.sunOrder - b.sunOrder)[0];
        } else {
            // Can't follow suit
            if (gameType === 'hokm') {
                if (partnerWinning) {
                    // Partner winning, dump low non-trump
                    const nonTrump = validCards.filter(c => c.suitId !== hokmSuit);
                    if (nonTrump.length > 0) {
                        return nonTrump.sort((a, b) => a.sunOrder - b.sunOrder)[0];
                    }
                }
                // Try to trump in
                const trumpCards = validCards.filter(c => c.suitId === hokmSuit);
                if (trumpCards.length > 0) {
                    // Play lowest trump that wins
                    const winnerStr = getCardStrength(currentWinner.card, gameType, hokmSuit, leadSuit);
                    const winningTrumps = trumpCards.filter(c =>
                        getCardStrength(c, gameType, hokmSuit, leadSuit) > winnerStr
                    ).sort((a, b) => a.hokmOrder - b.hokmOrder);
                    if (winningTrumps.length > 0) return winningTrumps[0];
                }
            }
            // Play lowest value card
            return validCards.sort((a, b) => a.sunPoints - b.sunPoints)[0];
        }
    }

    /**
     * Decide whether to double
     */
    static decideDouble(game, teamIndex) {
        // Simple heuristic: don't double unless  significantly behind
        const myScore = game.scores[teamIndex];
        const oppScore = game.scores[1 - teamIndex];
        return oppScore - myScore >= 30;
    }
}
