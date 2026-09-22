#!/usr/bin/env node
/**
 * L1 STT + event-detection go/no-go harness (architecture plan §3 gate / §15).
 *
 * Validates the two unverified L1 premises on a REAL recording:
 *   1. each rotated ~60s segment decodes independently (the recorder-rotation fix), and
 *   2. a cheap audio-in model gives adequate zh/en-mixed transcript + events,
 *      within the cost/latency budget.
 *
 * ⚠ DRY RUN BY DEFAULT — makes NO network / paid call. It only shows what would be
 * sent, the estimated cost, and the thresholds. The real, paid, gated call happens
 * ONLY with --go and a provider key (you authorize the spend).
 *
 * Usage:
 *   # 1) record a ~60s zh/en teaching clip with the app's recorder (rotated segments),
 *   #    and write a ground-truth transcript per segment.
 *   # 2) dry run (safe, free):
 *   node --import ./scripts/lib/register-ts-resolve.mjs scripts/l1-go-no-go.mjs \
 *     --audio seg0.webm,seg1.webm --ref ref0.txt,ref1.txt
 *   # 3) REAL gated call (spends on the provider — your consent):
 *   GEMINI_API_KEY=xxx node --import ./scripts/lib/register-ts-resolve.mjs \
 *     scripts/l1-go-no-go.mjs --audio seg0.webm --ref ref0.txt --go
 *
 * Flags: --model (default gemini-2.5-flash-lite) --context <file> --seg-seconds 60
 *        --wer-max 0.25 --cost-max-musd 1200 --latency-max-ms 30000 --out report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildL1Prompt, parseL1Response } from '../lib/lessonAI/l1Prompt.ts';
import { werMixed } from '../lib/lessonAI/wer.ts';
import { l1Verdict, DEFAULT_L1_THRESHOLDS } from '../lib/lessonAI/l1Verdict.ts';
import { audioUsageToMusd } from '../lib/ai/gateway/pricing.ts';

function arg(name, dflt) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  if (hit === `--${name}`) return true; // boolean flag
  return hit.slice(`--${name}=`.length);
}
// support "--audio x,y" (space-separated value) too
function argVal(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(`--${name}=`.length) : dflt;
}

const GO = process.argv.includes('--go');
const MODEL = argVal('model', 'gemini-2.5-flash-lite');
const SEG_SECONDS = Number(argVal('seg-seconds', '60'));
const THRESH = {
  werMax: Number(argVal('wer-max', String(DEFAULT_L1_THRESHOLDS.werMax))),
  costMaxMusd: Number(argVal('cost-max-musd', String(DEFAULT_L1_THRESHOLDS.costMaxMusd))),
  latencyMaxMs: Number(argVal('latency-max-ms', String(DEFAULT_L1_THRESHOLDS.latencyMaxMs))),
};
const MIME = { webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac' };

const audioList = String(argVal('audio', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const refList = String(argVal('ref', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const contextFile = argVal('context', '');
const contextSummary = contextFile && fs.existsSync(contextFile) ? fs.readFileSync(contextFile, 'utf8') : undefined;

if (audioList.length === 0) {
  console.error('Provide at least one audio segment: --audio seg0.webm[,seg1.webm]');
  console.error('Run with --help-ish flags shown at the top of this file. This is a DRY RUN unless --go is passed.');
  process.exit(1);
}

const prompt = buildL1Prompt({ contextSummary, segmentSeconds: SEG_SECONDS });

console.log('=== L1 go/no-go harness ===');
console.log(`mode:      ${GO ? 'REAL (paid provider call)' : 'DRY RUN (no network, no cost)'}`);
console.log(`model:     ${MODEL}`);
console.log(`segments:  ${audioList.length}`);
console.log(`thresholds: WER ≤ ${THRESH.werMax}, cost ≤ ${THRESH.costMaxMusd}µ$/seg, latency ≤ ${THRESH.latencyMaxMs}ms`);
console.log('--- prompt that will be sent ---');
console.log(prompt);
console.log('--------------------------------');

function loadAudio(file) {
  if (!fs.existsSync(file)) throw new Error(`audio not found: ${file}`);
  const buf = fs.readFileSync(file);
  const ext = file.split('.').pop().toLowerCase();
  const mimeType = MIME[ext] || 'application/octet-stream';
  return { buf, mimeType, base64: buf.toString('base64') };
}

async function callGemini(base64, mimeType) {
  const key = process.env.GEMINI_API_KEY || process.env.CI_GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set — required for --go');
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  );
  const latencyMs = Date.now() - t0;
  const data = await res.json();
  if (!res.ok) throw new Error(`provider ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const u = data.usageMetadata ?? {};
  const costMusd = audioUsageToMusd(MODEL, u.promptTokenCount ?? 0, u.candidatesTokenCount ?? 0);
  return { text, latencyMs, costMusd, usage: u };
}

const segments = [];
for (let i = 0; i < audioList.length; i++) {
  const file = audioList[i];
  const { buf, mimeType, base64 } = loadAudio(file);
  const refText = refList[i] && fs.existsSync(refList[i]) ? fs.readFileSync(refList[i], 'utf8') : undefined;

  if (!GO) {
    // Estimate only. Gemini bills audio ≈ 32 tokens/sec.
    const estAudioTok = Math.round(SEG_SECONDS * 32);
    const estOutTok = 400;
    const estMusd = audioUsageToMusd(MODEL, estAudioTok, estOutTok);
    console.log(`\n[dry] ${file}  ${(buf.length / 1024).toFixed(1)} KB  ${mimeType}  est≈${estMusd}µ$ (in≈${estAudioTok}tok/out≈${estOutTok}tok)`);
    if (refText) console.log(`      ref transcript: ${refText.trim().slice(0, 80)}…`);
    segments.push({ file, decoded: false, costMusd: estMusd });
    continue;
  }

  process.stdout.write(`\n[go] ${file} … `);
  try {
    const { text, latencyMs, costMusd } = await callGemini(base64, mimeType);
    const parsed = parseL1Response(text);
    const decoded = !!parsed && parsed.transcript.trim().length > 0;
    const wer = decoded && refText ? werMixed(refText, parsed.transcript).wer : undefined;
    const events = parsed?.events.length ?? 0;
    console.log(`decoded=${decoded} events=${events} ${wer != null ? `WER=${wer}` : ''} cost=${costMusd}µ$ ${latencyMs}ms`);
    if (parsed?.transcript) console.log(`      hyp: ${parsed.transcript.slice(0, 120)}…`);
    segments.push({ file, decoded, wer, costMusd, latencyMs, events });
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    segments.push({ file, decoded: false });
  }
}

const verdict = l1Verdict(segments, THRESH);
console.log('\n=== verdict ===');
if (!GO) {
  console.log('DRY RUN complete — no API call was made, no cost incurred.');
  console.log('Re-run with --go and GEMINI_API_KEY set to perform the real, paid gate test.');
} else {
  console.log(verdict.pass ? '✅ GO — L1 premises hold' : '❌ NO-GO');
  for (const r of verdict.reasons) console.log(`   - ${r}`);
}

const outPath = argVal('out', path.join(process.env.TEMP || '.', `l1-go-no-go-${Date.now()}.json`));
try {
  fs.writeFileSync(outPath, JSON.stringify({ mode: GO ? 'go' : 'dry', model: MODEL, thresholds: THRESH, segments, verdict }, null, 2));
  console.log(`\nreport: ${outPath}`);
} catch {
  /* ignore */
}
process.exit(GO && !verdict.pass ? 2 : 0);
