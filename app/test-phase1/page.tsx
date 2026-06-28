/**
 * Phase 1 Signaling Test Harness
 *
 * Available ONLY in non-production environments.
 * Production requests receive a 404.
 *
 * Usage (Playwright intercepts the WS URL):
 *   /test-phase1?wsUrl=ws://phase1.test.invalid&channel=test-ch&userId=user-1
 */

import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Phase1SignalingClient } from './client';

export default function TestPhase1Page() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <Suspense fallback={<div id="loading">Loading…</div>}>
      <Phase1SignalingClient />
    </Suspense>
  );
}
