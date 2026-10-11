'use client';

import Link from 'next/link';
import { useT } from '@/components/IntlProvider';
import DailyPhrases from '@/components/home/DailyPhrases';
import type { DailyPhrasePublic } from '@/lib/dailyPhraseService';

export default function ClientDailyPage({ items }: { items: DailyPhrasePublic[] }) {
  const t = useT();

  return (
    <div className="home">
      <section className="section-light home-daily daily-page">
        <div className="section-container">
          <div className="section-header-enhanced">
            <div>
              <h1 className="section-title-large">{t('daily_title')}</h1>
              <p className="section-subtitle">{t('daily_page_subtitle')}</p>
            </div>
          </div>
          {items.length > 0 ? (
            <DailyPhrases items={items} layout="grid" />
          ) : (
            <p className="home-empty">{t('daily_empty')}</p>
          )}
          <div className="daily-cta">
            <p className="daily-cta-text">{t('daily_cta_text')}</p>
            <Link href="/courses" className="btn-primary">{t('daily_cta_button')}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
