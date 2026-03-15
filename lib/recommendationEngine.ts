/**
 * Recommendation Engine
 * Implements: Log Smoothing + Time Decay + MMR + Business Rules
 * Reference: 混合式權重調整演算法設計文件
 */

export interface UserInteraction {
  tag: string;
  weight: number;          // stored weight (for survey seeds); 1.0 for click events
  createdAt: string;       // ISO timestamp
  source?: 'onboarding_survey' | 'click' | 'enroll' | 'view';
  expiresAt?: string;      // ISO timestamp – survey seeds expire after 30 days
}

export interface CourseCandidate {
  id: string;
  title: string;
  category: string;        // e.g. 英文, 數學, 日文
  teacherId?: string;
  teacherName?: string;
  tags: string[];          // normalised tags including subject-derived tags
  createdAt?: string;
  [key: string]: unknown;
}

export interface PinnedItems {
  slot4?: CourseCandidate | null;   // new-feature forced slot
  slot10?: CourseCandidate | null;  // editorial pick slot
}

export interface RecommendationConfig {
  lambda?: number;          // time-decay coefficient (default 0.1 → half-life ≈ 7d)
  decayCutoff?: number;     // ignore interactions older than N days (default 90)
  mmrAlpha?: number;        // trade-off: 1=pure relevance, 0=pure diversity (default 0.7)
  newBoostDays?: number;    // new-item boost window in days (default 14)
  maxPerCategory?: number;  // frequency cap per category (default 3)
  maxPerTeacher?: number;   // frequency cap per teacher (default 2)
}

export interface RecommendationResult {
  courses: CourseCandidate[];
  mmrAlphaUsed: number;
  isNewUser: boolean;
  tagScores: Record<string, number>;
}

const DEFAULTS = {
  lambda: 0.1,
  decayCutoff: 90,
  mmrAlpha: 0.7,
  newBoostDays: 14,
  maxPerCategory: 3,
  maxPerTeacher: 2,
} satisfies Required<RecommendationConfig>;

// ─── Step 2: TagScore (Log Smoothing + Time Decay) ────────────────────────────

function computeTagScores(
  interactions: UserInteraction[],
  lambda: number,
  cutoff: number
): Record<string, number> {
  const now = Date.now();
  const bucket: Record<string, number> = {};

  for (const interaction of interactions) {
    const tag = interaction.tag;
    if (!tag) continue;
    if (interaction.expiresAt && new Date(interaction.expiresAt).getTime() < now) continue;

    const deltaDays = (now - new Date(interaction.createdAt).getTime()) / 86_400_000;
    if (deltaDays > cutoff) continue;

    const timeDecay = Math.exp(-lambda * deltaDays);
    // Survey seeds already encode initial weight; real clicks have weight 1.0
    const w = (interaction.weight ?? 1.0) * timeDecay;
    bucket[tag] = (bucket[tag] ?? 0) + w;
  }

  // Log smoothing: prevents single tag from dominating
  const scores: Record<string, number> = {};
  for (const [tag, sum] of Object.entries(bucket)) {
    scores[tag] = Math.log(1 + sum);
  }
  return scores;
}

// ─── Step 3: New-item boost ────────────────────────────────────────────────────

function newBoostFactor(createdAt: string | undefined, boostDays: number): number {
  if (!createdAt) return 1.0;
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (ageDays >= boostDays) return 1.0;
  return 1.0 + 0.5 * (boostDays - ageDays) / boostDays;
}

function computeRelevance(
  course: CourseCandidate,
  tagScores: Record<string, number>,
  boostDays: number
): number {
  const base = course.tags.reduce((sum, tag) => sum + (tagScores[tag] ?? 0), 0);
  return base * newBoostFactor(course.createdAt, boostDays);
}

// ─── Step 4: Jaccard similarity (for MMR) ─────────────────────────────────────

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// ─── Step 5: MMR greedy selection ─────────────────────────────────────────────

