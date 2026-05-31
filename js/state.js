// state.js - Database & State Orchestrator

const STATE_KEY_PREFIX = 'ielts_vocab_gym_';
const HISTORY_KEY_PREFIX = 'ielts_vocab_gym_history_';

const state = {
  // Global States
  activeListName: '',
  activeWords: [],
  
  // Active learning round states
  sessionWords: [],
  sessionIndex: 0,
  sessionResults: [],
  sessionTimerId: null,
  sessionTimerSecs: 0,
  wordStartTime: 0,
  correctStreak: 0,
  maxCorrectStreak: 0,
  wrongAnswerAttempted: false,

  // Ledger table pagination state
  ledgerPage: 1,
  ledgerLimit: 15,
  filteredLedgerWords: [],

  // Database / Vault Operations
  getVaultKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Must start with vocab prefix but NOT match the history prefix
      if (key.startsWith(STATE_KEY_PREFIX) && !key.startsWith(HISTORY_KEY_PREFIX)) {
        keys.push(key.substring(STATE_KEY_PREFIX.length));
      }
    }
    return keys;
  },

  loadList(filename) {
    const key = STATE_KEY_PREFIX + filename;
    const serialized = localStorage.getItem(key);
    if (!serialized) return null;
    try {
      return JSON.parse(serialized);
    } catch (e) {
      console.error('Failed to parse database state:', e);
      return null;
    }
  },

  saveList(filename, words) {
    const key = STATE_KEY_PREFIX + filename;
    localStorage.setItem(key, JSON.stringify(words));
  },

  deleteList(filename) {
    const key = STATE_KEY_PREFIX + filename;
    localStorage.removeItem(key);
    
    // Also remove associated history
    localStorage.removeItem(HISTORY_KEY_PREFIX + filename);
  },

  // Intelligent merge: preserves stats and status if word already exists in local vault
  mergeAndSave(filename, newWords) {
    const existingWords = this.loadList(filename) || [];
    const existingMap = new Map();
    existingWords.forEach(w => existingMap.set(w.word.toLowerCase(), w));
    
    const mergedList = newWords.map(nw => {
      const existing = existingMap.get(nw.word.toLowerCase());
      if (existing) {
        return {
          ...nw,
          stats: existing.stats || { correct: 0, wrong: 0 },
          status: existing.status || 'unlearned'
        };
      }
      return nw;
    });
    
    this.saveList(filename, mergedList);
    return mergedList;
  },

  // Historical Rounds / Analytics Vault
  getSessionHistory(filename) {
    const key = HISTORY_KEY_PREFIX + filename;
    const serialized = localStorage.getItem(key);
    if (!serialized) return [];
    try {
      return JSON.parse(serialized);
    } catch (e) {
      console.error('Failed to parse history vault logs:', e);
      return [];
    }
  },

  saveSessionHistory(filename, resultsSummary) {
    const key = HISTORY_KEY_PREFIX + filename;
    const history = this.getSessionHistory(filename);
    
    const sessionRecord = {
      sessionId: 'sess_' + Date.now(),
      timestamp: Date.now(),
      totalWords: resultsSummary.totalWords,
      correctCount: resultsSummary.correctCount,
      accuracy: resultsSummary.accuracy,
      avgSpeed: parseFloat(resultsSummary.avgSpeed),
      maxStreak: resultsSummary.maxStreak,
      results: resultsSummary.results.map(r => ({
        word: r.word.word,
        definition: r.word.definition,
        correct: r.correct,
        elapsed: r.elapsed,
        initialStatus: r.initialStatus,
        finalStatus: r.finalStatus
      }))
    };
    
    history.push(sessionRecord);
    localStorage.setItem(key, JSON.stringify(history));
    return sessionRecord;
  },

  clearSessionHistory(filename) {
    const key = HISTORY_KEY_PREFIX + filename;
    localStorage.removeItem(key);
  }
};
