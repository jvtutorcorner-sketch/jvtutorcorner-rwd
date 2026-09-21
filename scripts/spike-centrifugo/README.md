# Centrifugo Phase-1 spike (plan appendix B.6)

Decision gate for Phase 1 of `.claude/plans/3-5-redis-parsed-phoenix.md`: can **Centrifugo**
(Apache-2.0, single Go binary, runs on Render) replace the hand-written `ws` +
Valkey signaling/presence server the plan otherwise proposes? Passing this spike
saves an estimated 1.5–2 person-weeks in Phase 1.

Local only. Touches no production code and no production environment. Root
`package.json` is intentionally **not** modified — the client deps are installed
ad-hoc for the spike.

## Run

```bash
cd scripts/spike-centrifugo
npm install centrifuge@5 ws        # ad-hoc, not saved to the repo
docker compose up -d               # valkey + 2 centrifugo instances sharing the engine
node spike.mjs                      # exits 0 iff all four B.1 conditions pass
docker compose down                 # teardown
```

Two Centrifugo instances (`:8801`, `:8802`) share one Valkey engine, so every
message the student receives has crossed the engine — that is the cross-instance
fan-out proof (condition 4).

## What it asserts (B.1 acceptance conditions)

1. **C1a/C1b — presence + join/leave.** `presence()` lists both members across
   instances; a peer killed by an ungraceful socket RST (a killed browser tab) is
   removed well within the 45s budget.
2. **C2 — frame relay + trusted sender.** The four existing signaling frames
   (`wb-uuid-sync`, `page-change`, `request-page-state`, `pdf-available`) relay
   byte-for-byte, and each publication's `info.user` equals the publisher's JWT
   `sub` (the server-forced sender id).
3. **C3 — JWT(HS256) connect.** Both clients connect using only an HS256 JWT
   signed with the shared `token_hmac_secret_key`.
4. **C4 — cross-instance fan-out.** 200 messages A→B via the shared engine, with
   p50/p95 latency reported.

## Result (2026-09-18)

ALL PASS, 3/3 runs. See `docs/classroom-concurrency-handoff-2026-09-15.md` §16.
