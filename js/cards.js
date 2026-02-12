/* ============================================
   cards.js - Card Definitions & Deck Management
   ============================================ */

const SUITS = {
    diamonds: { id: 'diamonds', nameAr: 'الديمن', symbol: '♦', color: 'red', cssClass: 'suit-diamonds' },
    hearts:   { id: 'hearts',   nameAr: 'الهاص',  symbol: '♥', color: 'red', cssClass: 'suit-hearts' },
    spades:   { id: 'spades',   nameAr: 'السبيت', symbol: '♠', color: 'black', cssClass: 'suit-spades' },
    clubs:    { id: 'clubs',    nameAr: 'الشيريا', symbol: '♣', color: 'black', cssClass: 'suit-clubs' }
};

const RANKS = {
    '7':  { id: '7',  nameAr: 'سبعة',  symbol: '7',  display: '٧' },
    '8':  { id: '8',  nameAr: 'ثمانية', symbol: '8',  display: '٨' },
    '9':  { id: '9',  nameAr: 'تسعة',  symbol: '9',  display: '٩' },
    '10': { id: '10', nameAr: 'عشرة',  symbol: '10', display: '١٠' },
    'J':  { id: 'J',  nameAr: 'ولد',   symbol: 'J',  display: 'J' },
    'Q':  { id: 'Q',  nameAr: 'بنت',   symbol: 'Q',  display: 'Q' },
    'K':  { id: 'K',  nameAr: 'شايب',  symbol: 'K',  display: 'K' },
    'A':  { id: 'A',  nameAr: 'إكة',   symbol: 'A',  display: 'A' }
};

// Sun (صن) ordering: A > 10 > K > Q > J > 9 > 8 > 7
const SUN_ORDER = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, 'J': 4, '9': 3, '8': 2, '7': 1 };

// Hokm (حكم) ordering: J > 9 > A > 10 > K > Q > 8 > 7
const HOKM_ORDER = { 'J': 8, '9': 7, 'A': 6, '10': 5, 'K': 4, 'Q': 3, '8': 2, '7': 1 };

// Sun point values
const SUN_POINTS = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };

// Hokm point values (for the trump suit)
const HOKM_POINTS = { 'J': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'Q': 3, '8': 0, '7': 0 };

// Project ordering for sequences: A > K > Q > J > 10 > 9 > 8 > 7
const PROJECT_ORDER = { 'A': 8, 'K': 7, 'Q': 6, 'J': 5, '10': 4, '9': 3, '8': 2, '7': 1 };

/**
 * Create a single card object
 */
function createCard(rankId, suitId) {
    const rank = RANKS[rankId];
    const suit = SUITS[suitId];
    return {
        id: `${rankId}_${suitId}`,
        rank: rank,
        suit: suit,
        rankId: rankId,
        suitId: suitId,
        nameAr: `${rank.nameAr} ${suit.nameAr}`,
        sunOrder: SUN_ORDER[rankId],
        hokmOrder: HOKM_ORDER[rankId],
        sunPoints: SUN_POINTS[rankId],
        hokmPoints: HOKM_POINTS[rankId],
        projectOrder: PROJECT_ORDER[rankId]
    };
}

/**
 * Create a full 32-card Baloot deck
 */
function createDeck() {
    const deck = [];
    for (const suitId of Object.keys(SUITS)) {
        for (const rankId of Object.keys(RANKS)) {
            deck.push(createCard(rankId, suitId));
        }
    }
    return deck;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Get card strength for comparison in a trick
 * @param {object} card - The card to evaluate
 * @param {string} gameType - 'sun' or 'hokm'
 * @param {string} hokmSuit - The trump suit (only for hokm)
 * @param {string} leadSuit - The suit that was led
 */
function getCardStrength(card, gameType, hokmSuit, leadSuit) {
    if (gameType === 'hokm' && card.suitId === hokmSuit) {
        // Trump cards are always strongest, add 100 to distinguish from lead suit
        return 100 + HOKM_ORDER[card.rankId];
    }
    if (card.suitId === leadSuit) {
        if (gameType === 'sun') {
            return SUN_ORDER[card.rankId];
        } else {
            // Non-trump suit in hokm uses Sun ordering
            return SUN_ORDER[card.rankId];
        }
    }
    // Card that doesn't follow suit and isn't trump = 0 strength
    return 0;
}

/**
 * Determine the winner of a trick
 * @param {Array} playedCards - Array of {card, playerIndex}
 * @param {string} gameType - 'sun' or 'hokm'
 * @param {string} hokmSuit - The trump suit
 */
function determineTrickWinner(playedCards, gameType, hokmSuit) {
    const leadSuit = playedCards[0].card.suitId;
    let winner = playedCards[0];
    let bestStrength = getCardStrength(winner.card, gameType, hokmSuit, leadSuit);

    for (let i = 1; i < playedCards.length; i++) {
        const strength = getCardStrength(playedCards[i].card, gameType, hokmSuit, leadSuit);
        if (strength > bestStrength) {
            bestStrength = strength;
            winner = playedCards[i];
        }
    }

    return winner;
}

/**
 * Get the point value of a card based on game type
 */
function getCardPoints(card, gameType, hokmSuit) {
    if (gameType === 'sun') {
        return card.sunPoints;
    } else {
        // In hokm, trump suit cards use hokm points, others use sun points
        if (card.suitId === hokmSuit) {
            return card.hokmPoints;
        }
        return card.sunPoints;
    }
}

/**
 * Calculate total points of a set of cards
 */
function calculateTrickPoints(cards, gameType, hokmSuit) {
    return cards.reduce((total, card) => total + getCardPoints(card, gameType, hokmSuit), 0);
}

/**
 * Sort cards for display: group by suit, then sort by project order within each suit
 */
function sortHand(cards) {
    const suitOrder = ['diamonds', 'hearts', 'spades', 'clubs'];
    return [...cards].sort((a, b) => {
        const suitDiff = suitOrder.indexOf(a.suitId) - suitOrder.indexOf(b.suitId);
        if (suitDiff !== 0) return suitDiff;
        return b.projectOrder - a.projectOrder;
    });
}

/**
 * Get valid cards that can be played given the lead suit and game type
 */
function getValidCards(hand, leadSuit, gameType, hokmSuit) {
    if (!leadSuit) {
        // First player can play anything
        return hand;
    }

    // Must follow lead suit if possible
    const sameSuitCards = hand.filter(c => c.suitId === leadSuit);
    if (sameSuitCards.length > 0) {
        return sameSuitCards;
    }

    // In hokm, if can't follow suit, can play trump or any card
    // In sun, if can't follow suit, can play anything
    return hand;
}
