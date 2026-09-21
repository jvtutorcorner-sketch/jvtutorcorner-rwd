'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useDateFormat } from '@/lib/hooks/useDateFormat';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'success'; studentName: string; courseTitle: string }
  | { kind: 'duplicate'; studentName: string; courseTitle: string; lastScannedAt: string }
  | { kind: 'error'; message: string };

const SCANNER_ELEMENT_ID = 'attendance-qr-reader';
const DEBOUNCE_MS = 2000;

export default function AttendanceScanner() {
  const dateFmt = useDateFormat();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [scanState, setScanState] = useState<ScanState>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<any>(null);
  const lastDecodedRef = useRef<{ text: string; at: number } | null>(null);

  const submitToken = useCallback(async (rawToken: string) => {
    const token = rawToken.includes('/ticket/') ? rawToken.split('/ticket/').pop() || rawToken : rawToken;

    setBusy(true);
    try {
      const res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setScanState({ kind: 'error', message: data.error || '報到失敗，請重試' });
        return;
      }

      if (data.duplicate) {
        setScanState({
          kind: 'duplicate',
          studentName: data.student?.name || '學生',
          courseTitle: data.course?.title || '',
          lastScannedAt: data.lastScannedAt,
        });
      } else {
        setScanState({
          kind: 'success',
          studentName: data.student?.name || '學生',
          courseTitle: data.course?.title || '',
        });
      }
    } catch (err: any) {
      setScanState({ kind: 'error', message: err?.message || '網路錯誤，請重試' });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDecoded = useCallback((decodedText: string) => {
    const now = Date.now();
    if (lastDecodedRef.current && lastDecodedRef.current.text === decodedText && now - lastDecodedRef.current.at < DEBOUNCE_MS) {
      return;
    }
    lastDecodedRef.current = { text: decodedText, at: now };
    submitToken(decodedText);
  }, [submitToken]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decodedText: string) => handleDecoded(decodedText),
          () => { /* per-frame decode failure — expected while aiming camera, ignore */ }
        );
      } catch (err: any) {
        if (cancelled) return;
        const message = String(err?.name || err?.message || err);
        if (message.includes('NotAllowedError') || message.toLowerCase().includes('permission')) {
          setCameraError('相機權限被拒絕。請至瀏覽器設定允許相機權限，或使用下方手動輸入。');
        } else if (message.includes('NotFoundError')) {
          setCameraError('找不到可用的相機裝置。請使用下方手動輸入。');
        } else {
          setCameraError('無法啟動相機，請使用下方手動輸入。');
        }
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().catch(() => {}).finally(() => {
          try { scanner.clear(); } catch {}
        });
      }
    };
  }, [handleDecoded]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
        <div id={SCANNER_ELEMENT_ID} className="w-full" />
      </div>

      {cameraError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {cameraError}
        </div>
      )}

      {scanState.kind === 'success' && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">
          <p className="font-semibold">✅ 報到成功</p>
          <p className="text-sm">{scanState.studentName} — {scanState.courseTitle}</p>
        </div>
      )}
      {scanState.kind === 'duplicate' && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
          <p className="font-semibold">⚠️ 已於稍早報到</p>
          <p className="text-sm">{scanState.studentName} — {scanState.courseTitle}</p>
          <p className="text-xs text-yellow-700">上次報到時間：{dateFmt.formatDateTime(scanState.lastScannedAt)}</p>
        </div>
      )}
      {scanState.kind === 'error' && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">❌ {scanState.message}</p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manualToken.trim()) submitToken(manualToken.trim());
        }}
        className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <label className="text-sm font-medium text-gray-700">手動輸入票券代碼</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="貼上票券連結或代碼"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !manualToken.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            送出
          </button>
        </div>
      </form>
    </div>
  );
}
