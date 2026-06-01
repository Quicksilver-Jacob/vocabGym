#!/usr/bin/env python3
"""
Parse 英汉词典.txt and generate dictionary.js (embedded in JS)
"""

import re
import json
from pathlib import Path

def parse_dictionary():
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent
    
    # Read dictionary file
    dict_file = root_dir / "英汉词典.txt"
    output_file = root_dir / "js" / "dictionary.js"
    
    print(f"Reading: {dict_file}")
    
    with open(dict_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.strip().split('\n')
    print(f"Total lines: {len(lines)}")
    
    dictionary = []
    word_id = 1
    word_map = {}
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Split by ⇒
        if '⇒' not in line:
            continue
        
        parts = line.split('⇒', 1)
        if len(parts) != 2:
            continue
        
        word = parts[0].strip()
        rest = parts[1].strip()
        
        # Skip affixes/prefixes/suffixes (starting with -)
        if word.startswith('-') or word.startswith("'"):
            continue
        
        # Extract phonetic and definition
        phonetic = ''
        definition = ''
        
        # Check for phonetic /.../
        phonetic_match = re.match(r'^(/[^/]+/)(.*)$', rest)
        if phonetic_match:
            phonetic = phonetic_match.group(1).strip()
            definition = phonetic_match.group(2).strip()
        else:
            definition = rest
        
        # Clean phonetic
        if phonetic:
            phonetic = phonetic.replace('[', '').replace(']', '')
        
        # Skip entries without definition or phonetic
        if not definition and not phonetic:
            continue
        
        # Deduplicate
        word_lower = word.lower()
        if word_lower in word_map:
            continue
        
        word_map[word_lower] = word_id
        
        dictionary.append({
            'id': word_id,
            'word': word,
            'phonetic': phonetic,
            'definition': definition
        })
        
        word_id += 1
    
    print(f"Parsed {len(dictionary)} unique words")
    
    # Generate JS file with embedded data
    js_content = f"""// dictionary.js - Central Dictionary Data (Auto-generated)
// Total words: {len(dictionary)}

const DICTIONARY_DATA = {{
  version: '1.0',
  totalWords: {len(dictionary)},
  dictionary: {json.dumps(dictionary, ensure_ascii=False, separators=(',', ':'))},
  wordMap: {json.dumps(word_map, ensure_ascii=False, separators=(',', ':'))}
}};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {{
  module.exports = DICTIONARY_DATA;
}}
"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"Saved to: {output_file}")
    print(f"File size: {output_file.stat().st_size / 1024:.1f} KB")
    
    # Show samples
    print("\nFirst 10 entries:")
    for w in dictionary[:10]:
        print(f"  [{w['id']:>6}] {w['word']:<25} {w['phonetic'][:35]:<35}")
    
    print("\nLast 5 entries:")
    for w in dictionary[-5:]:
        print(f"  [{w['id']:>6}] {w['word']:<25} {w['phonetic'][:35]:<35}")
    
    return dictionary

if __name__ == "__main__":
    parse_dictionary()
