# F-A1 PR-3 ceremony — as-run (2026-08-20)

**What went live:** migrations `0096_f_a1_writer_rotation` + `0097_f_a1_cutover` — the
witness-pair CUTOVER. From this window on, every invoice-kind document (invoice /
credit_note / debit_note / receipt) mints `llm_witness` with engine
`llm-openai:gpt-5.6-terra:v1`; the Azure invoice engine survives only as the tombstone
insert. Runtime **v65** (autoDraft_v8 + chatTurn_v12 + witnessFacts.v1) was deployed and
verified live BEFORE the window (design §6 order: PR-2 image → cutover), per the
positive-read law: in-VM greps of `/app/.output/server/index.mjs` found autoDraft_v8 ×8,
chatTurn_v12 ×3, enqueueWitnessFacts ×3; `/ready` 200; `fly releases` v65 complete.

## Recipe (v5 — the proven v4 shape + one new step)

Script: session-local `fa1-ceremony-2.sh` (+ `fa1-probe-2.mjs`, 25 positive reads) — the
in-repo successor tooling is still a registered harness gap (Known issues). Steps:

1. Sleeper machine on the clara-backup image (inherits app secrets); DSN captured
   env-to-env (`printenv DATABASE_URL`, session pooler, value never printed) +
   `sslmode=no-verify` appended (recorded deviation — pinned-CA tooling gap).
2. **NEW — PRE-QUIESCE TRIPWIRE (zero-downtime abort):** with the runtime still up, read
   the live frontier (must be 90/`0095_f_a1_writer`) and `request_reextraction`'s prosrc
   sha256 (must be `1ef02d7a…`, the frontier-0096-equivalent aggregate body 0097 S3 was
   authored against). A mismatch aborts BEFORE the stop. Ran clean.
3. D1 OPEN: `fly machine stop 48ee715b763048` → 110 s wait (the 0092-lineage quiesce
   guard wants >90 s heartbeat staleness).
4. `node scripts/migrate.mjs` → 0096 + 0097 applied, every prestate/tail notice green
   (`2 new migration(s) · 92 total`).
5. `fa1-probe-2.mjs`: **25/25 PASS** — ledger 92/`0097_f_a1_cutover`; B1 lock order
   (filings→entries→task re-lock, offsets 8025/8234/8267); facts_rotated +
   financial_date + invoice_facts_completed present; router mints llm_witness with the
   locked literal, either-regime already_completed, azure literal at exactly the one
   tombstone site; fail_witness_facts installed (SECDEF pinned, runtime-only ACL, 8-code
   vocabulary); wait_exhausted admitted; reextraction door order (primary 15076 <
   backfillArm 15215) + both-lane filed_bootstrap; evaluator freeze ok, deployed 4/4;
   wall 13 untouched. NOTIFY pgrst sent on ALL-PASS.
6. D1 CLOSE: runtime restarted, `/ready` 200. Sleeper destroyed. ERR trap (auto-restore)
   never fired.

## The tripwire's origin (why step 2 exists)

0097 S3's first sha pin hashed the raw 0026 recut of `request_reextraction` and claimed
"no migration after 0026 touches it" — a name-grep for recut statements, which cannot see
change-of-record SPLICES (0040 S4.13's op-key machinery is one). A full-chain rig replay
produced the true aggregate sha; the pin was corrected pre-merge and the ceremony gained
the pre-quiesce read so a base-body surprise can never again surface mid-window.
**Lesson: provenance of a live body is measured by rig replay, never by name-grep.**

## Post-ceremony live actions (same session)

- `witness_extraction` typed consents granted + activated through the audited owner
  verbs for ROME SECRETARY, BEE CREATIVE SOLUTION, ROME PROPERTIES (evidence: the
  standing signed consent-declaration documents already on file; op keys
  `fa1-corpus-grant/act-*-1`).
- The corpus measurement (PR-3's gating obligation): all 64 BELCORT invoice-kind
  documents with a done legacy extraction re-driven through `request_reextraction`
  (op keys `fa1-corpus-reext-*`); the pipeline runs on live with real model calls.
  Results land in the corpus-measurement report (PROGRESS + design annex when settled).
