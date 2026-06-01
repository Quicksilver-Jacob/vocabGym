#!/usr/bin/env python3
"""
Build Central Dictionary for IELTS Vocab Gym
合并所有词书，生成带编号的中央词典数据库
"""

import pandas as pd
import json
import os
from pathlib import Path

def build_dictionary():
    """读取所有Excel词书，合并生成中央词典"""
    
    # 获取books目录
    script_dir = Path(__file__).parent
    books_dir = script_dir.parent / "books"
    output_dir = script_dir.parent / "js"
    
    # 所有要处理的文件
    files = [
        "雅思标准词汇3800（第二版）.xlsx",
        "7天搞定雅思高频核心词.xlsx", 
        "雅思分级词汇21天进阶.xlsx"
    ]
    
    all_words = {}
    word_id = 1
    stats = {
        "total_files": 0,
        "total_rows": 0,
        "unique_words": 0,
        "duplicates": 0
    }
    
    print("=" * 60)
    print("Building Central Dictionary for IELTS Vocab Gym")
    print("=" * 60)
    
    for filename in files:
        filepath = books_dir / filename
        if not filepath.exists():
            print(f"⚠️  File not found: {filename}")
            continue
            
        print(f"\n📖 Processing: {filename}")
        stats["total_files"] += 1
        
        try:
            df = pd.read_excel(filepath)
            file_count = 0
            file_duplicates = 0
            
            for idx, row in df.iterrows():
                word = str(row["单词"]).strip() if pd.notna(row["单词"]) else None
                
                if not word or word.lower() in ["nan", "none", ""]:
                    continue
                    
                stats["total_rows"] += 1
                file_count += 1
                
                if word in all_words:
                    stats["duplicates"] += 1
                    file_duplicates += 1
                    continue
                
                all_words[word] = {
                    "id": word_id,
                    "word": word,
                    "phoneticBr": str(row["英音"]).strip() if pd.notna(row["英音"]) else "",
                    "phoneticUs": str(row["美音"]).strip() if pd.notna(row["美音"]) else "",
                    "definition": str(row["释义"]).strip() if pd.notna(row["释义"]) else ""
                }
                word_id += 1
            
            print(f"   ✓ Rows processed: {file_count}")
            print(f"   ✓ Duplicates skipped: {file_duplicates}")
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    # 生成词典数组（按id排序）
    dictionary = sorted(all_words.values(), key=lambda x: x["id"])
    stats["unique_words"] = len(dictionary)
    
    print("\n" + "=" * 60)
    print("Build Summary:")
    print("=" * 60)
    print(f"Files processed: {stats['total_files']}")
    print(f"Total rows: {stats['total_rows']}")
    print(f"Unique words: {stats['unique_words']}")
    print(f"Duplicates removed: {stats['duplicates']}")
    
    # 创建word到id的映射（用于快速查找）
    word_to_id = {w["word"].lower(): w["id"] for w in dictionary}
    
    # 保存词典数据
    output_data = {
        "version": "1.0",
        "buildDate": pd.Timestamp.now().isoformat(),
        "totalWords": len(dictionary),
        "dictionary": dictionary,
        "wordMap": word_to_id  # 用于快速查找
    }
    
    # 保存完整词典
    output_file = output_dir / "dictionary.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(",", ":"))
    
    print(f"\n💾 Dictionary saved to: {output_file}")
    print(f"   File size: {output_file.stat().st_size / 1024:.1f} KB")
    
    # 同时生成一个压缩版本（只包含id和word，用于快速加载）
    mini_dict = [{"id": w["id"], "w": w["word"]} for w in dictionary]
    mini_file = output_dir / "dictionary_mini.json"
    with open(mini_file, "w", encoding="utf-8") as f:
        json.dump({"words": mini_dict}, f, ensure_ascii=False, separators=(",", ":"))
    
    print(f"💾 Mini dictionary saved to: {mini_file}")
    print(f"   File size: {mini_file.stat().st_size / 1024:.1f} KB")
    
    # 显示示例
    print("\n📋 Sample entries:")
    for w in dictionary[:5]:
        print(f"   [{w['id']:>4}] {w['word']}")
    print("   ...")
    for w in dictionary[-3:]:
        print(f"   [{w['id']:>4}] {w['word']}")
    
    print("\n✅ Build complete!")
    return dictionary

if __name__ == "__main__":
    build_dictionary()
