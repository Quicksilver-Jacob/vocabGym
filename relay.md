# English Vocab Gym — Project Relay

## Overview

Single-page browser application for IELTS/English vocabulary dictation practice. No build step — plain HTML + vanilla JS + CDN dependencies. Dark theme (zinc palette, brand teal `#2dd4bf`). All state persisted in `localStorage`.

## File Structure

```
IELTS Vocab Gym/
├── index.html              # Main SPA shell (641 lines) — Tailwind CDN, all sections, script tags
├── app.css                 # 101 lines — glass-card, input-premium, btn classes, thin scrollbar
├── README.md               # Public-facing README for GitHub
├── relay.md                # This file — internal project documentation for agents
├── js/
│   ├── dictionary.js       # 4.7MB — DICTIONARY_DATA (v2.1, 33,592 words, COCA ranks). App uses THIS.
│   ├── dictionary.json     # 4.5MB — Alternative dictionary JSON (v1.0, 33,589 words, from books)
│   ├── dictionary_mini.json # 198KB — Mini word→id lookup (from books), for fast loading
│   ├── bundle.js           # 1,952 lines — All application logic (see modules below)
│   ├── share.js            # 301 lines — Progress import/export with RLE compression
│   └── sentences.js        # 8.2MB — Example sentences for 26,965 words (80.6% coverage)
├── scripts/
│   ├── build_dictionary.py  # Reads Excel books → dictionary.json + dictionary_mini.json
│   ├── parse_dictionary.py  # Reads 英汉词典.txt → dictionary.js (BROKEN PATH, see gotchas)
│   └── extract_sentences.py # kaikki JSONL → sentences.js
├── data/
│   ├── 英汉词典.txt        # 2.9MB, 38,256 lines — Source dictionary (word ⇒ /pronunciation/ definition)
│   ├── COCA60000.txt       # 592KB, 60,022 lines — Word frequency ranking (1=most common)
│   └── kaikki.org-dictionary-English.jsonl # 3.0GB — Raw Wiktionary JSONL for sentence extraction
├── books/                  # 3 IELTS vocab Excel books (reference, used by build_dictionary.py)
├── app.css                 # 101 lines — Custom styles
└── __pycache__/            # Python bytecode cache
```

## CDN Dependencies (loaded in `<head>`)

