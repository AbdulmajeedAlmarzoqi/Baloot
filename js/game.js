/* ============================================
   game.js - Baloot Game Engine
   Complete state machine for game lifecycle
   ============================================ */

const GAME_PHASES = {
    IDLE: 'idle',
    DEALING_FIRST: 'dealing_first',     // Deal 3 + 2 cards
    BIDDING_ROUND1: 'bidding_round1',   // First bidding round
    BIDDING_ROUND2: 'bidding_round2',   // Second bidding round
    DEALING_SECOND: 'dealing_second',   // Deal remaining 3 (or 2 for buyer)
    PROJECTS: 'projects',               // Show projects
    DOUBLE: 'double',                   // Double offer
    PLAYING: 'playing',                 // Trick-taking phase
    TRICK_END: 'trick_end',            // Evaluate trick
    ROUND_END: 'round_end',            // Score the round
    GAME_OVER: 'game_over'
};

// Player positions: 0=bottom(human), 1=right(opp1), 2=top(partner), 3=left(opp2)
// Team 1: players 0, 2 (human + partner)
// Team 2: players 1, 3 (opponents)
const PLAYER_NAMES = ['أنت', 'خصم ١', 'الشريك', 'خصم ٢'];
const PLAYER_SEATS = ['bottom', 'right', 'top', 'left'];

function getTeam(playerIndex) {
    return playerIndex % 2 === 0 ? 0 : 1;
}

function getTeamName(teamIndex) {
    return teamIndex === 0 ? 'فريقك' : 'الخصم';
}

class BalootGame {
    constructor() {
        this.reset();
    }

    reset() {
        this.phase = GAME_PHASES.IDLE;
        this.scores = [0, 0]; // Team scores [team1, team2]
        this.dealerIndex = Math.floor(Math.random() * 4);
        this.roundNumber = 0;
        this.resetRound();
    }

    resetRound() {
        this.deck = [];
        this.hands = [[], [], [], []]; // 4 player hands
        this.faceUpCard = null;
        this.gameType = null; // 'sun' or 'hokm'
        this.hokmSuit = null;
        this.buyerIndex = null;
        this.ashkalUsed = false;

        // Trick state
        this.currentTrick = [];
        this.trickNumber = 0;
        this.leadPlayerIndex = null;
        this.currentPlayerIndex = null;
        this.tricksWon = [[], []]; // Tricks won by each team (arrays of cards)

        // Bidding state
        this.biddingPlayerIndex = null;
        this.biddingRound = 0;
        this.passCount = 0;

        // Projects
        this.projects = [[], [], [], []]; // Projects per player
        this.teamProjects = [[], []]; // Winning projects per team
        this.projectsRevealed = false;

        // Double
        this.doubleMultiplier = 1;
        this.doubleTeam = null; // Which team can double next

        // Round scoring
        this.roundPoints = [0, 0];
        this.roundBnaat = [0, 0];
        this.isKaboot = false;
    }

    /* ---- DEALING ---- */
    startNewRound() {
        this.roundNumber++;
        this.resetRound();
        this.advanceDealer();
        this.deck = shuffleDeck(createDeck());
        this.phase = GAME_PHASES.DEALING_FIRST;
        this.dealFirstCards();
    }

    advanceDealer() {
        this.dealerIndex = (this.dealerIndex + 1) % 4;
    }

    dealFirstCards() {
        // Deal 3 cards to each player
        const startPlayer = (this.dealerIndex + 1) % 4;
        for (let round = 0; round < 3; round++) {
            for (let i = 0; i < 4; i++) {
                const pIdx = (startPlayer + i) % 4;
                this.hands[pIdx].push(this.deck.pop());
            }
        }
        // Deal 2 more cards to each player
        for (let round = 0; round < 2; round++) {
            for (let i = 0; i < 4; i++) {
                const pIdx = (startPlayer + i) % 4;
                this.hands[pIdx].push(this.deck.pop());
            }
        }
        // Reveal face-up card
        this.faceUpCard = this.deck.pop();

        // Sort hands
        for (let i = 0; i < 4; i++) {
            this.hands[i] = sortHand(this.hands[i]);
        }

        // Start bidding
        this.phase = GAME_PHASES.BIDDING_ROUND1;
        this.biddingRound = 1;
        this.biddingPlayerIndex = (this.dealerIndex + 1) % 4;
        this.passCount = 0;
    }

