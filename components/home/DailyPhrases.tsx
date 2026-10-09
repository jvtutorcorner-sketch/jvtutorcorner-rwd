'use client';

import { useState } from 'react';
import { useT } from '@/components/IntlProvider';
import type { DailyPhrasePublic } from '@/lib/dailyPhraseService';

interface DailyPhrasesProps {
  items: DailyPhrasePublic[];
  /** rail：首頁的橫向捲動列；grid：/daily 專頁的網格。 */
  layout?: 'rail' | 'grid';
}

/**
 * 「AI 每日一句」短片卡片。影片點了才載入（封面圖先頂著，不拖慢首頁），
 * 同一時間只播一支。
 */
export default function DailyPhrases({ items, layout = 'rail' }: DailyPhrasesProps) {
  const t = useT();
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <div className={layout === 'rail' ? 'daily-rail' : 'daily-grid'}>
      {items.map((item) => {
        const dayLabel = t('daily_day_label').replace('{day}', String(item.day));
        return (
          <article key={item.id} className="daily-card">
            <div
              className="daily-card-media"
              style={item.posterUrl ? { backgroundImage: `url("${item.posterUrl}")` } : undefined}
            >
              {playingId === item.id ? (
                <video
                  className="daily-card-video"
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
                  className="daily-card-play"
                  onClick={() => setPlayingId(item.id)}
                  aria-label={`${t('daily_play')}：${dayLabel} ${item.phrase}`}
                >
                  <span className="daily-card-play-icon" aria-hidden="true">▶</span>
                </button>
              )}
              <span className="daily-card-badge">{t('daily_ai_badge')}</span>
            </div>
            <div className="daily-card-body">
              <span className="daily-card-day">{dayLabel}</span>
              <h3 className="daily-card-phrase" lang="en">{item.phrase}</h3>
              {item.translation && <p className="daily-card-translation">{item.translation}</p>}
              {layout === 'grid' && item.note && <p className="daily-card-note">{item.note}</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
