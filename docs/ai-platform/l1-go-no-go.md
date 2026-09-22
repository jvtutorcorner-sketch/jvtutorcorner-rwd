# L1 Go/No-Go Gate (Phase 0b)

The whole real-time AI analysis stack (L1 event detection → L2 segment analysis →
transcript-based L3/L4) rests on **two unverified premises**:

1. Each rotated ~60s audio segment decodes **independently** (the recorder-rotation
   fix in `lib/classroom/recorderRotation.ts` / `useClassAudioRecorder.ts`).
2. A **cheap audio-in model** (Gemini 2.5 Flash-Lite) returns an adequate
   **zh/en-mixed transcript + teaching events** in a single call, within budget.

This harness tests both on a **real recording**. It is the gate that decides
whether Phase 3b's L1/L2 Lambdas are built as designed, or fall back to "STT and
event detection separated" (architecture plan §3 / §16).

## ⚠ It costs money — and only when you say so

`scripts/l1-go-no-go.mjs` is **dry-run by default and makes no network/paid call**.
The real, paid provider call happens **only** with `--go` **and** a provider key.
Running it against the paid API is your decision; nothing here does it for you.

## How to run

1. **Record** a ~60s zh/en teaching clip with the app's recorder so you get the
   actual rotated segments (`seg0.webm`, `seg1.webm`, …). Using the real recorder
   output is what proves premise (1); a single hand-exported file only tests (2).
2. **Write a ground-truth transcript** per segment (`ref0.txt`, `ref1.txt`, …) —
   exactly what was said, zh + en verbatim.
3. **Dry run** (safe, free — shows the prompt, estimated cost, thresholds):
   ```bash
   node --import ./scripts/lib/register-ts-resolve.mjs scripts/l1-go-no-go.mjs \
     --audio seg0.webm,seg1.webm --ref ref0.txt,ref1.txt
   ```
4. **Real gated call** (spends on the provider — your consent):
   ```bash
   GEMINI_API_KEY=xxx node --import ./scripts/lib/register-ts-resolve.mjs \
     scripts/l1-go-no-go.mjs --audio seg0.webm,seg1.webm --ref ref0.txt,ref1.txt --go
   ```

Flags: `--model` (default `gemini-2.5-flash-lite`), `--context <file>` (rolling
context summary), `--seg-seconds 60`, `--wer-max 0.25`, `--cost-max-musd 1200`,
`--latency-max-ms 30000`, `--out report.json`.

## Thresholds (§15; tune per your data)

| Metric | Default | Meaning |
|---|---|---|
| decode | every segment returns a non-empty transcript on its own | premise (1) |
| WER (mixed zh/en) | ≤ 0.25 | premise (2) quality; per-char zh + per-word en |
| cost | ≤ 1200 µ$ (=$0.0012) / segment | §15 L1 unit cost |
| latency | ≤ 30 000 ms | §15 "≤30s after upload" |

## Reading the result

- **GO** — L1/L2 as designed (one cheap audio-in call → transcript + events).
- **NO-GO** — inspect the reasons:
  - *segments didn't decode independently* → the recorder rotation isn't producing
    self-contained files on that browser/codec; revisit `useClassAudioRecorder`.
  - *WER too high* → the cheap model can't handle your code-switching; either raise
    the tier, or split STT (e.g. Deepgram/Gemini STT) from event detection.
  - *cost/latency over* → adjust segment length or model tier; re-cost the plan.

The event-detection quality (boundary F1) still needs a human eyeball or a labeled
marker set — the harness reports the events it got; it does not auto-score them.

## What's already verified offline

`scripts/verify-l1-harness.mjs` (no network) locks the pure pieces the harness
relies on: the L1 prompt/parse (`lib/lessonAI/l1Prompt.ts`), the mixed WER
(`lib/lessonAI/wer.ts`), and the pass/fail verdict (`lib/lessonAI/l1Verdict.ts`).
Those same modules are what the real L1 Lambda will reuse in Phase 3b.
