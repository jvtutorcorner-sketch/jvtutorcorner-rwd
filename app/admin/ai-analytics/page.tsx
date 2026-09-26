'use client';

// /admin/ai-analytics — AI benefit reports on the cadence in
// docs/ai-platform/ai-feature-benefit-assessment-2026-09-27.md §6:
// weekly ops, monthly KPIs, quarterly holdout review, manual metrics.
// All periods are UTC (the AI ledger partitions by UTC day).

import { useMemo, useState } from 'react';
import Tabs from '@/components/Tabs';
import type { WeeklyResponse, MonthlyResponse, QuarterlyResponse } from '@/lib/analytics/reports';
import type { ManualDef } from '@/lib/analytics/kpiCatalog';
import type { ManualMetric } from '@/lib/analytics/eventStore';
import type { SrcStatus } from '@/lib/analytics/types';
import { currentMonthKey, currentQuarterKey, lastFullDays } from '@/lib/analytics/periods';
import {
  Bars,
  CsvLink,
  ErrorBox,
  KpiTable,
  Loading,
  SourceBanner,
  StatusBadge,
  Tile,
  fmtKpiValue,
  fmtMoney,
  fmtPct,
  useReport,
} from './_components';

export default function AiAnalyticsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">AI 效益分析</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        依效益評估文件的報表節奏:週報看成本與異常、月報看 KPI、季報看 holdout 對照。所有期間皆為 UTC(台灣時間 −8 小時)。
      </p>
      <Tabs
        items={[
          { key: 'weekly', title: '週報', content: <WeeklyTab /> },
          { key: 'monthly', title: '月報', content: <MonthlyTab /> },
          { key: 'quarterly', title: '季報', content: <QuarterlyTab /> },
          { key: 'manual', title: '人工指標', content: <ManualTab /> },
        ]}
      />
    </div>
  );
}

// ── Weekly ────────────────────────────────────────────────────────────────────

type WeeklyData = WeeklyResponse & { ok: true };