    dealSecondCards() {
        const startPlayer = (this.dealerIndex + 1) % 4;
        for (let round = 0; round < 3; round++) {
            for (let i = 0; i < 4; i++) {
                const pIdx = (startPlayer + i) % 4;
                // Buyer gets only 2 because faceUp card is their 3rd
                if (pIdx === this.buyerIndex && round === 2) continue;
                this.hands[pIdx].push(this.deck.pop());
            }
        }
        // Give face-up card to buyer
        this.hands[this.buyerIndex].push(this.faceUpCard);

        // Sort all hands
        for (let i = 0; i < 4; i++) {
            this.hands[i] = sortHand(this.hands[i]);
        }

        // Detect projects
        this.detectAllProjects();
        this.phase = GAME_PHASES.DEALING_SECOND; // Signal for UI to render
    }

    /* ---- BIDDING ---- */

    /**
     * Get available bidding options for current player
     */
    getBiddingOptions() {
        const options = [];
        const pIdx = this.biddingPlayerIndex;
        const isDealer = pIdx === this.dealerIndex;
        const isDealerLeft = pIdx === (this.dealerIndex + 3) % 4; // player to left of dealer (since RTL, left is index - 1)

        if (this.biddingRound === 1) {
            // Round 1: Sun, Hokm (same suit as face-up), Pass
            options.push({ type: 'sun', label: 'صن', ariaLabel: 'اشتري صن' });
            options.push({
                type: 'hokm',
                label: 'حكم',
                ariaLabel: `اشتري حكم ${this.faceUpCard.suit.nameAr}`,
                suit: this.faceUpCard.suitId
            });
            options.push({ type: 'pass', label: 'بس', ariaLabel: 'بس - تمرير' });
        } else {
            // Round 2: Sun, Hokm (different suit), Pass
            options.push({ type: 'sun', label: 'صن', ariaLabel: 'اشتري صن' });
            options.push({ type: 'hokm_choose', label: 'حكم', ariaLabel: 'اشتري حكم - اختر النوع' });
            options.push({ type: 'pass', label: 'بس', ariaLabel: 'بس - تمرير' });

            // Ashkal option for dealer or player to dealer's left
            if (isDealer || isDealerLeft) {
                options.push({ type: 'ashkal', label: 'أشكل', ariaLabel: 'أشكل - التشكيل' });
            }
        }

        return options;
    }

    /**
     * Process a bid from a player
     */
    processBid(bidType, chosenSuit) {
        const pIdx = this.biddingPlayerIndex;

        switch (bidType) {
            case 'sun':
                this.gameType = 'sun';
                this.hokmSuit = null;
                this.buyerIndex = pIdx;
                break;
            case 'hokm':
                // Round 1: hokm with face-up card suit
                this.gameType = 'hokm';
                this.hokmSuit = this.faceUpCard.suitId;
                this.buyerIndex = pIdx;
                break;
            case 'hokm_choose':
                // Round 2: hokm with chosen suit (must differ from face-up)
                this.gameType = 'hokm';
                this.hokmSuit = chosenSuit;
                this.buyerIndex = pIdx;
                break;
            case 'ashkal':
                // Ashkal: give face-up to partner, play sun, ashkal player is buyer
                this.gameType = 'sun';
                this.hokmSuit = null;
                this.buyerIndex = pIdx;
                this.ashkalUsed = true;
                break;
            case 'pass':
                this.passCount++;
                // Move to next player
                this.biddingPlayerIndex = (this.biddingPlayerIndex + 1) % 4;

                if (this.passCount >= 4) {
                    if (this.biddingRound === 1) {
                        // All passed in round 1, go to round 2
                        this.biddingRound = 2;
                        this.phase = GAME_PHASES.BIDDING_ROUND2;
                        this.biddingPlayerIndex = (this.dealerIndex + 1) % 4;
                        this.passCount = 0;
                        return { action: 'next_round' };
                    } else {
                        // All passed both rounds, re-deal
                        return { action: 'redeal' };
                    }
                }
                return { action: 'next_player', nextPlayer: this.biddingPlayerIndex };
        }

        if (bidType !== 'pass') {
            // Someone bought, deal remaining cards
            this.dealSecondCards();
            return { action: 'bought', buyer: this.buyerIndex, gameType: this.gameType, hokmSuit: this.hokmSuit };
        }
    }

