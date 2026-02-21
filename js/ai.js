/* ============================================
   ai.js - Professional Baloot AI
   Card-tracking, memory-based, strategic AI
   that knows every card played and remaining.
   ============================================ */

class BalootAI {

    // ─────────────── CARD MEMORY ───────────────
    // Track all cards played, who played them, and which cards remain

    static _memory = {
        playedCards: [],         // All cards played this round [{card, playerIndex}]
        playerVoids: [           // Suits each player is known to be void in
            new Set(), new Set(), new Set(), new Set()
        ],
        trumpsPlayed: 0,        // How many trump cards have been played
        totalTrumps: 8,         // Total trump cards in deck (per suit)
        tricksWonBy: [0, 0],    // Number of tricks won [team0, team1]
        pointsWonBy: [0, 0],    // Raw points won [team0, team1]
    };

    static resetMemory() {
        this._memory = {
            playedCards: [],
            playerVoids: [new Set(), new Set(), new Set(), new Set()],
            trumpsPlayed: 0,
            totalTrumps: 8,
            tricksWonBy: [0, 0],
            pointsWonBy: [0, 0],
        };
    }

    /**
     * Called after every card is played to update AI memory
     */
    static recordCardPlayed(card, playerIndex, trick, gameType, hokmSuit) {
        this._memory.playedCards.push({ card, playerIndex });

        // Track trump usage
        if (gameType === 'hokm' && card.suitId === hokmSuit) {
            this._memory.trumpsPlayed++;
        }

        // If player didn't follow the lead suit, they are void in that suit
        if (trick.length > 0) {
            const leadSuit = trick[0].card.suitId;
            if (card.suitId !== leadSuit) {
                this._memory.playerVoids[playerIndex].add(leadSuit);
            }
        }
    }

    /**
     * Called after each trick ends
     */
    static recordTrickResult(winnerTeam, trickPoints) {
        this._memory.tricksWonBy[winnerTeam]++;
        this._memory.pointsWonBy[winnerTeam] += trickPoints;
    }

    /**
     * Get all cards of a suit that have NOT been played yet
     */
    static getRemainingCardsInSuit(suitId, hand) {
        const allInSuit = Object.keys(RANKS).map(r => `${r}_${suitId}`);
        const myCardIds = hand.map(c => c.id);
        const playedIds = this._memory.playedCards.map(pc => pc.card.id);
        return allInSuit.filter(id => !playedIds.includes(id) && !myCardIds.includes(id));
    }

    /**
     * Count how many trumps remain in opponents' hands
     */
    static getOpponentTrumpsRemaining(hand, hokmSuit) {
        if (!hokmSuit) return 0;
        const myTrumps = hand.filter(c => c.suitId === hokmSuit).length;
        return this._memory.totalTrumps - this._memory.trumpsPlayed - myTrumps;
    }

    /**
     * Check if a specific card is the highest remaining in its suit
     */
    static isHighestRemaining(card, hand, gameType, hokmSuit) {
        const remaining = this.getRemainingCardsInSuit(card.suitId, hand);
        const leadSuit = card.suitId;
        const myStrength = getCardStrength(card, gameType, hokmSuit, leadSuit);

        for (const cardId of remaining) {
            const [rankId, suitId] = cardId.split('_');
            const tempCard = { rankId, suitId };
            const str = getCardStrength(tempCard, gameType, hokmSuit, leadSuit);
            if (str > myStrength) return false;
        }
        return true;
    }

    /**
     * Check if an opponent is void in a suit
     */
    static isOpponentVoid(opponentIndex, suitId) {
        return this._memory.playerVoids[opponentIndex].has(suitId);
    }

    // ─────────────── BIDDING ───────────────

