// lib/analytics/kpiCatalog.ts
//
// Static definitions of every KPI in docs/ai-platform/ai-feature-benefit-
// assessment-2026-09-27.md §2–§4, and of the manually entered metrics. The
// aggregators fill in values; KPIs with no data source carry a fixed status.

import type { KpiSection, KpiStatus, KpiTier, KpiUnit } from './types';

export interface KpiDef {
  id: string;
  section: KpiSection;
  name: string;
  tier: KpiTier;
  unit: KpiUnit;
  formula: string;
  /** Set for KPIs that cannot be computed yet; the reason goes in `note`. */
  fixedStatus?: Extract<KpiStatus, 'not_instrumented' | 'not_applicable'>;
  note?: string;
  /** Only computed on the quarterly report. */
  quarterOnly?: boolean;
}

export const KPI_DEFS: readonly KpiDef[] = [
  // ── §2 AI Chat ──────────────────────────────────────────────────────────────
  { id: 'chat_cost_per_msg_widget', section: 'chat', name: '每則成本(全站小幫手)', tier: 'G', unit: 'musd', formula: 'Σ 成本(chat-assistant) ÷ 小幫手訊息數' },
  { id: 'chat_cost_per_msg_line', section: 'chat', name: '每則成本(LINE)', tier: 'G', unit: 'musd', formula: 'Σ 成本(line-text + line-vision) ÷ 其 AI 呼叫數', note: 'TCO 模型預估 NT$0.0138/則' },
  { id: 'chat_monthly_cost', section: 'chat', name: '月 AI 費用(對話類)', tier: 'G', unit: 'musd', formula: 'Σ 成本(chat-assistant + line-text + line-vision + chat)' },
  { id: 'widget_msg_volume', section: 'chat', name: '小幫手訊息量', tier: 'G', unit: 'count', formula: 'chat_message 事件數' },
  { id: 'line_msg_volume', section: 'chat', name: 'LINE 訊息量', tier: 'G', unit: 'count', formula: 'line_message 事件數' },
  { id: 'chat_self_resolve', section: 'chat', name: '自助解決率(代理指標)', tier: 'Y', unit: 'pct', formula: '對話期間及最後訊息後 24h 內無轉真人的對話 ÷ 對話數(對話 = 使用者 × UTC 日)', note: '「同一問題重問」無法偵測,未計入' },
  { id: 'chat_to_course_click', section: 'chat', name: '對話 → 課程點擊率', tier: 'Y', unit: 'pct', formula: '對話中課程連結被點擊的比例', fixedStatus: 'not_instrumented', note: '對話回覆中的課程連結尚未帶 src=chat' },
  { id: 'chat_to_purchase_7d', section: 'chat', name: '對話 → 7 日內購課率', tier: 'Y', unit: 'pct', formula: '當月有對話的使用者,首次對話後 7 日內有購課的比例' },
  { id: 'cs_hours', section: 'chat', name: '真人客服工時', tier: 'R', unit: 'hours', formula: '人工填寫(當月合計)' },
  { id: 'chat_error_rate', section: 'chat', name: '錯誤回答率(抽樣)', tier: 'R', unit: 'pct', formula: '抽樣中答錯/無關/幻覺的則數 ÷ 抽樣數' },

  // ── §3 AI 教師專區 ─────────────────────────────────────────────────────────
  { id: 'teacher_feature_usage', section: 'teacher', name: 'AI 功能使用率', tier: 'G', unit: 'pct', formula: '當月已完成課堂中有用 Copilot/Tutor/出題的課堂 ÷ 已完成課堂數' },
  { id: 'teacher_cost_per_lesson', section: 'teacher', name: '每堂課 AI 成本(平均)', tier: 'G', unit: 'musd', formula: '有 sessionId 的 AI 成本 ÷ 課堂數' },
  { id: 'assessment_adoption', section: 'teacher', name: 'AI 題目採用率', tier: 'Y', unit: 'pct', formula: '由 AI 草稿派發的測驗數 ÷ AI 出題次數', note: '< 50% 表示產題品質不足,應先調整 prompt' },
  { id: 'assessment_edit_rate', section: 'teacher', name: 'AI 題目修改率', tier: 'Y', unit: 'pct', formula: '被老師修改的題目比例', fixedStatus: 'not_applicable', note: '出題頁的題目目前是唯讀,老師無法修改' },
  { id: 'grading_override_rate', section: 'teacher', name: 'AI 批改覆寫率', tier: 'Y', unit: 'pct', formula: '老師手動改分的題目比例', fixedStatus: 'not_applicable', note: '目前沒有老師改分功能' },
  { id: 'summary_open_rate', section: 'teacher', name: '課後摘要開啟率', tier: 'Y', unit: 'pct', formula: '學生打開摘要的比例', fixedStatus: 'not_instrumented', note: '無學生端摘要入口(待補)' },
  { id: 'tutor_hint_depth', section: 'teacher', name: 'Tutor 提示深度', tier: 'Y', unit: 'count', formula: '學生平均用到第幾級提示', fixedStatus: 'not_instrumented', note: '提示階梯改伺服端追蹤後數字才可信(inventory Fix 11)' },
  { id: 'teacher_postclass_minutes', section: 'teacher', name: '老師課後工時', tier: 'R', unit: 'minutes', formula: '人工填寫(每堂課出題/批改/整理分鐘數)' },
  { id: 'ai_grading_agreement', section: 'teacher', name: 'AI 批改一致率(抽樣)', tier: 'R', unit: 'pct', formula: '老師盲評同意 AI 分數的份數 ÷ 抽樣數' },
  { id: 'active_teachers', section: 'teacher', name: '有完成課堂的老師數', tier: 'G', unit: 'count', formula: '當月已完成課堂的相異老師數', note: '只看趨勢,無法歸因給 AI' },
  { id: 'sessions_per_teacher', section: 'teacher', name: '每位老師完成課堂數', tier: 'G', unit: 'count', formula: '已完成課堂數 ÷ 老師數', note: '只看趨勢,無法歸因給 AI' },

  // ── §4 課程分析 ─────────────────────────────────────────────────────────────
  { id: 'rec_impressions', section: 'course', name: '推薦卡片曝光數', tier: 'Y', unit: 'count', formula: 'rec_impression 事件的卡片總數(僅登入者)' },
  { id: 'rec_ctr', section: 'course', name: '推薦點擊率(CTR)', tier: 'Y', unit: 'pct', formula: '推薦區點擊數 ÷ 推薦卡片曝光數' },
  { id: 'rec_to_purchase_7d', section: 'course', name: '推薦 → 7 日內購買率', tier: 'Y', unit: 'pct', formula: '推薦點擊後 7 日內買了同一門課 ÷ 推薦點擊數' },
  { id: 'catalog_to_purchase_7d', section: 'course', name: '目錄 → 7 日內購買率', tier: 'Y', unit: 'pct', formula: '目錄點擊後 7 日內買了同一門課 ÷ 目錄點擊數' },
  { id: 'rec_vs_catalog_diff', section: 'course', name: '推薦 vs 目錄 轉換率差', tier: 'Y', unit: 'pp', formula: '推薦購買率 − 目錄購買率(百分點)', note: '證明推薦有效的核心指標' },
  { id: 'personalization_coverage', section: 'course', name: '個人化覆蓋率', tier: 'G', unit: 'pct', formula: '有用到個人化的推薦請求 ÷ 推薦請求數' },
  { id: 'popularity_signal_validity', section: 'course', name: '熱門度訊號有效率', tier: 'G', unit: 'pct', formula: '有真實報名數(非缺值、非 0.5)的推薦卡片 ÷ 推薦卡片數' },
  { id: 'repurchase_in_quarter', section: 'course', name: '季內回購率', tier: 'G', unit: 'pct', formula: '季內購課 ≥ 2 次的使用者 ÷ 季內有購課的使用者', quarterOnly: true },
  { id: 'completion_rate', section: 'course', name: '完課率', tier: 'G', unit: 'pct', formula: '報名後完成全部課堂的比例', fixedStatus: 'not_instrumented', note: '尚未定義「完課」' },
  { id: 'learning_analytics_usage', section: 'course', name: '學習分析使用率', tier: 'Y', unit: 'count', formula: '老師查看課堂分析的次數', fixedStatus: 'not_instrumented', note: 'L1–L4 尚未實作' },
];

