// lib/lessonAI/tutor.ts
//
// Student Tutor core (Phase 3a): a hint ladder (1→4) that guides rather than
// answers. Pure prompt-building + level enforcement here (offline-tested);
// runTutor() wraps it with the task-routed, metered gateway (resolvePolicy('tutor')
// → runModel). No streaming (Amplify SSR has no reliable SSE) — one JSON reply
// inside the tutor task's 14s deadline.

import { resolvePolicy } from '@/lib/ai/gateway/router';
import { runModel, type RunContext, type RunResult } from '@/lib/ai/gateway/gateway';
import type { GenerateRequest } from '@/lib/ai/gateway/types';

export const MAX_HINT_LEVEL = 4;

/**
 * The next hint level. A first ask (prev < 1) starts at 1; every later ask
 * advances exactly one step, capped at 4 — a student can never jump straight to
 * the full walk-through. (3b hardens this with a per-thread server counter; here
 * the previous level is client-supplied but can only ever advance by one.)
 */
export function nextHintLevel(prev: number | undefined): number {
  const p = typeof prev === 'number' && Number.isFinite(prev) ? Math.floor(prev) : 0;
  if (p < 1) return 1;
  return Math.min(MAX_HINT_LEVEL, p + 1);
}

const LADDER: Record<number, string> = {
  1: '只給一個引導性問題或指出思考方向,幫學生自己想第一步,不要透露做法。',
  2: '點出這題該用到的觀念或該踏出的第一步,但不要代為計算。',
  3: '拆解解題步驟、或示範一個類似的小例子讓學生模仿套用;仍然不要算出這一題的最終答案。',
  4: '完整說明解題思路與每一步的理由;即使講到最後,也要把最後一步的計算與驗算留給學生自己完成,不要直接寫出最終答案讓學生照抄。',
};

export interface TutorPromptInput {
  question: string;
  hintLevel: number;
  courseTitle?: string;
  segmentTopic?: string;
}

/** Build the (system, user) prompt for a hint level. Pure + testable. */
export function buildTutorPrompt(input: TutorPromptInput): { systemInstruction: string; prompt: string } {
  const level = Math.min(MAX_HINT_LEVEL, Math.max(1, Math.floor(input.hintLevel) || 1));
  const context = [
    input.courseTitle ? `課程:${input.courseTitle}` : '',
    input.segmentTopic ? `目前主題:${input.segmentTopic}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const systemInstruction = `你是一位嚴謹又有耐心的家教助教。請遵守以下原則:
1. 循序漸進:目前是第 ${level} 級提示(共 ${MAX_HINT_LEVEL} 級),不要一次給到底。
2. 任何層級都「不要直接給出最終答案、也不要寫出可照抄的完整解答」,而是引導學生自己得到答案。
3. 一律使用繁體中文,語氣鼓勵、內容精簡,只聚焦這一題。
4. 不要杜撰課程以外的事實;不確定就說不確定,並建議學生問老師。
本級策略:${LADDER[level]}`;

  const prompt = `${context ? context + '\n\n' : ''}學生的問題:\n${input.question}`;
  return { systemInstruction, prompt };
}

export interface RunTutorInput extends TutorPromptInput {
  ctx: RunContext; // feature:'tutor' + ledger dims + resolveKey
}

/** Run one hint through the metered, task-routed gateway. */
export async function runTutor(input: RunTutorInput): Promise<RunResult> {
  const { systemInstruction, prompt } = buildTutorPrompt(input);
  const policy = resolvePolicy('tutor');
  const req: GenerateRequest = {
    prompt,
    systemInstruction,
    maxTokens: policy.maxTokens,
    temperature: 0.4,
  };
  return runModel(policy, req, input.ctx);
}