    static decideBid(game, playerIndex) {
        const hand = game.hands[playerIndex];
        const faceUpSuit = game.faceUpCard.suitId;
        const options = game.getBiddingOptions();

        const hokmStrength = this.evaluateHokmHand(hand, faceUpSuit);
        const sunStrength = this.evaluateSunHand(hand);

        if (game.biddingRound === 1) {
            if (sunStrength >= 32) return { type: 'sun' };
            if (hokmStrength >= 38) return { type: 'hokm', suit: faceUpSuit };
            return { type: 'pass' };
        } else {
            if (sunStrength >= 28) return { type: 'sun' };

            // Find the best alternative hokm suit
            let bestSuit = null;
            let bestStr = 0;
            for (const suit of Object.keys(SUITS)) {
                if (suit === faceUpSuit) continue;
                const s = this.evaluateHokmHand(hand, suit);
                if (s > bestStr) { bestStr = s; bestSuit = suit; }
            }
            if (bestStr >= 32 && bestSuit) {
                return { type: 'hokm_choose', suit: bestSuit };
            }

            if (options.some(o => o.type === 'ashkal') && sunStrength >= 25) {
                return { type: 'ashkal' };
            }

            return { type: 'pass' };
        }
    }

    static evaluateHokmHand(hand, trumpSuit) {
        let score = 0;
        const trumps = hand.filter(c => c.suitId === trumpSuit);
        const nonTrumps = hand.filter(c => c.suitId !== trumpSuit);

        // Trump card points (J=20, 9=14, A=11, 10=10, K=4, Q=3)
        for (const c of trumps) score += c.hokmPoints;

        // Long trump bonus
        if (trumps.length >= 5) score += 15;
        else if (trumps.length >= 4) score += 10;
        else if (trumps.length >= 3) score += 5;

        // Non-trump evaluation
        const suitGroups = {};
        for (const c of nonTrumps) {
            if (!suitGroups[c.suitId]) suitGroups[c.suitId] = [];
            suitGroups[c.suitId].push(c);
        }

        for (const [suit, cards] of Object.entries(suitGroups)) {
            const hasAce = cards.some(c => c.rankId === 'A');
            const hasTen = cards.some(c => c.rankId === '10');
            if (hasAce) score += 11; // Ace is a guaranteed trick
            if (hasTen && !hasAce) score += 3; // 10 without Ace is risky
            if (hasTen && hasAce) score += 8; // A+10 combo is strong
            // Being short (1-2 cards) in a side suit = can trump in
            if (cards.length <= 1) score += 4;
        }

        // Void in a side suit = huge advantage
        const nonTrumpSuits = Object.keys(SUITS).filter(s => s !== trumpSuit);
        for (const suit of nonTrumpSuits) {
            if (!hand.some(c => c.suitId === suit)) score += 8;
        }

        return score;
    }

    static evaluateSunHand(hand) {
        let score = 0;
        const suitGroups = {};

        for (const c of hand) {
            score += c.sunPoints; // A=11, 10=10, K=4, Q=3, J=2
            if (!suitGroups[c.suitId]) suitGroups[c.suitId] = [];
            suitGroups[c.suitId].push(c);
        }

        // Long suit bonus
        for (const [suit, cards] of Object.entries(suitGroups)) {
            if (cards.length >= 5) score += 15;
            else if (cards.length >= 4) score += 10;
            else if (cards.length >= 3) score += 5;

            // A+10 in same suit is very strong in Sun
            const hasAce = cards.some(c => c.rankId === 'A');
            const hasTen = cards.some(c => c.rankId === '10');
            if (hasAce && hasTen) score += 5;
        }

        return score;
    }

    // ─────────────── CARD PLAY ───────────────

    static chooseCard(game, playerIndex) {
        const hand = game.hands[playerIndex];
        const validCards = game.getValidCardsForCurrentPlayer();
        const trick = game.currentTrick;
        const isLeading = trick.length === 0;

        if (validCards.length === 1) return validCards[0];

        if (isLeading) {
            return this.chooseLeadCard(validCards, hand, game, playerIndex);
        } else {
            return this.chooseFollowCard(validCards, hand, game, playerIndex);
        }
    }

    // ─── LEADING ───

    static chooseLeadCard(validCards, hand, game, playerIndex) {
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;
        const partner = (playerIndex + 2) % 4;
        const opp1 = (playerIndex + 1) % 4;
        const opp3 = (playerIndex + 3) % 4;

        if (gameType === 'sun') {
            return this._leadSun(validCards, hand, game, playerIndex);
        } else {
            return this._leadHokm(validCards, hand, game, playerIndex);
        }
    }

