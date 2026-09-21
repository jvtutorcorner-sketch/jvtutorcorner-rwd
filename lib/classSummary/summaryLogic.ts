// Pure logic for the AI class-summary pipeline: id derivation, the status state machine,
// consent gating, transcript merging and the summary prompt. No DB / network / LLM here,
// so it is verified offline by scripts/verify-class-summary.mjs.

import type { ConsentRecord, SummaryStatus, TranscriptSegment, SummaryJson } from './types';

export const MAX_SUMMARY_ATTEMPTS = 3;
/** Bump when the recording-consent wording materially changes. */
export const CONSENT_VERSION = '2026-09-19';

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/**
 * One summary per (course, order, class start minute). Using the scheduled start minute
 * (not "now") keeps the id stable whether the teacher ends early or late, and idempotent
 * across the multiple "class ended" server paths.
 */
export function buildSummaryId(courseId: string, orderId: string, startMs: number): string {
  const d = new Date(startMs);
  const bucket = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}`;
  return `${courseId}#${orderId}#${bucket}`;
}

/**
 * Recording may only start when BOTH the teacher and the student have explicitly agreed
 * (and no one has declined). Assistants/observers don't gate. A missing side = no consent.
 */
export function canRecord(consents: ConsentRecord[]): boolean {
  const byRole = (role: string) => consents.filter((c) => c.role === role);
  const agreed = (role: string) => byRole(role).length > 0 && byRole(role).every((c) => c.agreed);
  const declined = consents.some((c) => (c.role === 'teacher' || c.role === 'student') && !c.agreed);
  if (declined) return false;
  return agreed('teacher') && agreed('student');
}

export type SummaryEvent =
  | { type: 'class_ended' } // RECORDING → PENDING
  | { type: 'claim' } // PENDING → PROCESSING
  | { type: 'succeed' } // PROCESSING → READY
  | { type: 'fail'; attempts: number } // PROCESSING → PENDING (retry) or FAILED
  | { type: 'consent_declined' }; // * → SKIPPED

/**
 * The summary status state machine. Returns the next status, or null for an invalid
 * transition (so callers can no-op idempotently rather than corrupt state).
 */
export function nextSummaryStatus(current: SummaryStatus, event: SummaryEvent): SummaryStatus | null {
  if (event.type === 'consent_declined') {
    return current === 'READY' ? null : 'SKIPPED';
  }
  switch (current) {
    case 'RECORDING':
      return event.type === 'class_ended' ? 'PENDING' : null;
    case 'PENDING':
      return event.type === 'claim' ? 'PROCESSING' : null;
    case 'PROCESSING':
      if (event.type === 'succeed') return 'READY';
      if (event.type === 'fail') return event.attempts >= MAX_SUMMARY_ATTEMPTS ? 'FAILED' : 'PENDING';
      return null;
    default:
      return null; // READY / FAILED / SKIPPED are terminal (except the decline guard above)
  }
}

/**
 * Interleave the independently-recorded per-mic transcripts into one ordered dialogue.
 * Each side is recorded separately (natural speaker separation), so we just sort by
 * startMs and label by role. Segments with empty text are dropped.
 */
export function mergeTranscript(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments
    .filter((s) => s && typeof s.text === 'string' && s.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
}

const ROLE_LABEL: Record<string, string> = { teacher: '老師', student: '學生', assistant: '助教', observer: '旁聽' };

/** Render the merged transcript as labelled dialogue text for the LLM. */
export function transcriptToText(segments: TranscriptSegment[]): string {
  return mergeTranscript(segments)
    .map((s) => `${ROLE_LABEL[s.role] ?? s.role}：${s.text.trim()}`)
    .join('\n');
}

export const SUMMARY_MIN_TRANSCRIPT_CHARS = 120;

/**
 * Build the summary prompt. The wording mirrors LEARNING_CONTENT_ANALYSIS_PROMPT's
 * anti-hallucination stance: when the transcript is too thin, the model must set
 * "insufficient": true rather than invent a lesson.
 */
export function buildSummaryPrompt(transcriptText: string, opts?: { subject?: string }): string {
  const subjectLine = opts?.subject ? `本堂課科目：${opts.subject}。\n` : '';
  return `你是線上家教平台的課後總結助理。以下是一堂 1 對 1 課程的逐字稿（可能還附上白板/教材圖片）。
${subjectLine}請「只根據實際內容」整理課後總結，不要臆測或補充逐字稿與教材沒有出現的東西。

請回傳合法 JSON，格式如下：
{
  "summary": "用繁體中文，3-6 句話說明這堂課教了什麼",
  "keyConcepts": ["這堂課出現的重點概念"],
  "teacherHighlights": ["老師講解的重點或方法"],
  "studentDifficulties": ["學生卡住或需要加強的地方；沒有就空陣列"],
  "homework": ["老師交代的作業或練習；沒有就空陣列"],
  "nextLessonSuggestions": ["下一堂可以接續的建議"],
  "vocabulary": [{ "term": "詞彙", "meaning": "課堂中出現的解釋" }],
  "confidence": "high|medium|low",
  "insufficient": false
}

規則：
1. 逐字稿過短、雜訊過多或無法判斷教學內容時，把 "insufficient" 設為 true、其餘欄位給空字串/空陣列，不要硬湊。
2. 只整理逐字稿與教材中確實出現的內容；不要加入外部知識或評價學生個人。
3. 不要輸出姓名、聯絡方式等個資，一律以「老師」「學生」代稱。

逐字稿：
"""
${transcriptText.slice(0, 20000)}
"""`;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x)) : [];

/** Parse + normalize an LLM summary response into a safe SummaryJson (or null). */
export function parseSummaryJson(text: string): SummaryJson | null {
  const raw = parseJson(text) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return null;
  const confidence = raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low' ? raw.confidence : 'low';
  const vocabulary = Array.isArray(raw.vocabulary)
    ? raw.vocabulary
        .filter((v: any) => v && typeof v.term === 'string')
        .map((v: any) => ({ term: String(v.term), meaning: typeof v.meaning === 'string' ? v.meaning : '' }))
    : [];
  return {
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    keyConcepts: asStringArray(raw.keyConcepts),
    teacherHighlights: asStringArray(raw.teacherHighlights),
    studentDifficulties: asStringArray(raw.studentDifficulties),
    homework: asStringArray(raw.homework),
    nextLessonSuggestions: asStringArray(raw.nextLessonSuggestions),
    vocabulary,
    confidence,
    insufficient: raw.insufficient === true,
  };
}
