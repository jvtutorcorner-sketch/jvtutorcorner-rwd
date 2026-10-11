'use client';

import Link from 'next/link';
import { useT } from '@/components/IntlProvider';
import AiZoneCards from '@/components/home/AiZoneCards';
import type { AiZoneItemPublic } from '@/lib/aiZoneContentService';

export default function ClientAiZonePage({ items }: { items: AiZoneItemPublic[] }) {
  const t = useT();

  return (
    <div className="home">
      <section className="section-light home-aiz aiz-page">
        <div className="section-container">
          <div className="section-header-enhanced">
            <div>
              <h1 className="section-title-large">{t('aizone_title')}</h1>
              <p className="section-subtitle">{t('aizone_page_subtitle')}</p>
            </div>
          </div>
          {items.length > 0 ? (
            <AiZoneCards items={items} layout="grid" />
          ) : (
            <p className="home-empty">{t('aizone_empty')}</p>
          )}
          <div className="aiz-cta">
            <p className="aiz-cta-text">{t('aizone_cta_text')}</p>
            <Link href="/courses" className="btn-primary">{t('aizone_cta_button')}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
