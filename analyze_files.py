import csv
import os

# 檢查 CSV 檔案
csv_path = r'd:\jvtutorcorner-rwd\large_file.csv'
txt_path1 = r'd:\jvtutorcorner-rwd\all1_11503_1.TXT'

# CSV 分析
try:
    with open(csv_path, 'r', encoding='utf-8-sig', errors='ignore') as f:
        reader = csv.reader(f)
        header = next(reader)
        print("=== CSV 檔案分析 ===")
        print(f"CSV 欄位數: {len(header)}")
        print(f"欄位名稱: {header}")
        
        # 讀取幾行資料看欄位值
        for i, row in enumerate(reader):
            if i >= 2:
                break
            print(f"資料行 {i+1}: {len(row)} 個值 - 範例: {row[:3] if len(row) >= 3 else row}")
except Exception as e:
    print(f"CSV 讀取錯誤: {e}")

# TXT 檔案（前 5 行）
print("\n=== TXT 檔案前 5 行 ===")
try:
    with open(txt_path1, 'r', encoding='utf-8', errors='ignore') as f:
        for i, line in enumerate(f):
            if i >= 5:
                break
            print(f"Line {i+1}: {line.strip()[:120]}")  # 只顯示前 120 字
except Exception as e:
    print(f"TXT 讀取錯誤: {e}")
