import re

txt_path = r'd:\jvtutorcorner-rwd\all1_11503_1.TXT'

print("=== 詳細分析 TXT 資料結構 ===\n")

with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = [next(f) for _ in range(10)]  # 讀取前 10 行

for idx, line in enumerate(lines, 1):
    print(f"Line {idx}:")
    print(f"  原始長度: {len(line)} 字符")
    print(f"  內容: {line.rstrip()}")
    print()

# 試著用正則表達式提取欄位
print("=== 嘗試提取欄位 ===")
pattern = r'^(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(.+)$'
first_data_line = lines[0].rstrip()
match = re.match(pattern, first_data_line)
if match:
    print(f"提取的欄位:")
    for i, group in enumerate(match.groups(), 1):
        print(f"  欄位 {i}: {group[:80]}")  # 只顯示前 80 字
