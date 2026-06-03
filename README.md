# English Vocab Gym

**Minimalist dictation practice for English vocabulary.** A single-page browser app — no build step, no server, no frameworks. Just open `index.html` and start practicing.

## Features

- **Dictation practice** — Hear a word, type the spelling, get instant feedback. Configurable playback speed and countdown timers.
- **33,000+ word dictionary** — English-Chinese dictionary with IPA pronunciations, COCA frequency rankings, and POS-tagged definitions with markdown-inspired formatting.
- **Example sentences** — 27,000 words include real usage examples from Wiktionary, playable during practice via `F2`.
- **Smart search** — Prefix, contains, fuzzy, and Chinese definition search ranked by word frequency. Waterfall card layout.
- **Progress tracking** — Per-word mastery tracking (unlearned → unfamiliar → mastered) persisted in localStorage.
- **Import/Export** — Compressed progress sharing via Base64-encoded text with run-length encoding.
- **Dark theme** — Clean zinc palette with teal accents. Responsive, keyboard-driven.

## Quick Start

1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/english-vocab-gym.git
   ```
2. Open `index.html` in any modern browser.

No `npm install`, no build tools, no server. Dependencies load from CDN (Tailwind CSS, SheetJS for Excel import).

You can also go to https://quicksilver-jacob.github.io/vocabGym/ for online version.

## Usage

### Dictation Practice
1. Import a vocabulary list (Excel `.xlsx` via the **Import** button) or use the full dictionary
2. Click **Start Dictation** — a word is spoken
3. Type the spelling and press `Enter`
4. Get immediate feedback with the correct answer revealed

### Keyboard Shortcuts (during dictation)

| Key | Action |
|-----|--------|
| `Enter` | Submit answer / advance |
| `Escape` | Reveal answer |
| `Ctrl + Space` | Replay word audio |
| `Ctrl + Enter` | Skip word |
| `` ` `` | Toggle unfamiliar flag |
| `F2` | Play example sentence |

### Dictionary Search
- Click the search bar or press `Ctrl + K`
- Search by word, prefix, or Chinese definition
- `Arrow Up/Down` to navigate, `Enter` to pronounce, `Escape` to close

## Data Sources

| Source | File | Description |
|--------|------|-------------|
| English-Chinese dictionary | `data/英汉词典.txt` | ~38,000 entries |
| COCA frequency ranks | `data/COCA60000.txt` | 60,000 word frequency ranking |
| Wiktionary sentences | `data/kaikki.org-dictionary-English.jsonl` (or https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl) | Extracted via [wiktextract](https://github.com/tatuylonen/wiktextract) |

## Regenerating Data

### Dictionary (`js/dictionary.js`)
Regeneration requires both `data/英汉词典.txt` and `data/COCA60000.txt`. The original build script (`generate_dict.js`) was a Node.js script that has since been removed. The Python scripts in `scripts/` generate different formats:
- `scripts/build_dictionary.py` — Reads Excel books → `dictionary.json` + `dictionary_mini.json`
- `scripts/parse_dictionary.py` — Reads `英汉词典.txt` → `dictionary.js` v1.0 (without COCA ranks)

### Example Sentences (`js/sentences.js`)
1. Download the Wiktionary JSONL (3.0GB):
   ```
   https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl
   ```
   Place it in `data/`.
2. Run the extraction:
   ```bash
   python scripts/extract_sentences.py data/kaikki.org-dictionary-English.jsonl
   ```
   Supports checkpoint/resume — if interrupted, re-run to continue from where it left off.

## File Structure

```
english-vocab-gym/
├── index.html              # Main SPA
├── app.css                 # Custom styles
├── README.md
├── relay.md                # Internal project docs
├── js/
│   ├── dictionary.js       # 33,592 word entries (main dictionary)
│   ├── dictionary.json     # Alternative dictionary JSON (from books)
│   ├── dictionary_mini.json # Compact word→id lookup
│   ├── bundle.js           # All application logic
│   ├── share.js            # Progress import/export
│   └── sentences.js        # 27K example sentences
├── scripts/
│   ├── build_dictionary.py  # Build dictionaries from Excel books
│   ├── parse_dictionary.py  # Parse 英汉词典.txt → dictionary.js
│   └── extract_sentences.py # Sentence extraction script
├── data/
│   ├── 英汉词典.txt        # Source dictionary
│   ├── COCA60000.txt       # Word frequency data
│   └── kaikki.org-dictionary-English.jsonl # Wiktionary raw data (3.0GB)
└── books/                  # 3 IELTS vocab Excel books
```

## Browser Support

Chrome, Edge, Firefox, Safari — any browser with Web Speech API support.

## License

MIT. Dictionary data from Wiktionary is [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). COCA frequency data is used for non-commercial research.
