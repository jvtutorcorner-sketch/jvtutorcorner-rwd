// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import Script from 'next/script';
import { GA_MEASUREMENT_ID } from '@/lib/gtag';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import Link from 'next/link';
export const metadata: Metadata = {
  title: 'Tutor Platform',
  description: 'Online tutoring platform with video and whiteboard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>
        {/* GA4：放在 body 裡，用 next/script */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script
              id="ga4-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_MEASUREMENT_ID}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}

        <header className="site-header">
          <div className="logo">Tutor Corner</div>
          <nav className="main-nav">
            <Link href="/">首頁</Link>
            <Link href="/teachers">老師</Link>
            <Link href="/courses">課程</Link>
            <Link href="/pricing">方案價格</Link>
            <Link href="/login">登入</Link>
          </nav>
          <LanguageSwitcher />
        </header>

        <main>{children}</main>

        <footer className="site-footer">
          © {new Date().getFullYear()} Tutor Corner
        </footer>
      </body>
    </html>
  );
}

