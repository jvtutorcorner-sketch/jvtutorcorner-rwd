"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/IntlProvider";
import { parseCsv } from "@/lib/registerProfileCsv";
import { formatLocalIso, timezoneForCountry } from "@/lib/countryTimezone";

/** Mirrors BATCH_MAX_ROWS in lib/registerProfile.ts (not imported: that module is server-only). */
const CSV_BATCH_MAX_ROWS = 200;

const REQUIRED_HEADERS = ['email', 'password', 'firstName', 'lastName', 'role', 'birthdate', 'gender', 'country'];

type OrgUnitOption = { id: string; name: string; level: number };

interface Props {
  orgId: string;
  /** 組織網域；僅用於畫面提示（真正的網域檢查在伺服器端每一列都會做）。 */
  orgDomain?: string;
  availableSeats: number;
  orgUnits: OrgUnitOption[];
  /** 匯入成功後重新載入成員清單與席次。 */
  onImported: () => void;
}

/**
 * 企業成員 CSV 批次匯入 —— 只出現在 /admin/organizations/[id] 的「成員」分頁，
 * 且只給系統管理員與該組織的組織管理員（與 POST /api/register/batch 的
 * requireOrgAccess 'write' 同一組條件）。
 *
 * 原本這個功能在公開頁 /login/register_enterprise 上，靠驗證碼 + IP 限流把關；
 * 改為登入後才能使用，避免匿名者用同一個 IP 每小時灌入數百個帳號。
 *
 * 匯入是全有全無：任一列驗證失敗就整批不寫入，因此這裡把可以在前端先看出來的問題
 * （缺欄位、檔案內重複 Email、超過單批上限、席次不足）先擋掉，減少來回。
 */
