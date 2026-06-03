"""
extract_sentences.py
Extracts example sentences from kaikki.org English Wiktionary JSONL
for every word in our central dictionary. Outputs js/sentences.js.

Usage:
  python extract_sentences.py [path_to_jsonl]

  The JSONL file (2.8GB) can be downloaded once from:
    https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl

  If no path is given, attempts to download directly (unstable for 2.8GB).
  For reliability, download with a browser/download-manager first, then run:
    python extract_sentences.py kaikki.org-dictionary-English.jsonl
"""

import urllib.request
import json
import re
import os
import sys
import time

KAIIKI_URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl"
DICT_JS = os.path.join("js", "dictionary.js")
OUTPUT_JS = os.path.join("js", "sentences.js")
CHECKPOINT_FILE = "extract_checkpoint.json"

def load_word_id_map():
    """Parse dictionary.js to build {lowercase_word: id} mapping using regex."""
    print(f"Loading dictionary from {DICT_JS}...")
    with open(DICT_JS, "r", encoding="utf-8") as f:
        content = f.read()

    word_map = {}
    for m in re.finditer(r'"word"\s*:\s*"((?:[^"\\]|\\.)*)"[^}]*"id"\s*:\s*(\d+)', content):
        word = m.group(1).strip().lower()
        word_id = int(m.group(2))
        if word:
            word_map[word] = word_id

    print(f"  Loaded {len(word_map)} words from dictionary")
    return word_map


def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Convert string keys back to int
        data["sentences"] = {int(k): v for k, v in data["sentences"].items()}
        print(f"Resuming from checkpoint: {data['lines_processed']:,} lines processed, "
              f"{len(data['sentences'])} words have sentences")
        return data
    return {"lines_processed": 0, "sentences": {}}


def save_checkpoint(lines_processed, sentences):
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump({"lines_processed": lines_processed, "sentences": sentences}, f)


def extract_from_stream(word_map, input_stream):
    """Process JSONL stream line by line, extracting example sentences."""
    cp = load_checkpoint()
    sentences = cp["sentences"]
    skip_count = cp["lines_processed"]
    matched = len(sentences)
    total_lines = 0

    print(f"Processing JSONL...")
    print(f"  Target words: {len(word_map):,}")
    print(f"  Already matched: {matched:,}")
    print(f"  Skipping first {skip_count:,} lines")

    start_time = time.time()
    last_report = start_time

    for raw_line in input_stream:
        # Decode if bytes
        if isinstance(raw_line, bytes):
            raw_line = raw_line.decode("utf-8", errors="replace")

        total_lines += 1

        # Resume: skip already-processed lines
        if skip_count > 0:
            skip_count -= 1
            continue

        line = raw_line.strip()
        if not line:
            continue

        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        word = entry.get("word", "").strip().lower()
        if not word or word not in word_map:
            continue

        word_id = word_map[word]
        if word_id in sentences:
            continue

        # Collect examples from all senses
        examples = []
        for sense in entry.get("senses", []):
            for ex in sense.get("examples", []):
                text = ex.get("text", "").strip()
                if text:
                    examples.append((text, ex.get("type", "example")))

        if not examples:
            continue

        # Prefer short "example" type over long "quotation" type
        examples.sort(key=lambda x: (0 if x[1] == "example" else 1, len(x[0])))

        # Take up to 3 unique sentences
        seen = set()
        picked = []
        for text, _ in examples:
            key = text.lower()
            if key not in seen:
                seen.add(key)
                picked.append(text)
            if len(picked) >= 3:
                break

        sentences[word_id] = picked
        matched += 1
        cp["lines_processed"] = total_lines

        # Progress report every 5 seconds
        now = time.time()
        if now - last_report > 5:
            elapsed = now - start_time
            rate = cp["lines_processed"] / elapsed if elapsed > 0 else 0
            print(f"  Lines: {cp['lines_processed']:,} | "
                  f"Matched: {matched:,}/{len(word_map):,} "
                  f"({matched*100/len(word_map):.1f}%) | "
                  f"{rate:,.0f} lines/s   ", end="\r")
            last_report = now
            save_checkpoint(cp["lines_processed"], sentences)

    cp["lines_processed"] = total_lines
    save_checkpoint(total_lines, sentences)

    elapsed = time.time() - start_time
    print(f"\nDone. Processed {total_lines:,} lines in {elapsed:.0f}s "
          f"({total_lines/elapsed:,.0f} lines/s)")
    print(f"Sentences found for {matched:,}/{len(word_map):,} words "
          f"({matched*100/len(word_map):.1f}%)")

    return sentences


def write_output(sentences):
    """Write js/sentences.js."""
    lines = ["const SENTENCE_DATA = {"]
    for word_id in sorted(sentences.keys()):
        texts = sentences[word_id]
        escaped = [t.replace("\\", "\\\\").replace('"', '\\"') for t in texts]
        json_texts = json.dumps(escaped, ensure_ascii=False)
        lines.append(f"  {word_id}:{json_texts},")
    lines.append("};")

    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    size_mb = os.path.getsize(OUTPUT_JS) / (1024 * 1024)
    print(f"Written {OUTPUT_JS} ({size_mb:.1f} MB)")

    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        print("Removed checkpoint file.")


def main():
    word_map = load_word_id_map()

    if len(sys.argv) > 1:
        path = sys.argv[1]
        print(f"Reading from local file: {path}")
        with open(path, "r", encoding="utf-8") as f:
            sentences = extract_from_stream(word_map, f)
    else:
        print(f"Downloading from {KAIIKI_URL}")
        print("Tip: download with a browser and pass the local path for reliability.")
        req = urllib.request.Request(KAIIKI_URL)
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            sentences = extract_from_stream(word_map, resp)
        except Exception as e:
            print(f"\nDownload error: {e}")
            print("Try downloading the file manually and re-running:")
            print(f"  python extract_sentences.py kaikki.org-dictionary-English.jsonl")
            sys.exit(1)

    write_output(sentences)


if __name__ == "__main__":
    main()
