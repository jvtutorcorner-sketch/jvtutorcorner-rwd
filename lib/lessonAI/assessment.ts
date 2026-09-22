// lib/lessonAI/assessment.ts
//
// AI Assessment core (Phase 4): generate quiz/homework questions and grade
// answers. Pure prompt-building + parsing + local MCQ scoring here (offline
// tested); runGenerate/runGradeShort route through the metered gateway
// (resolvePolicy('assessment_gen' | 'grading') → runModel). MCQ is graded locally
// (deterministic, no LLM); only short-answers are graded by the model.

import { randomUUID } from 'crypto';
import { resolvePolicy } from '@/lib/ai/gateway/router';
import { runModel, type RunContext, type RunResult } from '@/lib/ai/gateway/gateway';
import type { GenerateRequest } from '@/lib/ai/gateway/types';

export type QuestionType = 'mcq' | 'short';

export interface AssessmentQuestion {
  qid: string;
  type: QuestionType;
  prompt: string;
  options?: string[]; // mcq only
  answerIndex?: number; // mcq correct option — REDACTED for students
  rubric?: string; // short-answer grading guidance — REDACTED for students
  points: number;
}

/** Answers keyed by qid: mcq = selected option index; short = free text. */
export type AnswerMap = Record<string, string | number>;

export interface QuestionGrade {
  qid: string;
  score: number;
  max: number;
  feedback?: string;
  correct?: boolean; // mcq
}

export const MAX_QUESTIONS = 20;
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

// ── Generation ────────────────────────────────────────────────────────────────

export interface GeneratePromptInput {
  topic: string;
  count: number;
  difficulty?: string; // e.g. 簡單/中等/困難
  types?: QuestionType[];
  courseTitle?: string;
  segmentTopics?: string[];
}

