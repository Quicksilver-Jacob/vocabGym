// main.js - Application Bootstrapper & Main Controller

// Dashboard View Orchestrator
const dashboard = {
  init() {
    this.refreshSelectors();
    
    // Select dropdown listener
    document.getElementById('list-selector').addEventListener('change', (e) => {
      playSFX('click');
      this.switchActiveList(e.target.value);
    });

    // Delete list button
    document.getElementById('btn-delete-list').addEventListener('click', () => {
      if (!state.activeListName) return;
      if (confirm(`Are you sure you want to permanently delete the list "${state.activeListName}"?`)) {
        state.deleteList(state.activeListName);
        playSFX('wrong');
        state.activeListName = '';
        state.activeWords = [];
        this.refreshSelectors();
        this.updateUIPresence();
      }
    });

    // Speech speed slider
    const rateSlider = document.getElementById('voice-rate');
    rateSlider.addEventListener('input', (e) => {
      document.getElementById('rate-value').textContent = `${e.target.value}x`;
    });

    // Test speech button
    document.getElementById('btn-test-audio').addEventListener('click', (e) => {
      e.preventDefault();
      speech.pronounce('Welcome to IELTS vocabulary gym.');
    });
    
    // Unified Export button: Exports both vocabulary data AND round history vault for external analytics!
    document.getElementById('btn-export-json').addEventListener('click', () => {
      if (!state.activeWords || state.activeWords.length === 0) return;
      
      const historyLogs = state.getSessionHistory(state.activeListName);
      const unifiedPackage = {
        listName: state.activeListName,
        exportedAt: Date.now(),
        vocabulary: state.activeWords,
        sessionHistory: historyLogs
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(unifiedPackage, null, 2));
      const dlAnchorElem = document.createElement('a');
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `${state.activeListName}_progress_analytics.json`);
      dlAnchorElem.click();
    });

    this.updateUIPresence();
  },

  refreshSelectors() {
    const select = document.getElementById('list-selector');
    const keys = state.getVaultKeys();
    
    select.innerHTML = '';
    if (keys.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = 'No lists loaded in database';
      select.appendChild(opt);
      
      document.getElementById('btn-start-session').disabled = true;
      document.getElementById('btn-start-session').classList.add('opacity-50', 'cursor-not-allowed');
      document.getElementById('btn-delete-list').disabled = true;
      return;
    }

    keys.forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      if (key === state.activeListName) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    document.getElementById('btn-delete-list').disabled = false;
    
    if (!state.activeListName && keys.length > 0) {
      this.switchActiveList(keys[0]);
    }
  },

  switchActiveList(filename) {
    if (!filename) return;
    state.activeListName = filename;
    state.activeWords = state.loadList(filename);
    
    // Refresh pre-learning counters
    const unfamiliarCount = state.activeWords.filter(w => w.status === 'unfamiliar').length;
    document.getElementById('badge-unfamiliar-count').textContent = unfamiliarCount;
    
    this.updateUIPresence();
    this.renderMasteryChart();
    
    // Reset table pagination
    state.ledgerPage = 1;
    ledger.renderTable();
  },

  updateUIPresence() {
    const headerStats = document.getElementById('header-stats');
    const filenameLabel = document.getElementById('header-filename');
    const listStatsCard = document.getElementById('list-stats-card');
    const startBtn = document.getElementById('btn-start-session');
    const ledgerContainer = document.getElementById('word-ledger-container');
    
    if (state.activeListName && state.activeWords.length > 0) {
      headerStats.classList.remove('hidden');
      filenameLabel.textContent = state.activeListName;
      listStatsCard.classList.remove('hidden');
      ledgerContainer.classList.remove('hidden');
      
      startBtn.removeAttribute('disabled');
      startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      
      const mastered = state.activeWords.filter(w => w.status === 'mastered').length;
      const unfamiliar = state.activeWords.filter(w => w.status === 'unfamiliar').length;
      const unlearned = state.activeWords.filter(w => w.status === 'unlearned').length;
      
      document.getElementById('stat-count-mastered').textContent = mastered;
      document.getElementById('stat-count-unfamiliar').textContent = unfamiliar;
      document.getElementById('stat-count-unlearned').textContent = unlearned;
    } else {
      headerStats.classList.add('hidden');
      listStatsCard.classList.add('hidden');
      ledgerContainer.classList.add('hidden');
      
      startBtn.disabled = true;
      startBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  },

  renderMasteryChart() {
    if (!state.activeWords || state.activeWords.length === 0) return;
    
    const total = state.activeWords.length;
    const mastered = state.activeWords.filter(w => w.status === 'mastered').length;
    const unfamiliar = state.activeWords.filter(w => w.status === 'unfamiliar').length;
    const unlearned = state.activeWords.filter(w => w.status === 'unlearned').length;
    
    const circle = document.getElementById('mastery-progress-circle');
    const percentSpan = document.getElementById('mastery-progress-percent');
    const masteryPercent = Math.round((mastered / total) * 100);
    
    percentSpan.textContent = `${masteryPercent}%`;
    
    const offset = 175 - (masteryPercent / 100) * 175;
    circle.style.strokeDashoffset = offset;
    
    const mBar = document.getElementById('bar-mastered');
    const uBar = document.getElementById('bar-unfamiliar');
    const lBar = document.getElementById('bar-unlearned');
    
    mBar.style.width = `${(mastered / total) * 100}%`;
    uBar.style.width = `${(unfamiliar / total) * 100}%`;
    lBar.style.width = `${(unlearned / total) * 100}%`;
    
    document.getElementById('total-words-metric').textContent = total;
  }
};

// Excel file selector and drag-and-drop controller
const fileUploader = {
  init() {
    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('excel-file-input');
    
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
      alert('Unsupported file format. Please upload a Microsoft Excel workbook (.xlsx or .xls).');
      return;
    }
    
    excelParser.parseFile(file, (err, parsedWords) => {
      if (err) {
        alert('Failed to parse Excel workbook columns. Ensure your columns follow standard layouts.');
        console.error(err);
        return;
      }
      
      if (parsedWords.length === 0) {
        alert('The uploaded Excel sheet contains no valid English vocabulary records.');
        return;
      }
      
      const cleanFilename = file.name;
      state.mergeAndSave(cleanFilename, parsedWords);
      
      playSFX('correct');
      
      alert(`Successfully uploaded and scanned "${cleanFilename}"!\nLoaded ${parsedWords.length} vocabulary words into database ledger.`);
      
      dashboard.refreshSelectors();
      dashboard.switchActiveList(cleanFilename);
    });
  }
};

// Global DOM Bootstrap Orchestration
window.addEventListener('DOMContentLoaded', () => {
  speech.init();
  dashboard.init();
  ledger.init();
  dictation.init();
  fileUploader.init();
  
  // Try loading default vault list
  const savedKeys = state.getVaultKeys();
  if (savedKeys.length > 0) {
    dashboard.switchActiveList(savedKeys[0]);
  }
});
