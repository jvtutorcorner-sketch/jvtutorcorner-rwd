// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import Script from 'next/script';
import { GA_MEASUREMENT_ID } from '@/lib/gtag';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import Link from 'next/link';
import ConfigureAmplify from '@/components/ConfigureAmplify';
import Header from '@/components/Header';
import PageBreadcrumb from '@/components/PageBreadcrumb';

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
        <ConfigureAmplify />
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

        <Header />

        <main>
          <PageBreadcrumb />
          {children}
        </main>

        <footer className="site-footer">
          © {new Date().getFullYear()} Tutor Corner
        </footer>
      </body>
    </html>
  );
}

