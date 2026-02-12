/* ============================================
   accessibility.js - Screen Reader & Keyboard Support
   WCAG 2.2 Compliant Accessibility Layer
   Enhanced with: Interactive Log, Keyboard Shortcuts,
   Device Detection, Mobile Screen Reader Support
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
        // VoiceOver: iOS Safari with accessibility set
        // TalkBack: Android Chrome
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

            // Build the shortcut ID from the event
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
    constructor(logEntriesEl, announcer) {
        this.container = logEntriesEl;
        this.announcer = announcer;
        this.entries = [];
        this.focusedIndex = -1;
        this._setupKeyboard();
    }

    addEntry(message) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.setAttribute('role', 'option');
        entry.setAttribute('tabindex', '-1');
        entry.setAttribute('aria-label', message);
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
        // Focus last entry
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
            // Announce position for screen reader
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

/* ---- Accessibility Manager (Upgraded) ---- */
class AccessibilityManager {
    constructor() {
        this.announceEl = document.getElementById('sr-announce');
        this.announcePoliteEl = document.getElementById('sr-announce-polite');
        this.logEntriesEl = document.getElementById('log-entries');
        this.announceQueue = [];
        this.isAnnouncing = false;

        // Device detection
        this.device = new DeviceDetector();

        // Interactive log
        this.gameLog = new InteractiveGameLog(this.logEntriesEl, this);

        // Keyboard shortcuts
        this.shortcuts = new KeyboardShortcutManager();

        // Show/hide mobile toolbar
        if (this.device.isMobile || this.device.isTouchDevice) {
            this._showMobileToolbar();
        }
    }

    /* ---- Announcements ---- */

    announce(message, delay = 100) {
        this.announceQueue.push({ message, delay, priority: 'assertive' });
        if (!this.isAnnouncing) this.processQueue();
    }

    announcePolite(message) {
        // Non-interrupting announcement
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
        this.gameLog.addEntry(message);
    }

    announceAndLog(message, delay = 100) {
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
        } else {
            this.log(`دور ${playerName}`);
        }
    }

    announceCardPlayed(playerName, card, isHuman) {
        const msg = `${playerName} لعب ${card.nameAr}`;
        if (isHuman) {
            this.log(msg);
        } else {
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
