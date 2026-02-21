/* ============================================
   accessibility.js - Screen Reader & Keyboard Support
   WCAG 2.2 Compliant Accessibility Layer
   Enhanced with: Interactive Log, Keyboard Shortcuts,
   Device Detection, Mobile Screen Reader Support,
   Device-Adaptive Help Modal
   ============================================ */

/* ---- Device Detection ---- */
class DeviceDetector {
    constructor() {
        this._isMobile = null;
        this._isTouchDevice = null;
        this._screenReader = null;
        this.detect();
    }

    detect() {
        // Touch capability
        this._isTouchDevice = ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            (window.matchMedia('(pointer: coarse)').matches);

        // Mobile UA
        const ua = navigator.userAgent || '';
        this._isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua) ||
            (this._isTouchDevice && window.innerWidth <= 1024);

        // Screen reader heuristic (best effort)
        this._screenReader = 'unknown';
        if (/iPhone|iPad|iPod/.test(ua)) {
            this._screenReader = 'voiceover';
        } else if (/Android/.test(ua)) {
            this._screenReader = 'talkback';
        } else if (typeof window !== 'undefined') {
            this._screenReader = 'desktop'; // NVDA, JAWS, etc.
        }

        // Set CSS class and data attributes on body
        document.documentElement.classList.toggle('is-mobile', this._isMobile);
        document.documentElement.classList.toggle('is-touch', this._isTouchDevice);
        document.documentElement.classList.toggle('is-desktop', !this._isMobile);
        document.documentElement.dataset.device = this._isMobile ? 'mobile' : 'desktop';
        document.documentElement.dataset.screenReader = this._screenReader;

        // Listen for orientation change
        if (this._isMobile) {
            window.addEventListener('orientationchange', () => {
                setTimeout(() => this._updateOrientation(), 200);
            });
            this._updateOrientation();
        }
    }

    _updateOrientation() {
        const isLandscape = window.innerWidth > window.innerHeight;
        document.documentElement.classList.toggle('is-landscape', isLandscape);
        document.documentElement.classList.toggle('is-portrait', !isLandscape);
    }

    get isMobile() { return this._isMobile; }
    get isTouchDevice() { return this._isTouchDevice; }
    get screenReader() { return this._screenReader; }
}

/* ---- Keyboard Shortcut Manager (WCAG SC 2.1.4) ---- */
class KeyboardShortcutManager {
    constructor() {
        this.shortcuts = new Map();
        this._enabled = true;
        this._setupGlobalListener();
    }

    register(key, modifier, callback, description) {
        const id = `${modifier ? modifier + '+' : ''}${key}`.toLowerCase();
        this.shortcuts.set(id, { key, modifier, callback, description });
    }

    _setupGlobalListener() {
        document.addEventListener('keydown', (e) => {
            if (!this._enabled) return;

            let modifier = '';
            if (e.altKey) modifier = 'alt';
            else if (e.ctrlKey) modifier = 'ctrl';

            const id = `${modifier ? modifier + '+' : ''}${e.key}`.toLowerCase();
            const shortcut = this.shortcuts.get(id);

            if (shortcut) {
                e.preventDefault();
                e.stopPropagation();
                shortcut.callback();
            }
        });
    }

    enable() { this._enabled = true; }
    disable() { this._enabled = false; }
}

/* ---- Interactive Game Log (WAI-ARIA APG Listbox) ---- */
class InteractiveGameLog {
    constructor(logEntriesEl) {
        this.container = logEntriesEl;
        this.entries = [];
        this.focusedIndex = -1;
        this._setupKeyboard();
    }

    addEntry(message) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.setAttribute('role', 'option');
        entry.setAttribute('tabindex', '-1');
        // Only set textContent; screen reader reads it on focus
        entry.textContent = message;

        this.entries.push(entry);
        this.container.appendChild(entry);

        // Keep last 80 entries
        while (this.entries.length > 80) {
            const removed = this.entries.shift();
            removed.remove();
        }

        // Update indices
        this.entries.forEach((ent, i) => {
            ent.dataset.index = i;
        });

