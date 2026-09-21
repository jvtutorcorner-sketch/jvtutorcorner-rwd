// app/api/cron/class-summaries/route.ts
//
// POST /api/cron/class-summaries   (EventBridge every ~5 min; Bearer CRON_SECRET)
//
// Background worker for AI class summaries. Claims PENDING rows atomically, runs the
// STT + LLM pipeline (lib/classSummary/processSummary), and persists the result. Runs
// out-of-band (never during a class / in the SSR request path). For long batches this
// can be moved to a dedicated 900s Lambda later; the pattern mirrors the daily-report
// cron and reuses its CRON_SECRET auth.

import { NextRequest, NextResponse } from 'next/server';
import { getObjectBuffer, uploadToS3 } from '@/lib/s3';
import { getActiveAIIntegration, generateJson } from '@/lib/ai/llmClient';
import { transcribeAudio } from '@/lib/ai/transcribe';
import { listPending, claimForProcessing, markReady, markAttemptFailed, getClassSummary } from '@/lib/classSummaryService';
import { processSummaryRow, type ProcessDeps } from '@/lib/classSummary/processSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 5;
const MIME_BY_EXT: Record<string, string> = {
  webm: 'audio/webm',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && (auth === `Bearer ${secret}` || req.headers.get('x-cron-token') === secret)) return true;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return false;
    return true; // dev convenience, mirrors daily-report
  }
  return false;
}

const deps: ProcessDeps = {
  getObjectBase64: async (key) => {
    try {
      const buf = await getObjectBuffer(key);
      const ext = key.split('.').pop()?.toLowerCase() || '';
      return { base64: buf.toString('base64'), mimeType: MIME_BY_EXT[ext] || 'application/octet-stream' };
    } catch {
      return null;
    }
  },
  getIntegration: () => getActiveAIIntegration(),
  transcribe: (base64, mimeType) => transcribeAudio(base64, mimeType),
  generateJson: (args) => generateJson(args),
};

async function processOne(summaryId: string) {
  const row = await getClassSummary(summaryId);
  if (!row || row.status !== 'PROCESSING') return;
  try {
    const outcome = await processSummaryRow(row, deps);
    if (outcome.kind === 'failed') {
      const next = await markAttemptFailed(summaryId, row.attempts);
      return { summaryId, result: 'failed', reason: outcome.reason, next };
    }
    // ready or insufficient both persist a summary (insufficient flags "content too thin").
    let transcriptKey: string | undefined;
    if (outcome.transcriptText) {
      transcriptKey = `class-transcripts/${summaryId}.json`;
      try {
        await uploadToS3(Buffer.from(JSON.stringify({ text: outcome.transcriptText })), transcriptKey, 'application/json');
      } catch (e) {
        console.warn('[cron/class-summaries] transcript upload failed', e);
        transcriptKey = undefined;
      }
    }
    await markReady(summaryId, outcome.summary, {
      transcriptKey,
      model: outcome.kind === 'ready' ? outcome.model : undefined,
    });
    return { summaryId, result: outcome.kind };
  } catch (err) {
    console.error('[cron/class-summaries] processing error', summaryId, err);
    const next = await markAttemptFailed(summaryId, row.attempts).catch(() => 'FAILED');
    return { summaryId, result: 'error', next };
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const pending = await listPending(BATCH);
  const results: unknown[] = [];
  for (const row of pending) {
    if (await claimForProcessing(row.summaryId)) {
      results.push(await processOne(row.summaryId));
    }
  }
  return NextResponse.json({ ok: true, claimed: results.length, results });
}
