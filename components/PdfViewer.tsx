"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';

type Annotation = { points: number[]; color: string; width: number };

export default function PdfViewer({ file, onClose }: { file: File | null; onClose: () => void }) {
  const [pdfLib, setPdfLib] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({});
  const [color, setColor] = useState('#ff0000');
  const [width, setWidth] = useState(3);
  const fileId = file ? `${file.name}:${file.size}:${file.lastModified}` : 'no-file';
  const currentRenderTask = useRef<any>(null);
  const pdfDocumentRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      // Cancel any ongoing render task when component unmounts
      if (currentRenderTask.current) {
        try {
          currentRenderTask.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
        currentRenderTask.current = null;
      }
      pdfDocumentRef.current = null;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { getPdfLib, isPdfSupported } = await import('@/lib/pdfUtils');
        if (!isPdfSupported()) {
          if (mounted) setError('PDF rendering is not supported in this environment');
          return;
        }
        const lib = await getPdfLib();
        if (mounted) setPdfLib(lib);
      } catch (e) {
        console.error('pdfjs import failed', e);
        if (mounted) setError('PDF rendering requires the "pdfjs-dist" package. Please run: npm install pdfjs-dist');
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!pdfLib || !file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const loadingTask = (pdfLib as any).getDocument({ data });
        const pdf = await loadingTask.promise;
        pdfDocumentRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        // render first page
        renderPage(pdf, 1);
      } catch (e) {
        console.error(e);
        setError('Failed to load PDF');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [pdfLib, file]);

  const renderPage = useCallback(async (pdf: any, pageNum: number) => {
    try {
      // Cancel any ongoing render task
      if (currentRenderTask.current) {
        try {
          currentRenderTask.current.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const renderContext = { canvasContext: ctx, viewport };
      const renderTask = page.render(renderContext);
      currentRenderTask.current = renderTask;
      
      await renderTask.promise;
      currentRenderTask.current = null;
      
      const dataUrl = canvas.toDataURL('image/png');
      if (imgRef.current) imgRef.current.src = dataUrl;
      // ensure annotation canvas same size
      if (canvasRef.current) {
        canvasRef.current.width = canvas.width;
        canvasRef.current.height = canvas.height;
        canvasRef.current.style.width = `${viewport.width}px`;
        canvasRef.current.style.height = `${viewport.height}px`;
      }
      // load annotations for this page
      loadAnnotations(pageNum);
    } catch (e) {
      console.error('renderPage failed', e);
      currentRenderTask.current = null;
    }
  }, []);

  const handlePageChange = async (pageNum: number) => {
    if (!pdfDocumentRef.current) return;
    setCurrentPage(pageNum);
    await renderPage(pdfDocumentRef.current, pageNum);
  };

  // annotation helpers
  const loadAnnotations = (pageNum: number) => {
    try {
      const raw = localStorage.getItem(`pdf_annot:${fileId}:${pageNum}`);
      const parsed = raw ? JSON.parse(raw) as Annotation[] : [];
      setAnnotations((s) => ({ ...s, [pageNum]: parsed }));
      // draw loaded annotations
      requestAnimationFrame(() => redrawAnnotations(pageNum));
    } catch (e) {
      setAnnotations((s) => ({ ...s, [pageNum]: [] }));
    }
  };

  const saveAnnotations = (pageNum: number) => {
    const ann = annotations[pageNum] || [];
    localStorage.setItem(`pdf_annot:${fileId}:${pageNum}`, JSON.stringify(ann));
  };

  const redrawAnnotations = (pageNum: number) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const list = annotations[pageNum] || [];
    list.forEach((a) => {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.width;
      ctx.beginPath();
      if (a.points.length >= 2) {
        ctx.moveTo(a.points[0], a.points[1]);
        for (let i = 2; i < a.points.length; i += 2) ctx.lineTo(a.points[i], a.points[i + 1]);
        ctx.stroke();
      }
    });
  };

  useEffect(() => { redrawAnnotations(currentPage); }, [annotations, currentPage]);

  // pointer drawing
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    let isDrawing = false;
    let currentStroke: Annotation | null = null;

    function toPos(ev: PointerEvent) {
      if (!cvs) return { x: 0, y: 0 };
      const rect = cvs.getBoundingClientRect();
      return { x: (ev.clientX - rect.left) * (cvs.width / rect.width), y: (ev.clientY - rect.top) * (cvs.height / rect.height) };
    }

    function onPointerDown(ev: PointerEvent) {
      if (!cvs) return;
      isDrawing = true;
      try { cvs.setPointerCapture(ev.pointerId); } catch (e) {}
      const p = toPos(ev);
      currentStroke = { points: [p.x, p.y], color, width };
      setAnnotations((s) => ({ ...s, [currentPage]: [...(s[currentPage] || []), currentStroke as Annotation] }));
    }
    function onPointerMove(ev: PointerEvent) {
      if (!isDrawing || !currentStroke || !cvs) return;
      const p = toPos(ev);
      currentStroke.points.push(p.x, p.y);
      // draw incremental
      const ctx = cvs.getContext('2d');
      if (!ctx) return;
      ctx.strokeStyle = currentStroke.color;
      ctx.lineWidth = currentStroke.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const pts = currentStroke.points;
      const len = pts.length;
      if (len >= 4) {
        ctx.moveTo(pts[len - 4], pts[len - 3]);
        ctx.lineTo(pts[len - 2], pts[len - 1]);
        ctx.stroke();
      }
    }
    function onPointerUp(ev: PointerEvent) {
      isDrawing = false;
      if (cvs) {
        try { cvs.releasePointerCapture(ev.pointerId); } catch (e) {}
      }
      saveAnnotations(currentPage);
      currentStroke = null;
    }

    cvs.addEventListener('pointerdown', onPointerDown);
    cvs.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      cvs.removeEventListener('pointerdown', onPointerDown);
      cvs.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [currentPage, color, width, annotations]);

  const clearPageAnnotations = (pageNum: number) => {
    setAnnotations((s) => ({ ...s, [pageNum]: [] }));
    localStorage.removeItem(`pdf_annot:${fileId}:${pageNum}`);
  };

  const exportPageAsImage = (pageNum: number) => {
    const img = imgRef.current;
    const ann = canvasRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    // draw base image
    ctx.drawImage(img, 0, 0, w, h);
    // draw annotations scaled to image pixel size
    if (ann) {
      // ann canvas may be high-DPR; draw its pixels directly scaled
      ctx.drawImage(ann, 0, 0, w, h);
    }
    const dataUrl = out.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${file?.name || 'page' }-page-${pageNum}.png`;
    a.click();
  };

  if (!file) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '90%', maxWidth: 1000, maxHeight: '90%', background: '#fff', borderRadius: 8, overflow: 'auto', padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <strong>{file.name}</strong>
            <div style={{ fontSize: 12, color: '#666' }}>{numPages} pages</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        {error && <div style={{ color: 'salmon' }}>{error}</div>}

        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img ref={imgRef} alt="pdf-page" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />
              <canvas ref={canvasRef} style={{ position: 'absolute', left: 0, top: 0 }} />
            </div>
          </div>

          <div style={{ width: 240 }}>
            <div style={{ marginBottom: 12 }}>
              <label>Page:</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>Prev</button>
                <input value={currentPage} onChange={(e) => { let v = Number(e.target.value); if (isNaN(v) || v < 1) v = 1; if (v > numPages) v = numPages; setCurrentPage(v); }} style={{ width: 60 }} />
                <button onClick={() => currentPage < numPages && handlePageChange(currentPage + 1)} disabled={currentPage >= numPages}>Next</button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Tool:</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                <input type="range" min={1} max={30} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              <button onClick={() => exportPageAsImage(currentPage)}>Download Page as Image</button>
              <button onClick={() => clearPageAnnotations(currentPage)}>Clear Annotations</button>
              <button onClick={() => saveAnnotations(currentPage)}>Save Annotations</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {Array.from({ length: numPages }).map((_, i) => {
            const p = i + 1;
            return (
              <button key={p} onClick={() => handlePageChange(p)} style={{ padding: 6, minWidth: 32, background: p === currentPage ? '#2563eb' : undefined, color: p === currentPage ? '#fff' : undefined }}>
                {p}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