        // Auto-scroll to latest
        this.container.scrollTop = this.container.scrollHeight;

        // Update the active descendant to latest
        this.focusedIndex = this.entries.length - 1;
        this._updateRovingTabindex();
    }

    focus() {
        if (this.entries.length === 0) return;
        this.focusedIndex = this.entries.length - 1;
        this._updateRovingTabindex();
        this.entries[this.focusedIndex].focus();
    }

    _updateRovingTabindex() {
        this.entries.forEach((entry, i) => {
            entry.setAttribute('tabindex', i === this.focusedIndex ? '0' : '-1');
            entry.classList.toggle('log-focused', i === this.focusedIndex);
        });
    }

    _setupKeyboard() {
        this.container.addEventListener('keydown', (e) => {
            const len = this.entries.length;
            if (len === 0) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (this.focusedIndex < len - 1) {
                        this.focusedIndex++;
                        this._focusCurrent();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (this.focusedIndex > 0) {
                        this.focusedIndex--;
                        this._focusCurrent();
                    }
                    break;
                case 'Home':
                    e.preventDefault();
                    this.focusedIndex = 0;
                    this._focusCurrent();
                    break;
                case 'End':
                    e.preventDefault();
                    this.focusedIndex = len - 1;
                    this._focusCurrent();
                    break;
                case 'PageUp':
                    e.preventDefault();
                    this.focusedIndex = Math.max(0, this.focusedIndex - 5);
                    this._focusCurrent();
                    break;
                case 'PageDown':
                    e.preventDefault();
                    this.focusedIndex = Math.min(len - 1, this.focusedIndex + 5);
                    this._focusCurrent();
                    break;
                case 'Escape':
                    e.preventDefault();
                    // Return focus to player hand
                    const hand = document.getElementById('player-hand');
                    if (hand) {
                        const firstCard = hand.querySelector('.card[tabindex="0"]');
                        if (firstCard) firstCard.focus();
                        else hand.focus();
                    }
                    break;
            }
        });
    }

    _focusCurrent() {
        this._updateRovingTabindex();
        if (this.entries[this.focusedIndex]) {
            this.entries[this.focusedIndex].focus();
            // Set aria-label with position context only when navigating
            const pos = this.focusedIndex + 1;
            const total = this.entries.length;
            this.entries[this.focusedIndex].setAttribute('aria-label',
                `${this.entries[this.focusedIndex].textContent} — حدث ${pos} من ${total}`);
        }
    }

    clear() {
        this.container.innerHTML = '';
        this.entries = [];
        this.focusedIndex = -1;
    }
}

/* ---- Accessibility Manager (WCAG 2.2 Overhaul) ---- */
class AccessibilityManager {
    constructor() {
        this.announceEl = document.getElementById('sr-announce');
        this.announcePoliteEl = document.getElementById('sr-announce-polite');
        this.logEntriesEl = document.getElementById('log-entries');
        this.announceQueue = [];
        this.isAnnouncing = false;

        // Device detection
        this.device = new DeviceDetector();

        // Interactive log (no announcer reference — log is silent, announce is separate)
        this.gameLog = new InteractiveGameLog(this.logEntriesEl);

        // Keyboard shortcuts
        this.shortcuts = new KeyboardShortcutManager();

        // Show/hide mobile toolbar
        if (this.device.isMobile || this.device.isTouchDevice) {
            this._showMobileToolbar();
        }

        // Setup device-adaptive help modal content
        this._setupAdaptiveModal();
    }

    /* ---- Device-Adaptive Help Modal ---- */

