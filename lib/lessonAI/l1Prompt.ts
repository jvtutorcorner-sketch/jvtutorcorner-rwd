// lib/lessonAI/l1Prompt.ts
//
// The Level-1 (event detection) prompt + response parser. L1 sends one ~60s audio
// segment to a cheap audio-in model and gets back BOTH a transcript and detected
// teaching events in a single call (architecture plan §3). This module is the
// single source of that prompt/parse so the 0b go/no-go harness tests EXACTLY the
// call the future L1 Lambda will make. Pure — no I/O, offline-testable.

/** The AI semantic events L1 may emit (plan §3, level 3 signals). */
export const L1_EVENT_TYPES = [
  'topic_shift',
  'explanation',
  'exercise',
  'qa',
  'important_concept',
  'confusion',
  'common_mistake',
  'objective_done',
] as const;
export type L1EventType = (typeof L1_EVENT_TYPES)[number];

export interface L1Event {
  type: L1EventType;
  offsetSec: number; // seconds into THIS segment
  confidence: number; // 0..1
}

export interface L1Result {
  transcript: string;
  events: L1Event[];
}

export interface L1PromptOptions {
  /** Rolling context: prior-segment summary / current topic / lesson objective (≤~600 tok). */
  contextSummary?: string;
  segmentSeconds?: number;
}

export function buildL1Prompt(opts: L1PromptOptions = {}): string {
  const seg = opts.segmentSeconds ?? 60;
  const ctx = opts.contextSummary ? `\n目前脈絡(前段摘要/主題/目標):\n${opts.contextSummary}\n` : '';
  return `你是線上家教課堂的即時分析助理。以下是一段約 ${seg} 秒的教學音訊(繁體中文為主,可能夾雜英文專有名詞)。
${ctx}
請做兩件事,並「只」回傳合法 JSON,不要額外文字:
1. 逐字轉錄這段音訊(中英照原樣,不要翻譯、不要摘要)。
2. 偵測教學事件,每個事件標出在這段音訊中的相對秒數 offsetSec 與信心 confidence(0~1)。
   事件 type 僅能是:${L1_EVENT_TYPES.join(' / ')}。

JSON 格式:
{"transcript":"逐字稿","events":[{"type":"topic_shift","offsetSec":12,"confidence":0.8}]}

規則:只根據實際聽到的內容;沒有事件就給空陣列;不要杜撰。`;
}

function parseJsonLoose(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        /* fall through */
      }
    }
    const block = text.match(/\{[\s\S]*\}/)?.[0];
    if (block) {
      try {
        return JSON.parse(block);
      } catch {
        return null;
      }
    }
    return null;
  }
}

const isEventType = (v: unknown): v is L1EventType =>
  typeof v === 'string' && (L1_EVENT_TYPES as readonly string[]).includes(v);

/** Parse + normalize an L1 model response (or null if unusable). */
export function parseL1Response(text: string): L1Result | null {
  const raw = parseJsonLoose(text) as { transcript?: unknown; events?: unknown } | null;
  if (!raw || typeof raw !== 'object') return null;
  const transcript = typeof raw.transcript === 'string' ? raw.transcript : '';
  const events: L1Event[] = Array.isArray(raw.events)
    ? (raw.events as unknown[])
        .map((e) => e as { type?: unknown; offsetSec?: unknown; confidence?: unknown })
        .filter((e) => isEventType(e.type))
        .map((e) => ({
          type: e.type as L1EventType,
          offsetSec: typeof e.offsetSec === 'number' && Number.isFinite(e.offsetSec) ? Math.max(0, e.offsetSec) : 0,
          confidence:
            typeof e.confidence === 'number' && Number.isFinite(e.confidence)
              ? Math.min(1, Math.max(0, e.confidence))
              : 0.5,
        }))
    : [];
  // A response with neither transcript nor events is unusable.
  if (!transcript && events.length === 0) return null;
  return { transcript, events };
}
