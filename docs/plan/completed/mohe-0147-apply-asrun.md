# 0147 apply — as-run (2026-08-29, hardening B · 裁-16 hash-only bearer tokens)

**Outcome: APPLIED. Live = 142 / `0147_db_hardening_b_hash_only_bearer_tokens`.** One D1
write-quiesce window, 47 seconds stop-to-ready (08:46:55Z stop → 08:47:07Z apply → 08:47:16Z
restart → 08:47:26Z `/ready` 200 → 08:47:42Z sleeper destroyed). Two live writer bodies replaced
(`create_firm(text,uuid,text)` `d6baec6a…` → `59fa533d…`; `invite_member(text,text,text)`
`d00104d1…` → `809d29ed…`), `_create_firm_core(uuid,text)` byte-identical before and after
(`545c7177…`), all four live admission rows backfilled to a 32-byte hash, the plaintext column
gone, zero plaintext receipts (live had none to scrub: `scrubbed 0`).

Source PR: #414 (merged `752b8dde`). Migration file sha `28cfc3f7d83e28818e455c96849efe61ab87008bd7482239dfab41d0499f8121`,
pinned equal on the rehearsal rig and at the window (a differing sha is a refuse-condition, exit 91).

## The five gates the window waited on

1. **Rehearsal rig at the live frontier** (`postgres:17`, throwaway, migrations `0001–0146`
   held out physically, then `0147` applied): prestate OK, §B2 scrub notice, tail OK, second
   apply `0 new · 142 total`. Seeds were NOT applied at the 0146 frontier — `0002_core_seed`
   writes `token_hash` and follows HEAD — so the rehearsal's populated proof is the hrd-b drill's
   (below), not the seed's. Two read-instrument defects found and fixed BEFORE live was read:
   `polcmd`/`tgenabled` are `"char"` (cast `::text` before concatenation — the same trap the
   0142–0146 ceremony recorded) and `_create_firm_core`'s signature is `(uuid,text)`.
2. **Tripwire, rig vs live: IDENTICAL 29/29** (sorted sets; instrument
   `encode(sha256(convert_to(prosrc,'UTF8')),'hex')`; the fourteen bodies the file reads or
   replaces, the table's column/PK/index/RLS shape, the `op_receipts` owner policy, the two
   invariant indexes, allowlist 88). REPORTED rows: live `ADMISSIONS_TOTAL|4|unconsumed=0`,
   `OP_RECEIPTS_INVITE|0|legacy_plaintext=0`, `OP_RECEIPTS_FOREIGN_TOKEN|0`.
3. **Backup banked first**: `clara-backup` run `2026-08-29T08-38-35-874Z`, migration-head 141,
   bundle 23,181,386 bytes → `r2:clara-dr/db-snapshots/2026/2026-08-29T08-38-35-874Z/`, machine
   auto-stopped. (Log read ANSI-stripped, pinned by the pre-start timestamp.)
4. **In-flight zero**: agent_tasks 0/232, document_processing 0/435, intakes 0/159, both wake
   sources disabled, pending invites 0, operator firms 0.
5. **The populated-upgrade drill** (`hrd-b-upgrade-drill.test.mjs`, legacy-shape seed → 0147 →
   round trip): 8/8 on the conductor's throwaway rig (leg C, 08:46:33Z) and twice 8/8 on the
   reviewer's; in CI it runs on the sweep/dispatch only — see "sweep" below.

## The window (run `win0147-20260829T084653Z`)

- `fly machine stop 48ee715b763048` → `stopped`. Quiesce: 11 idle `clara_runtime_login` sessions
  reaped, **`NON_IDLE_AFTER|0`** (positive read, the refuse-condition on nonzero).
- Apply through the sleeper bridge (`scripts/ops/dsn-pipe.mjs`, verify-full + pinned CA,
  env-to-env): `migrate: 1 new migration(s) applied · 142 total`, backend pid 366591; the file's
  own prestate re-pinned both 0145 pre-images on live, §B2 scrubbed 0, tail OK.
- Post-reads on live vs the rehearsal capture: **diff = the REPORTED rows only**
  (`ADMISSIONS_TOTAL|4|unconsumed=0|hash_len_ok=true` vs the rig's 0; `FROZEN|graphile_worker|20`,
  `FROZEN|workflow|23` exist only on live — constraint 15 untouched). Positive reads:
  `PLAINTEXT_COL_GONE|true`, `HASHIDX|unique=true|valid=true|ready=true|keys=1|col=token_hash`,
  `CF_HASH_IN_CODE|sha256=true|hashcol=true|plain_lookup_gone=true`, `IM_HASH_IN_CODE|hashcol=true|sha256=true`,
  `ANY_PLAINTEXT_KEY|0`, `ADMRLS|rls=true|forced=true|acl=(null)`, ACLs on both doors unchanged
  (`clara_fn_owner`, `clara_authenticated` EXECUTE).
- Restart → `/ready` 200 after 10 s. Sleeper `0803139f5305d8` destroyed. A second, windowless
  post-read from a fresh sleeper (step 5) re-read the same rows (its log: `05-post.log`).

## The sweep red that preceded the window (recorded, not a live defect)

The manual `ci.yml` dispatch after #414 (run 33241919853) went RED on the sweep-only legs
(`closed-wave-drills` §4.11 and all four D-b frontier legs): the shared fixture `seedAdmission`
(`packages/db/tests/rig-fixtures.mjs`, runtime twin `relay-fixtures.mjs`) followed HEAD and wrote
`token_hash` at pre-0147 frontiers. PR **#415** (merged `8da13631`) made both fixtures
frontier-aware (catalog-probed on every call); its branch sweep (run 33243191540) turned the four
frontier legs green; reviewed CLEAR by an independent lane (no other fixture in the class —
census recorded on the PR). Product code was never wrong. Lesson: a PR that changes a shared test
fixture dispatches `ci.yml` on its branch before merge — the sweep-only legs are invisible to PR CI.

## Ceremony notes

- The docs lane's rehearsal/window scripts: scratch `ceremony-0147/` (01-rig · 02-backup ·
  03-pre-live · 04-window · 05-post · tripwire/inflight/quiesce/post-reads .sql) — the same
  five-step shape as the 0142–0146 ceremony (`mohe-0142-0146-apply-asrun.md`).
- Pricing brief (裁-28): the pre-window in-flight read also aggregated `llm_usage_events` by
  firm/month/channel/engine — four rows on live (fixture-scale usage; the cost floor is thin and
  says so), plus `firm_usage_daily` / `task_usage` exist for a follow-up read.
- Held rigs from hardening B's build lane (`hb_b_*`, four containers) destroyed after the window.
