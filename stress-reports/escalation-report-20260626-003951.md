# PDF Sync Stress Test — Escalation Report

**Date:** 2026-06-26 00:43:26  
**Total duration:** 3.6min  
**Force-close timeout:** 5min per group  
**Success threshold:** 75%  
**Mode:** Headed (browser visible)  
**Group sequence tested:** 7 → 8 → 9 → 10  

## System Concurrency Limit: **< 7 groups (first level already failed)**

> 7 groups caused failure (synced=57%)

## Results by Group Count

| Groups | Enrolled | Uploaded | Entered | Synced | Duration | Result |
|--------|----------|----------|---------|--------|----------|--------|
| 7 | 100% | 100% | 100% | 57% | 3m 30s | ❌ FAIL |

## Per-Run Detail

### ❌ 7 Group(s)

- Enrolled: 100%
- PDF Uploaded: 100%
- Entered classroom: 100%
- PDF Synced: 57%
- Achieved rate: 57%
- Duration: 3m 30s

```
✅ [group-0] Course ready
✅ [group-1] Course ready
✅ [group-2] Course ready
✅ [group-3] Course ready
✅ [group-4] Course ready
✅ [group-5] Course ready
✅ [group-6] Course ready
✅ [group-0] Approved
✅ [group-1] Approved
✅ [group-2] Approved
✅ [group-3] Approved
✅ [group-4] Approved
✅ [group-5] Approved
✅ [group-6] Approved
✅ [group-0] Enrolled
✅ [group-1] Enrolled
✅ [group-2] Enrolled
✅ [group-3] Enrolled
✅ [group-4] Enrolled
✅ [group-5] Enrolled
✅ [group-6] Enrolled
✅ [group-3] PDF Uploaded and registered
✅ [group-4] PDF Uploaded and registered
✅ [group-2] PDF Uploaded and registered
✅ [group-1] PDF Uploaded and registered
✅ [group-0] PDF Uploaded and registered
✅ [group-5] PDF Uploaded and registered
✅ [group-6] PDF Uploaded and registered
✅ [group-0] Entered classroom room
✅ [group-2] Entered classroom room
✅ [group-1] Entered classroom room
✅ [group-5] Entered classroom room
✅ [group-6] Entered classroom room
✅ [group-3] Entered classroom room
✅ [group-4] Entered classroom room
✅ [group-0] PDF Synchronization verified successfully
✅ [group-2] PDF Synchronization verified successfully
❌ [group-1] PDF Sync verification: page.evaluate: Error: you can only call it when room is connected. the phase of r
❌ [group-5] PDF Sync verification: page.evaluate: Error: you can only call it when room is connected. the phase of r
✅ [group-4] PDF Synchronization verified successfully
✅ [group-3] PDF Synchronization verified successfully
❌ [group-6] PDF Sync verification: page.evaluate: Error: you can only call it when room is connected. the phase of r
✅ [group-0] enrolled=true uploaded=true entered=true sync=true
⚠️ [group-1] enrolled=true uploaded=true entered=true sync=false [failed at: pdf_sync_verify]
✅ [group-2] enrolled=true uploaded=true entered=true sync=true
✅ [group-3] enrolled=true uploaded=true entered=true sync=true
✅ [group-4] enrolled=true uploaded=true entered=true sync=true
⚠️ [group-5] enrolled=true uploaded=true entered=true sync=false [failed at: pdf_sync_verify]
⚠️ [group-6] enrolled=true uploaded=true entered=true sync=false [failed at: pdf_sync_verify]
```


