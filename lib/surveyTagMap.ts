/**
 * Survey Tag Map
 * Maps each survey question / option key → backend seed tags + initial weight
 * Reference: 新手引導問卷設計文件 > 後端標籤對照表
 */

export interface TagSeed {
  tag: string;
  weight: number; // initial weight to inject as equivalent interaction
}

export type SurveyAnswer = {
  q1?: string; // A | B | C | D
  q2?: string; // A | B | C | D
  q3?: string[]; // multi-select: A | B | C | D (max 2)
  q4?: string; // A | B | C | D
};

// Q1 – 困境 / 目標
const Q1_MAP: Record<string, TagSeed[]> = {
  A: [
    { tag: 'english', weight: 3.0 },
    { tag: 'speaking', weight: 2.5 },
    { tag: 'conversation', weight: 2.0 },
  ],
  B: [
    { tag: 'career', weight: 3.0 },
    { tag: 'upskill', weight: 2.5 },
    { tag: 'certification', weight: 1.5 },
  ],
  C: [
    { tag: 'exam', weight: 3.0 },
    { tag: 'certification', weight: 3.0 },
    { tag: 'english', weight: 1.5 },
  ],
  D: [
    { tag: 'explore', weight: 2.0 },
    { tag: 'hobby', weight: 2.0 },
  ],
};

// Q2 – 學習時間 (influences format matching only, lower weight)
const Q2_MAP: Record<string, TagSeed[]> = {
  A: [
    { tag: 'format:short', weight: 1.5 },
    { tag: 'format:async', weight: 1.0 },
  ],
  B: [
    { tag: 'format:structured', weight: 1.5 },
    { tag: 'format:regular', weight: 1.0 },
  ],
  C: [
    { tag: 'format:bootcamp', weight: 1.5 },
    { tag: 'format:intensive', weight: 1.0 },
  ],
  D: [
    { tag: 'format:async', weight: 1.5 },
    { tag: 'format:self-paced', weight: 1.0 },
  ],
};

// Q3 – 上課體驗 (探索探針 C/D 有額外旗標)
const Q3_MAP: Record<string, TagSeed[]> = {
  A: [
    { tag: 'format:1on1', weight: 2.0 },
    { tag: 'style:personalized', weight: 1.5 },
  ],
  B: [
    { tag: 'format:structured', weight: 2.0 },
    { tag: 'style:roadmap', weight: 1.5 },
  ],
  C: [
    { tag: 'feature:ai-practice', weight: 2.5 },
    { tag: 'newfeature', weight: 2.0 },
  ],
  D: [
    { tag: 'feature:live-group', weight: 2.5 },
    { tag: 'newfeature', weight: 2.0 },
  ],
};

// Q4 – 程度
const Q4_MAP: Record<string, TagSeed[]> = {
  A: [{ tag: 'level:beginner', weight: 2.0 }],
  B: [{ tag: 'level:elementary', weight: 2.0 }],
  C: [{ tag: 'level:intermediate', weight: 2.0 }],
  D: [{ tag: 'level:advanced', weight: 2.0 }],
};

/** Flatten a SurveyAnswer into a list of TagSeeds */
export function surveyAnswersToSeeds(answers: SurveyAnswer): TagSeed[] {
  const seeds: TagSeed[] = [];

  if (answers.q1 && Q1_MAP[answers.q1]) seeds.push(...Q1_MAP[answers.q1]);
  if (answers.q2 && Q2_MAP[answers.q2]) seeds.push(...Q2_MAP[answers.q2]);
  if (answers.q3) {
    for (const opt of answers.q3) {
      if (Q3_MAP[opt]) seeds.push(...Q3_MAP[opt]);
    }
  }
  if (answers.q4 && Q4_MAP[answers.q4]) seeds.push(...Q4_MAP[answers.q4]);

  return seeds;
}

/**
 * Whether the user has high affinity for new features
 * (used to personalise Slot-4 in the recommendation results)
 */
export function hasNewFeatureAffinity(answers: SurveyAnswer): boolean {
  return !!(answers.q3?.includes('C') || answers.q3?.includes('D'));
}

/** Map course subject/category to normalised seed tags so the engine can match them */
export const SUBJECT_TO_TAGS: Record<string, string[]> = {
  英文: ['english', 'speaking', 'conversation', '英檢中級', '商用英文', 'exam', 'certification'],
  數學: ['math', 'exam', 'certification', '會考'],
  日文: ['japanese', 'travel', '旅遊', '日常會話'],
  程式: ['coding', 'career', 'upskill'],
  設計: ['design', 'career', 'upskill'],
  音樂: ['music', 'hobby', 'explore'],
  繪畫: ['art', 'hobby', 'explore'],
};
