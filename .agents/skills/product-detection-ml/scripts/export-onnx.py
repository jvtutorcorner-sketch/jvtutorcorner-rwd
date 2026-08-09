from ultralytics import YOLO

# 載入您訓練出的最佳權重 (.pt 檔案)
model = YOLO('best.pt')

# 匯出為 ONNX 格式
# imgsz: 與訓練時相同（通常為 640）
# simplify: 非常重要，可大幅縮減模型大小與運算複雜度，推薦設為 True
# format: 指定匯出為 onnx
success = model.export(
    format='onnx', 
    imgsz=640, 
    simplify=True,
    opset=12  # 指定 opset 版本，12 可與大多數瀏覽器相容
)

if success:
    print("模型已成功轉為 .onnx，可以放入專案的 public/models/ 目錄中。")
else:
    print("匯出失敗，請檢查權重檔案是否存在。")
