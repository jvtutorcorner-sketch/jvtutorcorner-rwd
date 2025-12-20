"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function TermsPage() {
  const [termsHtml, setTermsHtml] = useState<string | null>(null);

  useEffect(() => {
    // load the terms HTML (same-origin) into the page
    let mounted = true;
    fetch('/terms.html')
      .then((r) => r.text())
      .then((t) => {
        if (mounted) setTermsHtml(t);
      })
      .catch(() => setTermsHtml(null));
    return () => { mounted = false; };
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>服務條款與隱私權政策</h1>
        <p>請仔細閱讀以下條款內容</p>
      </header>

      <section className="section">
        <div className="card">
          <div
            style={{
              border: '1px solid #ddd',
              padding: '20px',
              maxHeight: '70vh',
              overflow: 'auto',
              lineHeight: '1.6'
            }}
            dangerouslySetInnerHTML={{
              __html: termsHtml || '<p>載入條款中... 或放置一份 PDF 到 public/terms.pdf 並提供下載。</p>'
            }}
          />
        </div>

        <div className="modal-actions" style={{ marginTop: 20, textAlign: 'center' }}>
          <Link href="/login/register" className="modal-button primary">
            返回註冊頁面
          </Link>
        </div>
      </section>
    </div>
  );
}