export function buildGeneratePrompt(input: GeneratePromptInput): { systemInstruction: string; prompt: string } {
  const count = clampInt(input.count, 1, MAX_QUESTIONS, 5);
  const types = input.types && input.types.length ? input.types : (['mcq', 'short'] as QuestionType[]);
  const systemInstruction = `你是專業的教學出題老師。請根據指定主題出題,並「只」回傳合法 JSON,不要有任何額外文字或說明。
格式:{"questions":[{"type":"mcq"|"short","prompt":"題目","options":["A","B","C","D"],"answerIndex":0,"rubric":"評分要點","points":10}]}
規則:
1. mcq 必須有 options(3–5 個)與 answerIndex(正確選項的 0-based 索引);short 不要 options/answerIndex,但要 rubric(評分要點)。
2. 只出與主題相關、且符合難度的題目;不要出超綱或與主題無關的題目。
3. 全部使用繁體中文;每題 points 為正整數。`;
  const prompt = [
    input.courseTitle ? `課程:${input.courseTitle}` : '',
    `主題:${input.topic}`,
    input.segmentTopics && input.segmentTopics.length ? `本堂涵蓋:${input.segmentTopics.join('、')}` : '',
    `難度:${input.difficulty || '中等'}`,
    `題型:${types.join(' / ')}`,
    `題數:${count}`,
    '請出題並回傳上述 JSON。',
  ]
    .filter(Boolean)
    .join('\n');
  return { systemInstruction, prompt };
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
    // last resort: first {...} or [...] block
    const block = text.match(/[[{][\s\S]*[\]}]/)?.[0];
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

/**
 * Normalize an array of raw question objects into safe questions. Used both for a
 * model response and for teacher-edited questions on persist (preserveQid keeps a
 * client-supplied qid so a re-save is stable).
 */
export function normalizeQuestions(arr: unknown[], opts?: { preserveQid?: boolean }): AssessmentQuestion[] {
  const out: AssessmentQuestion[] = [];
  for (const q of (arr || []) as any[]) {
    if (!q || typeof q.prompt !== 'string' || !q.prompt.trim()) continue;
    const type: QuestionType = q.type === 'mcq' ? 'mcq' : 'short';
    const points = clampInt(q.points, 1, 100, 10);
    const qid = opts?.preserveQid && typeof q.qid === 'string' && q.qid ? q.qid : randomUUID();
    if (type === 'mcq') {
      const options = Array.isArray(q.options) ? q.options.filter((o: unknown) => typeof o === 'string').map(String) : [];
      if (options.length < 2) continue; // an MCQ with <2 options is unusable
      const answerIndex = clampInt(q.answerIndex, 0, options.length - 1, 0);
      out.push({ qid, type, prompt: q.prompt.trim(), options, answerIndex, points });
    } else {
      out.push({ qid, type, prompt: q.prompt.trim(), rubric: typeof q.rubric === 'string' ? q.rubric : undefined, points });
    }
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

/** Parse + normalize a model response into safe questions (or null). */
export function parseAssessment(text: string): AssessmentQuestion[] | null {
  const raw = parseJsonLoose(text);
  const arr = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.questions) ? (raw as any).questions : null;
  if (!arr) return null;
  const out = normalizeQuestions(arr);
  return out.length ? out : null;
}

/** Strip answers + rubric so a student never receives the key. */
export function redactForStudent(questions: AssessmentQuestion[]): AssessmentQuestion[] {
  return questions.map((q) => ({ qid: q.qid, type: q.type, prompt: q.prompt, options: q.options, points: q.points }));
}

// ── Grading ───────────────────────────────────────────────────────────────────

/** Grade MCQ questions locally (deterministic). Returns grades for MCQ only. */
export function gradeMcq(questions: AssessmentQuestion[], answers: AnswerMap): QuestionGrade[] {
  return questions
    .filter((q) => q.type === 'mcq')
    .map((q) => {
      const picked = answers[q.qid];
      const idx = typeof picked === 'number' ? picked : Number(picked);
      const correct = Number.isFinite(idx) && idx === q.answerIndex;
      return { qid: q.qid, score: correct ? q.points : 0, max: q.points, correct };
    });
}

export function buildGradingPrompt(
  shortQuestions: AssessmentQuestion[],
  answers: AnswerMap,
  courseTitle?: string
): { systemInstruction: string; prompt: string } {
  const systemInstruction = `你是嚴謹公正的閱卷老師。只依題目、評分要點與學生作答評分,不要臆測學生沒寫的內容。
只回傳合法 JSON:{"grades":[{"qid":"...","score":0,"feedback":"簡短回饋"}]}。score 為 0 到該題滿分之間的整數;feedback 用繁體中文、一到兩句、對事不對人。`;
  const items = shortQuestions.map((q) => ({
    qid: q.qid,
    prompt: q.prompt,
    rubric: q.rubric || '(無)',
    points: q.points,
    answer: typeof answers[q.qid] === 'string' ? (answers[q.qid] as string).slice(0, 2000) : '',
  }));
  const prompt = [
    courseTitle ? `課程:${courseTitle}` : '',
    '請批改以下簡答題,回傳上述 JSON:',
    JSON.stringify(items, null, 0),
  ]
    .filter(Boolean)
    .join('\n');
  return { systemInstruction, prompt };
}

/** Parse grading JSON, clamping each score to [0, points]. Missing → 0. */
export function parseGrade(text: string, shortQuestions: AssessmentQuestion[]): QuestionGrade[] {
  const raw = parseJsonLoose(text);
  const arr = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.grades) ? (raw as any).grades : [];
  const byQid = new Map<string, any>((arr as any[]).filter((g) => g && typeof g.qid === 'string').map((g) => [g.qid, g]));
  return shortQuestions.map((q) => {
    const g = byQid.get(q.qid);
    const score = g ? clampInt(g.score, 0, q.points, 0) : 0;
    return { qid: q.qid, score, max: q.points, feedback: g && typeof g.feedback === 'string' ? g.feedback : undefined };
  });
}

/** Combine per-question grades into a total. */
export function totalScore(grades: QuestionGrade[]): { score: number; max: number } {
  return grades.reduce((acc, g) => ({ score: acc.score + g.score, max: acc.max + g.max }), { score: 0, max: 0 });
}

// ── Gateway runners ─────────────────────────────────────────────────────────────

export interface RunGenerateInput extends GeneratePromptInput {
  ctx: RunContext; // feature:'assessment'
}
export async function runGenerate(input: RunGenerateInput): Promise<RunResult> {
  const { systemInstruction, prompt } = buildGeneratePrompt(input);
  const policy = resolvePolicy('assessment_gen');
  const req: GenerateRequest = { prompt, systemInstruction, jsonMode: true, maxTokens: policy.maxTokens, temperature: 0.6 };
  return runModel(policy, req, input.ctx);
}

export interface RunGradeShortInput {
  shortQuestions: AssessmentQuestion[];
  answers: AnswerMap;
  courseTitle?: string;
  ctx: RunContext; // feature:'assessment'
}
export async function runGradeShort(input: RunGradeShortInput): Promise<RunResult> {
  const { systemInstruction, prompt } = buildGradingPrompt(input.shortQuestions, input.answers, input.courseTitle);
  const policy = resolvePolicy('grading');
  const req: GenerateRequest = { prompt, systemInstruction, jsonMode: true, maxTokens: policy.maxTokens, temperature: 0 };
  return runModel(policy, req, input.ctx);
}
