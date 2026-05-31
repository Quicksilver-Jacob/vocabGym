// excel.js - Excel Workbook Parser Module

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
        
        const words = this.normalize(rawRows);
        callback(null, words);
      } catch (err) {
        callback(err);
      }
    };
    reader.onerror = (e) => callback(new Error('File reading error.'));
    reader.readAsArrayBuffer(file);
  },
  
  normalize(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    
    let wordIdx = -1;
    let defIdx = -1;
    let brIdx = -1;
    let usIdx = -1;
    
    // Scan headers flexibly
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (/单词|word|spelling|vocab|term|english/i.test(h)) {
        wordIdx = i;
      } else if (/释义|definition|meaning|translation|chinese|explain/i.test(h)) {
        defIdx = i;
      } else if (/英音|br|british|uk/i.test(h)) {
        brIdx = i;
      } else if (/美音|us|american/i.test(h)) {
        usIdx = i;
      }
    }
    
    // Hard fallbacks
    if (wordIdx === -1) wordIdx = 0;
    if (defIdx === -1) {
      // Find an alternative column index
      for (let i = 0; i < headers.length; i++) {
        if (i !== wordIdx && i !== brIdx && i !== usIdx) {
          defIdx = i;
          break;
        }
      }
      if (defIdx === -1) defIdx = 1;
    }
    
    const list = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const word = String(row[wordIdx] || '').trim();
      if (!word) continue;
      
      const definition = String(row[defIdx] || '').trim();
      const phoneticBr = brIdx !== -1 ? String(row[brIdx] || '').trim() : '';
      const phoneticUs = usIdx !== -1 ? String(row[usIdx] || '').trim() : '';
      
      list.push({
        word,
        definition,
        phoneticBr,
        phoneticUs,
        stats: { correct: 0, wrong: 0 },
        status: 'unlearned'
      });
    }
    return list;
  }
};
