// share.js - Vocabulary List Sharing Module with Compression
// Supports ID-based sharing with run-length encoding for ranges

const shareModule = {
  VERSION: '2.0',
  MAX_QR_DATA_LENGTH: 2000,

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
   * Encode user progress for sharing
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

    // Set unfamiliar
    unfamiliarIds.forEach(id => {
      wordProgress[id] = { status: 'unfamiliar', correct: 0, wrong: 0 };
    });

    // Set mastered
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

  /**
   * Encode a word list (just IDs)
   */
  encodeList(listName, wordIds) {
    const payload = {
      v: '2.0',
      n: listName,
      i: this.compressIdList(wordIds)
    };

    const jsonStr = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(jsonStr)));
  },

  /**
   * Decode a word list
   */
  decodeList(encodedData) {
    const jsonStr = decodeURIComponent(escape(atob(encodedData)));
    const payload = JSON.parse(jsonStr);

    if (payload.v !== '2.0') {
      throw new Error('Unsupported version');
    }

    return {
      listName: payload.n,
      wordIds: this.decompressIdList(payload.i)
    };
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
    const qrContainer = document.getElementById('qrcode-container');
    const textarea = document.getElementById('exported-data-textarea');

    if (!modal) return;

    if (title) title.textContent = 'Share Your Progress';
    if (exportSection) exportSection.classList.remove('hidden');
    if (importSection) importSection.classList.add('hidden');

    try {
      const encodedData = this.encodeProgress();

      // Show stats
      const progress = state.getUserProgress();
      const wordCount = Object.keys(progress.wordProgress).length;

      if (qrContainer) {
        if (wordCount === 0) {
          qrContainer.innerHTML = `
            <div class="text-zinc-500 text-sm mb-4">
              <p>No progress to share.</p>
              <p class="text-xs mt-1">Complete a dictation session first.</p>
            </div>
          `;
        } else {
          qrContainer.innerHTML = `
            <div class="text-zinc-400 text-sm mb-4">
              <p>Sharing ${wordCount} words with progress</p>
              <p class="text-xs mt-1">Data size: ${encodedData.length} chars</p>
            </div>
          `;
        }

        if (encodedData.length <= this.MAX_QR_DATA_LENGTH) {
          this.generateQRCode(encodedData, qrContainer);
        } else {
          qrContainer.innerHTML += `
            <div class="text-amber-400 text-sm p-4 border border-amber-500/30 rounded-lg">
              <p>Data too large for QR code.</p>
              <p class="text-xs mt-1">Please use text copy below.</p>
            </div>
          `;
        }
      }

      if (textarea) textarea.value = encodedData;
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

  generateQRCode(data, container) {
    if (!container || typeof QRCode === 'undefined') return;

    const qrDiv = document.createElement('div');
    qrDiv.className = 'inline-block p-4 bg-white rounded-lg';
    container.appendChild(qrDiv);

    new QRCode(qrDiv, {
      text: data,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
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
      alert('Please paste the shared data.');
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