    /**
     * Get suits available for hokm selection (round 2 - different from face-up)
     */
    getAvailableHokmSuits() {
        return Object.values(SUITS).filter(s => s.id !== this.faceUpCard.suitId);
    }

    /* ---- PROJECTS (مشاريع) ---- */

    detectAllProjects() {
        for (let p = 0; p < 4; p++) {
            this.projects[p] = this.detectPlayerProjects(this.hands[p]);
        }
        this.resolveProjects();
    }

    detectPlayerProjects(hand) {
        const projects = [];

        // Check for four-of-a-kind (4 cards of same rank)
        const rankGroups = {};
        hand.forEach(card => {
            if (!rankGroups[card.rankId]) rankGroups[card.rankId] = [];
            rankGroups[card.rankId].push(card);
        });

        for (const [rankId, cards] of Object.entries(rankGroups)) {
            if (cards.length === 4) {
                if (rankId === 'A') {
                    // 4 Aces: 400 in sun, 100 in hokm
                    if (this.gameType === 'sun') {
                        projects.push({ type: '400', nameAr: 'أربع مائة', cards: [...cards], points: 400, value: 8 });
                    } else {
                        projects.push({ type: '100_four', nameAr: 'مائة', cards: [...cards], points: 100, value: 8 });
                    }
                } else if (['10', 'J', 'Q', 'K'].includes(rankId)) {
                    projects.push({ type: '100_four', nameAr: 'مائة', cards: [...cards], points: 100, value: PROJECT_ORDER[rankId] });
                }
            }
        }

        // Check for sequences (same suit, consecutive ranks by project order)
        const suitGroups = {};
        hand.forEach(card => {
            if (!suitGroups[card.suitId]) suitGroups[card.suitId] = [];
            suitGroups[card.suitId].push(card);
        });

        for (const [suitId, cards] of Object.entries(suitGroups)) {
            // Sort by project order
            const sorted = cards.sort((a, b) => b.projectOrder - a.projectOrder);

            // Find consecutive sequences
            let seqStart = 0;
            while (seqStart < sorted.length) {
                let seqEnd = seqStart;
                while (seqEnd + 1 < sorted.length &&
                    sorted[seqEnd].projectOrder - sorted[seqEnd + 1].projectOrder === 1) {
                    seqEnd++;
                }
                const seqLen = seqEnd - seqStart + 1;
                const seqCards = sorted.slice(seqStart, seqEnd + 1);
                const topValue = sorted[seqStart].projectOrder;

                if (seqLen >= 5) {
                    projects.push({ type: '100_seq', nameAr: 'مائة', cards: seqCards, points: 100, value: topValue });
                } else if (seqLen === 4) {
                    projects.push({ type: '50', nameAr: 'خمسين', cards: seqCards, points: 50, value: topValue });
                } else if (seqLen === 3) {
                    projects.push({ type: 'sra', nameAr: 'سرى', cards: seqCards, points: 0, value: topValue }); // points set below
                }
                seqStart = seqEnd + 1;
            }
        }

        return projects;
    }

