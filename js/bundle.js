// bundle.js - Refactored for Central Dictionary Architecture
// IELTS Vocab Gym with ID-based word reference system

// ====================================================================================
// Central Dictionary Loader (Baked-in Database from dictionary.js)
// ====================================================================================
const centralDictionary = {
  data: null,
  wordMap: new Map(), // word -> id
  idMap: new Map(),   // id -> word data

  init() {
    try {
      // Use embedded data from dictionary.js
      if (typeof DICTIONARY_DATA === 'undefined') {
        console.error('[Dictionary] DICTIONARY_DATA not found. Make sure dictionary.js is loaded first.');
        return false;
      }

      this.data = DICTIONARY_DATA;

      // Build lookup maps
      DICTIONARY_DATA.dictionary.forEach(entry => {
        this.wordMap.set(entry.word.toLowerCase(), entry.id);
        this.idMap.set(entry.id, entry);
      });

      // Build prefix index for fast search
      this.buildPrefixIndex();

      console.log(`[Dictionary] Loaded ${DICTIONARY_DATA.totalWords} words`);
      return true;
    } catch (e) {
      console.error('[Dictionary] Failed to load:', e);
      return false;
    }
  },

  getById(id) {
    return this.idMap.get(id) || null;
  },

  getByWord(word) {
    const id = this.wordMap.get(word.toLowerCase());
    return id ? this.idMap.get(id) : null;
  },

  // Build prefix index for fast search
  buildPrefixIndex() {
    this.prefixIndex = new Map();
    
    for (const entry of this.data.dictionary) {
      const word = entry.word.toLowerCase();
      // Index all prefixes (1-10 chars)
      for (let i = 1; i <= Math.min(word.length, 10); i++) {
        const prefix = word.substring(0, i);
        if (!this.prefixIndex.has(prefix)) {
          this.prefixIndex.set(prefix, []);
        }
        this.prefixIndex.get(prefix).push(entry);
      }
    }
  },

  // Calculate edit distance for fuzzy matching
  editDistance(s1, s2, maxDist = 3) {
    const len1 = s1.length, len2 = s2.length;
    if (Math.abs(len1 - len2) > maxDist) return maxDist + 1;
    
    const dp = Array(len2 + 1).fill(0);
    for (let j = 0; j <= len2; j++) dp[j] = j;
    
    for (let i = 1; i <= len1; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= len2; j++) {
        const temp = dp[j];
        if (s1[i - 1] === s2[j - 1]) {
          dp[j] = prev;
        } else {
          dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1);
        }
        prev = temp;
        if (dp[j] > maxDist) break;
      }
    }
    return dp[len2];
  },

  search(query, limit = 20) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];
    
    const results = new Map(); // Use Map to deduplicate
    
    // Strategy 1: Exact prefix match (highest priority)
    if (this.prefixIndex && this.prefixIndex.has(lowerQuery)) {
      const prefixMatches = this.prefixIndex.get(lowerQuery);
      for (const entry of prefixMatches) {
        if (!results.has(entry.id)) {
          results.set(entry.id, { entry, score: 100 - entry.word.length }); // Shorter words rank higher
        }
      }
    }
    
    // Strategy 2: Contains match (medium priority)
    if (results.size < limit) {
      for (const entry of this.data.dictionary) {
        if (results.has(entry.id)) continue;
        const word = entry.word.toLowerCase();
        
        if (word.includes(lowerQuery)) {
          // Score: starts with query > contains query
          let score = 50;
          if (word.startsWith(lowerQuery)) score += 30;
          if (word === lowerQuery) score += 20;
          score -= entry.word.length * 0.1; // Prefer shorter words
          
          results.set(entry.id, { entry, score });
          if (results.size >= limit * 2) break;
        }
      }
    }
    
    // Strategy 3: Fuzzy match for typos (lowest priority, only for longer queries)
    if (lowerQuery.length >= 4 && results.size < limit) {
      for (const entry of this.data.dictionary) {
        if (results.has(entry.id)) continue;
        const word = entry.word.toLowerCase();

        if (Math.abs(word.length - lowerQuery.length) <= 2) {
          const dist = this.editDistance(lowerQuery, word, 2);
          if (dist <= 2) {
            results.set(entry.id, { entry, score: 20 - dist * 5 });
          }
        }
        if (results.size >= limit * 4) break;
      }
    }

    // Strategy 4: Definition search — match query in Chinese definition
    if (results.size < limit) {
      for (const entry of this.data.dictionary) {
        if (results.has(entry.id)) continue;
        const def = entry.definition;
        if (def.includes(query)) {
          // Score: prefer shorter definitions and exact matches
          let score = 15;
          score -= def.length * 0.01;
          results.set(entry.id, { entry, score });
        }
        if (results.size >= limit * 3) break;
      }
    }
    
    // Sort by score and return top results
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.entry);
  },

  getWordId(word) {
    return this.wordMap.get(word.toLowerCase()) || null;
  }
};

// ====================================================================================
// State Management - User Progress Only (No Word Definitions)
// ====================================================================================
const STATE_KEY_PREFIX = 'ielts_vocab_gym_';
const USER_PROGRESS_KEY = STATE_KEY_PREFIX + 'user_progress';
const LIST_KEY_PREFIX = STATE_KEY_PREFIX + 'list_';

// User progress format:
// {
//   version: '2.0',
//   wordProgress: {
//     'wordId': { correct: 0, wrong: 0, status: 'unlearned|unfamiliar|mastered' }
//   },
//   lists: ['list1', 'list2']
// }