function WeeklyTab() {
  const def = useMemo(() => lastFullDays(7), []);
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const qs = `from=${from}&to=${to}`;
  const { data, error, loading, reload } = useReport<WeeklyData>(`/api/admin/analytics/weekly?${qs}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600">
          起<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 border rounded px-2 py-1" />
        </label>
        <label className="text-sm text-gray-600">
          迄<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 border rounded px-2 py-1" />
        </label>
        <span className="text-xs text-gray-400">最多 31 天</span>
        <CsvLink href={`/api/admin/analytics/weekly?${qs}&format=csv`} />
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !loading && <WeeklyBody data={data} />}
    </div>
  );
}

function WeeklyBody({ data }: { data: WeeklyData }) {
  const { report: r, fx } = data;
  const t = r.totals;
  const errorRate = t.requests + t.errors > 0 ? t.errors / (t.requests + t.errors) : null;
  const flagged = new Set(r.anomalies.map((a) => a.day));
  const ledgerOk = data.sources.ledger.status !== 'unavailable';
  const rollupMismatch =
    data.rollupCheck?.filter((c) => Math.abs(c.musd - (r.daily[c.day]?.musd ?? 0)) > 0) ?? [];

  return (
    <>
      <SourceBanner sources={data.sources} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="AI 成本" value={ledgerOk ? fmtMoney(t.musd, fx) : '—'} />
        <Tile label="成功請求" value={ledgerOk ? t.requests.toLocaleString() : '—'} />
        <Tile label="錯誤數 / 錯誤率" value={`${t.errors} / ${fmtPct(errorRate)}`} sub="含成本上限、預算、供應商失敗" />
        <Tile label="小幫手訊息" value={t.widgetMessages.toLocaleString()} />
        <Tile label="LINE 訊息" value={t.lineMessages.toLocaleString()} />
      </div>

      <h3 className="font-semibold text-gray-800 mt-2">每日 AI 成本(紅色 = 當日有異常)</h3>
      <Bars
        items={r.days.map((d) => ({ label: d.slice(5), value: r.daily[d]?.musd ?? 0, flag: flagged.has(d) }))}
        format={(v) => fmtMoney(v, fx)}
      />

      {r.anomalies.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <strong>成本異常</strong>(當日成本超過其他日平均的 3 倍):
          <ul className="list-disc ml-5 mt-1">
            {r.anomalies.map((a) => (
              <li key={`${a.feature}-${a.day}`}>
                {a.day} {a.feature}:{fmtMoney(a.musd, fx)}(其他日平均 {fmtMoney(a.avgMusd, fx)})
              </li>
            ))}
          </ul>
        </div>
      )}
      {rollupMismatch.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          帳本明細與 rollup 總額不一致的日期:{rollupMismatch.map((c) => c.day).join('、')}。可能有寫入失敗,請查伺服器 log。
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2">feature</th>
              <th className="text-right px-4 py-2">成功請求</th>
              <th className="text-right px-4 py-2">錯誤</th>
              <th className="text-right px-4 py-2">錯誤率</th>
              <th className="text-right px-4 py-2">成本</th>
            </tr>
          </thead>
          <tbody>
            {r.featureTotals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  {ledgerOk ? '這段期間沒有 AI 呼叫' : '帳本不可用'}
                </td>
              </tr>
            )}
            {r.featureTotals.map((f) => (
              <tr key={f.feature} className="border-t">
                <td className="px-4 py-2 font-mono">{f.feature}</td>
                <td className="px-4 py-2 text-right">{f.requests}</td>
                <td className="px-4 py-2 text-right">{f.errors}</td>
                <td className="px-4 py-2 text-right">{fmtPct(f.errorRate)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{fmtMoney(f.musd, fx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Monthly ───────────────────────────────────────────────────────────────────

type MonthlyData = MonthlyResponse & { ok: true };

function MonthlyTab() {
  const [month, setMonth] = useState(currentMonthKey());
  const { data, error, loading, reload } = useReport<MonthlyData>(`/api/admin/analytics/monthly?month=${month}`);
  const monthInput = `${month.slice(0, 4)}-${month.slice(4)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600">
          月份
          <input
            type="month"
            value={monthInput}
            onChange={(e) => e.target.value && setMonth(e.target.value.replace('-', ''))}
            className="ml-2 border rounded px-2 py-1"
          />
        </label>
        <CsvLink href={`/api/admin/analytics/monthly?month=${month}&format=csv`} />
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !loading && <MonthlyBody data={data} />}
    </div>
  );
}