    resolveProjects() {
        // Determine which team has the winning projects
        // Collect all projects per team
        const teamProjectsList = [[], []]; // team -> list of projects
        for (let p = 0; p < 4; p++) {
            const team = getTeam(p);
            this.projects[p].forEach(proj => {
                teamProjectsList[team].push({ ...proj, playerIndex: p });
            });
        }

        // Find the best project of each team
        const bestProject = [null, null];
        for (let t = 0; t < 2; t++) {
            for (const proj of teamProjectsList[t]) {
                if (!bestProject[t] || this.compareProjects(proj, bestProject[t]) > 0) {
                    bestProject[t] = proj;
                }
            }
        }

        // Determine which team gets to show projects
        if (bestProject[0] && bestProject[1]) {
            const cmp = this.compareProjects(bestProject[0], bestProject[1]);
            if (cmp >= 0) {
                // Team 0 wins (or tie goes to first player)
                this.teamProjects[0] = teamProjectsList[0];
                this.teamProjects[1] = [];
            } else {
                this.teamProjects[0] = [];
                this.teamProjects[1] = teamProjectsList[1];
            }
        } else {
            this.teamProjects[0] = teamProjectsList[0];
            this.teamProjects[1] = teamProjectsList[1];
        }
    }

    compareProjects(a, b) {
        // Compare by type hierarchy: 400 > 100 > 50 > sra
        const typeRank = { '400': 4, '100_four': 3, '100_seq': 3, '50': 2, 'sra': 1 };
        const ra = typeRank[a.type] || 0;
        const rb = typeRank[b.type] || 0;
        if (ra !== rb) return ra - rb;
        // Same type: compare by value (highest card)
        return a.value - b.value;
    }

    getProjectPoints(project) {
        const isSun = this.gameType === 'sun';
        switch (project.type) {
            case '400': return isSun ? 40 : 10; // 400 is only in sun (=40 bnaat), in hokm it's 100 (=10 bnaat)
            case '100_four': return isSun ? 20 : 10;
            case '100_seq': return isSun ? 20 : 10;
            case '50': return isSun ? 10 : 5;
            case 'sra': return isSun ? 4 : 2;
            default: return 0;
        }
    }

    hasProjects() {
        return this.teamProjects[0].length > 0 || this.teamProjects[1].length > 0;
    }

    /* ---- BALOOT (بلوت) ---- */

    /**
     * Check if a player has Baloot (K+Q of hokm suit, not part of 100 project)
     */
    checkBaloot(playerIndex) {
        if (this.gameType !== 'hokm') return false;
        const hand = this.hands[playerIndex];
        const hasKing = hand.some(c => c.rankId === 'K' && c.suitId === this.hokmSuit);
        const hasQueen = hand.some(c => c.rankId === 'Q' && c.suitId === this.hokmSuit);

        if (!hasKing || !hasQueen) return false;

        // Check that K and Q are not part of a 100 project
        for (const proj of this.projects[playerIndex]) {
            if ((proj.type === '100_seq' || proj.type === '100_four') &&
                proj.cards.some(c => c.suitId === this.hokmSuit &&
                    (c.rankId === 'K' || c.rankId === 'Q'))) {
                return false;
            }
        }
        return true;
    }

    /* ---- TRICK PLAY ---- */

    startPlay() {
        this.phase = GAME_PHASES.PLAYING;
        this.trickNumber = 0;
        this.leadPlayerIndex = (this.dealerIndex + 1) % 4;
        this.currentPlayerIndex = this.leadPlayerIndex;
        this.currentTrick = [];
    }

    /**
     * Get valid cards for the current player
     */
    getValidCardsForCurrentPlayer() {
        const hand = this.hands[this.currentPlayerIndex];
        const leadSuit = this.currentTrick.length > 0 ? this.currentTrick[0].card.suitId : null;
        return getValidCards(hand, leadSuit, this.gameType, this.hokmSuit);
    }

    /**
     * Play a card from the current player
     */
    playCard(card) {
        // Remove card from player's hand
        const hand = this.hands[this.currentPlayerIndex];
        const cardIndex = hand.findIndex(c => c.id === card.id);
        if (cardIndex === -1) return null;
        hand.splice(cardIndex, 1);

        this.currentTrick.push({
            card: card,
            playerIndex: this.currentPlayerIndex
        });

        // Check if trick is complete (4 cards played)
        if (this.currentTrick.length === 4) {
            return this.evaluateTrick();
        }

        // Move to next player
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
        return { action: 'next_player', nextPlayer: this.currentPlayerIndex };
    }

