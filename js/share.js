// share.js - Progress Import/Export with Compression
// Uses run-length encoding for ID ranges

const shareModule = {
  VERSION: '2.0',

  /**
   * Compress array of numbers using run-length encoding for consecutive sequences
   * [1,2,3,4,5,10,11,12] -> "1-5,10-12"
   */
  compressIdList(ids) {
    if (!ids || ids.length === 0) return '';

    const sorted = [...ids].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    return ranges.join(',');
  },

  /**
   * Decompress ID list from run-length encoded string
   * "1-5,10-12" -> [1,2,3,4,5,10,11,12]
   */
  decompressIdList(compressed) {
    if (!compressed) return [];

    const ids = [];
    const ranges = compressed.split(',');

    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          ids.push(i);
        }
      } else {
        ids.push(Number(range));
      }
    }

    return ids;
  },

  /**
   * Encode user progress for export
   * Format: v2.0|unfamiliarIds|masteredIds|wordStats
   */
  encodeProgress() {
    const progress = state.getUserProgress();
    const wordProgress = progress.wordProgress;

    const unfamiliarIds = [];
    const masteredIds = [];
    const wordStats = []; // [id, correct, wrong]

    for (const [wordIdStr, data] of Object.entries(wordProgress)) {
      const wordId = parseInt(wordIdStr);

      if (data.status === 'unfamiliar') {
        unfamiliarIds.push(wordId);
      } else if (data.status === 'mastered') {
        masteredIds.push(wordId);
      }

      // Include stats if there are attempts
      if (data.correct > 0 || data.wrong > 0) {
        wordStats.push([wordId, data.correct, data.wrong]);
      }
    }

    const payload = {
      v: '2.0',
      u: this.compressIdList(unfamiliarIds),
      m: this.compressIdList(masteredIds),
      s: wordStats.map(s => s.join(':')).join(',')
    };

    const jsonStr = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(jsonStr)));
  },

  /**
   * Decode shared progress data
   */
  decodeProgress(encodedData) {
    const jsonStr = decodeURIComponent(escape(atob(encodedData)));
    const payload = JSON.parse(jsonStr);

    if (payload.v !== '2.0') {
      throw new Error('Unsupported version: ' + payload.v);
    }

    const unfamiliarIds = this.decompressIdList(payload.u);
    const masteredIds = this.decompressIdList(payload.m);

    const wordProgress = {};

    unfamiliarIds.forEach(id => {
      wordProgress[id] = { status: 'unfamiliar', correct: 0, wrong: 0 };
    });

    masteredIds.forEach(id => {
      wordProgress[id] = { status: 'mastered', correct: 0, wrong: 0 };
    });

    // Parse stats with validation
    if (payload.s) {
      const statEntries = payload.s.split(',');
      for (const entry of statEntries) {
        if (!entry || entry.trim() === '') continue;
        const parts = entry.split(':').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) continue;
        const [id, correct, wrong] = parts;
        if (!wordProgress[id]) {
          wordProgress[id] = { status: 'unlearned', correct: 0, wrong: 0 };
        }
        wordProgress[id].correct = correct;
        wordProgress[id].wrong = wrong;
      }
    }

    return wordProgress;
  },

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const btnExport = document.getElementById('btn-export-share');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.openExportModal());
    }

    const btnImport = document.getElementById('btn-import-share');
    if (btnImport) {
      btnImport.addEventListener('click', () => this.openImportModal());
    }

    const btnClose = document.getElementById('btn-close-share-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal());
    }

    const btnCopy = document.getElementById('btn-copy-exported-data');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => this.copyToClipboard());
    }

    const btnImportData = document.getElementById('btn-import-data');
    if (btnImportData) {
      btnImportData.addEventListener('click', () => this.handleImport());
    }

    const modal = document.getElementById('share-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }
  },

  openExportModal() {
    const modal = document.getElementById('share-modal');
    const title = document.getElementById('share-modal-title');
    const exportSection = document.getElementById('share-export-section');
    const importSection = document.getElementById('share-import-section');
    const textarea = document.getElementById('exported-data-textarea');

    if (!modal) return;

    if (title) title.textContent = 'Export Progress';
    if (exportSection) exportSection.classList.remove('hidden');
    if (importSection) importSection.classList.add('hidden');

    try {
      const encodedData = this.encodeProgress();
      const progress = state.getUserProgress();
      const wordCount = Object.keys(progress.wordProgress).length;

      if (wordCount === 0) {
        if (textarea) textarea.value = 'No progress to export yet.';
      } else {
        if (textarea) textarea.value = encodedData;
      }

      modal.classList.remove('hidden');
    } catch (e) {
      alert('Failed to encode progress: ' + e.message);
    }
  },

  openImportModal() {
    const modal = document.getElementById('share-modal');
    const title = document.getElementById('share-modal-title');
    const exportSection = document.getElementById('share-export-section');
    const importSection = document.getElementById('share-import-section');
    const textarea = document.getElementById('import-data-textarea');

    if (!modal) return;

    if (title) title.textContent = 'Import Progress';
    if (exportSection) exportSection.classList.add('hidden');
    if (importSection) importSection.classList.remove('hidden');
    if (textarea) textarea.value = '';

    modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('share-modal');
    if (modal) modal.classList.add('hidden');
  },

  async copyToClipboard() {
    const textarea = document.getElementById('exported-data-textarea');
    if (!textarea) return;

    try {
      await navigator.clipboard.writeText(textarea.value);
      const btn = document.getElementById('btn-copy-exported-data');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('text-emerald-400');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('text-emerald-400');
        }, 2000);
      }
    } catch (e) {
      textarea.select();
      document.execCommand('copy');
      alert('Copied to clipboard!');
    }
  },

  handleImport() {
    const textarea = document.getElementById('import-data-textarea');
    if (!textarea) return;

    const encodedData = textarea.value.trim();
    if (!encodedData) {
      alert('Please paste the exported data.');
      return;
    }

    try {
      const wordProgress = this.decodeProgress(encodedData);
      const wordCount = Object.keys(wordProgress).length;

      if (!confirm(`Import progress for ${wordCount} words? This will merge with your existing progress.`)) {
        return;
      }

      // Merge progress
      const currentProgress = state.getUserProgress();
      for (const [wordId, data] of Object.entries(wordProgress)) {
        currentProgress.wordProgress[wordId] = data;
      }
      state.saveUserProgress();

      // Refresh UI safely
      if (typeof dashboard !== 'undefined' && dashboard.updateStats) {
        dashboard.updateStats();
      }
      if (typeof dashboard !== 'undefined' && dashboard.updateHeaderStats) {
        dashboard.updateHeaderStats();
      }
      if (typeof ledger !== 'undefined' && ledger.render) {
        ledger.render();
      }

      playSFX('correct');
      alert(`Successfully imported ${wordCount} words!`);
      this.closeModal();
    } catch (e) {
      alert('Failed to import: ' + e.message);
    }
  }
};

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => shareModule.init());
} else {
  shareModule.init();
}
