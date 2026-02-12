/* ============================================
   ui.js - DOM Rendering & Visual Updates
   Enhanced with mobile support, improved
   keyboard navigation, position announcements
   ============================================ */

class GameUI {
    constructor(a11y) {
        this.a11y = a11y;
        this.selectedCardIndex = -1;
        this.onCardPlayed = null;
        this.onBid = null;
        this.onSuitChosen = null;
        this.onDoubleDecision = null;
        this.animationSpeed = 400;
        this.cacheElements();
        this._setupPanelEscapeHandlers();
    }

    cacheElements() {
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.gameTable = document.getElementById('game-table');
        this.playerHand = document.getElementById('player-hand');
        this.playedCardsEl = document.getElementById('played-cards');
        this.faceUpCardEl = document.getElementById('face-up-card');
        this.biddingPanel = document.getElementById('bidding-panel');
        this.biddingButtons = document.getElementById('bidding-buttons');
        this.biddingInfo = document.getElementById('bidding-info');
        this.biddingTitle = document.getElementById('bidding-title');
        this.hokmSuitPanel = document.getElementById('hokm-suit-panel');
        this.hokmSuitButtons = document.getElementById('hokm-suit-buttons');
        this.projectsPanel = document.getElementById('projects-panel');
        this.projectsContent = document.getElementById('projects-content');
        this.roundResultPanel = document.getElementById('round-result');
        this.roundResultContent = document.getElementById('round-result-content');
        this.gameOverPanel = document.getElementById('game-over');
        this.gameOverTitle = document.getElementById('game-over-title');
        this.gameOverContent = document.getElementById('game-over-content');
        this.doublePanel = document.getElementById('double-panel');
        this.doubleButtons = document.getElementById('double-buttons');
        this.doubleInfo = document.getElementById('double-info');
        this.doubleTitle = document.getElementById('double-title');
        this.shortcutsPanel = document.getElementById('shortcuts-panel');
        this.team1Score = document.getElementById('team1-score');
        this.team2Score = document.getElementById('team2-score');
        this.tableCenter = document.getElementById('table-center');
        this.nameEls = [
            document.getElementById('name-bottom'),
            document.getElementById('name-right'),
            document.getElementById('name-top'),
            document.getElementById('name-left')
        ];
        this.cardBackEls = [
            null,
            document.getElementById('cards-right'),
            document.getElementById('cards-top'),
            document.getElementById('cards-left')
        ];
        this._allPanels = [
            this.biddingPanel, this.hokmSuitPanel, this.projectsPanel,
            this.roundResultPanel, this.gameOverPanel, this.doublePanel,
            this.shortcutsPanel
        ];
    }

    /* ---- Panel Escape Handlers (WCAG No Keyboard Trap) ---- */