    _setupAdaptiveModal() {
        const title = document.getElementById('shortcuts-modal-title');
        const keyboardSection = document.getElementById('shortcuts-keyboard');
        const touchSection = document.getElementById('shortcuts-touch');
        const btnIcon = document.getElementById('btn-shortcuts-icon');
        const btnLabel = document.getElementById('btn-shortcuts-label');
        const btn = document.getElementById('btn-shortcuts-top');

        if (this.device.isMobile || this.device.isTouchDevice) {
            // Mobile/Touch device: show touch gestures
            if (title) title.textContent = 'إيماءات اللمس';
            if (keyboardSection) keyboardSection.classList.add('hidden');
            if (touchSection) touchSection.classList.remove('hidden');
            if (btnIcon) btnIcon.textContent = '👆';
            if (btnLabel) btnLabel.textContent = 'عرض إيماءات اللمس';
            if (btn) btn.setAttribute('aria-label', 'عرض إيماءات اللمس');
        } else {
            // Desktop: show keyboard shortcuts
            if (title) title.textContent = 'اختصارات لوحة المفاتيح';
            if (keyboardSection) keyboardSection.classList.remove('hidden');
            if (touchSection) touchSection.classList.add('hidden');
            if (btnIcon) btnIcon.textContent = '⌨️';
            if (btnLabel) btnLabel.textContent = 'اختصارات لوحة المفاتيح (?)';
            if (btn) btn.setAttribute('aria-label', 'عرض اختصارات لوحة المفاتيح');
        }
    }

    /* ---- Announcements ---- */
    /*
     * WCAG fix: Only ONE announcement channel used at a time.
     * announce() => assertive (immediate, for important events)
     * log()      => silent add to log history (no aria-live on log container)
     * announceAndLog() = announce + log WITHOUT double reading
     */

    announce(message, delay = 100) {
        this.announceQueue.push({ message, delay, priority: 'assertive' });
        if (!this.isAnnouncing) this.processQueue();
    }

    announcePolite(message) {
        // Non-interrupting announcement for supplementary info
        if (this.announcePoliteEl) {
            this.announcePoliteEl.textContent = '';
            setTimeout(() => { this.announcePoliteEl.textContent = message; }, 50);
        }
    }

