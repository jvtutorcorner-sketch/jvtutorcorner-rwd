// lib/lessonAI/copilot.ts
//
// Teacher Copilot core (Phase 3b, non-gated slice): on-demand suggestions built
// from the lesson's markers + system events (NOT transcript — there is no L1 in
// this slice, so the model is told it cannot see what was said). Pure prompt
// building + a metered, task-routed runCopilot() via resolvePolicy('copilot').

import { resolvePolicy } from '@/lib/ai/gateway/router';
import { runModel, type RunContext, type RunResult } from '@/lib/ai/gateway/gateway';
import type { GenerateRequest } from '@/lib/ai/gateway/types';

const TYPE_LABEL: Record<string, string> = {
  important_concept: '重要概念',
  start_new_topic: '新主題',
  start_exercise: '開始練習',
  student_question: '學生提問',
  start_quiz: '開始測驗',
  end_segment: '結束本段',
  quiz_start: '測驗開始',
  quiz_complete: '測驗結束',
  screenshare_start: '開始螢幕分享',
  screenshare_stop: '結束螢幕分享',
  whiteboard_page_change: '白板換頁',
  whiteboard_clear: '清空白板',
  class_started: '上課開始',
  class_ended: '下課',
};

export interface CopilotEventLite {
  offsetSec: number;
  source: string;
  type: string;
  note?: string;
}
export interface CopilotSegmentLite {
  index: number;
  topic?: string;
  boundaryType?: string;
}

export interface CopilotPromptInput {
  events: CopilotEventLite[];
  segments?: CopilotSegmentLite[];
  courseTitle?: string;
  focus?: string; // optional teacher-typed nudge
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Build the (system, user) prompt for a Copilot suggestion. Pure + testable. */
export function buildCopilotPrompt(input: CopilotPromptInput): { systemInstruction: string; prompt: string } {
  const recent = input.events.slice(-15);
  const timeline = recent.length
    ? recent.map((e) => `[${mmss(e.offsetSec)}] ${TYPE_LABEL[e.type] || e.type}${e.note ? `:${e.note}` : ''}`).join('\n')
    : '(目前還沒有標記或事件)';
  const currentTopic = input.segments && input.segments.length ? input.segments[input.segments.length - 1].topic : undefined;

  const systemInstruction = `你是課堂上的教學 Copilot,協助老師即時教學。原則:
1. 只給「一個」具體、可立即執行的下一步建議 —— 檢核理解的提問、要預防的常見錯誤、或節奏提醒,三選一。
2. 你**看不到逐字稿**,只有老師的標記與系統事件;不要假裝知道學生具體說了什麼,也不要杜撰內容。
3. 只建議、不指揮;用繁體中文,一到三句話,直接給建議本身,不要客套或複述事件。
4. 不確定就給一個安全的通用建議(例如請學生用自己的話複述重點)。`;

  const prompt = [
    input.courseTitle ? `課程:${input.courseTitle}` : '',
    currentTopic ? `目前主題:${currentTopic}` : '',
    `最近的教學標記/事件:\n${timeline}`,
    input.focus ? `老師想聚焦:${input.focus}` : '',
    '請給老師一個下一步的教學建議。',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { systemInstruction, prompt };
}

export interface RunCopilotInput extends CopilotPromptInput {
  ctx: RunContext; // feature:'copilot' + ledger dims + resolveKey
}

/** Run one Copilot suggestion through the metered, task-routed gateway. */
export async function runCopilot(input: RunCopilotInput): Promise<RunResult> {
  const { systemInstruction, prompt } = buildCopilotPrompt(input);
  const policy = resolvePolicy('copilot');
  const req: GenerateRequest = {
    prompt,
    systemInstruction,
    maxTokens: policy.maxTokens,
    temperature: 0.5,
  };
  return runModel(policy, req, input.ctx);
}
