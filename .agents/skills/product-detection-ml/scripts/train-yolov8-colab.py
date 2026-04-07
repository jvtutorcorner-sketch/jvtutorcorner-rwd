from ultralytics import YOLO

# 1. 載入模型 (選用 Nano 版本以適配網頁端效能)
model = YOLO('yolov8n.pt')

# 2. 開始訓練
# data: 您的 Roboflow YAML 設定檔路徑
# epochs: 訓練輪數 (藥品建議 100-300 輪)
# imgsz: 圖片解析度 (通常為 640)
# batch: 批次大小 (若 T4 GPU 可設為 16 或 32)
results = model.train(
    data='/content/dataset/data.yaml', 
    epochs=100, 
    imgsz=640, 
    batch=16, 
    device=0
)

# 3. 獲取最佳模型權重路徑
best_model_path = 'runs/detect/train/weights/best.pt'
print(f"訓練完成！最佳模型存放在：{best_model_path}")