function mmrSelect(
  candidates: CourseCandidate[],
  relevances: Map<string, number>,
  n: number,
  alpha: number
): CourseCandidate[] {
  // Work on the top-50 by relevance to keep O(n) manageable
  const pool = [...candidates]
    .sort((a, b) => (relevances.get(b.id) ?? 0) - (relevances.get(a.id) ?? 0))
    .slice(0, 50);

  const selected: CourseCandidate[] = [];

  while (selected.length < n && pool.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const rel = relevances.get(c.id) ?? 0;

      let maxSim = 0;
      if (selected.length > 0) {
        for (const s of selected) {
          const sim = jaccard(c.tags, s.tags);
          // Same-category floor prevents the algorithm from underestimating similarity
          const effective = s.category === c.category ? Math.max(sim, 0.5) : sim;
          if (effective > maxSim) maxSim = effective;
        }
      }

      const mmrScore = alpha * rel - (1 - alpha) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    selected.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }

  return selected;
}

// ─── Step 6: Business rules / frequency caps ──────────────────────────────────

export function generateRecommendations(
  interactions: UserInteraction[],
  candidates: CourseCandidate[],
  pinned: PinnedItems = {},
  config: RecommendationConfig = {}
): RecommendationResult {
  const cfg = { ...DEFAULTS, ...config };
  const isNewUser = interactions.length === 0;

  // Adapt exploration level based on data richness
  let mmrAlpha = cfg.mmrAlpha;
  const realInteractions = interactions.filter(i => i.source !== 'onboarding_survey');
  if (isNewUser) {
    mmrAlpha = 0.4; // max exploration – skip mode
  } else if (realInteractions.length === 0) {
    mmrAlpha = 0.6; // survey seeds only
  }

  const tagScores = computeTagScores(interactions, cfg.lambda, cfg.decayCutoff);

  const relevances = new Map<string, number>();
  for (const c of candidates) {
    relevances.set(c.id, computeRelevance(c, tagScores, cfg.newBoostDays));
  }

  // Produce 30 MMR candidates then apply hard caps
  const mmrResults = mmrSelect(candidates, relevances, 30, mmrAlpha);

  // Tags the user has actually interacted with (for slot-9 unfamiliar detection)
  const interactedTags = new Set(interactions.map(i => i.tag));

  const categoryCount: Record<string, number> = {};
  const teacherCount: Record<string, number> = {};
  const final: CourseCandidate[] = [];

  const inFinal = (c: CourseCandidate) => final.some(f => f.id === c.id);

  const isEligible = (c: CourseCandidate) => {
    if ((categoryCount[c.category] ?? 0) >= cfg.maxPerCategory) return false;
    if (c.teacherId && (teacherCount[c.teacherId] ?? 0) >= cfg.maxPerTeacher) return false;
    return true;
  };

  const push = (c: CourseCandidate) => {
    categoryCount[c.category] = (categoryCount[c.category] ?? 0) + 1;
    if (c.teacherId) teacherCount[c.teacherId] = (teacherCount[c.teacherId] ?? 0) + 1;
    final.push(c);
  };

  // Slot 1–3: Pure personalisation
  for (const c of mmrResults) {
    if (final.length >= 3) break;
    if (isEligible(c)) push(c);
  }

  // Slot 4: Forced new-feature item
  if (pinned.slot4 && !inFinal(pinned.slot4)) {
    final.push(pinned.slot4);
  }

  // Slot 5–8: Personalisation with frequency caps
  for (const c of mmrResults) {
    if (final.length >= 8) break;
    if (!inFinal(c) && isEligible(c)) push(c);
  }

  // Slot 9: Force unfamiliar category (filter-bubble break)
  let filled9 = false;
  for (const c of mmrResults) {
    if (final.length >= 9) break;
    if (!inFinal(c) && !c.tags.some(t => interactedTags.has(t))) {
      final.push(c);
      filled9 = true;
      break;
    }
  }
  if (!filled9) {
    for (const c of mmrResults) {
      if (final.length >= 9) break;
      if (!inFinal(c)) { final.push(c); break; }
    }
  }

  // Slot 10: Editorial pick or fallback
  if (pinned.slot10 && !inFinal(pinned.slot10)) {
    final.push(pinned.slot10);
  } else {
    for (const c of mmrResults) {
      if (final.length >= 10) break;
      if (!inFinal(c)) final.push(c);
    }
  }

  return {
    courses: final.slice(0, 10),
    mmrAlphaUsed: mmrAlpha,
    isNewUser,
    tagScores,
  };
}
