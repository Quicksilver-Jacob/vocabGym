// speech.js - Speech Synthesis Auditory Pronunciation Engine

const speech = {
  voices: [],
  init() {
    if (!window.speechSynthesis) return;
    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices();
      this.populateVoiceSelector();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  },
  populateVoiceSelector() {
    const select = document.getElementById('voice-selector');
    if (!select) return;
    select.innerHTML = '';
    
    // Filter English voices case-insensitively supporting both hyphens and underscores
    const enVoices = this.voices.filter(v => /^en[-_]/i.test(v.lang));
    const voicesToUse = enVoices.length > 0 ? enVoices : this.voices;
    
    if (voicesToUse.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = 'System Default English Voice';
      select.appendChild(opt);
      return;
    }
    
    // Find best default selected index from voicesToUse
    let selectedIdx = -1;
    // Priority 1: Google US English
    for (let i = 0; i < voicesToUse.length; i++) {
      const name = voicesToUse[i].name.toLowerCase();
      const lang = voicesToUse[i].lang.toLowerCase();
      if (name.includes('google') && lang.includes('us')) {
        selectedIdx = i;
        break;
      }
    }
    // Priority 2: Standard Microsoft English voices (Zira, David, Aria) or en-US exact
    if (selectedIdx === -1) {
      for (let i = 0; i < voicesToUse.length; i++) {
        const name = voicesToUse[i].name.toLowerCase();
        const lang = voicesToUse[i].lang.toLowerCase();
        if (name.includes('zira') || name.includes('david') || name.includes('aria') || lang === 'en-us') {
          selectedIdx = i;
          break;
        }
      }
    }
    // Priority 3: Any English locale match
    if (selectedIdx === -1) {
      for (let i = 0; i < voicesToUse.length; i++) {
        if (/^en[-_]/i.test(voicesToUse[i].lang)) {
          selectedIdx = i;
          break;
        }
      }
    }
    // Priority 4: Fallback to first voice
    if (selectedIdx === -1) {
      selectedIdx = 0;
    }
    
    // Populate options
    voicesToUse.forEach((v, index) => {
      const opt = document.createElement('option');
      opt.value = this.voices.indexOf(v);
      opt.textContent = `${v.name} (${v.lang})`;
      if (index === selectedIdx) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  },
  pronounce(text, onEnd) {
    if (!window.speechSynthesis) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }
    window.speechSynthesis.cancel(); // Stop active speaking
    
    const textToSpeak = text.replace(/[^a-zA-Z\s'-]/g, '').trim(); // Remove brackets/phonetics if leaked, preserve apostrophes
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    // Load configurations
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
    
    // Fallback: If no voice set, explicitly find and enforce ANY English voice
    if (!voiceSet) {
      const defaultEn = this.voices.find(v => /^en[-_]/i.test(v.lang));
      if (defaultEn) utterance.voice = defaultEn;
    }
    
    if (rateSlider) {
      utterance.rate = parseFloat(rateSlider.value) || 1.0;
    }
    utterance.pitch = 1.0;
    
    // Fire callback when speech finishes
    if (typeof onEnd === 'function') {
      utterance.onend = onEnd;
      utterance.onerror = onEnd; // Also fire on error so timer isn't stuck
    }
    
    window.speechSynthesis.speak(utterance);
  }
};
