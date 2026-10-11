'use client';

// /ai-zone/manage — 上傳與管理 AI 專區的內容（短片、課程單元…）。
// 已發布的內容出現在 /ai-zone；首頁區塊另由 /admin/settings 的開關控制。

import { useEffect, useRef, useState } from 'react';
import type { AiZoneItemPublic, AiZoneItem } from '@/lib/aiZoneContentService';

type AdminItem = AiZoneItem & AiZoneItemPublic;

interface FormState {
  order: string;
  label: string;
  title: string;
  subtitle: string;
  note: string;
  published: boolean;
}

const EMPTY_FORM: FormState = { order: '', label: '', title: '', subtitle: '', note: '', published: true };

/** 用影片第 1 秒的畫面當封面，順便量出片長。 */
async function capturePoster(file: File): Promise<{ poster: Blob | null; durationSec: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('無法讀取影片'));
    });
    const durationSec = Number.isFinite(video.duration) ? video.duration : null;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(1, (durationSec || 2) / 2);
    });
    const width = Math.min(video.videoWidth, 720);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * video.videoHeight) / video.videoWidth);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return { poster, durationSec };
  } catch {
    return { poster: null, durationSec: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 先試瀏覽器直傳；API 回 409（本機 / 沒有物件儲存）時改走伺服端上傳。回傳物件 key。 */
async function uploadMedia(blob: Blob, fileName: string): Promise<string> {
  const presign = await fetch('/api/ai-zone/items/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mimeType: blob.type, fileSize: blob.size }),
  });
  const presignData = await presign.json().catch(() => null);

  if (presign.ok && presignData?.url && presignData?.key) {
    const put = await fetch(presignData.url, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
    if (!put.ok) throw new Error(`上傳失敗（${put.status}）`);
    return presignData.key;
  }
  if (presign.status !== 409) throw new Error(presignData?.error || `上傳失敗（${presign.status}）`);

  const formData = new FormData();
  formData.append('file', blob, fileName);
  const res = await fetch('/api/ai-zone/items/upload', { method: 'POST', body: formData });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.key) throw new Error(data?.error || `上傳失敗（${res.status}）`);
  return data.key;
}

export default function AdminAiZoneCardsPage() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch('/api/ai-zone/items?all=1');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
      setItems(data.items);
    } catch (err) {
      setMessage({ ok: false, text: `載入失敗：${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setVideoFile(null);
    setPosterFile(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (posterInputRef.current) posterInputRef.current.value = '';
  }

  function startEdit(item: AdminItem) {
    resetForm();
    setEditingId(item.id);
    setForm({
      order: String(item.order),
      label: item.label || '',
      title: item.title,
      subtitle: item.subtitle || '',
      note: item.note,
      published: item.published,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId && !videoFile) {
      setMessage({ ok: false, text: '請選擇影片檔' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        order: Number(form.order),
        label: form.label,
        title: form.title,
        subtitle: form.subtitle,
        note: form.note,
        published: form.published,
      };
      if (videoFile) {
        const { poster, durationSec } = await capturePoster(videoFile);
        payload.videoKey = await uploadMedia(videoFile, videoFile.name);
        if (durationSec) payload.durationSec = durationSec;
        const posterBlob = posterFile || poster;
        if (posterBlob) payload.posterKey = await uploadMedia(posterBlob, 'poster.jpg');
      } else if (posterFile) {
        payload.posterKey = await uploadMedia(posterFile, posterFile.name);
      }

      const res = await fetch('/api/ai-zone/items', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);

      setMessage({ ok: true, text: editingId ? '已更新' : '已新增' });
      resetForm();
      await load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(item: AdminItem) {
    setBusy(true);
    try {
      const res = await fetch('/api/ai-zone/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, published: !item.published }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);
      await load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: AdminItem) {
    if (!window.confirm(`確定刪除「${item.title}」？影片檔也會一併刪除。`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ai-zone/items?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);
      if (editingId === item.id) resetForm();
      await load();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
  // 全站 button 規則已固定底色與文字色，這裡只管尺寸。
  const actionClass = 'rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-50';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">AI 專區內容管理</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        已發布的內容會出現在 <a className="text-purple-700 underline" href="/ai-zone">/ai-zone</a>
        ；首頁區塊要另外到 <a className="text-purple-700 underline" href="/admin/settings">系統設定</a> 開啟。
        影片請用 9:16 直式 mp4（建議 720×1280、30MB 以內）。
      </p>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-5 mb-8 grid gap-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-lg font-semibold text-gray-900">
          {editingId ? '編輯影片' : '新增影片'}
        </h2>
        <label className="text-sm text-gray-700">
          影片（mp4）{editingId && <span className="text-gray-400">－不換就留空</span>}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="text-sm text-gray-700">
          封面圖 <span className="text-gray-400">－留空會自動擷取影片畫面</span>
          <input
            ref={posterInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setPosterFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="text-sm text-gray-700">
          排序（數字大的排前面）
          <input
            type="number"
            min={1}
            max={9999}
            required
            className={`${inputClass} mt-1`}
            value={form.order}
            onChange={(e) => setForm({ ...form, order: e.target.value })}
          />
        </label>
        <label className="text-sm text-gray-700">
          標籤（例如「單元 2」）
          <input
            type="text"
            maxLength={24}
            className={`${inputClass} mt-1`}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </label>
        <label className="text-sm text-gray-700">
          標題
          <input
            type="text"
            required
            maxLength={120}
            className={`${inputClass} mt-1`}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="text-sm text-gray-700">
          副標題
          <input
            type="text"
            maxLength={200}
            className={`${inputClass} mt-1`}
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
          />
        </label>
        <label className="text-sm text-gray-700">
          說明
          <input
            type="text"
            maxLength={300}
            className={`${inputClass} mt-1`}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            發布
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '處理中…' : editingId ? '儲存變更' : '上傳並新增'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} disabled={busy} className={actionClass}>
              取消編輯
            </button>
          )}
          {message && (
            <span role="status" className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">載入中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">還沒有影片。</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-4 rounded-lg border border-gray-200 bg-white p-3">
              <video
                className="w-24 shrink-0 rounded-md bg-black"
                style={{ aspectRatio: '9 / 16' }}
                src={item.videoUrl}
                poster={item.posterUrl || undefined}
                preload="none"
                controls
                playsInline
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-purple-700">{item.label || `#${item.order}`}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      item.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {item.published ? '已發布' : '未發布'}
                  </span>
                  {item.durationSec && <span className="text-gray-400">{item.durationSec} 秒</span>}
                </div>
                <p className="mt-1 font-semibold text-gray-900 break-words">{item.title}</p>
                <p className="text-sm text-gray-600 break-words">{item.subtitle}</p>
                {item.note && <p className="mt-1 text-xs text-gray-500 break-words">{item.note}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <button type="button" disabled={busy} onClick={() => startEdit(item)} className={actionClass}>
                    編輯
                  </button>
                  <button type="button" disabled={busy} onClick={() => togglePublished(item)} className={actionClass}>
                    {item.published ? '取消發布' : '發布'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => handleDelete(item)} className={actionClass}>
                    刪除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
