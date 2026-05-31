// ledger.js - Vocabulary Bank Ledger Table Controller

const ledger = {
  init() {
    document.getElementById('ledger-search').addEventListener('input', () => {
      state.ledgerPage = 1;
      this.renderTable();
    });
    
    document.getElementById('ledger-status-filter').addEventListener('change', () => {
      state.ledgerPage = 1;
      this.renderTable();
    });
    
    document.getElementById('btn-ledger-prev').addEventListener('click', () => {
      if (state.ledgerPage > 1) {
        state.ledgerPage--;
        this.renderTable();
      }
    });
    
    document.getElementById('btn-ledger-next').addEventListener('click', () => {
      const totalPages = Math.ceil(state.filteredLedgerWords.length / state.ledgerLimit);
      if (state.ledgerPage < totalPages) {
        state.ledgerPage++;
        this.renderTable();
      }
    });
  },

  renderTable() {
    const tbody = document.getElementById('ledger-table-body');
    const pagination = document.getElementById('ledger-pagination');
    
    if (!state.activeWords || state.activeWords.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-zinc-500 font-medium">No active vocabulary list is selected. Upload an Excel list above to populate.</td>
        </tr>
      `;
      pagination.classList.add('hidden');
      return;
    }

    // Apply queries
    const query = document.getElementById('ledger-search').value.toLowerCase().trim();
    const statusFilter = document.getElementById('ledger-status-filter').value;
    
    state.filteredLedgerWords = state.activeWords.filter(w => {
      const matchesSearch = w.word.toLowerCase().includes(query) || w.definition.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    
    if (state.filteredLedgerWords.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-zinc-500 font-medium">No records found matching current query filters.</td>
        </tr>
      `;
      pagination.classList.add('hidden');
      return;
    }
    
    pagination.classList.remove('hidden');
    
    const totalRows = state.filteredLedgerWords.length;
    const totalPages = Math.ceil(totalRows / state.ledgerLimit);
    
    // Page calculations
    const start = (state.ledgerPage - 1) * state.ledgerLimit;
    const end = Math.min(start + state.ledgerLimit, totalRows);
    
    document.getElementById('ledger-page-start').textContent = start + 1;
    document.getElementById('ledger-page-end').textContent = end;
    document.getElementById('ledger-total-rows').textContent = totalRows;
    
    document.getElementById('btn-ledger-prev').disabled = state.ledgerPage === 1;
    document.getElementById('btn-ledger-next').disabled = state.ledgerPage === totalPages;
    
    const pageWords = state.filteredLedgerWords.slice(start, end);
    tbody.innerHTML = '';
    
    pageWords.forEach(w => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-zinc-900/40 transition-colors group border-b border-zinc-900/60';
      
      const attempts = (w.stats?.correct || 0) + (w.stats?.wrong || 0);
      const acc = attempts > 0 ? Math.round((w.stats.correct / attempts) * 100) : 0;

      tr.innerHTML = `
        <td class="px-6 py-3.5 font-bold font-mono text-zinc-100 flex items-center gap-2">
          <span>${w.word}</span>
          <button onclick="speech.pronounce('${w.word.replace(/'/g, "\\'")}')" class="text-zinc-500 hover:text-brand-400 focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity" title="Play pronunciation">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />
            </svg>
          </button>
        </td>
        <td class="px-6 py-3.5 text-xs text-zinc-500 font-mono">
          <div class="flex flex-col gap-0.5">
            ${w.phoneticBr ? `<span class="truncate max-w-[120px]">Br: ${w.phoneticBr}</span>` : ''}
            ${w.phoneticUs ? `<span class="truncate max-w-[120px]">Us: ${w.phoneticUs}</span>` : ''}
            ${!w.phoneticBr && !w.phoneticUs ? '<span>--</span>' : ''}
          </div>
        </td>
        <td class="px-6 py-3.5 text-zinc-300 font-medium text-xs break-all max-w-sm">${w.definition}</td>
        <td class="px-6 py-3.5 text-center text-zinc-400 font-semibold font-mono">${attempts}</td>
        <td class="px-6 py-3.5 text-center font-bold font-mono">
          <span class="${attempts > 0 ? (acc >= 75 ? 'text-emerald-400' : (acc >= 50 ? 'text-amber-400' : 'text-rose-400')) : 'text-zinc-600'}">
            ${attempts > 0 ? `${acc}%` : '--'}
          </span>
        </td>
        <td class="px-6 py-3.5 text-right">
          <select onchange="ledger.updateWordStatus('${w.word.replace(/'/g, "\\'")}', this.value)" class="bg-zinc-900 border border-zinc-800 rounded-lg py-1 px-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer ${w.status === 'mastered' ? 'text-emerald-400' : (w.status === 'unfamiliar' ? 'text-amber-400' : 'text-zinc-400')}">
            <option value="unlearned" ${w.status === 'unlearned' ? 'selected' : ''}>Unlearned</option>
            <option value="unfamiliar" ${w.status === 'unfamiliar' ? 'selected' : ''}>Unfamiliar</option>
            <option value="mastered" ${w.status === 'mastered' ? 'selected' : ''}>Mastered</option>
          </select>
        </td>
      `;
      
      tbody.appendChild(tr);
    });
  },

  updateWordStatus(wordSpelling, newStatus) {
    const wordObj = state.activeWords.find(w => w.word.toLowerCase() === wordSpelling.toLowerCase());
    if (wordObj) {
      wordObj.status = newStatus;
      state.saveList(state.activeListName, state.activeWords);
      playSFX('unfamiliar');
      
      dashboard.switchActiveList(state.activeListName);
    }
  }
};