    async processQueue() {
        this.isAnnouncing = true;
        while (this.announceQueue.length > 0) {
            const { message, delay } = this.announceQueue.shift();
            this.announceEl.textContent = '';
            await this.wait(50);
            this.announceEl.textContent = message;
            await this.wait(delay + 500);
        }
        this.isAnnouncing = false;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /* ---- Game Log ---- */

    log(message) {
        // Silently adds to log history (no screen reader repeat)
        this.gameLog.addEntry(message);
    }

    announceAndLog(message, delay = 100) {
        // Announce to screen reader (assertive, once) AND add to silent log
        this.announce(message, delay);
        this.log(message);
    }

    /* ---- Context Announcements (for shortcuts) ---- */

    announceScore(scores) {
        this.announce(`النتيجة: فريقك ${scores[0]} - الخصم ${scores[1]}`);
    }

    announceGameStatus(gameType, hokmSuit) {
        if (!gameType) {
            this.announce('لم يبدأ اللعب بعد');
            return;
        }
        if (gameType === 'sun') {
            this.announce('نوع اللعب: صن');
        } else {
            this.announce(`نوع اللعب: حكم ${hokmSuit || ''}`);
        }
    }

    announceTableCards(trickCards) {
        if (!trickCards || trickCards.length === 0) {
            this.announce('لا توجد أوراق على الطاولة');
            return;
        }
        const desc = trickCards.map(tc =>
            `${PLAYER_NAMES[tc.playerIndex]}: ${tc.card.nameAr}`
        ).join('، ');
        this.announce(`الأوراق على الطاولة: ${desc}`);
    }

    /* ---- Focus Management ---- */

    setLabel(element, label) {
        if (element) element.setAttribute('aria-label', label);
    }

    markActive(element) {
        element.setAttribute('aria-current', 'true');
    }

    clearActive(element) {
        element.removeAttribute('aria-current');
    }

    focusElement(element, preventScroll = false) {
        if (element) element.focus({ preventScroll });
    }

    focusLog() {
        this.gameLog.focus();
    }

    focusHand() {
        const hand = document.getElementById('player-hand');
        if (hand) {
            const firstCard = hand.querySelector('.card[tabindex="0"]') ||
                hand.querySelector('.card:not(.disabled)') ||
                hand.querySelector('.card');
            if (firstCard) firstCard.focus();
            else hand.focus();
        }
    }

    /**
     * After an AI plays or a card is removed, refocus the next available card
     * so the screen reader user doesn't lose their place.
     */
    refocusNextCard() {
        const hand = document.getElementById('player-hand');
        if (!hand) return;
        // Find the currently focused card, or the first focusable card
        const current = hand.querySelector('.card[tabindex="0"]');
        if (current) {
            current.focus();
            return;
        }
        // Fallback: focus first available card
        const first = hand.querySelector('.card:not(.disabled)') || hand.querySelector('.card');
        if (first) {
            first.setAttribute('tabindex', '0');
            first.focus();
        }
    }

    /* ---- Card / Hand Descriptions ---- */

    describeCard(card) {
        return card.nameAr;
    }

    describeHand(cards) {
        if (cards.length === 0) return 'لا توجد أوراق';
        return cards.map(c => c.nameAr).join('، ');
    }

    /* ---- Game Event Announcements ---- */

    announceTurn(playerName, isHuman) {
        if (isHuman) {
            this.announce('دورك. اختر ورقة للعب.');
        }
        // AI turns: don't announce "دور خصم" to avoid noise; just log silently
    }

    announceCardPlayed(playerName, card, isHuman) {
        const msg = `${playerName} لعب ${card.nameAr}`;
        if (isHuman) {
            // Human played: just log (they know what they played)
            this.log(msg);
        } else {
            // AI played: announce once via assertive + silent log
            this.announceAndLog(msg, 200);
        }
    }

    announceTrickWinner(winnerName, trickNumber) {
        this.announceAndLog(`${winnerName} فاز بالأكلة ${trickNumber}`);
    }

    announceBid(playerName, bidType, suitName = '') {
        let msg;
        switch (bidType) {
            case 'sun': msg = `${playerName} اشترى صن`; break;
            case 'hokm': msg = `${playerName} اشترى حكم ${suitName}`; break;
            case 'hokm_choose': msg = `${playerName} اشترى حكم ${suitName}`; break;
            case 'ashkal': msg = `${playerName} أشكل`; break;
            case 'pass': msg = `${playerName} قال بس`; break;
            default: msg = `${playerName}: ${bidType}`;
        }
        this.announceAndLog(msg);
    }

    announceGameType(gameType, hokmSuit) {
        if (gameType === 'sun') {
            this.announceAndLog('نوع اللعب: صن');
        } else {
            this.announceAndLog(`نوع اللعب: حكم ${hokmSuit}`);
        }
    }

    announceRoundScore(team1Bnaat, team2Bnaat, team1Total, team2Total) {
        this.announceAndLog(
            `نتيجة الجولة: فريقك ${team1Bnaat} - الخصم ${team2Bnaat}. ` +
            `المجموع: فريقك ${team1Total} - الخصم ${team2Total}`
        );
    }

    announceProject(teamName, projectName, cards, points) {
        const cardsStr = cards.map(c => c.nameAr).join('، ');
        this.announceAndLog(`مشروع ${projectName} لـ${teamName}: ${cardsStr} - ${points} أبناط`);
    }

    announceGameOver(winnerTeamName, score1, score2) {
        this.announce(`انتهت اللعبة! فاز ${winnerTeamName}. النتيجة النهائية: فريقك ${score1} - الخصم ${score2}`);
    }

    announceDealing() {
        this.announceAndLog('يتم توزيع الأوراق...');
    }

    announceFaceUpCard(card) {
        this.announceAndLog(`الورقة المكشوفة: ${card.nameAr}`);
    }

    /* ---- Mobile Toolbar ---- */

    _showMobileToolbar() {
        const toolbar = document.getElementById('mobile-toolbar');
        if (toolbar) toolbar.classList.remove('hidden');
    }

    /* ---- Clear ---- */

    clear() {
        this.announceEl.textContent = '';
        if (this.announcePoliteEl) this.announcePoliteEl.textContent = '';
        this.announceQueue = [];
    }
}
  
