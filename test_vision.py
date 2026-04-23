import google.generativeai as genai
import PIL.Image
import requests
import json
from io import BytesIO

# ==========================================
# 1. 設定 Gemini API Key
# ==========================================
# 請將這裡換成您在 Google AI Studio 申請的 API Key
API_KEY = "AIzaSyCEZpUWEbxRHWdtT_ZflXvWg3uB9FpiIPc"
genai.configure(api_key=API_KEY)

# ==========================================
# 2. 準備測試圖片 (使用食藥署真實圖片)
# ==========================================
print("📥 正在下載測試圖片...")
print("📥 從本地載入測試圖片...")
# 使用您提供的本機路徑載入圖片
image_path = r"C:\Users\Attlie\Downloads\AI藥師\內衛成製字第000075號-20250717(廠商自行上傳)-001.jpg"
img = PIL.Image.open(image_path)
print(f"✅ 圖片載入完成：{image_path}")

# ==========================================
# 3. 設定模型與 Prompt
# ==========================================
# 使用具備強大視覺能力的 1.5 Pro 模型
model = genai.GenerativeModel('gemini-2.5-flash')

prompt = """
你是一位專業且嚴謹的「AI 數位藥劑師視覺助理」。你的任務是仔細觀察使用者上傳的藥品圖片，並精準萃取出藥品的外觀特徵。

【任務規則】
1. 你只能根據圖片中「真實看到」的特徵進行描述。絕對不可以猜測、推論或捏造圖片中看不清楚的細節。
2. 如果圖片極度模糊、嚴重反光，或者根本不是藥品，請在對應的特徵欄位填寫 "無法辨識"。

【特徵萃取標準】
請分析圖片並回傳以下 JSON 結構：
{
  "shape": "請從以下選項中選擇：圓形、橢圓形、長圓柱形、膠囊形、三角形、方形、多邊形、其他。若無法辨識請填 '無法辨識'。",
  "color": "請辨識藥品的主要顏色。請使用單一基礎顏色描述，例如：白、黃、紅、棕、粉紅、綠、藍、黑、灰。若有雙色請用 '/' 隔開。若無法辨識請填 '無法辨識'。",
  "imprint": "請仔細讀取藥丸表面的『英文、數字或符號刻字』。請區分大小寫，若有空格請保留。若雙面皆有刻字請用 '/' 隔開。若表面平滑無字，請填寫 '無'。若模糊看不清請填 '無法辨識'。",
  "score_line": "請觀察藥丸表面是否有『刻痕』。若有一條直線請填 '一字'，若有十字線請填 '十字'，若無刻痕請填 '無'。"
}

這攸關醫療安全，寧可回傳 "無法辨識"，也絕對不可以使用推測的數值。
"""

# ==========================================
# 4. 呼叫 API 並強制輸出 JSON
# ==========================================
print("🧠 正在呼叫 Gemini Vision API 進行特徵萃取...")

# generation_config 強制模型輸出純 JSON 字串
result = model.generate_content(
    [prompt, img],
    generation_config={"response_mime_type": "application/json"}
)

# ==========================================
# 5. 解析與驗證結果
# ==========================================
print("\n=== 🎯 AI 萃取結果 ===")
print("原始字串回傳值:", result.text)

try:
    # 測試是否能成功轉換為 Python 字典
    extracted_features = json.loads(result.text)
    print("\n✅ 成功解析為 JSON 物件:")
    print(f"- 形狀: {extracted_features.get('shape')}")
    print(f"- 顏色: {extracted_features.get('color')}")
    print(f"- 刻字: {extracted_features.get('imprint')}")
    print(f"- 刻痕: {extracted_features.get('score_line')}")
    
    # 您可以在這裡撰寫邏輯：
    # 如果 extracted_features['shape'] == '無法辨識'，就準備回傳請使用者重拍的訊息給 LINE。
    
except json.JSONDecodeError:
    print("❌ 解析失敗，AI 回傳的不是標準 JSON 格式。")