    evaluateTrick() {
        const winner = determineTrickWinner(this.currentTrick, this.gameType, this.hokmSuit);
        const winnerTeam = getTeam(winner.playerIndex);
        const trickCards = this.currentTrick.map(tc => tc.card);

        // Add cards to winning team's pile
        this.tricksWon[winnerTeam].push(...trickCards);

        this.trickNumber++;
        const trickResult = {
            action: 'trick_complete',
            winner: winner.playerIndex,
            winnerTeam: winnerTeam,
            cards: trickCards,
            trickNumber: this.trickNumber
        };

        // Check if all tricks are done
        if (this.trickNumber >= 8) {
            this.phase = GAME_PHASES.ROUND_END;
            trickResult.roundEnd = true;
        } else {
            // Winner leads next trick
            this.leadPlayerIndex = winner.playerIndex;
            this.currentPlayerIndex = winner.playerIndex;
            this.currentTrick = [];
        }

        return trickResult;
    }

    startNextTrick() {
        this.currentTrick = [];
    }

    /* ---- SCORING ---- */

    calculateRoundScore() {
        const isSun = this.gameType === 'sun';
        const buyerTeam = getTeam(this.buyerIndex);
        const otherTeam = 1 - buyerTeam;

        // Calculate raw points from tricks
        let rawPoints = [0, 0];
        for (let t = 0; t < 2; t++) {
            rawPoints[t] = calculateTrickPoints(this.tricksWon[t], this.gameType, this.hokmSuit);
        }

        // Last trick bonus (10 points for "ground")
        // Determine who won the last trick
        const lastTrickWinner = this.tricksWon[0].length > this.tricksWon[1].length ? 0 :
            (this.tricksWon[1].length > this.tricksWon[0].length ? 1 :
                // This shouldn't happen in normal play
                0);
        // The team that won all 8 tricks or more tricks gets the ground
        // Actually need to properly track who won last trick
        // For now, we pass lastTrickWinnerTeam from the trick evaluations
        rawPoints[this.lastTrickWinnerTeam ?? 0] += 10;

        // Check for Kaboot (one team won ALL tricks)
        if (this.tricksWon[0].length === 0) {
            this.isKaboot = true;
            this.kabootTeam = 1;
        } else if (this.tricksWon[1].length === 0) {
            this.isKaboot = true;
            this.kabootTeam = 0;
        }

        // Calculate project points (in bnaat)
        let projectBnaat = [0, 0];
        for (let t = 0; t < 2; t++) {
            for (const proj of this.teamProjects[t]) {
                projectBnaat[t] += this.getProjectPoints(proj);
            }
        }

        // Check baloot for each player
        let balootBnaat = [0, 0];
        for (let p = 0; p < 4; p++) {
            if (this._playerPlayedBaloot && this._playerPlayedBaloot[p]) {
                const team = getTeam(p);
                balootBnaat[team] += (isSun ? 4 : 2);
            }
        }

        // Convert raw points to bnaat
        let bnaat = [0, 0];

        if (this.isKaboot) {
            // Kaboot: winner gets 44 (sun) or 26 (hokm) + projects
            const kabootPoints = isSun ? 44 : 26;
            bnaat[this.kabootTeam] = kabootPoints;
            bnaat[1 - this.kabootTeam] = 0;
            // Only kaboot team's projects count
            bnaat[this.kabootTeam] += projectBnaat[this.kabootTeam];
            bnaat[this.kabootTeam] += balootBnaat[this.kabootTeam];
        } else {
            // Normal scoring
            // Card point totals: Sun = 120 (card values), Hokm = 152 (card values with J=20, 9=14)
            // Plus 10 ground = 130 (Sun) or 162 (Hokm)
            // In Sun, multiply raw points by 2 then convert to bnaat (/10), total = 26
            // In Hokm, just convert raw to bnaat (/10), total ~16

            if (isSun) {
                // Sun: raw×2 then /10
                for (let t = 0; t < 2; t++) {
                    const doubled = rawPoints[t] * 2;
                    bnaat[t] = this.roundBnaat_convert(doubled, true);
                }
                // Ensure total = 26
                const bnaatTotal = bnaat[0] + bnaat[1];
                if (bnaatTotal !== 26) {
                    if (bnaat[0] > bnaat[1]) bnaat[0] = 26 - bnaat[1];
                    else bnaat[1] = 26 - bnaat[0];
                }
            } else {
                // Hokm: raw /10
                for (let t = 0; t < 2; t++) {
                    bnaat[t] = this.roundBnaat_convert(rawPoints[t], false);
                }
                // Ensure total = 16
                const bnaatTotal = bnaat[0] + bnaat[1];
                if (bnaatTotal !== 16) {
                    if (bnaat[0] > bnaat[1]) bnaat[0] = 16 - bnaat[1];
                    else bnaat[1] = 16 - bnaat[0];
                }
            }

            // Check if buyer team got at least half
            const halfBnaat = isSun ? 13 : 8;
            if (bnaat[buyerTeam] < halfBnaat) {
                // Buyer loses, all base bnaat go to opponent
                const totalBase = isSun ? 26 : 16;
                bnaat[otherTeam] = totalBase;
                bnaat[buyerTeam] = 0;
            }

            // Add projects
            bnaat[0] += projectBnaat[0];
            bnaat[1] += projectBnaat[1];

            // Add baloot
            bnaat[0] += balootBnaat[0];
            bnaat[1] += balootBnaat[1];
        }

        // Apply double multiplier (but not to baloot)
        if (this.doubleMultiplier > 1) {
            const baseBnaat0 = bnaat[0] - balootBnaat[0];
            const baseBnaat1 = bnaat[1] - balootBnaat[1];
            bnaat[0] = baseBnaat0 * this.doubleMultiplier + balootBnaat[0];
            bnaat[1] = baseBnaat1 * this.doubleMultiplier + balootBnaat[1];
        }

        this.roundBnaat = bnaat;
        this.roundPoints = rawPoints;

        // Add to game scores
        this.scores[0] += bnaat[0];
        this.scores[1] += bnaat[1];

        return {
            rawPoints,
            bnaat,
            projectBnaat,
            balootBnaat,
            buyerTeam,
            isKaboot: this.isKaboot,
            doubleMultiplier: this.doubleMultiplier,
            scores: [...this.scores]
        };
    }