export default function OrgCsvImportPanel({ orgId, orgDomain, availableSeats, orgUnits, onImported }: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [targetUnitId, setTargetUnitId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ created: number; emailsSent: number } | null>(null);
  const [importing, setImporting] = useState<{ total: number } | null>(null);

  const downloadSampleCsv = () => {
    const sampleData = [
      ['student@example.com', 'password123', 'John', 'Doe', 'student', '2000-01-01', 'male', 'TW'],
      ['teacher@example.com', 'password456', 'Jane', 'Smith', 'teacher', '1985-05-15', 'female', 'US'],
    ];
    const csvContent = [REQUIRED_HEADERS.join(','), ...sampleData.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_registration.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('csv_error_pick_file'));
      setCsvFile(null);
      return;
    }
    setCsvFile(file);
    setError(null);
    setSuccess(null);
  };

  // Server row-error codes (lib/registerProfile.ts registerMembersBatch) → readable text
  const describeRowError = (code: string) => {
    if (code.startsWith('missing_')) return t('csv_row_err_missing', { field: code.slice('missing_'.length) });
    if (code.endsWith('_too_long')) return t('csv_row_err_too_long', { field: code.slice(0, -'_too_long'.length) });
    const known = ['email_invalid', 'email_domain_mismatch', 'email_duplicate_in_batch', 'email_already_registered', 'email_lookup_failed', 'role_invalid'];
    return known.includes(code) ? t(`csv_row_err_${code}`) : code;
  };

  const handleImport = async () => {
    if (!csvFile) {
      setError(t('csv_error_no_file'));
      return;
    }
    setError(null);
    setSuccess(null);

    try {
      const text = await csvFile.text();
      // Proper CSV parsing: quoted fields may contain commas, quotes ("") and line breaks
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setError(t('csv_error_format'));
        return;
      }

      const headers = parsed[0].values;
      const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setError(t('csv_error_missing_headers', { fields: missingHeaders.join(', ') }));
        return;
      }

      const records: Array<{ line: number; data: Record<string, string> }> = [];
      const rowErrors: string[] = [];
      for (const { line, values } of parsed.slice(1)) {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = (values[index] || '').trim();
        });
        const missing = REQUIRED_HEADERS.filter((h) => !record[h]);
        if (missing.length > 0) {
          rowErrors.push(t('csv_error_row_missing', { row: line, fields: missing.join(', ') }));
        } else {
          records.push({ line, data: record });
        }
      }
      if (rowErrors.length > 0) {
        setError(`${t('csv_error_validation')}\n${rowErrors.join('\n')}`);
        return;
      }
      if (records.length > CSV_BATCH_MAX_ROWS) {
        setError(t('csv_error_batch_too_large', { records: records.length, max: CSV_BATCH_MAX_ROWS }));
        return;
      }

      // 檔案內重複 Email —— 伺服器端也會再檢查一次，這裡只是提早回饋。
      const emailCounts = new Map<string, number>();
      records.forEach((r) => {
        const key = r.data.email.toLowerCase();
        emailCounts.set(key, (emailCounts.get(key) || 0) + 1);
      });
      const duplicates = Array.from(emailCounts.entries()).filter(([, n]) => n > 1).map(([e]) => e);
      if (duplicates.length > 0) {
        setError(`${t('csv_error_duplicate_emails')}\n${duplicates.join('\n')}`);
        return;
      }

      // 席次前置檢查（advisory）—— 真正的把關在伺服器端整批交易。
      if (records.length > availableSeats) {
        setError(t('csv_import_seats_short', { records: records.length, seats: availableSeats }));
        return;
      }

      const rows = records.map(({ data }) => {
        const times = formatLocalIso(timezoneForCountry(data.country));
        return {
          email: data.email.toLowerCase(),
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          birthdate: data.birthdate,
          gender: data.gender,
          country: data.country,
          timezone: times.timezone,
          createdAtUtc: times.utc,
          createdAtLocal: times.local,
          updatedAtLocal: times.local,
        };
      });

      setImporting({ total: rows.length });
      let res: Response;
      let data: any = null;
      try {
        res = await fetch('/api/register/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, orgUnitId: targetUnitId || undefined, rows }),
        });
        data = await res.json().catch(() => null);
      } catch (netErr: any) {
        setError(`${t('csv_import_nothing_imported')}\n${netErr?.message || t('csv_error_network')}`);
        return;
      } finally {
        setImporting(null);
      }

      if (!res.ok || !data?.ok) {
        const code = data?.message as string | undefined;
        let detail: string;
        if (Array.isArray(data?.rowErrors) && data.rowErrors.length > 0) {
          detail = data.rowErrors
            .map((re: { index: number; email?: string; errors: string[] }) =>
              t('csv_row_error_line', {
                row: records[re.index]?.line ?? re.index + 2,
                email: re.email || '',
                errors: re.errors.map(describeRowError).join(', '),
              })
            )
            .join('\n');
        } else if (res.status === 401 || res.status === 403) {
          detail = t('csv_import_forbidden');
        } else if (res.status === 429) {
          detail = t('register_too_many_attempts');
        } else if (code === 'batch_partial') {
          detail = t('csv_error_batch_partial', { count: data?.partial?.profileIds?.length ?? 0 });
        } else {
          detail = data?.detail || code || t('csv_error_row_failed');
        }
        setError(code === 'batch_partial' ? detail : `${t('csv_import_nothing_imported')}\n${detail}`);
        onImported();
        return;
      }

      setSuccess({ created: data.created, emailsSent: data.emailsSent ?? 0 });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImported();
    } catch (err: any) {
      setImporting(null);
      setError(t('csv_error_parse', { message: err?.message || String(err) }));
    }
  };

  return (
    <details style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>{t('csv_import_panel_title')}</summary>

      <p style={{ fontSize: 13, color: '#555', margin: '10px 0' }}>
        {t('csv_import_panel_hint', { max: CSV_BATCH_MAX_ROWS })}
        {orgDomain ? ` ${t('csv_import_domain_hint', { domain: orgDomain })}` : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="org-csv-file"
        />
        <label htmlFor="org-csv-file" style={{ ...btnStyle('#1976d2'), display: 'inline-block' }}>
          📁 {t('register_csv_choose')}
        </label>
        {csvFile && <span style={{ fontSize: 13 }}>{csvFile.name}</span>}

        <label style={{ fontSize: 13 }}>
          {t('csv_import_target_unit')}{' '}
          <select value={targetUnitId} onChange={(e) => setTargetUnitId(e.target.value)} style={{ padding: 6 }}>
            <option value="">{t('csv_import_unit_none')}</option>
            {orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {'　'.repeat(u.level)}{u.name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={handleImport} disabled={!csvFile || !!importing} style={btnStyle('#4caf50')}>
          {t('register_csv_import')}
        </button>
        <button type="button" onClick={downloadSampleCsv} style={btnStyle('#757575')}>
          {t('register_csv_sample')}
        </button>
      </div>

      {importing && (
        <p style={{ fontSize: 13, color: '#555', marginTop: 10 }}>{t('csv_importing_batch', { total: importing.total })}</p>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: 10, backgroundColor: '#ffebee', borderRadius: 4 }}>
          <strong style={{ color: '#c62828' }}>{t('csv_import_error_title')}</strong>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', fontSize: 12, color: '#c62828' }}>{error}</pre>
        </div>
      )}

      {success && (
        <div style={{ marginTop: 10, padding: 10, backgroundColor: '#e8f5e9', borderRadius: 4, fontSize: 13 }}>
          <strong style={{ color: '#2e7d32' }}>{t('csv_import_done')}</strong>{' '}
          {t('csv_import_created', { count: success.created, emails: success.emailsSent })}
        </div>
      )}
    </details>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '6px 14px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13
  };
}