const state = {
  // Active training session
  activeListName: '',
  activeWordIds: [], // Array of word IDs

  // Session states
  sessionWordIds: [],
  sessionIndex: 0,
  sessionResults: [],
  sessionTimerId: null,
  sessionTimerSecs: 0,
  wordStartTime: 0,
  correctStreak: 0,
  maxCorrectStreak: 0,
  wrongAnswerAttempted: false,
  wordManuallyMarkedUnfamiliar: false,

  // Ledger pagination
  ledgerPage: 1,
  ledgerLimit: 15,
  filteredLedgerIds: [],

  // User progress cache
  _userProgress: null,

  // Get user progress from localStorage
  getUserProgress() {
    if (this._userProgress) return this._userProgress;

    const saved = localStorage.getItem(USER_PROGRESS_KEY);
    if (saved) {
      try {
        this._userProgress = JSON.parse(saved);
        return this._userProgress;
      } catch (e) {
        console.error('Failed to parse user progress:', e);
      }
    }

    // Initialize new progress
    this._userProgress = {
      version: '2.0',
      wordProgress: {},
      lists: []
    };
    return this._userProgress;
  },

  // Save user progress
  saveUserProgress() {
    if (this._userProgress) {
      localStorage.setItem(USER_PROGRESS_KEY, JSON.stringify(this._userProgress));
    }
  },

  // Get word progress (returns { correct, wrong, status })
  getWordProgress(wordId) {
    const progress = this.getUserProgress();
    return progress.wordProgress[wordId] || { correct: 0, wrong: 0, status: 'unlearned' };
  },

  // Update word progress
  updateWordProgress(wordId, updates) {
    const progress = this.getUserProgress();
    if (!progress.wordProgress[wordId]) {
      progress.wordProgress[wordId] = { correct: 0, wrong: 0, status: 'unlearned' };
    }
    Object.assign(progress.wordProgress[wordId], updates);
    this.saveUserProgress();
  },

  // Get word status
  getWordStatus(wordId) {
    return this.getWordProgress(wordId).status;
  },

  // Get word stats
  getWordStats(wordId) {
    const p = this.getWordProgress(wordId);
    return { correct: p.correct || 0, wrong: p.wrong || 0 };
  },

  // Get accuracy for word
  getWordAccuracy(wordId) {
    const stats = this.getWordStats(wordId);
    const total = stats.correct + stats.wrong;
    return total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  },

  // List operations
  getListNames() {
    const progress = this.getUserProgress();
    return progress.lists || [];
  },

  loadList(listName) {
    const key = LIST_KEY_PREFIX + listName;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse list:', e);
      }
    }
    return null;
  },

  saveList(listName, wordIds) {
    const key = LIST_KEY_PREFIX + listName;
    localStorage.setItem(key, JSON.stringify({
      name: listName,
      wordIds: wordIds,
      createdAt: Date.now()
    }));

    // Add to lists registry
    const progress = this.getUserProgress();
    if (!progress.lists.includes(listName)) {
      progress.lists.push(listName);
      this.saveUserProgress();
    }
  },

  deleteList(listName) {
    const key = LIST_KEY_PREFIX + listName;
    localStorage.removeItem(key);

    const progress = this.getUserProgress();
    progress.lists = progress.lists.filter(l => l !== listName);
    this.saveUserProgress();
  },

  // Merge word IDs into list (for Excel import)
  mergeList(listName, newWordIds) {
    const existing = this.loadList(listName);
    const existingIds = existing ? existing.wordIds : [];

    // Merge and deduplicate
    const mergedIds = [...new Set([...existingIds, ...newWordIds])];
    this.saveList(listName, mergedIds);

    return mergedIds;
  }
};

// ====================================================================================
// Sound Effects
// ====================================================================================
const playSFX = (type) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'wrong') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'unfamiliar') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }

    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch (e) {
    console.warn('Audio error:', e);
  }
};

// ====================================================================================
// Speech Synthesis
// ====================================================================================
const speech = {
  voices: [],
  voiceMap: new Map(),

  init() {
    if (!window.speechSynthesis) return;

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices();
      this.populateVoiceSelector();
    };

    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  },

  populateVoiceSelector() {
    const select = document.getElementById('voice-selector');
    if (!select) return;
    select.innerHTML = '';
    this.voiceMap.clear();

    const enVoices = this.voices.filter(v => /^en[-_]/i.test(v.lang));
    const systemVoices = enVoices.filter(v => !v.name.toLowerCase().includes('google') && v.localService);
    const networkVoices = enVoices.filter(v => v.name.toLowerCase().includes('google') || !v.localService);
    const voicesToUse = [...systemVoices, ...networkVoices];

    if (voicesToUse.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No English voices found';
      select.appendChild(opt);
      return;
    }

    let selectedIdx = 0;
    for (let i = 0; i < voicesToUse.length; i++) {
      const name = voicesToUse[i].name.toLowerCase();
      const lang = voicesToUse[i].lang.toLowerCase();
      if (name.includes('google') && lang.includes('us')) {
        selectedIdx = i;
        break;
      }
    }

    voicesToUse.forEach((v, index) => {
      const opt = document.createElement('option');
      const originalIndex = this.voices.indexOf(v);
      opt.value = originalIndex;
      this.voiceMap.set(String(originalIndex), v);

      let label = `${v.name} (${v.lang})`;
      if (systemVoices.includes(v)) label += ' (Offline)';
      else if (networkVoices.includes(v)) label += ' (Online)';
      opt.textContent = label;

      if (index === selectedIdx) opt.selected = true;
      select.appendChild(opt);
    });
  },

  pronounce(text, onEnd) {
    if (!window.speechSynthesis) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }
    window.speechSynthesis.cancel();

    if (this.voices.length === 0) {
      this.voices = window.speechSynthesis.getVoices();
      if (this.voices.length === 0) {
        if (typeof onEnd === 'function') onEnd();
        return;
      }
      this.populateVoiceSelector();
    }

    const textToSpeak = text.replace(/[\[\](){}\/\\⟨⟩‿ˈˌː.]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    const select = document.getElementById('voice-selector');
    const rateSlider = document.getElementById('voice-rate');

    let voiceSet = false;
    if (select && select.value !== '' && select.value !== 'default') {
      const voiceIdx = parseInt(select.value);
      if (!isNaN(voiceIdx) && this.voices[voiceIdx]) {
        utterance.voice = this.voices[voiceIdx];
        voiceSet = true;
      }
    }

    if (!voiceSet) {
      const defaultEn = this.voices.find(v => /^en[-_]/i.test(v.lang));
      if (defaultEn) utterance.voice = defaultEn;
    }

    if (rateSlider) {
      utterance.rate = parseFloat(rateSlider.value) || 1.0;
    }
    utterance.pitch = 1.0;

    if (typeof onEnd === 'function') {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  }
};

// ====================================================================================
// Excel Parser - Now only extracts word IDs
// ====================================================================================
const excelParser = {
  parseFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const wordIds = this.extractWordIds(rawRows);
        callback(null, wordIds);
      } catch (err) {
        callback(err);
      }
    };
    reader.onerror = () => callback(new Error('File reading error.'));
    reader.readAsArrayBuffer(file);
  },

  extractWordIds(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

    let wordIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (/单词|word|spelling|vocab|term|english/i.test(h)) {
        wordIdx = i;
        break;
      }
    }

    if (wordIdx === -1) {
      throw new Error('Could not identify a "word" column.');
    }

    const wordIds = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const word = String(row[wordIdx] || '').trim();
      if (!word) continue;

      // Look up word ID in central dictionary
      const wordId = centralDictionary.getWordId(word);
      if (wordId) {
        wordIds.push(wordId);
      }
    }

    return wordIds;
  }
};

