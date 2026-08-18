# The F-A1 PR-1 (0089-0095) ceremony — as run (2026-08-19, ~03:30 MYT)

**Scope:** the witness-pair DB estate applied to the live project from merged `main`
(d8abf19, PR #263), inside a **D1 write-quiesce window** — 0089 replaces the supersede
trigger and 0093 replaces the two fact-state resolver bodies, all reached by every
existing invoice/statement document. **Result: 7/7 applied clean (over two attempts —
see the quiesce-guard field note); positive reads 28/28 ALL-PASS; evaluator deploy
flip 2→4 one-way; `/ready` 200 first probe.** Live frontier: 83/`0088` → **90/`0095`**.

## Order of operations (the D1 recipe, fourth execution)

1. **Backup banked first**: `clara-backup` on-demand run → R2
   `db-snapshots/2026/2026-08-18T19-09-54-515Z/` (bundle 20,822,836 bytes; hc-ping
   success; machine exit 0).
2. **DSN bridge, reconstructed in-repo-adjacent** (the prior ceremonies' `dsn-pipe.mjs`
   was session-local and GONE — the handoffs-rule failure shape, now a named harness
   gap): a sleeper machine on the `clara-backup` image (`fly machine run … sleep`,
   inheriting app secrets) → `printenv DATABASE_URL` captured env-to-env, never
   printed. The backup DSN **is already the session-pooler migration DSN**
   (`aws-0-ap-southeast-1.pooler.supabase.com:5432`, `user.<ref>` form).
3. **D1 window OPEN**: `clara-runtime` machine `48ee715b763048` stopped, then a
   **110-second staleness wait** (see field note 1).
4. **Apply** `node scripts/migrate.mjs` with `sslmode=no-verify` appended (field
   note 3). First attempt applied 0089-0091; 0092's own quiesce guard refused on a
   fresh reconciler heartbeat; second attempt (post-staleness) applied 0092-0095.
   Every prestate held on live — 0089's zero-data-touch checksum identical over 416
   rows before/after; 0090's full sha-pinned prestate roster; 0092/0093's 765/766-body
   whole-schema snapshots with "exactly N changed" tails; the 11-body/27-site caller
   census printed on live.
5. **Positive reads** (`fa1-probe.mjs`, asserted, 28/28 PASS): ledger **90**, frontier
   `0095_f_a1_writer` · trigger body sha `56b8264697be…` (≠ pre-0089 `e603399e…`),
   kind-scope at exactly 3 sites, no pointer-block supersede write · the four
   `_f_a1` CHECKs admit the witness kinds/lane/codes · `llm_witness_concurrency`
   nullable · the five new callables exist · wall 13's lane-scoped arm present ·
   both dispatch recuts live · `llm_usage_events` RLS enabled+forced · 3 purpose
   CHECKs + the doc_sha arm admit `witness_extraction` · `document.llm_witness_failed`
   registered (taxonomy rows=1) · the three runtime verbs EXECUTE-granted to
   `clara_runtime` only, no PUBLIC · `verify_evaluator_freeze` ok,
   registered 4 / deployed 2 pre-flip.
6. **The one-way deploy flip**: `update … set deployed=true where not deployed` as the
   ceremony principal (0060's trigger admits exactly this transition) — 2 rows flipped,
   post-flip **deployed 4/4**, `NOTIFY pgrst` sent.
7. **D1 window CLOSED**: runtime restarted, `/ready` 200 on the first probe. Sleeper
   destroyed. **Locally after**: `check-frozen-evaluators.mjs --lock-deployed` locked
   the 2 newly-deployed entries into the manifest (this PR carries it).

## What F-A1 PR-1 changes on live

The 0017 supersede trigger is KIND-SCOPED (a witness pair can no longer supersede
itself; a classify verdict no longer buries the OCR row). The thirteen walls admit the
`llm_witness` lane fail-closed (kill switches, attempt cap, witness-own concurrency
window, typed `witness_extraction` purpose sha-bound at enqueue — INERT until PR-3
mints the lane; no router change shipped, so the estate is LIVE-INERT for witness
work). The frozen witness predicate + identity leaf are deployed 4-member-closure
evaluators; the two fact-state resolvers dispatch by regime with the legacy path
byte-preserved (the live caller census printed 11 bodies / 27 sites unchanged).
`persist_witness_facts` / `record_llm_usage_event` / `witness_citation_regions` are
runtime-only verbs awaiting PR-2's workflow.

## Field notes

1. **The 0092 in-file quiesce guard fired, correctly, on the first attempt** — the
   D1 obligation encoded structurally (refuse while any runtime heartbeat is <90s
   stale; the mechanism is 0023:77-98's, credited in 0092's own header — 0022/0023
   carry it too). This is the first time the guard has actually FIRED in a live
   ceremony, and it caught a real gap: the recipe's old 8-second post-stop pause is
   NOT a quiesce. The recipe now reads: stop, wait 110s, apply. The guard's refusal
   message named the fix exactly.
2. **`fly.exe` on Windows exits non-zero ("The handle is invalid") after SUCCESSFUL
   non-tty `ssh console -C` runs** — under `set -e` this reads as failure. Every ssh
   capture in the ceremony script tolerates the exit code and trusts captured output.
3. **TLS deviation, recorded**: the apply ran `sslmode=no-verify` (encrypted,
   CA-unpinned) — the prior ceremonies' pinned-pooler-CA discipline depended on the
   session-local tooling that is gone. Root-caused first: a BARE pooler DSN attempts
   non-TLS and the pooler silently drops it (reads as `migrate: FAIL — timeout
   expired`); one earlier attempt also chased a false direct-host/IPv6 hypothesis.
   **Harness fix owed**: commit the pooler CA + an in-repo `dsn-pipe` successor so the
   bridge and the pin survive sessions.
4. **S0b(b) measured the pre-existing statement-pair coin-flip on LIVE for the first
   time: 15 documents / 24 pairs** where one reader row supersedes its sibling on the
   uuid tie-break. Counted, named, deliberately NOT repaired (CLR08 once-only);
   heals at F-A1 PR-4's re-kinding.
5. The ERR trap (restart runtime + destroy sleeper) fired twice across the failed
   attempts and restored cleanly both times — total extra downtime ≈ the 110s wait
   plus two short stop/start cycles, all inside ~03:00-03:30 MYT with zero users.

## Residue

- **PR-2 (runtime)** builds `witnessFacts.v1` against the live verbs; **PR-3** mints
  the lane (the estate stays live-inert until then); **PR-3a/PR-4** follow per the
  design §6.
- The pooler-CA + dsn-pipe harness gap (field note 3) is registered in PROGRESS.
- The corpus-capture measurement (§8's top product risk) gates PR-3, not this apply.