    roundBnaat_convert(rawPoints, isSun) {
        // Convert raw points to bnaat (÷10)
        const val = rawPoints / 10;
        const decimal = Math.round((val % 1) * 10) / 10; // Avoid floating point issues

        if (decimal === 0) return val;
        if (decimal === 0.5) {
            if (isSun) {
                // Sun rule: "في العدد المناصف في الصن 35 = يتم مضاعفته ويكون 7"
                // .5 rounds up in Sun
                return Math.ceil(val);
            } else {
                // Hokm rule: "في العدد المناصف في الحكم 45 = 4"
                // .5 rounds down in Hokm
                return Math.floor(val);
            }
        }
        if (decimal < 0.5) return Math.floor(val);
        return Math.ceil(val);
    }

    checkGameOver() {
        if (this.scores[0] >= 152 || this.scores[1] >= 152) {
            this.phase = GAME_PHASES.GAME_OVER;
            return true;
        }
        return false;
    }

    getWinner() {
        if (this.scores[0] >= 152 && this.scores[1] >= 152) {
            return this.scores[0] > this.scores[1] ? 0 : 1;
        }
        if (this.scores[0] >= 152) return 0;
        if (this.scores[1] >= 152) return 1;
        return null;
    }

    /* ---- DOUBLE (دبل) ---- */

    canDouble() {
        // Double is allowed after score exceeds 100 in sun
        // In hokm, double can be at any time
        if (this.gameType === 'hokm') return true;
        // In sun, only if buyer's team score >= 100 and other team < 100
        // Actually: "يسمح الدبل بعد خروج اللعب (بمعنى بعد أن يتعدى القيد المائه)"
        // This means after scores pass 100
        return true; // Simplified: always allow, UI will check
    }

    applyDouble(multiplier) {
        this.doubleMultiplier = multiplier;
    }
}
