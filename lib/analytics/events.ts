// lib/analytics/events.ts
//
// Product analytics event types for the AI benefit KPIs
// (docs/ai-platform/ai-feature-benefit-assessment-2026-09-27.md).
// Events never carry message content or a raw LINE uid.

export type CourseClickSrc =
  | 'homepage'
  | 'catalog'
  | 'recommendation'
  | 'search'
  | 'category'
  | 'notification'
  | 'other';

export const COURSE_CLICK_SRCS: readonly CourseClickSrc[] = [
  'homepage', 'catalog', 'recommendation', 'search', 'category', 'notification', 'other',
];

/** Recommendation experiment arm. Guests are never assigned. */
export type RecArm = 'treatment' | 'holdout';

export type AiErrorReason = 'cost_cap' | 'budget' | 'provider';

export type AnalyticsEventInput =
  | { type: 'course_click'; userId: string; courseId: string; src: CourseClickSrc }
  | { type: 'rec_served'; userId?: string; arm: RecArm | 'guest'; personalized: boolean; interactionCount: number; n: number; popNonDefault: number }
  | { type: 'rec_impression'; userId: string; courseIds: string[]; arm: RecArm }
  | { type: 'course_purchase'; userId: string; orderId: string; courseId: string; paymentMethod: string }
  | { type: 'chat_message'; userId?: string; channel: 'widget' }
  | { type: 'chat_handoff'; userId?: string; department: string }
  | { type: 'line_message'; msgType: string; uidHash: string }
  | { type: 'assessment_generated'; userId?: string; sessionId: string; requestId: string; questionCount: number }
  | { type: 'assessment_dispatched'; userId?: string; sessionId: string; assessmentId: string; generateRequestId?: string; questionCount: number }
  | { type: 'ai_error'; userId?: string; feature: string; reason: AiErrorReason; provider?: string };

export type AnalyticsEventType = AnalyticsEventInput['type'];

/** A stored event row. `ts` is ISO (UTC); `pk`/`sk` are the table keys. */
export type AnalyticsEvent = AnalyticsEventInput & {
  pk: string;
  sk: string;
  eventId: string;
  ts: string;
  appEnv: AppEnv;
};

export type AppEnv = 'production' | 'local' | 'dev';

/**
 * Which deployment wrote an event. A `next dev` server is 'dev' even though
 * .env.local points at production AWS, so reports can drop developer traffic.
 */
export function currentAppEnv(): AppEnv {
  if (process.env.NODE_ENV !== 'production') return 'dev';
  return process.env.APP_ENV === 'production' ? 'production' : 'local';
}

/** Whitelist an untrusted click source. */
export function normalizeClickSrc(src: unknown): CourseClickSrc {
  return COURSE_CLICK_SRCS.includes(src as CourseClickSrc) ? (src as CourseClickSrc) : 'other';
}