    _setupPanelEscapeHandlers() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close any open panel
                let closed = false;
                for (const panel of this._allPanels) {
                    if (panel && !panel.classList.contains('hidden')) {
                        this.hidePanel(panel);
                        closed = true;
                    }
                }
                if (closed) {
                    e.preventDefault();
                    // Return focus to hand
                    this.a11y.focusHand();
                }
            }
        });
    }

    /* ---- SHOW / HIDE ---- */

    showWelcome() {
        this.welcomeScreen.classList.remove('hidden');
        this.gameTable.classList.add('hidden');
    }

    showGameTable() {
        this.welcomeScreen.classList.add('hidden');
        this.gameTable.classList.remove('hidden');
    }

    showPanel(panel) {
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        // Trap focus inside dialog
        const firstBtn = panel.querySelector('button');
        if (firstBtn) setTimeout(() => firstBtn.focus(), 100);
    }

    hidePanel(panel) {
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
    }

    hideAllPanels() {
        for (const panel of this._allPanels) {
            if (panel) this.hidePanel(panel);
        }
    }

    /* ---- SCORE UPDATE ---- */

    updateScores(scores) {
        this.team1Score.textContent = scores[0];
        this.team2Score.textContent = scores[1];
        this.team1Score.setAttribute('aria-label', `نقاط فريقك: ${scores[0]}`);
        this.team2Score.setAttribute('aria-label', `نقاط الخصم: ${scores[1]}`);
    }

    /* ---- CARD RENDERING ---- */

    createCardElement(card, options = {}) {
        const el = document.createElement('div');
        el.className = `card ${card.suit.cssClass}`;
        if (options.extraClass) el.className += ` ${options.extraClass}`;
        el.setAttribute('data-card-id', card.id);

        const inner = document.createElement('div');
        inner.className = 'card-inner';
        inner.setAttribute('aria-hidden', 'true');

        const cornerTop = document.createElement('div');
        cornerTop.className = 'card-corner card-corner-top';
        cornerTop.innerHTML = `<span class="card-rank">${card.rank.symbol}</span><span class="card-suit-small">${card.suit.symbol}</span>`;
        inner.appendChild(cornerTop);

        const centerSuit = document.createElement('div');
        centerSuit.className = 'card-suit-center';
        centerSuit.textContent = card.suit.symbol;
        inner.appendChild(centerSuit);

        const cornerBottom = document.createElement('div');
        cornerBottom.className = 'card-corner card-corner-bottom';
        cornerBottom.innerHTML = `<span class="card-rank">${card.rank.symbol}</span><span class="card-suit-small">${card.suit.symbol}</span>`;
        inner.appendChild(cornerBottom);

        el.appendChild(inner);
        el.setAttribute('aria-label', card.nameAr);

        return el;
    }

    /* ---- PLAYER HAND (Enhanced WAI-ARIA APG Listbox) ---- */

    renderHand(cards, validCardIds = null, isPlayerTurn = false) {
        this.playerHand.innerHTML = '';
        this.selectedCardIndex = -1;
        this._currentHandCards = cards; // Store reference

        cards.forEach((card, index) => {
            const el = this.createCardElement(card);
            el.setAttribute('role', 'option');
            el.setAttribute('tabindex', index === 0 ? '0' : '-1');
            // Enhanced aria-label with position
            el.setAttribute('aria-label', `${card.nameAr}، ورقة ${index + 1} من ${cards.length}`);
            el.setAttribute('data-index', index);

            const isValid = validCardIds === null || validCardIds.includes(card.id);

            if (!isValid || !isPlayerTurn) {
                el.classList.add('disabled');
                el.setAttribute('aria-disabled', 'true');
            } else {
                el.setAttribute('aria-disabled', 'false');
            }

            // Click handler (works for mouse and touch double-tap via screen reader)
            el.addEventListener('click', () => {
                if (el.classList.contains('disabled')) return;
                this.selectAndPlayCard(index, cards);
            });

            // Touch: ensure minimum 48×48 touch target (CSS handles sizing)
            el.style.animationDelay = `${index * 80}ms`;
            el.classList.add('card-dealing');

            this.playerHand.appendChild(el);
        });

        // Enhanced keyboard navigation
        this.setupHandKeyboard(cards);

        // Focus first valid card if it's player's turn
        if (isPlayerTurn) {
            const firstValid = this.playerHand.querySelector('.card:not(.disabled)');
            if (firstValid) {
                setTimeout(() => firstValid.focus(), 300);
            }
        }
    }

    setupHandKeyboard(cards) {
        if (this._handKeyboardAbort) {
            this._handKeyboardAbort.abort();
        }
        this._handKeyboardAbort = new AbortController();

        this.playerHand.addEventListener('keydown', (e) => {
            const cardEls = Array.from(this.playerHand.querySelectorAll('.card'));
            const focused = document.activeElement;
            const currentIdx = cardEls.indexOf(focused);
            const len = cardEls.length;

            if (len === 0) return;

            const moveFocus = (newIdx) => {
                if (newIdx < 0 || newIdx >= len) return;
                if (cardEls[currentIdx]) cardEls[currentIdx].setAttribute('tabindex', '-1');
                cardEls[newIdx].setAttribute('tabindex', '0');
                cardEls[newIdx].focus();
                // Announce position
                this.a11y.announcePolite(`ورقة ${newIdx + 1} من ${len}`);
            };

            switch (e.key) {
                case 'ArrowRight': // RTL: right = previous card
                    e.preventDefault();
                    moveFocus(currentIdx - 1);
                    break;
                case 'ArrowLeft': // RTL: left = next card
                    e.preventDefault();
                    moveFocus(currentIdx + 1);
                    break;
                case 'ArrowUp': // Alternative: up = previous
                    e.preventDefault();
                    moveFocus(currentIdx - 1);
                    break;
                case 'ArrowDown': // Alternative: down = next
                    e.preventDefault();
                    moveFocus(currentIdx + 1);
                    break;
                case 'Home':
                    e.preventDefault();
                    moveFocus(0);
                    break;
                case 'End':
                    e.preventDefault();
                    moveFocus(len - 1);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (focused && !focused.classList.contains('disabled') && focused.classList.contains('card')) {
                        this.selectAndPlayCard(currentIdx, cards);
                    }
                    break;
            }
        }, { signal: this._handKeyboardAbort.signal });
    }

    selectAndPlayCard(index, cards) {
        if (this.onCardPlayed && index >= 0 && index < cards.length) {
            const cardEls = Array.from(this.playerHand.querySelectorAll('.card'));
            cardEls.forEach(el => el.classList.remove('selected'));
            if (cardEls[index]) cardEls[index].classList.add('selected');
            this.onCardPlayed(cards[index]);
        }
    }

    /* ---- AI CARD BACKS ---- */

    renderCardBacks(playerIndex, count) {
        const container = this.cardBackEls[playerIndex];
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const back = document.createElement('div');
            back.className = 'card-back';
            back.setAttribute('aria-hidden', 'true');
            container.appendChild(back);
        }
    }

    /* ---- TABLE CENTER ---- */

    clearPlayedCards() {
        this.playedCardsEl.innerHTML = '';
        this.playedCardsEl.style.position = 'relative';
    }

    showPlayedCard(card, seatPosition) {
        const wrapper = document.createElement('div');
        wrapper.className = 'played-card-wrapper';
        wrapper.setAttribute('data-seat', seatPosition);
        wrapper.setAttribute('aria-hidden', 'true');

        const cardEl = this.createCardElement(card, { extraClass: 'card-on-table' });
        wrapper.appendChild(cardEl);
        this.playedCardsEl.appendChild(wrapper);
    }

    showFaceUpCard(card) {
        this.faceUpCardEl.innerHTML = '';
        const cardEl = this.createCardElement(card, { extraClass: 'card-face-up' });
        this.faceUpCardEl.appendChild(cardEl);
        this.faceUpCardEl.classList.remove('hidden');
        this.faceUpCardEl.setAttribute('aria-label', `الورقة المكشوفة: ${card.nameAr}`);
    }

    hideFaceUpCard() {
        this.faceUpCardEl.classList.add('hidden');
        this.faceUpCardEl.innerHTML = '';
    }

    /* ---- ACTIVE TURN INDICATOR ---- */

    showActiveTurn(playerIndex) {
        this.nameEls.forEach((el, i) => {
            if (i === playerIndex) {
                el.classList.add('active-turn');
            } else {
                el.classList.remove('active-turn');
            }
        });
    }

    clearActiveTurn() {
        this.nameEls.forEach(el => el.classList.remove('active-turn'));
    }

    /* ---- GAME TYPE BADGE ---- */

    showGameTypeBadge(gameType, hokmSuitName) {
        const existing = document.querySelector('.game-type-badge');
        if (existing) existing.remove();

        const badge = document.createElement('div');
        badge.className = 'game-type-badge';
        badge.setAttribute('aria-hidden', 'true');
        if (gameType === 'sun') {
            badge.textContent = 'صن';
        } else {
            badge.textContent = `حكم ${hokmSuitName}`;
        }
        this.gameTable.appendChild(badge);
    }

    removeGameTypeBadge() {
        const existing = document.querySelector('.game-type-badge');
        if (existing) existing.remove();
    }

    /* ---- DOUBLE BADGE ---- */

    showDoubleBadge(multiplier) {
        const existing = document.querySelector('.double-badge');
        if (existing) existing.remove();

        if (multiplier > 1) {
            const badge = document.createElement('div');
            badge.className = 'double-badge';
            const labels = { 2: 'دبل', 3: 'دبل ٣', 4: 'دبل ٤' };
            badge.textContent = labels[multiplier] || `دبل × ${multiplier}`;
            badge.setAttribute('role', 'status');
            badge.setAttribute('aria-label', `الدبل: ${badge.textContent}`);
            this.gameTable.appendChild(badge);
        }
    }

    /* ---- BIDDING UI ---- */

    showBiddingPanel(options, playerName, faceUpCard) {
        this.biddingTitle.textContent = 'اختيار نوع اللعب';
        this.biddingInfo.textContent = `الورقة المكشوفة: ${faceUpCard.nameAr}. دورك للاختيار.`;
        this.biddingButtons.innerHTML = '';

        options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = `btn ${option.type === 'pass' ? 'btn-secondary' : 'btn-primary'}`;
            btn.textContent = option.label;
            btn.setAttribute('aria-label', option.ariaLabel);
            btn.addEventListener('click', () => {
                if (this.onBid) this.onBid(option);
            });
            this.biddingButtons.appendChild(btn);
        });

        this.showPanel(this.biddingPanel);
    }

    showHokmSuitPanel(suits) {
        this.hokmSuitButtons.innerHTML = '';

        suits.forEach(suit => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.innerHTML = `<span style="font-size:2rem;color:${suit.color === 'red' ? 'var(--suit-red)' : 'var(--suit-black)'}">${suit.symbol}</span><span class="suit-name">${suit.nameAr}</span>`;
            btn.setAttribute('aria-label', `حكم ${suit.nameAr}`);
            btn.addEventListener('click', () => {
                this.hidePanel(this.hokmSuitPanel);
                if (this.onSuitChosen) this.onSuitChosen(suit.id);
            });
            this.hokmSuitButtons.appendChild(btn);
        });

        this.showPanel(this.hokmSuitPanel);
    }

    /* ---- SHORTCUTS PANEL ---- */

    showShortcutsPanel() {
        this.showPanel(this.shortcutsPanel);
    }

    hideShortcutsPanel() {
        this.hidePanel(this.shortcutsPanel);
    }

    toggleShortcutsPanel() {
        if (this.shortcutsPanel.classList.contains('hidden')) {
            this.showShortcutsPanel();
        } else {
            this.hideShortcutsPanel();
            this.a11y.focusHand();
        }
    }

    /* ---- PROJECTS DISPLAY ---- */

    showProjectsPanel(teamProjects, getTeamName) {
        this.projectsContent.innerHTML = '';

        for (let t = 0; t < 2; t++) {
            if (teamProjects[t].length === 0) continue;

            const teamHeader = document.createElement('h3');
            teamHeader.textContent = `مشاريع ${getTeamName(t)}`;
            teamHeader.style.color = 'var(--text-primary)';
            teamHeader.style.marginTop = 'var(--space-md)';
            this.projectsContent.appendChild(teamHeader);

            teamProjects[t].forEach(proj => {
                const item = document.createElement('div');
                item.className = 'project-item';
                item.setAttribute('role', 'listitem');

                const name = document.createElement('span');
                name.className = 'project-name';
                name.textContent = proj.nameAr;

                const cards = document.createElement('span');
                cards.className = 'project-cards';
                cards.textContent = proj.cards.map(c => `${c.rank.symbol}${c.suit.symbol}`).join(' ');
                cards.setAttribute('aria-label', proj.cards.map(c => c.nameAr).join('، '));

                const points = document.createElement('span');
                points.className = 'project-points';

                item.appendChild(name);
                item.appendChild(cards);
                item.appendChild(points);
                this.projectsContent.appendChild(item);
            });
        }

        if (teamProjects[0].length === 0 && teamProjects[1].length === 0) {
            this.projectsContent.textContent = 'لا توجد مشاريع في هذه الجولة';
        }

        this.showPanel(this.projectsPanel);
    }

    /* ---- ROUND RESULT ---- */

    showRoundResult(result, getTeamName) {
        this.roundResultContent.innerHTML = '';

        const rows = [
            { label: 'نقاط الأوراق - فريقك', value: result.rawPoints[0] },
            { label: 'نقاط الأوراق - الخصم', value: result.rawPoints[1] },
            { label: 'المشاريع - فريقك', value: `${result.projectBnaat[0]} بنط` },
            { label: 'المشاريع - الخصم', value: `${result.projectBnaat[1]} بنط` },
        ];

        if (result.isKaboot) {
            rows.push({ label: 'كبوت!', value: `لـ${getTeamName(result.kabootTeam || 0)}` });
        }

        if (result.doubleMultiplier > 1) {
            rows.push({ label: 'الدبل', value: `× ${result.doubleMultiplier}` });
        }

        rows.push({ label: 'الأبناط - فريقك', value: result.bnaat[0] });
        rows.push({ label: 'الأبناط - الخصم', value: result.bnaat[1] });
        rows.push({ label: 'المجموع - فريقك', value: result.scores[0] });
        rows.push({ label: 'المجموع - الخصم', value: result.scores[1] });

        rows.forEach(row => {
            const div = document.createElement('div');
            div.className = 'result-row';
            div.innerHTML = `<span class="result-label">${row.label}</span><span class="result-value">${row.value}</span>`;
            this.roundResultContent.appendChild(div);
        });

        this.showPanel(this.roundResultPanel);
    }

    /* ---- DOUBLE UI ---- */

    showDoublePanel(teamName, currentMultiplier) {
        const nextMultiplier = currentMultiplier === 1 ? 2 : currentMultiplier + 1;
        this.doubleTitle.textContent = 'الدبل';
        this.doubleInfo.textContent = 'هل تريد مضاعفة اللعب؟';
        this.doubleButtons.innerHTML = '';

        const btnDouble = document.createElement('button');
        btnDouble.className = 'btn btn-danger';
        const labels = { 2: 'دبل', 3: 'ثري', 4: 'فور' };
        btnDouble.textContent = labels[nextMultiplier] || 'دبل';
        btnDouble.setAttribute('aria-label', `${labels[nextMultiplier] || 'دبل'} - مضاعفة اللعب`);
        btnDouble.addEventListener('click', () => {
            this.hidePanel(this.doublePanel);
            if (this.onDoubleDecision) this.onDoubleDecision(nextMultiplier);
        });

        const btnPass = document.createElement('button');
        btnPass.className = 'btn btn-secondary';
        btnPass.textContent = 'لا';
        btnPass.setAttribute('aria-label', 'عدم المضاعفة');
        btnPass.addEventListener('click', () => {
            this.hidePanel(this.doublePanel);
            if (this.onDoubleDecision) this.onDoubleDecision(0);
        });

        this.doubleButtons.appendChild(btnDouble);
        this.doubleButtons.appendChild(btnPass);

        this.showPanel(this.doublePanel);
    }

    /* ---- GAME OVER ---- */

    showGameOver(winnerTeam, scores) {
        const isWin = winnerTeam === 0;
        this.gameOverTitle.textContent = isWin ? '🎉 مبروك! فزت!' : '😔 خسرت!';
        this.gameOverTitle.style.color = isWin ? 'var(--accent-green)' : 'var(--accent-red)';

        this.gameOverContent.innerHTML = '';
        const rows = [
            { label: 'فريقك', value: scores[0] },
            { label: 'الخصم', value: scores[1] },
        ];
        rows.forEach(row => {
            const div = document.createElement('div');
            div.className = 'result-row';
            div.innerHTML = `<span class="result-label">${row.label}</span><span class="result-value">${row.value}</span>`;
            this.gameOverContent.appendChild(div);
        });

        this.showPanel(this.gameOverPanel);
    }

    /* ---- TRICK COLLECTION ANIMATION ---- */

    async animateCollectTrick(winnerSeat) {
        const cards = this.playedCardsEl.querySelectorAll('.played-card-wrapper');
        const dirMap = {
            'bottom': 'translateY(100px)',
            'top': 'translateY(-100px)',
            'right': 'translateX(100px)',
            'left': 'translateX(-100px)'
        };
        cards.forEach(card => {
            card.style.transition = 'all 0.4s ease';
            card.style.transform += ` ${dirMap[winnerSeat]}`;
            card.style.opacity = '0';
        });
        await new Promise(r => setTimeout(r, 500));
        this.clearPlayedCards();
    }
}
