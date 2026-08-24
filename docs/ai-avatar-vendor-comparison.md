# AI 虛擬人技術選型：Agora / Replicate / RunPod 比較

> Tutor Corner · AI 虛擬人教學專區 · 技術選型筆記
> 2026-08-23

目標是先做出一支 1 分鐘內的 AI 虛擬人教學廣告樣片，評估值不值得投入。這份筆記把三個平台在「難度」與「要串接什麼」上攤開來看，方便決定先動哪一個。

## 快速結論

| 平台 | 定位 | 適合這次1分鐘廣告嗎 |
|---|---|---|
| **Agora** | 即時互動語音／視訊代理人，虛擬人臉即時同步說話 | ✕ 不適合（不是預錄影片工具） |
| **Replicate** | 託管式模型 API 市集，一次呼叫即可產生內容 | ✓ 建議先用這個 |
| **RunPod** | 純 GPU 雲端租賃，自己包模型、自己顧環境 | ✕ 現階段先不用 |

## 完整比較表

| 面向 | Agora | Replicate | RunPod |
|---|---|---|---|
| 定位／最佳情境 | 即時互動語音視訊代理人＋虛擬人臉同步，適合「即時對話」場景 | 託管式模型 API，一次呼叫即可產生內容，適合單次／少量成品影片 | 純 GPU 租賃，自架模型與環境，適合長期大量生產、要壓低單位成本 |
| 用在「1分鐘廣告」的難度 | 不適用 | 低～中 | 高 |
| 要自架伺服器／容器？ | 否，但要串 4-5 個第三方帳號 | 否，純 API 呼叫 | **是**，Docker image＋GPU 環境全部自己顧 |
| 需串接的外部服務 | Agora 本身＋LLM＋STT＋TTS＋Avatar provider，共 4-5 個 | TTS 模型＋口型同步模型，共 2-3 個（+ 選用 S3） | RunPod 平台 + 自選 TTS／口型同步模型全部要自己包成容器 |
| 執行模式 | 即時串流（real-time） | 非同步批次：送出任務 → 輪詢或 webhook 拿結果，約數十秒至數分鐘 | 依部署方式而定，但冷啟動、擴縮容都要自己處理 |
| 首版預估開發時間 | 3–5 天（4方帳號申請＋agent設定＋RTC串流程） | 半天～1天（申請 Token＋串2-3個API＋寫輪詢邏輯） | 3–7 天（打包容器、部署、除錯 GPU 環境） |
| 成本結構 | $0.10/分鐘對話 ＋ RTC頻道費 ＋ Avatar provider費，三筆帳單疊加（有 300 分鐘免費試用） | TTS 按字數計費（非GPU計時）、口型同步模型固定跑在 L40S、按GPU秒數計費，試作抓 $20–40 美元 | GPU租用約 $0.69/hr（RTX 4090），單次算力 $0.1–0.3 美元，但工程與維運人力是主要隱藏成本 |
| 這次 pilot 適合嗎 | 不適合 | 適合 | 不建議現階段 |

## 各平台詳細串接清單

### Replicate — 建議先做這個
7 個步驟 · 半天～1天

1. **申請 API Token** — 取得 `REPLICATE_API_TOKEN`，存進 `.env.local` 或 Amplify 環境變數
2. **選配音（TTS）模型** — 用 `minimax/speech-02-turbo`（官方合作模型，不跑在你選的 GPU 上，按**輸入字數**計費：$0.06/千字元，音訊輸出不額外收費）
3. **選虛擬人臉／口型同步模型** — 用 `lucataco/sadtalker`（大頭照＋語音檔 → 合成影片），這類社群模型的 GPU 是**作者固定好的、你不能選**，此模型固定跑在 **Nvidia L40S**，按 GPU 秒數計費，單次（約137秒運算）約 $0.13
4. **處理非同步任務** — Replicate 的 prediction 是非同步的，要輪詢狀態或設定 webhook callback
5. **（可選）後製** — 用 ffmpeg 燒字幕、配樂、加片頭尾
6. **成品儲存** — 接既有 `@aws-sdk/client-s3`（專案已有）把產出影片存起來
7. **簡易觸發介面** — 寫一支小工具或 script 觸發生成、下載成品即可，不用放進正式 nav

> **關於 GPU**：Replicate 上不像 RunPod 一樣自己選 GPU 型號——GPU 是每個模型的作者事先固定好的，你只能選「用哪個模型」。上面兩個模型分別是：`minimax/speech-02-turbo` 不按 GPU 計費（按字數）、`lucataco/sadtalker` 固定跑在 Nvidia L40S（按秒計費）。

### Agora — 之後做「即時虛擬助教」再評估
8 個步驟 · 3–5天

1. **沿用既有基礎** — 專案已裝 `agora-rtc-sdk-ng`、`agora-access-token`，`app/api/agora/token/route.ts` 的簽發邏輯可直接重用
2. **建立 Conversational AI Agent** — 在 Agora Console 或 REST API 設定 agent，指定要用的 LLM／STT／TTS／Avatar provider
3. **申請 Avatar Provider 帳號** — 如 Akool、Simli 等 Agora 整合商，各自要申請 API Key
4. **串接 LLM** — 接上對話模型（如 Anthropic API），設定 system prompt 與知識範圍
5. **設定 STT／TTS provider** — 可用 Agora 內建或自選第三方語音服務
6. **教室內的邀請流程** — 在 `app/classroom` 加入「邀請虛擬助教加入頻道」的 UI 與流程
7. **處理生命週期 Webhook** — 接收 agent 開始／結束／錯誤等事件通知
8. **拆帳單監控** — Conversational AI 分鐘費、RTC 頻道費、Avatar provider 費，三個帳單來源要分開追蹤

### RunPod — 規模化生產階段才需要
9 個步驟 · 3–7天

1. **申請 API Key** — 建立 RunPod 帳號與 API 金鑰
2. **打包 Docker image** — Python＋PyTorch/CUDA＋選定的開源模型（SadTalker／LivePortrait等）＋所有相依套件
3. **部署 Endpoint** — 選 Serverless Endpoint 或 Pod，挑 GPU 型號（4090／A100），設定 idle timeout 避免閒置燒錢
4. **管理模型權重** — 用 Network Volume 快取權重，否則每次冷啟動都要重新下載，可能拖到好幾分鐘
5. **自行處理 TTS 環節** — 同容器內跑開源 TTS，或另外呼叫外部 TTS API
6. **寫 API wrapper** — 自己實作提交 job → 輪詢或 webhook 拿結果的邏輯
7. **錯誤重試與監控** — RunPod 只給基本 dashboard，timeout／重試／告警要自己刻
8. **成品儲存** — 一樣要接 S3 存放輸出影片
9. **長期維護** — 模型更新、CUDA／套件相依性 debug、GPU 缺貨排隊風險，都是持續性人力成本

## 建議

- **現在（試作1分鐘廣告）**：用 Replicate。免架設、半天到一天能出第一版，抓 US$20–40 試作預算即可評估。
- **如果廣告成效不錯，想做「即時互動虛擬助教」**：評估 Agora，因為 RTC 基礎建設專案裡已經有了，能省掉重新接一套即時串流的工程量。
- **RunPod**：先不用。只有在確定要規模化生產、影片產量大到能攤提 DevOps 人力成本時才重新評估。