// ====================================================================================
// Dictation Controller
// ====================================================================================
const dictation = {
  init() {
    document.getElementById('btn-start-session').addEventListener('click', () => this.startSession());
    document.getElementById('btn-quit-session').addEventListener('click', () => {
      if (confirm('Quit session? Progress will be saved.')) this.quitSession();
    });
    document.getElementById('btn-dictation-pronounce').addEventListener('click', () => this.playActiveWordAudio());
    document.getElementById('dictation-input').addEventListener('keydown', (e) => this.handleInputKeydowns(e));
    document.getElementById('btn-replay-session').addEventListener('click', () => this.startSession());
    document.getElementById('btn-results-home').addEventListener('click', () => this.exitToDashboard());
    document.getElementById('tested-search').addEventListener('input', () => this.renderResultsBreakdown());
  },

  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  startSession() {
    playSFX('click');

    const filterVal = document.querySelector('input[name="session-filter"]:checked').value;
    const limitInput = document.getElementById('session-timer').value;
    state.sessionTimerSecs = limitInput ? parseInt(limitInput) : 0;

    let pool = [...state.activeWordIds];

    if (filterVal === 'unfamiliar') {
      pool = pool.filter(id => state.getWordStatus(id) === 'unfamiliar');
    } else if (filterVal === 'low-accuracy') {
      const threshold = parseInt(document.getElementById('accuracy-threshold').value) || 60;
      pool = pool.filter(id => {
        const stats = state.getWordStats(id);
        const total = stats.correct + stats.wrong;
        if (total === 0) return true;
        return (stats.correct / total) * 100 < threshold;
      });
    } else if (filterVal === 'unlearned') {
      pool = pool.filter(id => state.getWordStatus(id) === 'unlearned');
    }

    if (pool.length === 0) {
      alert('No words found matching filter.');
      return;
    }

    const sizeInput = document.getElementById('session-size').value.trim();
    let sessionSize = sizeInput ? parseInt(sizeInput) : pool.length;
    if (isNaN(sessionSize) || sessionSize <= 0) sessionSize = pool.length;

    const shuffled = this.shuffleArray(pool);
    state.sessionWordIds = shuffled.slice(0, sessionSize);

    state.sessionIndex = 0;
    state.sessionResults = [];
    state.correctStreak = 0;
    state.maxCorrectStreak = 0;
    state.wrongAnswerAttempted = false;

    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('results-view').classList.add('hidden');
    document.getElementById('word-ledger-container').classList.add('hidden');
    document.getElementById('dictation-view').classList.remove('hidden');

    document.getElementById('total-session-words').textContent = state.sessionWordIds.length;

    this.loadActiveWord();
  },

  loadActiveWord() {
    if (state.sessionIndex >= state.sessionWordIds.length) {
      this.endSession();
      return;
    }

    const wordId = state.sessionWordIds[state.sessionIndex];
    const wordData = centralDictionary.getById(wordId);
    if (!wordData) {
      state.sessionIndex++;
      this.loadActiveWord();
      return;
    }

    state.wrongAnswerAttempted = false;
    // Capture status at presentation time so backtick toggles during
    // the word do not overwrite the "initial" status in the results.
    state.currentWordInitialStatus = state.getWordStatus(wordId);
    state.wordManuallyMarkedUnfamiliar = false;

    document.getElementById('reveal-drawer').classList.add('hidden');

    const feedback = document.getElementById('feedback-ring');
    feedback.className = 'relative rounded-2xl p-0.5 bg-zinc-800 transition-all duration-300';

    const input = document.getElementById('dictation-input');
    input.value = '';
    input.readOnly = false;

    setTimeout(() => input.focus(), 80);

    document.getElementById('current-word-index').textContent = state.sessionIndex + 1;
    const progressPercent = ((state.sessionIndex + 1) / state.sessionWordIds.length) * 100;
    document.getElementById('session-progress-bar').style.width = `${progressPercent}%`;

    this.updateUnfamiliarBadge(state.getWordStatus(wordId) === 'unfamiliar');

    setTimeout(() => {
      this.playActiveWordAudio(() => {
        state.wordStartTime = Date.now();
        this.startCountdownTimer();
      });
    }, 150);
  },

  playActiveWordAudio(onEnd) {
    if (state.sessionIndex >= state.sessionWordIds.length) return;
    const wordId = state.sessionWordIds[state.sessionIndex];
    const wordData = centralDictionary.getById(wordId);
    if (wordData) {
      speech.pronounce(wordData.word, onEnd);
    }
  },

  updateUnfamiliarBadge(isUnfamiliar) {
    const badge = document.getElementById('unfamiliar-badge');
    if (isUnfamiliar) {
      badge.classList.remove('opacity-0', 'scale-95');
      badge.classList.add('opacity-100', 'scale-100');
    } else {
      badge.classList.add('opacity-0', 'scale-95');
      badge.classList.remove('opacity-100', 'scale-100');
    }
  },

  startCountdownTimer() {
    clearInterval(state.sessionTimerId);
    const counter = document.getElementById('word-countdown');

    if (state.sessionTimerSecs <= 0) {
      counter.classList.add('hidden');
      return;
    }

    counter.classList.remove('hidden');
    let remaining = state.sessionTimerSecs;

    const updateText = () => {
      counter.textContent = `${remaining}s`;
      if (remaining > 5) {
        counter.className = 'absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-brand-500/10 border border-brand-500/20 text-brand-400 font-bold rounded-lg text-sm font-mono';
      } else if (remaining > 2) {
        counter.className = 'absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-amber-500/15 border border-amber-500/35 text-amber-400 font-bold rounded-lg text-sm font-mono';
      } else {
        counter.className = 'absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-400 font-bold rounded-lg text-sm font-mono animate-pulse';
      }
    };

    updateText();

    state.sessionTimerId = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(state.sessionTimerId);
        this.handleWordTimeout();
      } else {
        updateText();
      }
    }, 1000);
  },

  handleWordTimeout() {
    clearInterval(state.sessionTimerId);

    const wordId = state.sessionWordIds[state.sessionIndex];
    const wordData = centralDictionary.getById(wordId);
    const input = document.getElementById('dictation-input');
    input.readOnly = true;

    playSFX('wrong');
    state.correctStreak = 0;
    this.updateStreakUI();

    const initialStatus = state.currentWordInitialStatus || 'unlearned';
    state.updateWordProgress(wordId, {
      wrong: state.getWordStats(wordId).wrong + 1,
      status: 'unfamiliar'
    });
    this.updateUnfamiliarBadge(true);

    const elapsed = Date.now() - state.wordStartTime;
    state.sessionResults.push({
      wordId: wordId,
      word: wordData.word,
      elapsed: elapsed,
      correct: false,
      initialStatus: initialStatus,
      finalStatus: 'unfamiliar'
    });

    const feedback = document.getElementById('feedback-ring');
    feedback.className = 'relative rounded-2xl p-0.5 bg-rose-500 transition-all duration-300 animate-shake';

    this.revealAnswer(wordData, false);
    state.wrongAnswerAttempted = true;
  },

  handleInputKeydowns(e) {
    if (state.sessionIndex >= state.sessionWordIds.length) return;

    const wordId = state.sessionWordIds[state.sessionIndex];
    const wordData = centralDictionary.getById(wordId);
    if (!wordData) return;

    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      this.playActiveWordAudio();
      return;
    }

    if (e.key === '`') {
      e.preventDefault();
      const currentStatus = state.getWordStatus(wordId);
      const newStatus = currentStatus === 'unfamiliar' ? 'unlearned' : 'unfamiliar';
      state.updateWordProgress(wordId, { status: newStatus });
      playSFX('unfamiliar');
      this.updateUnfamiliarBadge(newStatus === 'unfamiliar');
      if (newStatus === 'unfamiliar') state.wordManuallyMarkedUnfamiliar = true;
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      clearInterval(state.sessionTimerId);

      if (state.wrongAnswerAttempted) {
        playSFX('click');
        state.sessionIndex++;
        this.loadActiveWord();
        return;
      }

      const input = document.getElementById('dictation-input');
      const value = input.value.trim();

      if (!value || /^\s*$/.test(value)) return;

      const isCorrect = value.toLowerCase() === wordData.word.toLowerCase();
      const elapsed = Date.now() - state.wordStartTime;
      const initialStatus = state.currentWordInitialStatus || 'unlearned';

      if (isCorrect) {
        playSFX('correct');
        state.correctStreak++;
        if (state.correctStreak > state.maxCorrectStreak) state.maxCorrectStreak = state.correctStreak;
        this.updateStreakUI();

        const stats = state.getWordStats(wordId);
        const newCorrect = stats.correct + 1;
        let newStatus = initialStatus;
        if (state.wordManuallyMarkedUnfamiliar) {
          newStatus = 'unfamiliar';
        } else {
          newStatus = 'mastered';
        }

        state.updateWordProgress(wordId, {
          correct: stats.correct + 1,
          status: newStatus
        });

        state.sessionResults.push({
          wordId: wordId,
          word: wordData.word,
          elapsed: elapsed,
          correct: true,
          initialStatus: initialStatus,
          finalStatus: newStatus
        });

        const feedback = document.getElementById('feedback-ring');
        feedback.className = 'relative rounded-2xl p-0.5 bg-emerald-500 transition-all duration-300';
        input.readOnly = true;

        this.revealAnswer(wordData, true);
        state.wrongAnswerAttempted = true;

      } else {
        playSFX('wrong');
        state.correctStreak = 0;
        this.updateStreakUI();

        const stats = state.getWordStats(wordId);
        state.updateWordProgress(wordId, {
          wrong: stats.wrong + 1,
          status: 'unfamiliar'
        });
        this.updateUnfamiliarBadge(true);

        state.sessionResults.push({
          wordId: wordId,
          word: wordData.word,
          elapsed: elapsed,
          correct: false,
          initialStatus: initialStatus,
          finalStatus: 'unfamiliar'
        });

        const feedback = document.getElementById('feedback-ring');
        feedback.className = 'relative rounded-2xl p-0.5 bg-rose-500 transition-all duration-300 animate-shake';
        input.readOnly = true;

        this.revealAnswer(wordData, false);
        state.wrongAnswerAttempted = true;
      }
    }
  },

  updateStreakUI() {
    const streakContainer = document.getElementById('streak-indicator');
    const streakCount = document.getElementById('streak-count');
    if (state.correctStreak > 0) {
      streakContainer.classList.remove('hidden');
      streakContainer.classList.add('flex');
      streakCount.textContent = state.correctStreak;
      if (state.correctStreak >= 5) {
        streakContainer.className = 'flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-black rounded-lg transition-all animate-pulse-subtle shadow-md shadow-amber-500/10 scale-105';
      }
    } else {
      streakContainer.classList.add('hidden');
      streakContainer.classList.remove('flex');
    }
  },

  revealAnswer(wordData, isCorrect) {
    document.getElementById('reveal-drawer').classList.remove('hidden');
    const resultBadge = document.getElementById('reveal-result-text');
    if (resultBadge) {
      if (isCorrect) {
        resultBadge.textContent = 'Correct';
        resultBadge.className = 'text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      } else {
        resultBadge.textContent = 'Incorrect';
        resultBadge.className = 'text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30';
      }
    }
    document.getElementById('revealed-word').textContent = wordData.word;

    const phoneticsContainer = document.getElementById('revealed-phonetics');
    const brSpan = document.getElementById('revealed-phonetic-br');
    const usSpan = document.getElementById('revealed-phonetic-us');

    // Use single phonetic field from dictionary
    if (wordData.phonetic) {
      brSpan.textContent = wordData.phonetic;
      brSpan.classList.remove('hidden');
      usSpan.classList.add('hidden');
      phoneticsContainer.classList.remove('hidden');
    } else {
      phoneticsContainer.classList.add('hidden');
    }

    const defEl = document.getElementById('revealed-definition');
    defEl.textContent = wordData.definition;
    defEl.style.whiteSpace = 'pre-line';
  },

  endSession() {
    clearInterval(state.sessionTimerId);
    playSFX('correct');
    document.getElementById('session-progress-bar').style.width = '100%';

    document.getElementById('dictation-view').classList.add('hidden');
    document.getElementById('results-view').classList.remove('hidden');

    const total = state.sessionResults.length;
    const correctCount = state.sessionResults.filter(r => r.correct).length;
    const accPercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const totalDuration = state.sessionResults.reduce((acc, r) => acc + r.elapsed, 0);
    const avgDuration = total > 0 ? ((totalDuration / 1000) / total).toFixed(1) : '0.0';

    document.getElementById('result-stat-accuracy').textContent = `${accPercent}%`;
    document.getElementById('result-stat-count').textContent = `${correctCount}/${total}`;
    document.getElementById('result-stat-speed').textContent = `${avgDuration}s`;
    document.getElementById('result-stat-streak').textContent = `🔥 ${state.maxCorrectStreak}`;

    this.renderResultsBreakdown();

    if (typeof dashboard !== 'undefined' && dashboard.updateStats) {
      dashboard.updateStats();
    }
    if (typeof dashboard !== 'undefined' && dashboard.updateHeaderStats) {
      dashboard.updateHeaderStats();
    }
    if (typeof ledger !== 'undefined' && ledger.render) {
      ledger.render();
    }
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  renderResultsBreakdown() {
    const container = document.getElementById('tested-words-list');
    const searchVal = document.getElementById('tested-search').value.toLowerCase().trim();

    container.innerHTML = '';

    const filteredResults = state.sessionResults.filter(r => {
      return r.word.toLowerCase().includes(searchVal);
    });

    if (filteredResults.length === 0) {
      container.innerHTML = `
        <div class="col-span-2 text-center py-8 text-zinc-500 text-sm">
          No matching tested words found.
        </div>
      `;
      return;
    }

    filteredResults.forEach(r => {
      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border flex flex-col justify-between space-y-3 bg-[#121214]/60 ${r.correct ? 'border-emerald-500/20' : 'border-rose-500/20'}`;

      const wordEscaped = this.escapeHtml(r.word);
      const wordData = centralDictionary.getById(r.wordId);
      const defEscaped = wordData ? this.escapeHtml(wordData.definition) : '';

      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <h4 class="font-bold font-mono text-zinc-100 text-sm flex items-center gap-1.5">
              <span>${wordEscaped}</span>
              <span class="text-[10px] font-mono text-zinc-500">(${((r.elapsed / 1000)).toFixed(1)}s)</span>
            </h4>
            ${defEscaped ? `<p class="text-xs text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-line line-clamp-3" title="${defEscaped}">${defEscaped}</p>` : ''}
            <div class="flex gap-2 mt-2">
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.initialStatus === 'mastered' ? 'bg-emerald-500/20 text-emerald-300' : (r.initialStatus === 'unfamiliar' ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-700 text-zinc-400')}">
                Original: ${r.initialStatus}
              </span>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.finalStatus === 'mastered' ? 'bg-emerald-500/20 text-emerald-300' : (r.finalStatus === 'unfamiliar' ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-700 text-zinc-400')}">
                Final: ${r.finalStatus}
              </span>
            </div>
          </div>

          <span class="flex-shrink-0 ml-3 h-6 w-6 rounded-full flex items-center justify-center ${r.correct ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
            ${r.correct ? `
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ` : `
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            `}
          </span>
        </div>

        <div class="flex items-center justify-between border-t border-zinc-900 pt-2.5 text-[10px]">
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500 font-medium">State Shift:</span>
            <span class="font-semibold ${r.initialStatus === 'mastered' ? 'text-emerald-400' : (r.initialStatus === 'unfamiliar' ? 'text-amber-400' : 'text-zinc-400')}">${r.initialStatus}</span>
            <svg class="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            <span class="font-semibold ${r.finalStatus === 'mastered' ? 'text-emerald-400' : (r.finalStatus === 'unfamiliar' ? 'text-amber-400' : 'text-zinc-400')}">${r.finalStatus}</span>
          </div>
          <button class="btn-replay-word text-zinc-500 hover:text-brand-400 flex items-center gap-1 text-[10px] font-semibold" data-word="${wordEscaped}">
            Replay Audio
          </button>
        </div>
      `;

      const replayBtn = card.querySelector('.btn-replay-word');
      if (replayBtn) {
        replayBtn.addEventListener('click', () => {
          speech.pronounce(r.word);
        });
      }

      container.appendChild(card);
    });
  },

  quitSession() {
    clearInterval(state.sessionTimerId);
    this.exitToDashboard();
  },

  exitToDashboard() {
    playSFX('click');
    document.getElementById('dictation-view').classList.add('hidden');
    document.getElementById('results-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('word-ledger-container').classList.remove('hidden');
  }
};

// ====================================================================================
// File Uploader
// ====================================================================================
const fileUploader = {
  init() {
    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('excel-file-input');

    if (!dropzone || !input) return;

    dropzone.addEventListener('click', () => input.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-brand-500', 'bg-zinc-900/60');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-brand-500', 'bg-zinc-900/60');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-brand-500', 'bg-zinc-900/60');
      if (e.dataTransfer.files.length > 0) {
        this.handleFile(e.dataTransfer.files[0]);
      }
    });

    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });
  },

  handleFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please upload a Microsoft Excel workbook (.xlsx or .xls).');
      return;
    }

    excelParser.parseFile(file, (err, wordIds) => {
      if (err) {
        alert(`Failed to parse: ${err.message}`);
        return;
      }

      if (wordIds.length === 0) {
        alert('No valid words found in the Excel file.');
        return;
      }

      const cleanFilename = file.name;
      const mergedIds = state.mergeList(cleanFilename, wordIds);

      playSFX('correct');
      alert(`Uploaded "${cleanFilename}"!\nMatched ${wordIds.length} words from dictionary.`);

      dashboard.refreshSelectors();
      dashboard.switchActiveList(cleanFilename);
    });
  }
};

// ====================================================================================
// Dashboard Controller
// ====================================================================================
const dashboard = {
  init() {
    this.bindEvents();
    this.refreshSelectors();
    this.updateStats();
  },

  bindEvents() {
    const listSelector = document.getElementById('list-selector');
    if (listSelector) {
      listSelector.addEventListener('change', (e) => {
        if (e.target.value) this.switchActiveList(e.target.value);
      });
    }

    const btnDelete = document.getElementById('btn-delete-list');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => this.deleteCurrentList());
    }

    const btnTestAudio = document.getElementById('btn-test-audio');
    if (btnTestAudio) {
      btnTestAudio.addEventListener('click', () => {
        speech.pronounce('welcome to IELTS vocabulary gym');
      });
    }

    const rateSlider = document.getElementById('voice-rate');
    const rateValue = document.getElementById('rate-value');
    if (rateSlider && rateValue) {
      rateSlider.addEventListener('input', (e) => {
        rateValue.textContent = `${e.target.value}x`;
      });
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => this.exportJSON());
    }
  },

  refreshSelectors() {
    const selector = document.getElementById('list-selector');
    if (!selector) return;

    const listNames = state.getListNames();
    const currentValue = selector.value;

    selector.innerHTML = '';

    if (listNames.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No lists loaded';
      opt.disabled = true;
      opt.selected = true;
      selector.appendChild(opt);
      return;
    }

    listNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === currentValue || name === state.activeListName) {
        opt.selected = true;
      }
      selector.appendChild(opt);
    });
  },

  switchActiveList(listName) {
    if (!listName) return;

    const listData = state.loadList(listName);
    if (!listData) {
      console.error('Failed to load list:', listName);
      return;
    }

    state.activeListName = listName;
    state.activeWordIds = listData.wordIds || [];

    this.refreshSelectors();
    this.updateStats();
    this.updateHeaderStats();

    const btnStart = document.getElementById('btn-start-session');
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    const listStatsCard = document.getElementById('list-stats-card');
    if (listStatsCard) {
      listStatsCard.classList.remove('hidden');
    }

    if (typeof ledger !== 'undefined' && ledger.render) {
      ledger.render();
    }
  },

  deleteCurrentList() {
    if (!state.activeListName) {
      alert('No list selected.');
      return;
    }

    if (!confirm(`Delete "${state.activeListName}"?`)) return;

    state.deleteList(state.activeListName);
    state.activeListName = '';
    state.activeWordIds = [];

    this.refreshSelectors();
    this.updateStats();
    this.updateHeaderStats();

    const btnStart = document.getElementById('btn-start-session');
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.classList.add('opacity-50', 'cursor-not-allowed');
    }

    const listStatsCard = document.getElementById('list-stats-card');
    if (listStatsCard) {
      listStatsCard.classList.add('hidden');
    }

    if (typeof ledger !== 'undefined' && ledger.render) {
      ledger.render();
    }

    playSFX('click');
  },

  updateStats() {
    const totalWords = state.activeWordIds.length;
    let mastered = 0, unfamiliar = 0, unlearned = 0;

    state.activeWordIds.forEach(id => {
      const status = state.getWordStatus(id);
      if (status === 'mastered') mastered++;
      else if (status === 'unfamiliar') unfamiliar++;
      else unlearned++;
    });

    const progressPercent = totalWords > 0 ? Math.round((mastered / totalWords) * 100) : 0;
    const circle = document.getElementById('mastery-progress-circle');
    const percentText = document.getElementById('mastery-progress-percent');
    const totalMetric = document.getElementById('total-words-metric');

    if (circle) {
      const circumference = 2 * Math.PI * 28;
      const offset = circumference - (progressPercent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }

    if (percentText) percentText.textContent = `${progressPercent}%`;
    if (totalMetric) totalMetric.textContent = totalWords;

    const barMastered = document.getElementById('bar-mastered');
    const barUnfamiliar = document.getElementById('bar-unfamiliar');
    const barUnlearned = document.getElementById('bar-unlearned');

    if (totalWords > 0) {
      if (barMastered) barMastered.style.width = `${(mastered / totalWords) * 100}%`;
      if (barUnfamiliar) barUnfamiliar.style.width = `${(unfamiliar / totalWords) * 100}%`;
      if (barUnlearned) barUnlearned.style.width = `${(unlearned / totalWords) * 100}%`;
    } else {
      if (barMastered) barMastered.style.width = '0%';
      if (barUnfamiliar) barUnfamiliar.style.width = '0%';
      if (barUnlearned) barUnlearned.style.width = '0%';
    }

    const badgeUnfamiliar = document.getElementById('badge-unfamiliar-count');
    if (badgeUnfamiliar) badgeUnfamiliar.textContent = unfamiliar;
  },

  updateHeaderStats() {
    const headerFilename = document.getElementById('header-filename');
    const statMastered = document.getElementById('stat-count-mastered');
    const statUnfamiliar = document.getElementById('stat-count-unfamiliar');
    const statUnlearned = document.getElementById('stat-count-unlearned');

    if (headerFilename) headerFilename.textContent = state.activeListName || 'None';

    let mastered = 0, unfamiliar = 0, unlearned = 0;
    state.activeWordIds.forEach(id => {
      const status = state.getWordStatus(id);
      if (status === 'mastered') mastered++;
      else if (status === 'unfamiliar') unfamiliar++;
      else unlearned++;
    });

    if (statMastered) statMastered.textContent = mastered;
    if (statUnfamiliar) statUnfamiliar.textContent = unfamiliar;
    if (statUnlearned) statUnlearned.textContent = unlearned;
  },

  exportJSON() {
    const progress = state.getUserProgress();
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '2.0',
      progress: progress
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts_progress_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    playSFX('correct');
  }
};

// ====================================================================================
// Ledger Controller
// ====================================================================================
const ledger = {
  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    const searchInput = document.getElementById('ledger-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.ledgerPage = 1;
        this.render();
      });
    }

    const statusFilter = document.getElementById('ledger-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        state.ledgerPage = 1;
        this.render();
      });
    }

    const btnPrev = document.getElementById('btn-ledger-prev');
    const btnNext = document.getElementById('btn-ledger-next');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (state.ledgerPage > 1) {
          state.ledgerPage--;
          this.render();
        }
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        const maxPage = Math.ceil(state.filteredLedgerIds.length / state.ledgerLimit);
        if (state.ledgerPage < maxPage) {
          state.ledgerPage++;
          this.render();
        }
      });
    }
  },

  getFilteredIds() {
    const searchVal = (document.getElementById('ledger-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('ledger-status-filter')?.value || 'all';

    return state.activeWordIds.filter(id => {
      const wordData = centralDictionary.getById(id);
      if (!wordData) return false;

      if (statusFilter !== 'all' && state.getWordStatus(id) !== statusFilter) {
        return false;
      }

      if (searchVal) {
        return wordData.word.toLowerCase().includes(searchVal) ||
               wordData.definition.toLowerCase().includes(searchVal);
      }

      return true;
    });
  },

  render() {
    const tbody = document.getElementById('ledger-table-body');
    const pagination = document.getElementById('ledger-pagination');

    if (!tbody) return;

    if (state.activeWordIds.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-zinc-500 font-medium">No active list. Upload an Excel file to populate.</td>
        </tr>
      `;
      if (pagination) pagination.classList.add('hidden');
      return;
    }

    state.filteredLedgerIds = this.getFilteredIds();

    if (state.filteredLedgerIds.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-zinc-500 font-medium">No words match the filter.</td>
        </tr>
      `;
      if (pagination) pagination.classList.add('hidden');
      return;
    }

    const totalWords = state.filteredLedgerIds.length;
    const totalPages = Math.ceil(totalWords / state.ledgerLimit);
    const start = (state.ledgerPage - 1) * state.ledgerLimit;
    const end = Math.min(start + state.ledgerLimit, totalWords);
    const pageIds = state.filteredLedgerIds.slice(start, end);

    if (pagination) {
      pagination.classList.remove('hidden');
      const pageStart = document.getElementById('ledger-page-start');
      const pageEnd = document.getElementById('ledger-page-end');
      const totalRows = document.getElementById('ledger-total-rows');
      const btnPrev = document.getElementById('btn-ledger-prev');
      const btnNext = document.getElementById('btn-ledger-next');

      if (pageStart) pageStart.textContent = start + 1;
      if (pageEnd) pageEnd.textContent = end;
      if (totalRows) totalRows.textContent = totalWords;
      if (btnPrev) btnPrev.disabled = state.ledgerPage <= 1;
      if (btnNext) btnNext.disabled = state.ledgerPage >= totalPages;
    }

    tbody.innerHTML = '';
    pageIds.forEach(id => {
      const wordData = centralDictionary.getById(id);
      if (!wordData) return;

      const stats = state.getWordStats(id);
      const attempts = stats.correct + stats.wrong;
      const accuracy = attempts > 0 ? Math.round((stats.correct / attempts) * 100) : 0;
      const status = state.getWordStatus(id);

      const tr = document.createElement('tr');

      let rowClass = 'transition-colors duration-200 border-l-2';
      let selectClass = 'ledger-status-select rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 transition-colors duration-200';
      if (status === 'mastered') {
        rowClass += ' bg-emerald-950/25 border-emerald-500/50 hover:bg-emerald-950/40';
        selectClass += ' bg-emerald-950/60 border-emerald-600/50 text-emerald-300 hover:border-emerald-400 focus:ring-emerald-500/50';
      } else if (status === 'unfamiliar') {
        rowClass += ' bg-amber-950/20 border-amber-500/40 hover:bg-amber-950/30';
        selectClass += ' bg-amber-950/50 border-amber-600/40 text-amber-300 hover:border-amber-400 focus:ring-amber-500/50';
      } else {
        rowClass += ' border-transparent hover:bg-zinc-900/50';
        selectClass += ' bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-600 focus:ring-brand-500/50';
      }
      tr.className = rowClass;


      const statusOptions = [
        { value: 'unlearned', label: 'Unlearned' },
        { value: 'unfamiliar', label: 'Unfamiliar' },
        { value: 'mastered', label: 'Mastered' }
      ];
      const statusSelect = statusOptions.map(opt =>
        `<option value="${opt.value}" ${status === opt.value ? 'selected' : ''}>${opt.label}</option>`
      ).join('');

      tr.innerHTML = `
        <td class="px-6 py-3.5">
          <div class="flex items-center gap-2"><span class="status-dot hidden w-2 h-2 rounded-full ml-1"></span><span class="font-mono font-semibold text-zinc-200">${this.escapeHtml(wordData.word)}</span></div>
        </td>
        <td class="px-6 py-3.5">
          <div class="text-xs font-mono text-zinc-500">
            ${wordData.phonetic ? this.escapeHtml(wordData.phonetic) : '—'}
          </div>
        </td>
        <td class="px-6 py-3.5">
          <div class="text-sm text-zinc-300 whitespace-pre-line">${this.escapeHtml(wordData.definition)}</div>
        </td>
        <td class="px-6 py-3.5 text-center">
          <span class="text-sm font-semibold text-zinc-300">${attempts}</span>
        </td>
        <td class="px-6 py-3.5 text-center">
          <span class="text-sm font-semibold ${accuracy >= 80 ? 'text-emerald-400' : (accuracy >= 50 ? 'text-amber-400' : 'text-rose-400')}">${accuracy}%</span>
        </td>
        <td class="px-6 py-3.5 text-right">
          <select class="${selectClass}" data-word-id="${id}">
            ${statusSelect}
          </select>
        </td>
      `;

      const select = tr.querySelector('.ledger-status-select');
      if (select) {
        select.addEventListener('change', (e) => {
          this.updateWordStatus(id, e.target.value);
        });
      }

      // Show status dot based on mastery level
      const dot = tr.querySelector('.status-dot');
      if (dot) {
        if (status === 'mastered') {
          dot.classList.remove('hidden');
          dot.classList.add('bg-emerald-400', 'shadow-sm', 'shadow-emerald-400/50');
        } else if (status === 'unfamiliar') {
          dot.classList.remove('hidden');
          dot.classList.add('bg-amber-400', 'shadow-sm', 'shadow-amber-400/50');
        }
      }
      tbody.appendChild(tr);
    });
  },

  updateWordStatus(wordId, newStatus) {
    state.updateWordProgress(wordId, { status: newStatus });
    dashboard.updateStats();
    dashboard.updateHeaderStats();
    this.render();
    playSFX('click');
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// ====================================================================================
// Dictionary Lookup — Header search dropdown panel
// ====================================================================================
const dictionaryLookup = {
  highlightedIndex: -1,
  resultCount: 0,
  closeTimeoutId: null,

  init() {
    this.bindEvents();
  },

  openDropdown() {
    const dropdown = document.getElementById('dict-dropdown');
    if (!dropdown) return;
    dropdown.classList.remove('hidden');
    dropdown.classList.remove('animate-fade-in');
    void dropdown.offsetWidth;
    dropdown.classList.add('animate-fade-in');
    this.highlightedIndex = -1;
    this.performSearch();
  },

  closeDropdown(blurSearch) {
    const dropdown = document.getElementById('dict-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    if (this.closeTimeoutId) {
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
    }
    this.highlightedIndex = -1;
    if (blurSearch) {
      const searchInput = document.getElementById('header-dict-search');
      if (searchInput) searchInput.blur();
    }
  },

  bindEvents() {
    const searchInput = document.getElementById('header-dict-search');
    const dropdown = document.getElementById('dict-dropdown');
    const searchWrapper = document.getElementById('header-search-wrapper');

    if (!searchInput || !dropdown) return;

    searchInput.addEventListener('focus', () => {
      this.openDropdown();
    });

    searchInput.addEventListener('input', () => {
      this.openDropdown();
    });

    searchInput.addEventListener('blur', () => {
      this.closeTimeoutId = setTimeout(() => {
        this.closeDropdown(false);
      }, 150);
    });

    dropdown.addEventListener('mousedown', (e) => {
      if (this.closeTimeoutId) {
        clearTimeout(this.closeTimeoutId);
        this.closeTimeoutId = null;
      }
      if (!e.target.closest('.btn-dict-pronounce')) {
        e.preventDefault();
      }
    });

    dropdown.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-dict-pronounce')) {
        searchInput.focus();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      const dropdownVisible = !dropdown.classList.contains('hidden');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!dropdownVisible) { this.openDropdown(); return; }
        this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.resultCount - 1);
        this.updateHighlight();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!dropdownVisible) { this.openDropdown(); return; }
        this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1);
        this.updateHighlight();
        return;
      }

      if (e.key === 'Enter') {
        if (dropdownVisible && this.highlightedIndex >= 0) {
          e.preventDefault();
          this.pronounceHighlighted();
          return;
        }
        if (dropdownVisible) {
          e.preventDefault();
          this.closeDropdown(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (dropdownVisible) {
          e.preventDefault();
          e.stopPropagation();
          this.closeDropdown(true);
        }
        return;
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        this.openDropdown();
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (dropdown.classList.contains('hidden')) return;
      if (searchWrapper && !searchWrapper.contains(e.target)) {
        this.closeDropdown(true);
      }
    });
  },

  performSearch() {
    const query = document.getElementById('header-dict-search')?.value || '';
    const resultsContainer = document.getElementById('dict-dropdown-results');
    const countEl = document.getElementById('dict-dropdown-count');

    if (!resultsContainer) return;

    this.highlightedIndex = -1;

    if (!query.trim()) {
      resultsContainer.className = 'flex-1 overflow-y-auto p-3';
      resultsContainer.innerHTML = '<p class="text-zinc-500 text-xs text-center py-8">Type to search the dictionary</p>';
      if (countEl) countEl.textContent = '0 words found';
      this.resultCount = 0;
      return;
    }

    const results = centralDictionary.search(query, 30);
    this.resultCount = results.length;

    if (countEl) {
      countEl.textContent = results.length === 1 ? '1 word found' : results.length + ' words found';
    }

    if (results.length === 0) {
      resultsContainer.className = 'flex-1 overflow-y-auto p-3';
      resultsContainer.innerHTML = '<p class="text-zinc-500 text-xs text-center py-8">No words found</p>';
      return;
    }

    resultsContainer.className = 'flex-1 overflow-y-auto p-3 columns-1 md:columns-2 gap-3 space-y-3';
    resultsContainer.innerHTML = '';

    results.forEach((entry, index) => {
      const progress = state.getWordProgress(entry.id);

      let accentBorder, statusBadgeClass;
      if (progress.status === 'mastered') {
        accentBorder = 'border-l-emerald-500/60';
        statusBadgeClass = 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
      } else if (progress.status === 'unfamiliar') {
        accentBorder = 'border-l-amber-500/60';
        statusBadgeClass = 'bg-amber-500/15 border-amber-500/30 text-amber-300';
      } else {
        accentBorder = 'border-l-zinc-700';
        statusBadgeClass = 'bg-zinc-800 border-zinc-700 text-zinc-400';
      }

      const statusText = progress.status.charAt(0).toUpperCase() + progress.status.slice(1);

      const wrapper = document.createElement('div');
      wrapper.className = 'inline-block w-full mb-3 break-inside-avoid';
      wrapper.setAttribute('data-dict-index', index);
      wrapper.setAttribute('data-dict-word', entry.word);

      wrapper.innerHTML =
        '<div class="dict-result-card bg-zinc-800/40 border border-zinc-800 border-l-2 ' + accentBorder + ' rounded-xl p-4 hover:bg-zinc-800/60 transition-colors group cursor-pointer">' +
          '<div class="flex items-start justify-between gap-3 mb-3">' +
            '<div class="flex-1 min-w-0">' +
              '<h4 class="font-mono font-bold text-zinc-100 text-base">' + this.escapeHtml(entry.word) + '</h4>' +
              (entry.phonetic ? '<p class="text-xs font-mono text-zinc-500 mt-0.5">' + this.escapeHtml(entry.phonetic) + '</p>' : '') +
            '</div>' +
            '<div class="flex items-center gap-2 flex-shrink-0">' +
              '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ' + statusBadgeClass + '">' + statusText + '</span>' +
              '<button class="btn-dict-pronounce text-zinc-500 hover:text-brand-400 p-1 transition-colors opacity-0 group-hover:opacity-100" data-word="' + this.escapeHtml(entry.word) + '" title="Pronounce">' +
                '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
                  '<path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />' +
                '</svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          this.formatDefinitionHTML(entry.definition) +
        '</div>';

      const pronounceBtn = wrapper.querySelector('.btn-dict-pronounce');
      if (pronounceBtn) {
        pronounceBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          speech.pronounce(entry.word);
        });
      }

      const card = wrapper.querySelector('.dict-result-card');
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-dict-pronounce')) {
          speech.pronounce(entry.word);
        }
      });

      resultsContainer.appendChild(wrapper);
    });
  },

  updateHighlight() {
    const wrappers = document.querySelectorAll('#dict-dropdown-results [data-dict-index]');
    wrappers.forEach((wrapper, i) => {
      const card = wrapper.querySelector('.dict-result-card');
      if (i === this.highlightedIndex) {
        wrapper.classList.add('ring-2', 'ring-brand-500/60', 'rounded-xl');
        wrapper.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        wrapper.classList.remove('ring-2', 'ring-brand-500/60', 'rounded-xl');
      }
    });
  },

  pronounceHighlighted() {
    const wrapper = document.querySelector('#dict-dropdown-results [data-dict-index="' + this.highlightedIndex + '"]');
    if (wrapper) {
      const word = wrapper.getAttribute('data-dict-word');
      if (word) speech.pronounce(word);
    }
  },

  formatDefinitionHTML(raw) {
    if (!raw || typeof raw !== 'string') return '';

    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '<p class="text-sm text-zinc-500">—</p>';

    const parts = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const posMatch = line.match(/^(n\.|vt\.|vi\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|int\.|aux\.|num\.|pref\.|suf\.|abbr\.)\s*/);
      let pos = '';
      let content = line;

      if (posMatch) {
        pos = posMatch[1];
        content = line.substring(posMatch[0].length).trim();
      }

      const senseMatches = [...content.matchAll(/(\d+)\.\s*(.*?)(?=\s*\d+\.\s*|$)/g)];

      let bodyHTML = '';

      if (senseMatches.length > 1) {
        const items = senseMatches.map(m =>
          '<div class="flex gap-2 pl-2 py-0.5">' +
            '<span class="text-[10px] text-zinc-500 font-mono flex-shrink-0 min-w-[1.25rem] text-right">' + this.escapeHtml(m[1]) + '.</span>' +
            '<span class="text-xs text-zinc-300 leading-relaxed">' + this.escapeHtml(m[2]) + '</span>' +
          '</div>'
        ).join('');
        bodyHTML = '<div class="space-y-0">' + items + '</div>';
      } else if (content) {
        bodyHTML = '<p class="text-xs text-zinc-300 leading-relaxed pl-2">' + this.escapeHtml(content) + '</p>';
      }

      let sectionHTML;

      if (pos) {
        sectionHTML =
          '<div class="flex items-start gap-2">' +
            '<span class="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded flex-shrink-0 min-w-[2.25rem] text-center">' + this.escapeHtml(pos.replace('.', '')) + '</span>' +
            '<div class="flex-1 min-w-0">' + bodyHTML + '</div>' +
          '</div>';
      } else {
        sectionHTML = '<div class="pl-2">' + bodyHTML + '</div>';
      }

      if (i > 0 && pos) {
        parts.push('<div class="my-1 border-t border-zinc-800/50"></div>');
      }

      parts.push(sectionHTML);
    }

    return '<div class="space-y-1.5">' + parts.join('') + '</div>';
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// ====================================================================================
// Bootstrap
// ====================================================================================
window.addEventListener('DOMContentLoaded', () => {
  // Load central dictionary first
  const dictLoaded = centralDictionary.init();
  if (!dictLoaded) {
    alert('Failed to load dictionary. Please refresh the page.');
    return;
  }

  // Initialize all modules
  speech.init();
  dashboard.init();
  ledger.init();
  dictation.init();
  dictionaryLookup.init();

  try {
    fileUploader.init();
  } catch (e) {
    console.error('File uploader init failed:', e);
  }

  // Load first list if available
  const listNames = state.getListNames();
  if (listNames.length > 0) {
    dashboard.switchActiveList(listNames[0]);
  }
});
