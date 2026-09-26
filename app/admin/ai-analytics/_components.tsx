'use client';

// Shared pieces for /admin/ai-analytics. No chart library in this repo: bars
// are plain Tailwind divs, like app/admin/analytics/page.tsx.

import { useCallback, useEffect, useState } from 'react';
import type { KpiRow, KpiStatus, SrcStatus } from '@/lib/analytics/types';

// ── Data fetching ─────────────────────────────────────────────────────────────

export function useReport<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) setError('沒有權限(需要管理員登入)');
      else if (!res.ok || !j?.ok) setError(j?.error || `讀取失敗(HTTP ${res.status})`);
      else setData(j as T);
    } catch {
      setError('連線失敗');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtUsd(musd: number): string {
  const usd = musd / 1_000_000;
  return `$${usd < 0.01 && usd > 0 ? usd.toFixed(6) : usd.toFixed(4)}`;
}

export function fmtNt(musd: number, fx: number): string {
  const nt = (musd / 1_000_000) * fx;
  return `NT$${nt < 1 && nt > 0 ? nt.toFixed(4) : nt.toFixed(2)}`;
}

export function fmtMoney(musd: number, fx: number): string {
  return `${fmtUsd(musd)} · ${fmtNt(musd, fx)}`;
}

export function fmtPct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`;
}

export function fmtKpiValue(k: KpiRow, fx: number): string {
  if (k.value === null) return '—';
  switch (k.unit) {
    case 'musd':
      return fmtMoney(k.value, fx);
    case 'pct':
      return fmtPct(k.value);
    case 'pp':
      return `${k.value >= 0 ? '+' : ''}${k.value.toFixed(1)} 個百分點`;
    case 'hours':
      return `${k.value} 小時`;
    case 'minutes':
      return `${k.value} 分鐘`;
    default:
      return Number.isInteger(k.value) ? k.value.toLocaleString() : k.value.toFixed(2);
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<KpiStatus, { label: string; cls: string }> = {
  ok: { label: '正常', cls: 'bg-green-50 text-green-700 border-green-200' },
  memory: { label: '記憶體模式', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  partial: { label: '期間未完整', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  unavailable: { label: '資料源不可用', cls: 'bg-gray-100 text-gray-600 border-gray-300' },
  no_denominator: { label: '無資料', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  not_instrumented: { label: '待補', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  not_applicable: { label: '不適用', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  manual_missing: { label: '待填', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
};

export function StatusBadge({ status, lowSample }: { status: KpiStatus; lowSample?: boolean }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`text-xs px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>
      {lowSample && <span className="text-xs px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">樣本不足,只看趨勢</span>}
    </span>
  );
}

const TIER_LABEL: Record<KpiRow['tier'], string> = { G: '🟢', Y: '🟡', R: '🔴' };

const SOURCE_LABEL: Record<string, string> = {
  ledger: 'AI 用量帳本',
  events: '分析事件',
  sessions: '課堂紀錄',
  manual: '人工指標',
};

/** One line per data source; unavailable sources show the likely cause. */
export function SourceBanner({ sources }: { sources: Record<string, SrcStatus | undefined> }) {
  const entries = Object.entries(sources).filter((e): e is [string, SrcStatus] => !!e[1]);
  const anyMemory = entries.some(([, s]) => s.status === 'memory');
  const bad = entries.filter(([, s]) => s.status === 'unavailable');
  return (
    <div className="space-y-2 mb-4">
      {anyMemory && (
        <div className="text-sm rounded border border-yellow-200 bg-yellow-50 text-yellow-800 px-3 py-2">
          記憶體模式:這台伺服器沒有 DynamoDB 憑證,顯示的是本機暫存資料,重新啟動就會消失。
        </div>
      )}
      {bad.map(([k, s]) => (
        <div key={k} className="text-sm rounded border border-gray-300 bg-gray-50 text-gray-700 px-3 py-2">
          <strong>{SOURCE_LABEL[k] ?? k}不可用</strong>:{s.hint}。相關指標顯示「資料源不可用」,不代表數值為 0。
        </div>
      ))}
      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
        {entries.map(([k, s]) => (
          <span key={k} className="px-2 py-0.5 rounded bg-gray-100">
            {SOURCE_LABEL[k] ?? k}:{s.status === 'ok' ? `正常(${s.rows ?? 0} 列)` : s.status === 'memory' ? `記憶體(${s.rows ?? 0} 列)` : '不可用'}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── KPI table ─────────────────────────────────────────────────────────────────

const SECTION_LABEL: Record<KpiRow['section'], string> = {
  chat: 'AI Chat(全站小幫手 + LINE)',
  teacher: 'AI 教師專區',
  course: '課程分析',
};

export function KpiTable({ rows, fx }: { rows: KpiRow[]; fx: number }) {
  const sections = (['chat', 'teacher', 'course'] as const).filter((s) => rows.some((r) => r.section === s));
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section} className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <h3 className="px-4 py-3 font-semibold text-gray-800 border-b">{SECTION_LABEL[section]}</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 w-8"></th>
                <th className="text-left px-4 py-2">KPI</th>
                <th className="text-right px-4 py-2">數值</th>
                <th className="text-right px-4 py-2">分子 / 分母</th>
                <th className="text-left px-4 py-2">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.section === section)
                .map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-4 py-2" title={r.tier === 'G' ? '現在就能量' : r.tier === 'Y' ? '需先埋點' : '人工填寫'}>
                      {TIER_LABEL[r.tier]}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.formula}</div>
                      {r.note && <div className="text-xs text-gray-400 mt-0.5">{r.note}</div>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono whitespace-nowrap">{fmtKpiValue(r, fx)}</td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                      {r.denominator !== undefined && r.unit !== 'musd' ? `${r.numerator ?? 0} / ${r.denominator}` : ''}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} lowSample={r.lowSample} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900 mt-1 break-all">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

/** Vertical bars, one per label. */
export function Bars({ items, format }: { items: Array<{ label: string; value: number; flag?: boolean }>; format: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-2 h-40 bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col items-center justify-end h-full min-w-[40px] flex-1 group relative">
          <div
            className={`w-full rounded-t ${i.flag ? 'bg-red-400' : 'bg-indigo-400'} group-hover:opacity-80`}
            style={{ height: `${Math.max(2, (i.value / max) * 100)}%` }}
          />
          <div className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">{i.label}</div>
          <div className="absolute -top-6 hidden group-hover:block text-xs bg-gray-800 text-white px-2 py-0.5 rounded whitespace-nowrap z-10">
            {format(i.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CsvLink({ href }: { href: string }) {
  return (
    <a href={href} className="text-sm px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
      下載 CSV
    </a>
  );
}

export function Loading() {
  return <div className="text-sm text-gray-500 py-8">載入中…</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-sm rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 flex items-center gap-3">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline">
          重試
        </button>
      )}
    </div>
  );
}