function MonthlyBody({ data }: { data: MonthlyData }) {
  const { report: r, fx } = data;
  return (
    <>
      <SourceBanner sources={r.sources} />
      <KpiTable rows={r.kpis} fx={fx} />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-2">各 feature 成本</h3>
          {r.featureCosts.length === 0 ? (
            <p className="text-sm text-gray-400">{r.sources.ledger.status === 'unavailable' ? '帳本不可用' : '本月沒有 AI 呼叫'}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {r.featureCosts.map((f) => (
                  <tr key={f.feature} className="border-t">
                    <td className="py-1 font-mono">{f.feature}</td>
                    <td className="py-1 text-right">{f.requests} 次</td>
                    <td className="py-1 text-right whitespace-nowrap">{fmtMoney(f.musd, fx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-2">每堂課 AI 成本分布</h3>
          {r.lessonCost ? (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-gray-500">有 AI 紀錄的課堂</dt>
              <dd className="text-right">{r.lessonCost.lessons}</dd>
              <dt className="text-gray-500">平均</dt>
              <dd className="text-right">{fmtMoney(r.lessonCost.avgMusd, fx)}</dd>
              <dt className="text-gray-500">中位數</dt>
              <dd className="text-right">{fmtMoney(r.lessonCost.medianMusd, fx)}</dd>
              <dt className="text-gray-500">p90</dt>
              <dd className="text-right">{fmtMoney(r.lessonCost.p90Musd, fx)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">本月沒有帶課堂 id 的 AI 呼叫</p>
          )}
          <h4 className="font-medium text-gray-700 mt-4 mb-1 text-sm">已完成課堂中各功能使用堂數</h4>
          <ul className="text-sm">
            {r.featureUsage.map((f) => (
              <li key={f.feature} className="flex justify-between">
                <span className="font-mono">{f.feature}</span>
                <span>{f.lessons}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

// ── Quarterly ─────────────────────────────────────────────────────────────────

type QuarterlyData = QuarterlyResponse & { ok: true };

function recentQuarters(n: number): string[] {
  const out: string[] = [];
  let [y, q] = currentQuarterKey().split('Q').map(Number);
  for (let i = 0; i < n; i++) {
    out.push(`${y}Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

function QuarterlyTab() {
  const quarters = useMemo(() => recentQuarters(4), []);
  const [quarter, setQuarter] = useState(quarters[0]);
  const { data, error, loading, reload } = useReport<QuarterlyData>(`/api/admin/analytics/quarterly?quarter=${quarter}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-600">
          季度
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="ml-2 border rounded px-2 py-1">
            {quarters.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <CsvLink href={`/api/admin/analytics/quarterly?quarter=${quarter}&format=csv`} />
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && !loading && <QuarterlyBody data={data} />}
    </div>
  );
}

function fmtZ(z: number | null): string {
  if (z === null) return '—';
  const sig = Math.abs(z) >= 1.96 ? '(達 95% 顯著)' : '(未達顯著)';
  return `${z.toFixed(2)} ${sig}`;
}

function QuarterlyBody({ data }: { data: QuarterlyData }) {
  const { report: r, fx } = data;
  const kpiIds = r.months[0]?.kpis.filter((k) => k.status !== 'not_applicable' && k.status !== 'not_instrumented').map((k) => k.id) ?? [];

  return (
    <>
      <SourceBanner sources={{ events: r.eventsSource, ...(r.months[0] ? { ledger: r.months[0].sources.ledger, sessions: r.months[0].sources.sessions } : {}) }} />
      {r.warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ul className="list-disc ml-5">
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <h3 className="px-4 py-3 font-semibold text-gray-800 border-b">推薦 holdout 對照(個人化 vs 熱門排序)</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2">組別</th>
              <th className="text-right px-4 py-2">曝光使用者</th>
              <th className="text-right px-4 py-2">卡片數</th>
              <th className="text-right px-4 py-2">推薦點擊</th>
              <th className="text-right px-4 py-2">CTR</th>
              <th className="text-right px-4 py-2">推薦 → 7 日購買</th>
              <th className="text-right px-4 py-2">曝光後 7 日任一購課</th>
            </tr>
          </thead>
          <tbody>
            {r.arms.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  無資料
                </td>
              </tr>
            )}
            {r.arms.map((a) => (
              <tr key={a.arm} className="border-t">
                <td className="px-4 py-2">
                  {a.arm === 'treatment' ? '個人化(treatment)' : '熱門排序(holdout)'}
                  {a.lowSample && <span className="ml-2 text-xs text-amber-700">樣本不足</span>}
                </td>
                <td className="px-4 py-2 text-right">{a.users}</td>
                <td className="px-4 py-2 text-right">{a.cards}</td>
                <td className="px-4 py-2 text-right">{a.recClicks}</td>
                <td className="px-4 py-2 text-right">{fmtPct(a.ctr)}</td>
                <td className="px-4 py-2 text-right">
                  {fmtPct(a.recPurchase.rate)} <span className="text-xs text-gray-400">({a.recPurchase.converted}/{a.recPurchase.total})</span>
                </td>
                <td className="px-4 py-2 text-right">
                  {fmtPct(a.anyPurchase.rate)} <span className="text-xs text-gray-400">({a.anyPurchase.converted}/{a.anyPurchase.total})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs text-gray-500 border-t space-y-1">
          <div>CTR 差異 z 值:{fmtZ(r.zCtr)}</div>
          <div>7 日購課率差異 z 值:{fmtZ(r.zAnyPurchase)}</div>
          <div>組別以使用者第一次曝光時的分組為準;訪客不列入。</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Tile label={r.repurchase.name} value={fmtKpiValue(r.repurchase, fx)} sub={r.repurchase.formula} />
      </div>
      <div className="-mt-2">
        <StatusBadge status={r.repurchase.status} lowSample={r.repurchase.lowSample} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <h3 className="px-4 py-3 font-semibold text-gray-800 border-b">三個月 KPI 並列</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2">KPI</th>
              {r.months.map((m) => (
                <th key={m.month} className="text-right px-4 py-2">
                  {m.month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiIds.map((id) => (
              <tr key={id} className="border-t">
                <td className="px-4 py-2">{r.months[0].kpis.find((k) => k.id === id)?.name}</td>
                {r.months.map((m) => {
                  const k = m.kpis.find((x) => x.id === id);
                  return (
                    <td key={m.month} className="px-4 py-2 text-right whitespace-nowrap" title={k ? k.status : ''}>
                      {k ? fmtKpiValue(k, fx) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Manual metrics ────────────────────────────────────────────────────────────

interface ManualData {
  ok: true;
  defs: ManualDef[];
  rows: ManualMetric[];
  source: SrcStatus;
}

function ManualTab() {
  const { data, error, loading, reload } = useReport<ManualData>('/api/admin/analytics/manual');
  const [metricKey, setMetricKey] = useState('');
  const [period, setPeriod] = useState(currentMonthKey());
  const [value, setValue] = useState('');
  const [sampleSize, setSampleSize] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const def = data?.defs.find((d) => d.metricKey === (metricKey || data.defs[0]?.metricKey));

  const save = async () => {
    if (!def) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/analytics/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metricKey: def.metricKey,
          period,
          value: Number(value),
          ...(def.kind === 'ratio' ? { sampleSize: Number(sampleSize) } : {}),
          note,
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setNotice('已儲存');
        setValue('');
        setSampleSize('');
        setNote('');
        void reload();
      } else setNotice(j?.error || `儲存失敗(HTTP ${res.status})`);
    } catch {
      setNotice('連線失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        系統量不到的 🔴 指標在這裡填。月報會讀取期間 = 當月(例如 202609)的數值;baseline / after 或週次(例如 2026-W39)只列在這裡,用來比較上線前後。
      </p>
      <SourceBanner sources={{ manual: data.source }} />

      <div className="bg-white rounded-xl border border-gray-200 p-4 grid md:grid-cols-6 gap-3 items-end">
        <label className="text-sm text-gray-600 md:col-span-2">
          指標
          <select value={def?.metricKey ?? ''} onChange={(e) => setMetricKey(e.target.value)} className="mt-1 w-full border rounded px-2 py-1">
            {data.defs.map((d) => (
              <option key={d.metricKey} value={d.metricKey}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          期間
          <input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" placeholder={def?.periodHint} />
        </label>
        <label className="text-sm text-gray-600">
          {def?.valueLabel ?? '數值'}
          <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
        </label>
        {def?.kind === 'ratio' && (
          <label className="text-sm text-gray-600">
            {def.sampleLabel}
            <input type="number" min={1} value={sampleSize} onChange={(e) => setSampleSize(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
          </label>
        )}
        <label className="text-sm text-gray-600 md:col-span-2">
          備註
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" maxLength={200} />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || value === '' || (def?.kind === 'ratio' && sampleSize === '')}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm disabled:opacity-50"
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
        {def && <div className="md:col-span-6 text-xs text-gray-400">期間範例:{def.periodHint}</div>}
        {notice && <div className="md:col-span-6 text-sm text-gray-700">{notice}</div>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2">指標</th>
              <th className="text-left px-4 py-2">期間</th>
              <th className="text-right px-4 py-2">數值</th>
              <th className="text-left px-4 py-2">備註</th>
              <th className="text-left px-4 py-2">更新</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  尚未填寫任何人工指標
                </td>
              </tr>
            )}
            {data.rows.map((m) => {
              const d = data.defs.find((x) => x.metricKey === m.metricKey);
              const shown =
                d?.kind === 'ratio' && m.sampleSize ? `${m.value} / ${m.sampleSize}(${fmtPct(m.value / m.sampleSize)})` : String(m.value);
              return (
                <tr key={`${m.metricKey}#${m.period}`} className="border-t">
                  <td className="px-4 py-2">{d?.label ?? m.metricKey}</td>
                  <td className="px-4 py-2 font-mono">{m.period}</td>
                  <td className="px-4 py-2 text-right">{shown}</td>
                  <td className="px-4 py-2 text-gray-500">{m.note}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{m.updatedAt?.slice(0, 16).replace('T', ' ')} UTC</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