export function kpiDef(id: string): KpiDef {
  const d = KPI_DEFS.find((k) => k.id === id);
  if (!d) throw new Error(`unknown KPI ${id}`);
  return d;
}

/**
 * Manually entered metrics (doc 🔴 tier). `ratio` metrics store the numerator in
 * `value` and the sample in `sampleSize`. Monthly KPIs read the row whose
 * period equals the month key (yyyymm); other periods (baseline/after labels,
 * ISO weeks) are listed on the manual tab only.
 */
export interface ManualDef {
  metricKey: string;
  kpiId: string;
  label: string;
  kind: 'value' | 'ratio';
  unit: KpiUnit;
  valueLabel: string;
  sampleLabel?: string;
  periodHint: string;
}

export const MANUAL_DEFS: readonly ManualDef[] = [
  { metricKey: 'cs_hours', kpiId: 'cs_hours', label: '真人客服工時', kind: 'value', unit: 'hours', valueLabel: '工時(小時)', periodHint: '202609(月合計),或 2026-W39(上線前週基線)' },
  { metricKey: 'chat_error_sample', kpiId: 'chat_error_rate', label: 'AI 回答錯誤抽樣', kind: 'ratio', unit: 'pct', valueLabel: '錯誤則數', sampleLabel: '抽樣則數', periodHint: '202609' },
  { metricKey: 'teacher_postclass_minutes', kpiId: 'teacher_postclass_minutes', label: '老師課後工時', kind: 'value', unit: 'minutes', valueLabel: '每堂課平均分鐘數', periodHint: '202609,或 baseline / after' },
  { metricKey: 'ai_grading_agreement', kpiId: 'ai_grading_agreement', label: 'AI 批改一致率抽樣', kind: 'ratio', unit: 'pct', valueLabel: '老師同意份數', sampleLabel: '抽樣份數', periodHint: '202609' },
];

export function manualDef(metricKey: string): ManualDef | undefined {
  return MANUAL_DEFS.find((m) => m.metricKey === metricKey);
}

/** Ledger features counted as AI Chat cost. */
export const CHAT_FEATURES = ['chat-assistant', 'line-text', 'line-vision', 'chat'] as const;
export const LINE_FEATURES = ['line-text', 'line-vision'] as const;
/** Ledger features that mean "AI was used in this lesson". */
export const LESSON_AI_FEATURES = ['copilot', 'tutor', 'assessment'] as const;
