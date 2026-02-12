/* ============================================
   app.js - Application Controller
   Wires game engine, AI, UI, and accessibility
   Enhanced with keyboard shortcuts and mobile support
   ============================================ */

class BalootApp {
    constructor() {
        this.game = new BalootGame();
        this.a11y = new AccessibilityManager();
        this.ui = new GameUI(this.a11y);
        this.aiDelay = 800;

        this.setupCallbacks();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.setupMobileToolbar();
        this.ui.showWelcome();
    }

    setupCallbacks() {
        this.ui.onCardPlayed = (card) => this.humanPlayCard(card);
        this.ui.onBid = (option) => this.humanBid(option);
        this.ui.onSuitChosen = (suitId) => this.humanChooseSuit(suitId);
        this.ui.onDoubleDecision = (multiplier) => this.handleDoubleDecision(multiplier);
    }

    setupEventListeners() {
        document.getElementById('btn-new-game').addEventListener('click', () => this.startGame());
        document.getElementById('btn-close-projects').addEventListener('click', () => {
            this.ui.hidePanel(this.ui.projectsPanel);
            this.startPlayPhase();
        });
        document.getElementById('btn-next-round').addEventListener('click', () => {
            this.ui.hidePanel(this.ui.roundResultPanel);
            this.startNewRound();
        });
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.ui.hidePanel(this.ui.gameOverPanel);
            this.startGame();
        });
        document.getElementById('btn-close-shortcuts').addEventListener('click', () => {
            this.ui.hideShortcutsPanel();
            this.a11y.focusHand();
        });
    }

    /* ======== KEYBOARD SHORTCUTS (Alt + Key per WCAG SC 2.1.4) ======== */

    setupKeyboardShortcuts() {
        const sm = this.a11y.shortcuts;

        // Alt+H → Focus player hand
        sm.register('h', 'alt', () => {
            this.a11y.focusHand();
        }, 'الانتقال لأوراقك');

        // Alt+L → Focus game log
        sm.register('l', 'alt', () => {
            this.a11y.focusLog();
        }, 'سجل اللعبة');

        // Alt+S → Announce current score
        sm.register('s', 'alt', () => {
            this.a11y.announceScore(this.game.scores);
        }, 'سماع النتيجة');

        // Alt+G → Announce game type
        sm.register('g', 'alt', () => {
            const hokmName = this.game.hokmSuit ? SUITS[this.game.hokmSuit].nameAr : '';
            this.a11y.announceGameStatus(this.game.gameType, hokmName);
        }, 'نوع اللعب');

        // Alt+T → Announce table cards
        sm.register('t', 'alt', () => {
            this.a11y.announceTableCards(this.game.currentTrick);
        }, 'أوراق الطاولة');

        // Alt+K → Toggle shortcuts help panel
        sm.register('k', 'alt', () => {
            this.ui.toggleShortcutsPanel();
        }, 'لوحة الاختصارات');
    }

    /* ======== MOBILE TOOLBAR ======== */

    setupMobileToolbar() {
        const toolbar = document.getElementById('mobile-toolbar');
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.mobile-btn');
            if (!btn) return;

            const action = btn.dataset.action;
            switch (action) {
                case 'hand':
                    this.a11y.focusHand();
                    break;
                case 'log':
                    this.a11y.focusLog();
                    break;
                case 'score':
                    this.a11y.announceScore(this.game.scores);
                    break;
                case 'game':
                    const hName = this.game.hokmSuit ? SUITS[this.game.hokmSuit].nameAr : '';
                    this.a11y.announceGameStatus(this.game.gameType, hName);
                    break;
                case 'table':
                    this.a11y.announceTableCards(this.game.currentTrick);
                    break;
                case 'help':
                    this.ui.toggleShortcutsPanel();
                    break;
            }
        });
    }

    /* ======== GAME FLOW ======== */

    startGame() {
        this.game.reset();
        this.ui.showGameTable();
        this.ui.updateScores([0, 0]);
        this.a11y.announceAndLog('بدأت لعبة جديدة!');
        this.startNewRound();
    }

    async startNewRound() {
        this.ui.hideAllPanels();
        this.ui.removeGameTypeBadge();
        this.ui.clearPlayedCards();
        this.game.startNewRound();

        this.a11y.announceDealing();

        for (let p = 1; p <= 3; p++) {
            this.ui.renderCardBacks(p, 5);
        }

        await this.delay(500);
        this.ui.showFaceUpCard(this.game.faceUpCard);
        this.a11y.announceFaceUpCard(this.game.faceUpCard);

        this.ui.renderHand(this.game.hands[0], null, false);
        this.a11y.announceAndLog(`أوراقك: ${this.a11y.describeHand(this.game.hands[0])}`);

        await this.delay(800);
        this.processBidding();
    }

    /* ======== BIDDING ======== */

    async processBidding() {
        const pIdx = this.game.biddingPlayerIndex;

        if (pIdx === 0) {
            const options = this.game.getBiddingOptions();
            this.ui.showBiddingPanel(options, PLAYER_NAMES[0], this.game.faceUpCard);
            this.a11y.announce('دورك للشراء. اختر صن أو حكم أو بس.');
        } else {
            this.ui.showActiveTurn(pIdx);
            await this.delay(this.aiDelay);

            const bid = BalootAI.decideBid(this.game, pIdx);
            this.processActualBid(pIdx, bid.type, bid.suit);
        }
    }

    humanBid(option) {
        this.ui.hidePanel(this.ui.biddingPanel);

        if (option.type === 'hokm_choose') {
            const suits = this.game.getAvailableHokmSuits();
            this.ui.showHokmSuitPanel(suits);
            return;
        }

        this.processActualBid(0, option.type, option.suit);
    }

    humanChooseSuit(suitId) {
        this.processActualBid(0, 'hokm_choose', suitId);
    }

    async processActualBid(playerIndex, bidType, suit) {
        const suitName = suit ? SUITS[suit].nameAr : '';
        this.a11y.announceBid(PLAYER_NAMES[playerIndex], bidType, suitName);

        const result = this.game.processBid(bidType, suit);

        if (!result) return;

        switch (result.action) {
            case 'next_player':
                await this.delay(300);
                this.processBidding();
                break;

            case 'next_round':
                this.a11y.announceAndLog('الدورة الثانية من الشراء');
                await this.delay(500);
                this.processBidding();
                break;

            case 'redeal':
                this.a11y.announceAndLog('لم يشتر أحد. إعادة التوزيع.');
                await this.delay(1000);
                this.startNewRound();
                break;

            case 'bought':
                this.ui.hideFaceUpCard();
                this.ui.clearActiveTurn();

                const hokmName = this.game.hokmSuit ? SUITS[this.game.hokmSuit].nameAr : '';
                this.a11y.announceGameType(this.game.gameType, hokmName);
                this.ui.showGameTypeBadge(this.game.gameType, hokmName);

                for (let p = 1; p <= 3; p++) {
                    this.ui.renderCardBacks(p, this.game.hands[p].length);
                }

                this.ui.renderHand(this.game.hands[0], null, false);

                await this.delay(500);
                this.a11y.announceAndLog(`أوراقك: ${this.a11y.describeHand(this.game.hands[0])}`);

                await this.delay(800);
                this.showProjects();
                break;
        }
    }

    /* ======== PROJECTS ======== */

    showProjects() {
        if (this.game.hasProjects()) {
            for (let t = 0; t < 2; t++) {
                const teamName = getTeamName(t);
                for (const proj of this.game.teamProjects[t]) {
                    const points = this.game.getProjectPoints(proj);
                    this.a11y.announceProject(teamName, proj.nameAr, proj.cards, points);
                }
            }

            this.ui.showProjectsPanel(this.game.teamProjects, getTeamName);
        } else {
            this.a11y.announceAndLog('لا توجد مشاريع');
            this.startPlayPhase();
        }
    }

    /* ======== TRICK PLAY ======== */

    startPlayPhase() {
        this.game.startPlay();
        this.game._playerPlayedBaloot = {};
        this.processTurn();
    }

    async processTurn() {
        const pIdx = this.game.currentPlayerIndex;
        this.ui.showActiveTurn(pIdx);

        if (pIdx === 0) {
            const validCards = this.game.getValidCardsForCurrentPlayer();
            const validIds = validCards.map(c => c.id);
            this.ui.renderHand(this.game.hands[0], validIds, true);
            this.a11y.announceTurn(PLAYER_NAMES[0], true);
        } else {
            this.a11y.announceTurn(PLAYER_NAMES[pIdx], false);
            await this.delay(this.aiDelay);

            const card = BalootAI.chooseCard(this.game, pIdx);
            this.processCardPlay(pIdx, card);
        }
    }

    humanPlayCard(card) {
        const validCards = this.game.getValidCardsForCurrentPlayer();
        if (!validCards.find(c => c.id === card.id)) {
            this.a11y.announce('لا يمكنك لعب هذه الورقة');
            return;
        }

        this.processCardPlay(0, card);
    }

    async processCardPlay(playerIndex, card) {
        // Baloot tracking
        if (this.game.gameType === 'hokm' && card.suitId === this.game.hokmSuit) {
            if ((card.rankId === 'K' || card.rankId === 'Q') && this.game.checkBaloot(playerIndex)) {
                if (!this.game._playerPlayedBaloot) this.game._playerPlayedBaloot = {};
                if (this.game._balootTracking && this.game._balootTracking[playerIndex]) {
                    this.game._playerPlayedBaloot[playerIndex] = true;
                    this.a11y.announceAndLog(`${PLAYER_NAMES[playerIndex]} أعلن بلوت!`);
                } else {
                    if (!this.game._balootTracking) this.game._balootTracking = {};
                    this.game._balootTracking[playerIndex] = card.rankId;
                }
            }
        }

        this.a11y.announceCardPlayed(PLAYER_NAMES[playerIndex], card, playerIndex === 0);

        const seat = PLAYER_SEATS[playerIndex];
        this.ui.showPlayedCard(card, seat);

        if (playerIndex !== 0) {
            this.ui.renderCardBacks(playerIndex, this.game.hands[playerIndex].length - 1);
        }

        const result = this.game.playCard(card);

        if (!result) return;

        if (result.action === 'next_player') {
            if (playerIndex === 0) {
                this.ui.renderHand(this.game.hands[0], null, false);
            }
            await this.delay(300);
            this.processTurn();
        } else if (result.action === 'trick_complete') {
            this.game.lastTrickWinnerTeam = getTeam(result.winner);

            this.a11y.announceTrickWinner(PLAYER_NAMES[result.winner], result.trickNumber);

            if (playerIndex === 0) {
                this.ui.renderHand(this.game.hands[0], null, false);
            }

            await this.delay(1200);
            await this.ui.animateCollectTrick(PLAYER_SEATS[result.winner]);

            if (result.roundEnd) {
                this.endRound();
            } else {
                this.game.startNextTrick();
                this.processTurn();
            }
        }
    }

    /* ======== ROUND END ======== */

    endRound() {
        this.ui.clearActiveTurn();
        const result = this.game.calculateRoundScore();
        this.ui.updateScores(this.game.scores);

        this.a11y.announceRoundScore(
            result.bnaat[0], result.bnaat[1],
            this.game.scores[0], this.game.scores[1]
        );

        this.ui.showRoundResult(result, getTeamName);

        if (this.game.checkGameOver()) {
            const winner = this.game.getWinner();
            setTimeout(() => {
                this.ui.hidePanel(this.ui.roundResultPanel);
                this.ui.showGameOver(winner, this.game.scores);
                this.a11y.announceGameOver(getTeamName(winner), this.game.scores[0], this.game.scores[1]);
            }, 2000);
        }
    }

    /* ======== DOUBLE ======== */

    handleDoubleDecision(multiplier) {
        if (multiplier > 0) {
            this.game.applyDouble(multiplier);
            this.ui.showDoubleBadge(multiplier);
            this.a11y.announceAndLog(`تم تفعيل الدبل: × ${multiplier}`);
        }
    }

    /* ======== UTILITY ======== */

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ---- Initialize Application ----
document.addEventListener('DOMContentLoaded', () => {
    window.balootApp = new BalootApp();
});
