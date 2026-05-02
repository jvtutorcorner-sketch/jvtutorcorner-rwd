# Classroom Streaming Test Suite — Quick Reference

Modular test suite inspired by streaming platform practices
(YouTube Live, Twitch, Zoom endurance/load testing).

## Philosophy

> "Don't test everything at once. Test each concern independently,
>  measure it, and gate the next level on the previous one passing."

Each spec tests ONE concern. Each `test()` tests ONE phase of that concern.
When something breaks you immediately see which spec file, which test, which phase.

---

## File Map

```
e2e/helpers/streaming_monitor.ts   — Shared monitoring utilities (health, latency, heartbeat)
e2e/classroom/
  00_preflight.spec.ts             — ~30s   API health gate (run FIRST)
  01_canary.spec.ts                — ~3-4m  Single session per-phase checkpoints
  02_sync_quality.spec.ts          — ~5-7m  5 draw probes + idle reconnect
  03_duration_stability.spec.ts    — varies  Duration-based with periodic heartbeat
  04_load_escalation.spec.ts       — varies  Staged concurrent load
  05_wait_pdf_upload.spec.ts       — ~3-5m  Teacher wait-page PDF upload verification
  06_room_pdf_sync_countdown.spec.ts — ~6-9m  Room PDF render/page-sync + countdown precision
```

---

## Run Order (CI / Triage)

```powershell
# 1. Pre-flight (always run first)
npx playwright test e2e/classroom/00_preflight.spec.ts --project=chromium

# 2. Canary (1 session, all phases)
npx playwright test e2e/classroom/01_canary.spec.ts --project=chromium

# 3. Sync quality (5 draw probes + idle)
npx playwright test e2e/classroom/02_sync_quality.spec.ts --project=chromium

# 4. Duration stability (parameterised)
$env:DURATION_MINUTES="1";  npx playwright test e2e/classroom/03_duration_stability.spec.ts --project=chromium
$env:DURATION_MINUTES="5";  npx playwright test e2e/classroom/03_duration_stability.spec.ts --project=chromium
$env:DURATION_MINUTES="15"; npx playwright test e2e/classroom/03_duration_stability.spec.ts --project=chromium

# 5. Wait-page PDF upload (teacher-only capability)
npx playwright test e2e/classroom/05_wait_pdf_upload.spec.ts --project=chromium

# 6. Room PDF sync + countdown precision
npx playwright test e2e/classroom/06_room_pdf_sync_countdown.spec.ts --project=chromium

# 7. Load escalation (staged, run each level separately)
$env:CONCURRENT_GROUPS="3";  npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
$env:CONCURRENT_GROUPS="5";  npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
$env:CONCURRENT_GROUPS="10"; npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
```

---

## Canary Gating Rule

Before running load tests (04), confirm:
- `00_preflight` all green
- `01_canary` Phase F sync latency < SLO
- `02_sync_quality` 0 failed probes

If any of the above fail, do NOT proceed to load — fix the root cause first.

---

## SLO Thresholds (override via env)

| Variable              | Default | Meaning                                  |
|-----------------------|---------|------------------------------------------|
| `SYNC_LATENCY_SLO_MS` | 8000    | Max draw→sync latency (ms)               |
| `API_LATENCY_SLO_MS`  | 3000    | Max API response time (ms)               |
| `HEARTBEAT_INTERVAL_MS`| 30000  | Heartbeat poll interval during sessions  |
| `SUCCESS_THRESHOLD`   | 0.75    | Min fraction of groups that must sync    |

```powershell
$env:SYNC_LATENCY_SLO_MS="5000"; $env:CONCURRENT_GROUPS="5"; npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
```

---

## What Each Test Measures

### 00_preflight
- All key API endpoints respond (no 5xx)
- Login API latency < API_LATENCY_SLO_MS
- DynamoDB latency via /api/orders < SLO
- Required env vars present

### 01_canary (phases A–F)
- Phase A: Course creation time
- Phase B: Admin approval time
- Phase C: Enrollment time
- Phase D: Wait-room navigation time for both roles
- Phase E: Ready signal + classroom entry time
- Phase F: **Sync latency measurement** (emits warning if > SLO)

### 02_sync_quality
- First-draw sync latency (hard assert: must sync)
- 5 repeated draw probes at 30s intervals (soft SLO warning if >2 slow)
- Canvas pixel integrity on both sides
- **Post-60s-idle reconnect** probe (detects connection drop)

### 03_duration_stability
- Session START / END sync probes
- **Periodic heartbeat** every N seconds (checks: syncAlive, canvasContent, API latency)
- Drift detection: START latency vs END latency delta
- Mid-session probe (only for sessions ≥ 5 min)

### 04_load_escalation
- Per-group result: enrolled / entered / synced / latency
- **Circuit breaker warning** if <50% enrolled
- Most-common failure phase identification
- Overall success rate vs configurable threshold

### 06_room_pdf_sync_countdown
- Wait-page uploaded PDF appears in /classroom/room
- Multi-page PDF scene index sync (teacher -> student)
- Countdown start value aligns with order duration (no +5s offset)

---

## Emergency Triage (production issue)

```powershell
# Step 1: Is the system alive?
npx playwright test e2e/classroom/00_preflight.spec.ts --project=chromium

# Step 2: Does a single session still work?
npx playwright test e2e/classroom/01_canary.spec.ts --project=chromium --grep "Phase F"

# Step 3: Is sync quality degraded?
$env:SYNC_LATENCY_SLO_MS="3000"; npx playwright test e2e/classroom/02_sync_quality.spec.ts --project=chromium

# Step 4: Which load level breaks?
$env:CONCURRENT_GROUPS="3"; npx playwright test e2e/classroom/04_load_escalation.spec.ts --project=chromium
```

---

## Previous Monolithic Test

The old `e2e/classroom_stress_test_multi_duration.spec.ts` still exists.
It can still be used for full-suite sweeps, but the new modular specs are
preferred for diagnosis and CI gating.
