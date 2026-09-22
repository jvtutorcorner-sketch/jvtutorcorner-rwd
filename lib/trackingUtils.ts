/**
 * lib/trackingUtils.ts
 * Client helpers that POST behavioural signals to /api/tracking/*.
 *
 * The tracking routes are session-guarded (withAuth) and take the userId from
 * the session — never the body — so these helpers don't send a userId and only
 * run for logged-in users (same-origin fetch carries the session cookie). Guests
 * are handled by survey seeds (localStorage → POST /api/recommendations).
 * All calls are fire-and-forget and swallow errors so they never disrupt the UI.
 */

export interface CourseClickEvent {
  courseId: string;
  courseName?: string;
  tags?: string[];
  timestamp?: number;
  source?: 'homepage' | 'search' | 'category' | 'notification' | 'recommendation';
}

export interface UserFeedbackEvent {
  courseId: string;
  courseName?: string;
  tags?: string[];
  feedback: 'like' | 'dislike';
  reason?: string;
}

export interface ScrollDepthEvent {
  scrollDepth: number; // 0-1, percentage of content scrolled
  viewportHeight: number;
  contentHeight: number;
  timeSpent?: number; // milliseconds
}

async function postTracking(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 401) {
      console.warn(`${path} failed: ${res.status}`);
    }
  } catch (error) {
    console.error(`Error posting ${path}:`, error);
  }
}

/** Track a course click. No-op without a courseId. */
export async function trackCourseClick(event: CourseClickEvent): Promise<void> {
  if (!event.courseId) return;
  await postTracking('/api/tracking/course-click', {
    ...event,
    timestamp: event.timestamp || Date.now(),
    source: event.source || 'homepage',
  });
}

/** Track like/dislike feedback on a recommendation. */
export async function trackUserFeedback(event: UserFeedbackEvent): Promise<void> {
  if (!event.courseId || !event.feedback) return;
  await postTracking('/api/tracking/feedback', { ...event, tags: event.tags || [] });
}

/** Track scroll-depth engagement. */
export async function trackScrollDepth(event: ScrollDepthEvent): Promise<void> {
  await postTracking('/api/tracking/scroll-depth', event);
}
