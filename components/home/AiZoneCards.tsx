'use client';

import { useState } from 'react';
import { useT } from '@/components/IntlProvider';
import type { AiZoneItemPublic } from '@/lib/aiZoneContentService';

interface AiZoneCardsProps {
  items: AiZoneItemPublic[];
  /** rail：首頁的橫向捲動列；grid：/ai-zone 專頁的網格。 */
  layout?: 'rail' | 'grid';
}

/**
 * AI 專區的內容卡片（短片、課程單元…）。影片點了才載入（封面圖先頂著，不拖慢首頁），
 * 同一時間只播一支。
 */
export default function AiZoneCards({ items, layout = 'rail' }: AiZoneCardsProps) {
  const t = useT();
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <div className={layout === 'rail' ? 'aiz-rail' : 'aiz-grid'}>
      {items.map((item) => (
        <article key={item.id} className="aiz-card">
          <div
            className="aiz-card-media"
            style={item.posterUrl ? { backgroundImage: `url("${item.posterUrl}")` } : undefined}
          >
            {playingId === item.id ? (
              <video
                className="aiz-card-video"
                src={item.videoUrl}
                poster={item.posterUrl || undefined}
                controls
                autoPlay
                playsInline
                onEnded={() => setPlayingId(null)}
              />
            ) : (
              <button
                type="button"
                className="aiz-card-play"
                onClick={() => setPlayingId(item.id)}
                aria-label={`${t('aizone_play')}：${item.title}`}
              >
                <span className="aiz-card-play-icon" aria-hidden="true">▶</span>
              </button>
            )}
            <span className="aiz-card-badge">{t('aizone_ai_badge')}</span>
          </div>
          <div className="aiz-card-body">
            {item.label && <span className="aiz-card-day">{item.label}</span>}
            <h3 className="aiz-card-phrase">{item.title}</h3>
            {item.subtitle && <p className="aiz-card-translation">{item.subtitle}</p>}
            {layout === 'grid' && item.note && <p className="aiz-card-note">{item.note}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}
