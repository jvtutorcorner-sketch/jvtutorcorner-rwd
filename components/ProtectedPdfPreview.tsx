'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 講義線上預覽元件（不提供下載）。改寫自 components/PdfViewer.tsx 的 canvas 渲染邏輯，
 * 差異：吃受保護的預覽 API URL（非 File）、無下載按鈕、阻擋右鍵選單。
 *
 * 誠實揭露：canvas 渲染 + 無下載按鈕 + 阻擋右鍵僅能提高一般使用者下載的門檻，
 * 無法防止 screenshot／devtools／螢幕錄影等方式取得內容。
 */
export default function ProtectedPdfPreview({
  previewUrl,
  title,
  onClose,
}: {
  previewUrl: string;
  title: string;
  onClose: () => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const currentRenderTask = useRef<any>(null);
  const pdfDocumentRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (currentRenderTask.current) {
        try { currentRenderTask.current.cancel(); } catch {}
        currentRenderTask.current = null;
      }
      pdfDocumentRef.current = null;
    };
  }, []);

  const renderPage = useCallback(async (pdf: any, pageNum: number) => {
    try {
      if (currentRenderTask.current) {
        try { currentRenderTask.current.cancel(); } catch {}
      }
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const renderTask = page.render({ canvasContext: ctx, viewport });
      currentRenderTask.current = renderTask;
      await renderTask.promise;
      currentRenderTask.current = null;

      const dataUrl = canvas.toDataURL('image/png');
      if (imgRef.current) imgRef.current.src = dataUrl;
    } catch (e) {
      console.error('renderPage failed', e);
      currentRenderTask.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { getPdfLib, isPdfSupported } = await import('@/lib/pdfUtils');
        const lib = await getPdfLib();
        if (!isPdfSupported() && !lib) {
          throw new Error('PDF rendering is not supported in this environment');
        }

        const res = await fetch(previewUrl, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(res.status === 403 ? '您沒有權限檢視此教材' : '教材載入失敗');
        }
        const arrayBuffer = await res.arrayBuffer();
        if (!mounted) return;

        const data = new Uint8Array(arrayBuffer);
        const loadingTask = lib.getDocument({ data });
        const pdf = await loadingTask.promise;
        if (!mounted) return;

        pdfDocumentRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
        renderPage(pdf, 1);
      } catch (e: any) {
        if (mounted) {
          setError(e?.message || '教材載入失敗');
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [previewUrl, renderPage]);

  useEffect(() => {
    if (pdfDocumentRef.current) {
      renderPage(pdfDocumentRef.current, currentPage);
    }
  }, [currentPage, renderPage]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={{ width: '92%', maxWidth: 960, maxHeight: '92%', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <strong>{title}</strong>
            {numPages > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>第 {currentPage} / {numPages} 頁</span>}
          </div>
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200">
            關閉
          </button>
        </div>

        <div
          style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 16, userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
          onContextMenu={(e) => e.preventDefault()}
        >
          {loading && <p style={{ color: '#6b7280' }}>教材載入中…</p>}
          {error && <p style={{ color: '#dc2626' }}>{error}</p>}
          {!loading && !error && (
            <img
              ref={imgRef}
              alt={title}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              style={{ display: 'block', maxWidth: '100%', height: 'auto', pointerEvents: 'none' }}
            />
          )}
        </div>

        {numPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              上一頁
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
