// dictation.js - Dictation Practice Mode Loop Controller

const dictation = {
  init() {
    // Listeners for dictation buttons
    document.getElementById('btn-start-session').addEventListener('click', () => {
      this.startSession();
    });
    
    document.getElementById('btn-quit-session').addEventListener('click', () => {
      if (confirm('Quit dictation session? Unfinished words will lose this session\'s performance.')) {
        this.quitSession();
      }
    });
    
    document.getElementById('btn-dictation-pronounce').addEventListener('click', () => {
      this.playActiveWordAudio();
    });
    
    document.getElementById('dictation-input').addEventListener('keydown', (e) => {
      this.handleInputKeydowns(e);
    });
    
    document.getElementById('btn-replay-session').addEventListener('click', () => {
      this.startSession();
    });
    
    document.getElementById('btn-results-home').addEventListener('click', () => {
      this.exitToDashboard();
    });

    // Tested search in summary
    document.getElementById('tested-search').addEventListener('input', () => {
      this.renderResultsBreakdown();
    });
  },

  startSession() {
    playSFX('click');
    
    // Assemble session filter queries
    const filterVal = document.querySelector('input[name="session-filter"]:checked').value;
    const limitInput = document.getElementById('session-timer').value;
    state.sessionTimerSecs = limitInput ? parseInt(limitInput) : 0;
    
    let pool = [...state.activeWords];
    
    if (filterVal === 'unfamiliar') {
      pool = pool.filter(w => w.status === 'unfamiliar');
    } else if (filterVal === 'low-accuracy') {
      const threshold = parseInt(document.getElementById('accuracy-threshold').value) || 60;
      pool = pool.filter(w => {
        const att = (w.stats?.correct || 0) + (w.stats?.wrong || 0);
        if (att === 0) return true; // Include unattempted as 0% accuracy
        const acc = (w.stats.correct / att) * 100;
        return acc < threshold;
      });
    } else if (filterVal === 'unlearned') {
      pool = pool.filter(w => w.status === 'unlearned');
    }
    
    if (pool.length === 0) {
      alert('No words found matching selection filter queries in this list. Please change filter parameters.');
      return;
    }

    // Retrieve custom session size input
    const sizeInput = document.getElementById('session-size').value.trim();
    let sessionSize = sizeInput ? parseInt(sizeInput) : pool.length;
    if (isNaN(sessionSize) || sessionSize <= 0) {
      sessionSize = pool.length;
    }

    // Shuffle the pool and slice according to custom session size limit
    pool.sort(() => Math.random() - 0.5);
    state.sessionWords = pool.slice(0, sessionSize);
    
    state.sessionIndex = 0;
    state.sessionResults = [];
    state.correctStreak = 0;
    state.maxCorrectStreak = 0;
    state.wrongAnswerAttempted = false;
    
    // Switch Views
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('results-view').classList.add('hidden');
    document.getElementById('word-ledger-container').classList.add('hidden');
    document.getElementById('dictation-view').classList.remove('hidden');
    
    // Setup headers stats
    document.getElementById('total-session-words').textContent = state.sessionWords.length;
    
    this.loadActiveWord();
  },

  loadActiveWord() {
    if (state.sessionIndex >= state.sessionWords.length) {
      this.endSession();
      return;
    }
    
    const activeWord = state.sessionWords[state.sessionIndex];
    state.wrongAnswerAttempted = false;
    
    // Reset Card layouts
    document.getElementById('reveal-drawer').classList.add('hidden');
    
    const feedback = document.getElementById('feedback-ring');
    feedback.className = 'relative rounded-2xl p-0.5 bg-zinc-800 transition-all duration-300';
    
    const input = document.getElementById('dictation-input');
    input.value = '';
    input.readOnly = false;
    
    // Force autofocus on inputs
    setTimeout(() => {
      input.focus();
    }, 80);

    // Update indicators
    document.getElementById('current-word-index').textContent = state.sessionIndex + 1;
    const progressPercent = ((state.sessionIndex) / state.sessionWords.length) * 100;
    document.getElementById('session-progress-bar').style.width = `${progressPercent}%`;
    
    // Unfamiliar toggle indicator state
    this.updateUnfamiliarBadge(activeWord.status === 'unfamiliar');
    
    // Play pronunciation, then start timer AFTER audio finishes
    setTimeout(() => {
      this.playActiveWordAudio(() => {
        // Timer starts only when the user has heard the full word
        state.wordStartTime = Date.now();
        this.startCountdownTimer();
      });
    }, 150);
  },

  playActiveWordAudio(onEnd) {
    if (state.sessionIndex >= state.sessionWords.length) return;
    const activeWord = state.sessionWords[state.sessionIndex];
    speech.pronounce(activeWord.word, onEnd);
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
    
    const activeWord = state.sessionWords[state.sessionIndex];
    const input = document.getElementById('dictation-input');
    input.readOnly = true;
    
    // Count as wrong answer
    playSFX('wrong');
    state.correctStreak = 0;
    this.updateStreakUI();
    
    // Save progress to main list
    const mainWordRef = state.activeWords.find(w => w.word.toLowerCase() === activeWord.word.toLowerCase());
    if (mainWordRef) {
      mainWordRef.stats.wrong++;
      // Unconditionally set incorrect spellings to unfamiliar state as requested!
      mainWordRef.status = 'unfamiliar';
      state.saveList(state.activeListName, state.activeWords);
    }
    
    // Track session analytics
    const elapsed = Date.now() - state.wordStartTime;
    state.sessionResults.push({
      word: activeWord,
      elapsed: elapsed,
      correct: false,
      initialStatus: activeWord.status,
      finalStatus: mainWordRef ? mainWordRef.status : activeWord.status
    });
    
    // Style input as failed
    const feedback = document.getElementById('feedback-ring');
    feedback.className = 'relative rounded-2xl p-0.5 bg-rose-500 transition-all duration-300 animate-shake';
    
    // Reveal detailed drawer and wait for user Enter
    this.revealAnswer(activeWord);
    state.wrongAnswerAttempted = true; // Wait for enter to advance
  },

  handleInputKeydowns(e) {
    if (state.sessionIndex >= state.sessionWords.length) return;
    const activeWord = state.sessionWords[state.sessionIndex];
    
    // 1. REPLAY SHORTCUT (Ctrl + Space)
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      this.playActiveWordAudio();
      return;
    }

    // 2. UNFAMILIAR TOGGLE SHORTCUT (Backtick `)
    if (e.key === '`') {
      e.preventDefault();
      
      const mainWordRef = state.activeWords.find(w => w.word.toLowerCase() === activeWord.word.toLowerCase());
      if (mainWordRef) {
        const prev = mainWordRef.status;
        const targetStatus = prev === 'unfamiliar' ? 'unlearned' : 'unfamiliar';
        
        mainWordRef.status = targetStatus;
        activeWord.status = targetStatus;
        
        state.saveList(state.activeListName, state.activeWords);
        playSFX('unfamiliar');
        
        this.updateUnfamiliarBadge(targetStatus === 'unfamiliar');
      }
      return;
    }

    // 3. CONFIRMATION TRIGGER (Enter)
    if (e.key === 'Enter') {
      e.preventDefault();
      clearInterval(state.sessionTimerId);
      
      if (state.wrongAnswerAttempted) {
        // Second Enter hit, advanced to next word
        playSFX('click');
        state.sessionIndex++;
        this.loadActiveWord();
        return;
      }
      
      const input = document.getElementById('dictation-input');
      const value = input.value.trim();
      
      if (!value) return; // Do not submit empty string
      
      const isCorrect = value.toLowerCase() === activeWord.word.toLowerCase();
      const elapsed = Date.now() - state.wordStartTime;
      
      const mainWordRef = state.activeWords.find(w => w.word.toLowerCase() === activeWord.word.toLowerCase());
      
      if (isCorrect) {
        playSFX('correct');
        state.correctStreak++;
        if (state.correctStreak > state.maxCorrectStreak) state.maxCorrectStreak = state.correctStreak;
        this.updateStreakUI();
        
        // Save main list metrics
        if (mainWordRef) {
          mainWordRef.stats.correct++;
          // Auto-upgrade status to mastered if correct attempts significantly exceed wrong
          if (mainWordRef.status === 'unlearned' || mainWordRef.status === 'unfamiliar') {
            mainWordRef.status = 'mastered';
          }
          state.saveList(state.activeListName, state.activeWords);
        }
        
        // Track session analytics
        state.sessionResults.push({
          word: activeWord,
          elapsed: elapsed,
          correct: true,
          initialStatus: activeWord.status,
          finalStatus: mainWordRef ? mainWordRef.status : activeWord.status
        });
        
        // Highlight Input as green success
        const feedback = document.getElementById('feedback-ring');
        feedback.className = 'relative rounded-2xl p-0.5 bg-emerald-500 transition-all duration-300';
        input.readOnly = true;
        
        // Auto advance after short 1s block
        setTimeout(() => {
          state.sessionIndex++;
          this.loadActiveWord();
        }, 1000);
        
      } else {
        playSFX('wrong');
        state.correctStreak = 0;
        this.updateStreakUI();
        
        // Save main list metrics
        if (mainWordRef) {
          mainWordRef.stats.wrong++;
          // Unconditionally set incorrect spellings to unfamiliar state as requested!
          mainWordRef.status = 'unfamiliar';
          state.saveList(state.activeListName, state.activeWords);
        }
        
        // Track session analytics
        state.sessionResults.push({
          word: activeWord,
          elapsed: elapsed,
          correct: false,
          initialStatus: activeWord.status,
          finalStatus: mainWordRef ? mainWordRef.status : activeWord.status
        });
        
        // Style input as failed
        const feedback = document.getElementById('feedback-ring');
        feedback.className = 'relative rounded-2xl p-0.5 bg-rose-500 transition-all duration-300 animate-shake';
        input.readOnly = true;
        
        // Reveal correct answer and expect second enter press
        this.revealAnswer(activeWord);
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

  revealAnswer(activeWord) {
    document.getElementById('reveal-drawer').classList.remove('hidden');
    document.getElementById('revealed-word').textContent = activeWord.word;
    
    const phoneticsContainer = document.getElementById('revealed-phonetics');
    const brSpan = document.getElementById('revealed-phonetic-br');
    const usSpan = document.getElementById('revealed-phonetic-us');
    
    if (activeWord.phoneticBr) {
      brSpan.textContent = `UK: ${activeWord.phoneticBr}`;
      brSpan.classList.remove('hidden');
    } else {
      brSpan.classList.add('hidden');
    }
    
    if (activeWord.phoneticUs) {
      usSpan.textContent = `US: ${activeWord.phoneticUs}`;
      usSpan.classList.remove('hidden');
    } else {
      usSpan.classList.add('hidden');
    }
    
    if (!activeWord.phoneticBr && !activeWord.phoneticUs) {
      phoneticsContainer.classList.add('hidden');
    } else {
      phoneticsContainer.classList.remove('hidden');
    }
    
    document.getElementById('revealed-definition').textContent = activeWord.definition;
  },

  endSession() {
    clearInterval(state.sessionTimerId);
    playSFX('correct');
    
    // Switch panels
    document.getElementById('dictation-view').classList.add('hidden');
    document.getElementById('results-view').classList.remove('hidden');
    
    // Core report calculations
    const total = state.sessionResults.length;
    const correctCount = state.sessionResults.filter(r => r.correct).length;
    const accPercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const totalDuration = state.sessionResults.reduce((acc, r) => acc + r.elapsed, 0);
    const avgDuration = total > 0 ? ((totalDuration / 1000) / total).toFixed(1) : '0.0';
    
    document.getElementById('result-stat-accuracy').textContent = `${accPercent}%`;
    document.getElementById('result-stat-count').textContent = `${correctCount}/${total}`;
    document.getElementById('result-stat-speed').textContent = `${avgDuration}s`;
    document.getElementById('result-stat-streak').textContent = `🔥 ${state.maxCorrectStreak}`;
    
    // Enforce data rounds persistence: save completed data to LocalStorage Analytics vault history!
    state.saveSessionHistory(state.activeListName, {
      totalWords: total,
      correctCount: correctCount,
      accuracy: accPercent,
      avgSpeed: avgDuration,
      maxStreak: state.maxCorrectStreak,
      results: state.sessionResults
    });
    
    this.renderResultsBreakdown();
    
    // Re-sync dashboard options & ledger statuses
    dashboard.switchActiveList(state.activeListName);
  },

  renderResultsBreakdown() {
    const container = document.getElementById('tested-words-list');
    const searchVal = document.getElementById('tested-search').value.toLowerCase().trim();
    
    container.innerHTML = '';
    
    const filteredResults = state.sessionResults.filter(r => {
      return r.word.word.toLowerCase().includes(searchVal) || r.word.definition.toLowerCase().includes(searchVal);
    });

    if (filteredResults.length === 0) {
      container.innerHTML = `
        <div class="col-span-2 text-center py-8 text-zinc-500 text-sm">
          No matching tested words found in this session report.
        </div>
      `;
      return;
    }

    filteredResults.forEach(r => {
      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border flex flex-col justify-between space-y-3 bg-[#121214]/60 ${r.correct ? 'border-emerald-500/20' : 'border-rose-500/20'}`;
      
      card.innerHTML = `
        <div class="flex items-start justify-between">
          <div>
            <h4 class="font-bold font-mono text-zinc-100 text-sm flex items-center gap-1.5">
              <span>${r.word.word}</span>
              <span class="text-[10px] font-mono text-zinc-500">(${((r.elapsed / 1000)).toFixed(1)}s)</span>
            </h4>
            <p class="text-xs text-zinc-400 mt-1 line-clamp-2">${r.word.definition}</p>
          </div>
          
          <span class="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${r.correct ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
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
            <span class="font-semibold text-zinc-400">${r.initialStatus}</span>
            <svg class="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            <span class="font-semibold text-brand-400">${r.finalStatus}</span>
          </div>
          <button onclick="speech.pronounce('${r.word.word.replace(/'/g, "\\'")}')" class="text-zinc-500 hover:text-brand-400 flex items-center gap-1 text-[10px] font-semibold">
            Replay Audio
          </button>
        </div>
      `;
      
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
