// app/ai-avatar/page.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/IntlProvider';
import { MAX_SCRIPT_LENGTH } from '@/lib/replicate/aiAvatarConstants';

const POLL_INTERVAL_MS = 3000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type Stage = 'idle' | 'tts_processing' | 'lipsync_processing' | 'done' | 'error';

export default function AiAvatarPage() {
  const t = useT();

  const features = [
    { title: t('ai_avatar_feature1_title'), desc: t('ai_avatar_feature1_desc') },
    { title: t('ai_avatar_feature2_title'), desc: t('ai_avatar_feature2_desc') },
    { title: t('ai_avatar_feature3_title'), desc: t('ai_avatar_feature3_desc') },
  ];

  const [isAdmin, setIsAdmin] = useState(false);
  const [script, setScript] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setIsAdmin(data?.user?.role === 'admin'))
      .catch(() => setIsAdmin(false));
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setErrorMsg(t('ai_avatar_photo_too_large'));
      return;
    }
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const pollAdvance = async (ttsId: string, lipsyncId: string | null, photo: string) => {
    if (cancelledRef.current) return;
    try {
      const res = await fetch('/api/ai-avatar/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lipsyncId ? { ttsId, lipsyncId } : { ttsId, photoDataUrl: photo }),
      });
      const data = await res.json();

      if (!res.ok || data.stage === 'error') {
        setStage('error');
        setErrorMsg(data.error || 'unknown error');
        return;
      }
      if (data.stage === 'tts_processing') {
        setStage('tts_processing');
        setTimeout(() => pollAdvance(ttsId, null, photo), POLL_INTERVAL_MS);
        return;
      }
      if (data.stage === 'lipsync_started') {
        setStage('lipsync_processing');
        setTimeout(() => pollAdvance(ttsId, data.lipsyncId, photo), POLL_INTERVAL_MS);
        return;
      }
      if (data.stage === 'lipsync_processing') {
        setStage('lipsync_processing');
        setTimeout(() => pollAdvance(ttsId, lipsyncId, photo), POLL_INTERVAL_MS);
        return;
      }
      if (data.stage === 'done') {
        setStage('done');
        setVideoUrl(data.videoUrl);
      }
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'unknown error');
    }
  };

  const handleGenerate = async () => {
    if (!script.trim() || !photoDataUrl) {
      setErrorMsg(t('ai_avatar_need_script_and_photo'));
      return;
    }
    setErrorMsg(null);
    setVideoUrl(null);
    setStage('tts_processing');
    try {
      const res = await fetch('/api/ai-avatar/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: script.trim(), photoDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStage('error');
        setErrorMsg(data.error || 'unknown error');
        return;
      }
      setTimeout(() => pollAdvance(data.ttsId, null, photoDataUrl), POLL_INTERVAL_MS);
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'unknown error');
    }
  };

  const isGenerating = stage === 'tts_processing' || stage === 'lipsync_processing';
  const stageMessage =
    stage === 'tts_processing' ? t('ai_avatar_stage_tts')
    : stage === 'lipsync_processing' ? t('ai_avatar_stage_lipsync')
    : stage === 'done' ? t('ai_avatar_stage_done')
    : null;

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <span className="inline-block bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          {t('ai_avatar_badge')}
        </span>
        <h1 className="text-4xl font-bold mb-4">{t('ai_avatar_title')}</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">{t('ai_avatar_subtitle')}</p>
      </div>

      <div className="max-w-3xl mx-auto mb-14">
        {videoUrl ? (
          <div className="w-full">
            <video className="w-full aspect-video rounded-2xl bg-black" src={videoUrl} controls />
            <p className="text-center text-gray-500 text-xs mt-2">
              {t('ai_avatar_download_note')}{' '}
              <a href={videoUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                {t('ai_avatar_download_link')}
              </a>
            </p>
          </div>
        ) : (
          <div className="relative w-full aspect-video rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-center px-6">
            <svg className="w-12 h-12 text-gray-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.72a.75.75 0 011.13.65v8.14a.75.75 0 01-1.13.65l-4.72-2.72M4.5 6h9a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 16.5v-9A1.5 1.5 0 014.5 6z" />
            </svg>
            <p className="font-semibold text-gray-700">
              {stageMessage || t('ai_avatar_video_placeholder_title')}
            </p>
            {!stageMessage && (
              <p className="text-gray-500 text-sm mt-1">{t('ai_avatar_video_placeholder_desc')}</p>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="max-w-3xl mx-auto mb-14 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-bold text-lg mb-4">{t('ai_avatar_admin_panel_title')}</h2>

          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ai_avatar_script_label')}</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-3 text-sm mb-1"
            rows={4}
            maxLength={MAX_SCRIPT_LENGTH}
            placeholder={t('ai_avatar_script_placeholder')}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={isGenerating}
          />
          <p className="text-right text-xs text-gray-400 mb-4">{script.length}/{MAX_SCRIPT_LENGTH}</p>

          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ai_avatar_photo_label')}</label>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            disabled={isGenerating}
            className="block w-full text-sm text-gray-600 mb-4"
          />
          {photoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoDataUrl} alt="" className="w-20 h-20 object-cover rounded-lg mb-4 border border-gray-200" />
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold px-6 py-2.5 rounded-full transition-colors"
          >
            {isGenerating ? t('ai_avatar_generating_button') : t('ai_avatar_generate_button')}
          </button>

          {errorMsg && (
            <p className="text-red-600 text-sm mt-4">{t('ai_avatar_error_prefix')}{errorMsg}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {features.map((item, i) => (
          <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg mb-2">{item.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-gray-400 text-xs mt-12">{t('ai_avatar_status_note')}</p>
    </div>
  );
}
