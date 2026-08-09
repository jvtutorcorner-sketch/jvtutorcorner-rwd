'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

type LearningAnalysis = {
  contentType?: string;
  title?: string;
  summary?: string;
  extractedText?: string;
  keyConcepts?: string[];
  difficulty?: string;
  confidence?: string;
  suggestedQuestions?: Array<{ question?: string; answerHint?: string }>;
};

const contentTypeLabels: Record<string, string> = {
  textbook: '教材頁面',
  worksheet: '練習題／學習單',
  diagram: '圖表／示意圖',
  slide: '課程投影片',
  handwritten_note: '手寫筆記',
  other: '其他教學內容',
  unknown: '待確認',
};

const difficultyLabels: Record<string, string> = {
  beginner: '入門',
  intermediate: '中階',
  advanced: '進階',
  unknown: '待確認',
};

export default function LearningContentPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [courseId, setCourseId] = useState('');
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
      setError('目前支援 JPG、PNG、WEBP 教材圖片。');
      return;
    }
    if (nextFile.size > 7 * 1024 * 1024) {
      setError('圖片大小不可超過 7 MB。');
      return;
    }
    setError(null);
    setAnalysis(null);
    setFile(nextFile);
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(nextFile);
  }

  async function analyze() {
    if (!file || !preview) {
      setError('請先選擇教材圖片。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/learning-content-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: preview, mimeType: file.type, courseId: courseId.trim() || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '教材分析失敗');
      setAnalysis(body.analysis || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '教材分析失敗，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold text-emerald-600">學習工具</p>
            <h1 className="text-3xl font-bold tracking-tight">教材影像分析與學習回饋</h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              上傳教材、題目、圖表或課堂筆記，整理學習重點並產生理解檢核問題。分析結果僅作為學習輔助，不取代老師的教學判斷。
            </p>
          </div>
          <Link className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50" href="/learning-content/questionnaire">
            填寫學習需求問卷
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">上傳教材內容</h2>
            <p className="mt-2 text-sm text-slate-500">支援 JPG、PNG、WEBP，單張圖片最多 7 MB。</p>

            <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="course-id">
              課程 ID（選填）
            </label>
            <input
              id="course-id"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              placeholder="填寫後會檢查課程存取權限"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />

            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-8 text-center font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              {file ? `更換教材圖片：${file.name}` : '選擇教材圖片'}
            </button>

            {preview && (
              <img src={preview} alt="教材預覽" className="mt-5 max-h-80 w-full rounded-xl border border-slate-200 object-contain" />
            )}

            <button
              type="button"
              onClick={analyze}
              disabled={!file || loading}
              className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? '分析教材中…' : '開始分析教材'}
            </button>

            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">學習分析結果</h2>
            {!analysis && <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">完成上傳並分析後，這裡會顯示教材摘要、關鍵概念與理解檢核問題。</p>}
            {analysis && (
              <div className="mt-4 space-y-5">
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{contentTypeLabels[analysis.contentType || 'unknown'] || '教學內容'}</span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">難度：{difficultyLabels[analysis.difficulty || 'unknown'] || analysis.difficulty}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">信心：{analysis.confidence || 'unknown'}</span>
                </div>
                <div>
                  <h3 className="font-semibold">{analysis.title || '未辨識標題'}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{analysis.summary || '目前沒有足夠內容產生摘要。'}</p>
                </div>
                {analysis.keyConcepts?.length ? (
                  <div>
                    <h3 className="font-semibold">關鍵概念</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{analysis.keyConcepts.map((concept) => <li key={concept}>{concept}</li>)}</ul>
                  </div>
                ) : null}
                {analysis.suggestedQuestions?.length ? (
                  <div>
                    <h3 className="font-semibold">理解檢核</h3>
                    <div className="mt-2 space-y-2">{analysis.suggestedQuestions.map((item, index) => (
                      <div key={`${item.question}-${index}`} className="rounded-lg bg-amber-50 p-3 text-sm text-slate-700">
                        <p className="font-medium">{index + 1}. {item.question}</p>
                        {item.answerHint && <p className="mt-1 text-xs text-slate-500">提示：{item.answerHint}</p>}
                      </div>
                    ))}</div>
                  </div>
                ) : null}
                {analysis.extractedText && (
                  <details className="rounded-lg border border-slate-200 p-3">
                    <summary className="cursor-pointer text-sm font-semibold">查看辨識文字</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{analysis.extractedText}</p>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
