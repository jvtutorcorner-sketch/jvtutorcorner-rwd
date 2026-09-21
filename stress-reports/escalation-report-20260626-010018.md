# PDF Sync Stress Test — Escalation Report

**Date:** 2026-06-26 01:13:39  
**Total duration:** 13.3min  
**Force-close timeout:** 5min per group  
**Success threshold:** 75%  
**Mode:** Headed (browser visible)  
**Group sequence tested:** 7 → 8 → 9 → 10  

## System Concurrency Limit: **7 concurrent group(s)**

> 8 groups caused failure (synced=25%)

## Results by Group Count

| Groups | Enrolled | Uploaded | Entered | Synced | Duration | Result |
|--------|----------|----------|---------|--------|----------|--------|
| 7 | 100% | 100% | 100% | 100% | 3m 49s | ✅ PASS |
| 8 | 100% | 100% | 88% | 25% | 9m 22s | ❌ FAIL |

## Per-Run Detail

### ✅ 7 Group(s)

- Enrolled: 100%
- PDF Uploaded: 100%
- Entered classroom: 100%
- PDF Synced: 100%
- Achieved rate: 100%
- Duration: 3m 49s

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
✅ [group-5] PDF Uploaded and registered
✅ [group-1] PDF Uploaded and registered
✅ [group-0] PDF Uploaded and registered
✅ [group-4] PDF Uploaded and registered
✅ [group-6] PDF Uploaded and registered
✅ [group-2] PDF Uploaded and registered
✅ [group-1] Entered classroom room
✅ [group-2] Entered classroom room
✅ [group-0] Entered classroom room
✅ [group-6] Entered classroom room
✅ [group-5] Entered classroom room
✅ [group-3] Entered classroom room
✅ [group-4] Entered classroom room
✅ [group-1] PDF Synchronization verified successfully
✅ [group-2] PDF Synchronization verified successfully
✅ [group-3] PDF Synchronization verified successfully
✅ [group-4] PDF Synchronization verified successfully
✅ [group-5] PDF Synchronization verified successfully
✅ [group-6] PDF Synchronization verified successfully
✅ [group-0] PDF Synchronization verified successfully
✅ [group-0] enrolled=true uploaded=true entered=true sync=true
✅ [group-1] enrolled=true uploaded=true entered=true sync=true
✅ [group-2] enrolled=true uploaded=true entered=true sync=true
✅ [group-3] enrolled=true uploaded=true entered=true sync=true
✅ [group-4] enrolled=true uploaded=true entered=true sync=true
✅ [group-5] enrolled=true uploaded=true entered=true sync=true
✅ [group-6] enrolled=true uploaded=true entered=true sync=true
```

### ❌ 8 Group(s)

- Enrolled: 100%
- PDF Uploaded: 100%
- Entered classroom: 88%
- PDF Synced: 25%
- Achieved rate: 25%
- Duration: 9m 22s

```
✅ [group-0] Course ready
✅ [group-1] Course ready
✅ [group-2] Course ready
✅ [group-3] Course ready
✅ [group-4] Course ready
✅ [group-5] Course ready
✅ [group-6] Course ready
✅ [group-7] Course ready
✅ [group-0] Approved
✅ [group-1] Approved
✅ [group-2] Approved
✅ [group-3] Approved
✅ [group-4] Approved
✅ [group-5] Approved
✅ [group-6] Approved
✅ [group-7] Approved
✅ [group-0] Enrolled
✅ [group-1] Enrolled
✅ [group-2] Enrolled
✅ [group-3] Enrolled
✅ [group-4] Enrolled
✅ [group-5] Enrolled
✅ [group-6] Enrolled
✅ [group-7] Enrolled
✅ [group-2] PDF Uploaded and registered
✅ [group-5] PDF Uploaded and registered
✅ [group-0] PDF Uploaded and registered
✅ [group-4] PDF Uploaded and registered
✅ [group-7] PDF Uploaded and registered
✅ [group-1] PDF Uploaded and registered
✅ [group-6] PDF Uploaded and registered
✅ [group-3] PDF Uploaded and registered
✅ [group-1] Entered classroom room
✅ [group-6] Entered classroom room
✅ [group-5] Entered classroom room
✅ [group-2] Entered classroom room
✅ [group-0] Entered classroom room
✅ [group-4] Entered classroom room
✅ [group-3] Entered classroom room
❌ [group-7] Classroom wait/enter: page.evaluate: Execution context was destroyed, most likely because of a navigatio
✅ [group-2] PDF Synchronization verified successfully
❌ [group-1] PDF Sync verification: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m
❌ [group-4] PDF Sync verification: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m
❌ [group-0] PDF Sync verification: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m
✅ [group-3] PDF Synchronization verified successfully
⏰ [group-5] Force-close triggered after 5min — navigating away to unblock
⏰ [group-6] Force-close triggered after 5min — navigating away to unblock
⏰ [group-5] PDF Sync verification: Force-closed after 5min [student_pdf_sync]: PDF sync did not complete
⏰ [group-6] PDF Sync verification: Force-closed after 5min [student_pdf_sync]: PDF sync did not complete
⚠️ [group-0] enrolled=true uploaded=true entered=true sync=false [failed at: pdf_sync_verify]
⚠️ [group-1] enrolled=true uploaded=true entered=true sync=false [failed at: pdf_sync_verify]
✅ [group-2] enrolled=true uploaded=true entered=true sync=true
✅ [group-3] enrolled=true uploaded=true entered=true sync=true
⚠️ [group-4] enrolled=true uploaded=true entered=true sync=false [failed at: pdf_sync_verify]
⚠️ [group-5] enrolled=true uploaded=true entered=true sync=false [failed at: room_not_ready]
⚠️ [group-6] enrolled=true uploaded=true entered=true sync=false [failed at: room_not_ready]
❌ [group-7] enrolled=true uploaded=true entered=false sync=false [failed at: classroom_enter]
```


