// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import Script from 'next/script';
import { GA_MEASUREMENT_ID } from '@/lib/gtag';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { IntlProvider } from '@/components/IntlProvider';
import Link from 'next/link';
import ConfigureAmplify from '@/components/ConfigureAmplify';
import Header from '@/components/Header';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import SessionTimer from '@/components/SessionTimer';

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
        <IntlProvider>
          {/* Session timer handles 30-minute expiry + 1-minute warning */}
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-ignore */}
          <script />
          {/* Mount SessionTimer as a client component */}
          {/* Import dynamically to avoid server-side errors */}
          {/* We'll render via a client component import below */}
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
        <SessionTimer />

        <main>
          <PageBreadcrumb />
          {children}
        </main>

        <footer className="site-footer">
          © {new Date().getFullYear()} Tutor Corner
        </footer>
        </IntlProvider>
      </body>
    </html>
  );
}