    static _leadSun(validCards, hand, game, playerIndex) {
        // 1. Play guaranteed winners (cards that are highest remaining in their suit)
        const guaranteedWinners = validCards.filter(c => this.isHighestRemaining(c, hand, 'sun', null));
        if (guaranteedWinners.length > 0) {
            // Among guaranteed winners, play the one worth the most points
            return guaranteedWinners.sort((a, b) => b.sunPoints - a.sunPoints)[0];
        }

        // 2. Play Aces (nearly always winners)
        const aces = validCards.filter(c => c.rankId === 'A');
        if (aces.length > 0) return aces[0];

        // 3. Lead from the longest suit to exhaust opponents
        const suitCounts = {};
        validCards.forEach(c => suitCounts[c.suitId] = (suitCounts[c.suitId] || 0) + 1);
        const longestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0][0];

        // Within the longest suit, play the highest card
        const suitCards = validCards.filter(c => c.suitId === longestSuit);
        return suitCards.sort((a, b) => b.sunOrder - a.sunOrder)[0];
    }

    static _leadHokm(validCards, hand, game, playerIndex) {
        const hokmSuit = game.hokmSuit;
        const trumpCards = validCards.filter(c => c.suitId === hokmSuit);
        const nonTrumpCards = validCards.filter(c => c.suitId !== hokmSuit);
        const opp1 = (playerIndex + 1) % 4;
        const opp3 = (playerIndex + 3) % 4;
        const opponentTrumpsLeft = this.getOpponentTrumpsRemaining(hand, hokmSuit);

        // 1. Lead guaranteed non-trump winners (Aces that are highest remaining)
        const nonTrumpWinners = nonTrumpCards.filter(c => this.isHighestRemaining(c, hand, 'hokm', hokmSuit));
        if (nonTrumpWinners.length > 0) {
            // Play winner worth the most points
            return nonTrumpWinners.sort((a, b) => b.sunPoints - a.sunPoints)[0];
        }

        // 2. If we have strong trumps and opponents still have trumps, draw them out
        if (trumpCards.length > 0 && opponentTrumpsLeft > 0) {
            const highTrumps = trumpCards.filter(c => ['J', '9', 'A'].includes(c.rankId));
            if (highTrumps.length > 0) {
                return highTrumps.sort((a, b) => b.hokmOrder - a.hokmOrder)[0];
            }
        }

        // 3. Lead from a short non-trump suit (to eventually be void and cut)
        if (nonTrumpCards.length > 0) {
            const suitCounts = {};
            nonTrumpCards.forEach(c => suitCounts[c.suitId] = (suitCounts[c.suitId] || 0) + 1);

            // Prefer suits where an opponent is void (they can't follow, we can win)
            // Unless they can trump... 
            const shortestSuit = Object.entries(suitCounts).sort((a, b) => a[1] - b[1])[0][0];
            const suitCards = nonTrumpCards.filter(c => c.suitId === shortestSuit);

            // Play lowest from shortest suit
            return suitCards.sort((a, b) => a.sunOrder - b.sunOrder)[0];
        }

        // 4. Only trumps left - play lowest
        return trumpCards.sort((a, b) => a.hokmOrder - b.hokmOrder)[0];
    }

    // ─── FOLLOWING ───

    static chooseFollowCard(validCards, hand, game, playerIndex) {
        const trick = game.currentTrick;
        const leadSuit = trick[0].card.suitId;
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;
        const partner = (playerIndex + 2) % 4;

        const currentWinner = determineTrickWinner([...trick], gameType, hokmSuit);
        const partnerWinning = currentWinner.playerIndex === partner;
        const isLastPlayer = trick.length === 3;
        const isSecondPlayer = trick.length === 1;
        const followingSuit = validCards.every(c => c.suitId === leadSuit) ||
            (validCards.length > 0 && validCards[0].suitId === leadSuit);

        // Calculate the total points at stake in this trick
        const trickPoints = trick.reduce((sum, tc) => sum + getCardPoints(tc.card, gameType, hokmSuit), 0);

        if (followingSuit && validCards[0].suitId === leadSuit) {
            return this._followSuit(validCards, hand, game, playerIndex, currentWinner, partnerWinning, isLastPlayer, trickPoints);
        } else {
            return this._cantFollowSuit(validCards, hand, game, playerIndex, currentWinner, partnerWinning, isLastPlayer, trickPoints);
        }
    }

    static _followSuit(validCards, hand, game, playerIndex, currentWinner, partnerWinning, isLastPlayer, trickPoints) {
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;
        const leadSuit = game.currentTrick[0].card.suitId;

        const winnerStrength = getCardStrength(currentWinner.card, gameType, hokmSuit, leadSuit);
        const beatingCards = validCards
            .filter(c => getCardStrength(c, gameType, hokmSuit, leadSuit) > winnerStrength)
            .sort((a, b) => getCardStrength(a, gameType, hokmSuit, leadSuit) - getCardStrength(b, gameType, hokmSuit, leadSuit));

        if (partnerWinning) {
            if (isLastPlayer) {
                // Partner is winning and we are last. Support with high-value cards (التدعيم)
                // Give 10 if we have it (worth a lot of points)
                const tens = validCards.filter(c => c.rankId === '10');
                if (tens.length > 0) return tens[0];
                // Otherwise play highest value card that won't take the trick from partner
                return validCards.sort((a, b) => b.sunPoints - a.sunPoints)[0];
            }
            // Partner winning but more players after us. Play lowest to protect partner's lead
            return validCards.sort((a, b) => a.sunOrder - b.sunOrder)[0];
        }

        // Opponent winning
        if (beatingCards.length > 0) {
            if (isLastPlayer) {
                // We are last: play the cheapest card that wins
                return beatingCards[0];
            }
            // Not last: consider if next player can overtake us
            // Play the cheapest winning card
            return beatingCards[0];
        }

        // Can't beat the winner. Throw the least valuable card
        return validCards.sort((a, b) => a.sunPoints - b.sunPoints)[0];
    }

    static _cantFollowSuit(validCards, hand, game, playerIndex, currentWinner, partnerWinning, isLastPlayer, trickPoints) {
        const gameType = game.gameType;
        const hokmSuit = game.hokmSuit;
        const leadSuit = game.currentTrick[0].card.suitId;

        if (gameType === 'hokm') {
            const trumpCards = validCards.filter(c => c.suitId === hokmSuit);
            const nonTrump = validCards.filter(c => c.suitId !== hokmSuit);

            if (partnerWinning) {
                // Partner is winning. Don't waste trump unless forced.
                if (nonTrump.length > 0) {
                    if (isLastPlayer) {
                        // Support partner: throw a 10 to add points
                        const tens = nonTrump.filter(c => c.rankId === '10');
                        if (tens.length > 0) return tens[0];
                    }
                    // Discard lowest non-trump (no points wasted)
                    return nonTrump.sort((a, b) => a.sunPoints - b.sunPoints)[0];
                }
                // Only trumps. validCards may already enforce rules. Play lowest.
                return validCards.sort((a, b) => a.hokmOrder - b.hokmOrder)[0];
            }

            // Opponent winning
            // validCards already enforces forced trumping / overtrumping from cards.js
            if (trumpCards.length > 0) {
                const winnerStr = getCardStrength(currentWinner.card, gameType, hokmSuit, leadSuit);
                const winningTrumps = trumpCards
                    .filter(c => getCardStrength(c, gameType, hokmSuit, leadSuit) > winnerStr)
                    .sort((a, b) => a.hokmOrder - b.hokmOrder);

                if (winningTrumps.length > 0) {
                    // Smart trump play: if trick has many points, use cheapest winning trump
                    return winningTrumps[0];
                }
            }

            // Can't win. Discard lowest value
            if (nonTrump.length > 0) {
                return nonTrump.sort((a, b) => a.sunPoints - b.sunPoints)[0];
            }
            return validCards.sort((a, b) => a.sunPoints - b.sunPoints)[0];
        }

        // Sun (no trumping, just discard)
        // Throw the card with least value
        return validCards.sort((a, b) => a.sunPoints - b.sunPoints)[0];
    }

    // ─────────────── DOUBLING ───────────────

    static decideDouble(game, teamIndex) {
        const myScore = game.scores[teamIndex];
        const oppScore = game.scores[1 - teamIndex];
        // Double when significantly behind
        if (oppScore - myScore >= 30) return true;
        // Also double if we are very confident (buyer with strong hand)
        return false;
    }
}