- **Tailwind CSS** — Play CDN with custom theme (zinc colors, brand-400=#2dd4bf)
- **SheetJS** (xlsx) — Excel file parsing for book import
- ~~QRCode.js~~ — Removed. Sharing uses text-only import/export.

## Application Modules (all in bundle.js)

### 1. `centralDictionary` (lines ~7-167)

The search engine over the embedded dictionary data (`DICTIONARY_DATA` from `dictionary.js`).

- **Data structure**: `DICTIONARY_DATA.dictionary` is an array of `{id, word, phonetic, definition, rank}`
- **Indexes built at load**: `wordMap` (lowercase word → entries[]), `idMap` (id → entry), `prefixIndex` (first 3 chars → entries[])
- **`search(query, limit=20)`**: 4-strategy ranked search:
  1. Prefix match (startsWith) — via `prefixIndex`
  2. Contains match — substring anywhere in word
  3. Fuzzy match — Levenshtein edit distance ≤ 2
  4. Definition search — Chinese characters detected by `/[一-鿿]/` regex, matches against `definition` field
- **`freqBoost(entry)`**: `(60000 - rank) / 2400`. Rank 1 = +25 points, rank 60000 = 0, unranked = 0. Applied in every search strategy.
- Top 30 results returned, limited to `limit` by caller.

### 2. `state` (lines ~169-280)

localStorage-backed progress management.

- **Key prefix**: `english_vocab_gym_`
- **`wordProgress`**: `{ [wordId]: { status: 'unlearned'|'unfamiliar'|'mastered', correct: number, wrong: number } }`
- **`saveUserProgress()`**: Writes to localStorage periodically.
- **`getAllWordIds()`**: Returns all 33,592 IDs from dictionary.
- **`getWordById(id)`**: Lookup via `centralDictionary.idMap`.

### 3. `dictation` controller (lines ~555-1060)

Core practice session engine.

- **Session flow**: Book selection → settings → word-by-word playback → results
- **Audio**: Web Speech API. `speech.pronounce()` at configurable rate. `speech.speakSentence()` at fixed 1.0× rate for example sentences.
- **Keyboard shortcuts**:
  - `Enter` — Submit answer / advance
  - `Escape` — Reveal answer
  - `Ctrl+Enter` — Skip word
  - `Ctrl+Space` — Replay word audio
  - `` ` `` (backtick) — Toggle unfamiliar flag
  - `F2` — Play example sentence (if available for current word)
- **Status transitions**: Correct → `mastered` (unless backtick-flagged); Wrong → `unfamiliar`
- **`currentWordInitialStatus`**: Captured at word load, used in results.
- **Reveal drawer**: Full word info with markdown-formatted definition.
- **Sentence hint**: `#sentence-hint` appears below pronounce button when `SENTENCE_DATA` has a sentence for the current word.

### 4. `dictionaryLookup` (lines ~1559-1880)

Dropdown search panel anchored below the header search input.

- **Panel**: `#dict-dropdown` — `absolute left-0 right-0 top-full`, `z-50`, `max-h-[78vh]`
- **Open**: Focus/input on `#header-dict-search`. Close: Escape, blur (150ms delay), click-outside, Enter.
- **Global shortcut**: `Ctrl+K` focuses search + opens dropdown.
- **Results**: CSS `columns-1 md:columns-2` waterfall cards. Left border = status color only (emerald=mastered, amber=unfamiliar, zinc=unlearned). Words use `break-words` to prevent truncation. Pronounce button appears on hover.
- **`formatDefinitionHTML(raw)`**: Parses POS prefixes, renders POS badges (brand-colored pills), numbered senses with monospace numbers, dividers between POS sections.
- **`getSentencesHTML(wordId)`**: Looks up `SENTENCE_DATA[wordId]`, renders up to 3 sentences in italic quotes below a divider.

### 5. `dashboard` controller

Home page stats: total words, mastered/unfamiliar/unlearned counts, accuracy%. Progress bars and word lists.

### 6. `ledger` controller

Word-by-word ledger with status, correct/wrong counts. Filterable by status.

### 7. `fileUploader` controller

Excel book import via SheetJS. Parses `.xlsx`, extracts vocabulary lists. Supports new/merge modes.

### 8. `speech` utility

Wraps `window.speechSynthesis`.

- **`pronounce(text, onEnd)`**: Speaks at the voice rate slider setting. Strips IPA symbols (`⟨⟩‿ˈˌː.`). Uses selected voice.
- **`speakSentence(text)`**: Speaks sentence at fixed rate 1.0× (natural speed, ignoring dictation rate slider). Uses `setTimeout(20ms)` before `speak()` to work around Chrome dropping utterances after `cancel()`. Same voice selection as `pronounce`.
- **`playSFX(type)`**: UI sound effects (correct, error, tick, key).

### 9. `shareModule` (share.js, 301 lines)

Progress import/export with RLE compression. Text-only — no QR codes.

- **Compression**: Run-length encoding — `[1,2,3,4,5,10,11,12]` → `"1-5,10-12"`
- **`encodeProgress()`**: JSON → encodeURIComponent → btoa. Payload: `{v:'2.0', u:compressedUnfamiliar, m:compressedMastered, s:"id:correct:wrong,..."}`
- **`decodeProgress(encoded)`**: btoa decode → JSON parse → RLE decompress → wordProgress object
- **Import merges** with existing progress (no overwrite).
- Modal: Export section (textarea + copy button), Import section (textarea + import button).

## Data Files

### dictionary.js (v2.1, 4.7MB, 33,592 words)

The main dictionary the app loads. Format:
```js
const DICTIONARY_DATA = {
  version: '2.1',
  totalWords: 33592,
  dictionary: [
    {"id":1,"word":"-ability","phonetic":"/ə'bɪlɪtɪ/","definition":"suf ...","rank":0},
    ...
  ]
};
```

- 23,905 words have COCA ranks (1-60000), 9,687 don't (rank=0)
- 3,835 words have merged multi-POS definitions (separated by `\n`)
- Includes affix entries (words starting with `-`)
- **No regeneration script exists** — the original `generate_dict.js` that built this was deleted. `scripts/parse_dictionary.py` produces a different format (v1.0, no COCA ranks, skips affixes).

### dictionary.json / dictionary_mini.json

Generated by `scripts/build_dictionary.py` from the Excel books. Alternative dictionary data (not what the app uses for search). `dictionary_mini.json` is a compact `{id, word}` list for fast loading.

### sentences.js (8.2MB, 26,965 words)

Extracted from `data/kaikki.org-dictionary-English.jsonl` (Wiktionary dump, 2026-05-01). Format:
```js
const SENTENCE_DATA = {
  1:["people's","greengrocer's","a friend of Sarah's"],
  ...
};
```

Regenerate with: `python scripts/extract_sentences.py data/kaikki.org-dictionary-English.jsonl`

## Key UI Patterns

- **Tailwind classes**: `zinc-900/950` backgrounds, `brand-400` (#2dd4bf) accents, `zinc-800` borders
- **Glass cards**: `bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl`
- **CSS columns waterfall**: `columns-1 md:columns-2` with `break-inside-avoid` on cards
- **Animations**: `animate-fade-in` (custom keyframe), `transition-colors duration-150`
- **Z-index stack**: dropdown `z-50`, sticky header `z-40`, modals `z-50`
- **Status colors**: Border-left only — emerald=mastered, amber=unfamiliar, zinc=unlearned. No text badges.

## localStorage Keys

- `english_vocab_gym_progress` — word progress
- `english_vocab_gym_config` — user preferences
- `english_vocab_gym_books` — imported book lists

## Script Load Order

```html
<script src="js/dictionary.js"></script>   <!-- 4.7MB — word data -->
<script src="js/bundle.js"></script>        <!-- all app logic -->
<script src="js/share.js"></script>         <!-- progress import/export -->
<script src="js/sentences.js"></script>     <!-- 8.2MB — example sentences -->
```

CDNs in `<head>`: Tailwind, SheetJS.

## Known Gotchas

1. **CRLF line endings**: All `.js`/`.html` files use Windows CRLF. The Edit tool frequently fails matching strings because of invisible `\r` characters. Workaround: Write a Node.js script to a temp file, execute, delete.

2. **bundle.js is 1,952 lines**. When editing, read targeted sections with `offset`/`limit`.

3. **dictionary.js is 4.7MB** — never read it whole. All dictionary access goes through `centralDictionary` methods.

4. **No module system**: Everything is global scope. Load order matters: `dictionary.js` → `bundle.js` → `share.js` → `sentences.js`. Modules reference each other directly by global name.

5. **`columns-1 md:columns-2` waterfall**: Content flows top-to-bottom within each column. `break-inside-avoid` prevents card splitting.

6. **Speech synthesis**: Chrome drops utterances spoken immediately after `cancel()` — must use `setTimeout(fn, 20)` delay. `speakSentence()` handles this.

7. **blur-delay pattern**: Dictionary dropdown uses `setTimeout(150ms)` on blur + `mousedown` `preventDefault()` to avoid focus-reopen loops.

8. **Shortcut key constraint**: Don't bind shortcuts to character keys that can type into input fields. Use non-typing keys (`F2` for sentence) or keys with modifiers (`Ctrl+Space`).

9. **sentences.js is 8.2MB**. Total JS payload: ~13.4MB. If load time becomes an issue, consider lazy-loading.

10. **No dictionary regeneration script**: `generate_dict.js` was deleted. `scripts/parse_dictionary.py` has a broken path (`root_dir / "英汉词典.txt"` should be `root_dir / "data" / "英汉词典.txt"`) and generates v1.0 without COCA ranks, skipping affix entries. `scripts/build_dictionary.py` generates `dictionary.json`/`dictionary_mini.json` from Excel books — not `dictionary.js`.
