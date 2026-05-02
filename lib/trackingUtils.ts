/**
 * lib/trackingUtils.ts
 * Utility functions for tracking user behavior events
 * - Course clicks
 * - Purchase events
 * - User feedback (like/dislike)
 * - Scroll depth engagement
 */

export interface CourseClickEvent {
  userId?: string;
  courseId: string;
  courseName: string;
  tags?: string[];
  timestamp?: number;
  source?: 'homepage' | 'search' | 'category' | 'notification' | 'recommendation';
}

export interface PurchaseEvent {
  userId: string;
  courseId: string;
  courseName: string;
  tags?: string[];
  price: number;
  currency: string;
  planType: 'points' | 'subscription' | 'combo';
}

export interface UserFeedbackEvent {
  userId: string;
  courseId: string;
  courseName: string;
  tags?: string[];
  feedback: 'like' | 'dislike';
  reason?: string; // Optional: 'not_interested', 'already_know', 'too_expensive', etc.
}

export interface ScrollDepthEvent {
  userId?: string;
  scrollDepth: number; // 0-1, percentage of content scrolled
  viewportHeight: number;
  contentHeight: number;
  timeSpent?: number; // milliseconds
}

/**
 * Track a course click event
 * Asynchronous - does not block UI
 * Gracefully handles network errors
 */
export async function trackCourseClick(event: CourseClickEvent) {
  if (!event.courseId) {
    console.warn('trackCourseClick: courseId is required');
    return;
  }

  try {
    const response = await fetch('/api/tracking/course-click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        timestamp: event.timestamp || Date.now(),
        source: event.source || 'homepage',
      }),
    });

    if (!response.ok) {
      console.warn(`trackCourseClick failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error tracking course click:', error);
    // Silently fail - don't disrupt user experience
  }
}

/**
 * Track a purchase/enrollment event
 * Used after successful payment or plan enrollment
 */
export async function trackPurchaseEvent(event: PurchaseEvent) {
  if (!event.userId || !event.courseId) {
    console.warn('trackPurchaseEvent: userId and courseId are required');
    return;
  }

  try {
    const response = await fetch('/api/tracking/purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        tags: event.tags || [],
      }),
    });

    if (!response.ok) {
      console.warn(`trackPurchaseEvent failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error tracking purchase event:', error);
  }
}

/**
 * Track user feedback on recommendations
 * Negative feedback (-1 weight) helps improve recommendations
 */
export async function trackUserFeedback(event: UserFeedbackEvent) {
  if (!event.userId || !event.courseId || !event.feedback) {
    console.warn('trackUserFeedback: userId, courseId, and feedback are required');
    return;
  }

  try {
    const response = await fetch('/api/tracking/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        tags: event.tags || [],
      }),
    });

    if (!response.ok) {
      console.warn(`trackUserFeedback failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error tracking user feedback:', error);
  }
}

/**
 * Track scroll depth engagement
 * Useful for understanding how deeply users engage with recommendations
 */
export async function trackScrollDepth(event: ScrollDepthEvent) {
  try {
    const response = await fetch('/api/tracking/scroll-depth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.warn(`trackScrollDepth failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error tracking scroll depth:', error);
  }
}

/**
 * Utility: Batch multiple tracking events
 * Useful for high-frequency events that should be debounced
 */
export class TrackingBatcher {
  private events: Array<{ type: string; data: unknown }> = [];
  private timeoutId: NodeJS.Timeout | null = null;
  private batchDelay: number; // milliseconds

  constructor(batchDelay = 5000) {
    this.batchDelay = batchDelay;
  }

  add(type: 'click' | 'feedback' | 'scroll', data: unknown) {
    this.events.push({ type, data });

    // Debounce batch send
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.flush();
    }, this.batchDelay);
  }

  async flush() {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];
    this.timeoutId = null;

    try {
      await fetch('/api/tracking/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events: eventsToSend }),
      });
    } catch (error) {
      console.error('Error flushing tracking batch:', error);
      // Re-add events for retry?
    }
  }

  destroy() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.events = [];
  }
}
