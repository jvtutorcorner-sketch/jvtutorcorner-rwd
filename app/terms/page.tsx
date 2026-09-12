"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/IntlProvider";

export default function TermsPage() {
  const t = useT();
  const [termsHtml, setTermsHtml] = useState<string | null>(null);

  useEffect(() => {
    // load the terms HTML (same-origin) into the page
    let mounted = true;
    fetch('/terms.html')
      .then((r) => r.text())
      .then((html) => {
        if (mounted) setTermsHtml(html);
      })
      .catch(() => setTermsHtml(null));
    return () => { mounted = false; };
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1>{t('terms_page_title')}</h1>
        <p>{t('terms_page_subtitle')}</p>
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
              __html: termsHtml || `<p>${t('terms_loading')}</p>`
            }}
          />
        </div>

        <div className="modal-actions" style={{ marginTop: 20, textAlign: 'center' }}>
          <Link href="/login/register" className="modal-button primary">
            {t('terms_back_to_register')}
          </Link>
        </div>
      </section>
    </div>
  );
}