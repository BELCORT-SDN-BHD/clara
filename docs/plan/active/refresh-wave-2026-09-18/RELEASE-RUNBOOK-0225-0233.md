# Hosted release ceremony — 0225…0233 (wave 2026-09-18) + chatTurn_v21 / claraWork_v5 image + web

**AS RUN 2026-09-19 22:40–22:50 MYT — see § RESULTS at the end.** The body below is the draft as it was
verified before the window (written by an agent with no hosted access, every hosted number an
EXPECTATION); it is kept unedited so the expectations and the readings can be compared. Where a
reading corrected the draft, § RESULTS says so (step 4: the image build prints no bundle-gate counts;
step 10.3: the cash-set query named a column that does not exist).

RELEASE_SHA = **`ede1df83`** (`main`, merge of PR #954 / `integration/wave-2026-09-18`, 2026-09-19;
the `git rev-parse` full sha goes in `--build-arg CLARA_BUILD_SHA=<full>`). Label
`refresh-ede1df83`.

**Migration count — the arithmetic, stated before the window rather than during it.**
`git ls-tree -r --name-only HEAD -- packages/db/migrations/ | wc -l` = **228** files on
`ede1df83` (max version `0233`; the five pre-existing gaps at 0032 and 0073–0076 are still there and
are why the file count and the version number differ). Hosted is at **219 / `0224_preview_invite`**
(`docs/PROGRESS.md` "Current State", the 2026-09-17 ceremony's own ledger re-read). So the migrate
step should report **`9 new migration(s) applied · 228 total`** — 228 is the FILE count
(`migrate.mjs`'s own counter), 0233 is only the highest version *number*. The integration branch
measured exactly this total twice from scratch (`reports/integration-merge.md` §3.1 and
`reports/integration-fix-2.md` §4.1: `228 new migration(s) applied · 228 total`, two virgin
clusters). Re-verify the arithmetic against whatever `main` and the hosted ledger actually are at
window time.

**Rollback points BEFORE** (from the ledger and `docs/PROGRESS.md`; re-read live at step 3):
DB **219 / `0224_preview_invite`**. Runtime image **`refresh-a296765c`** =
`registry.fly.io/clara-runtime@sha256:b67163f322ddaf0ea68a9aa20cab7d5c580337d667aebf4b167cd61ec8ce5a2b`
(measured boot `bodies=53`, pins `chatTurn_v20` / `claraWork_v4` / `clientOnboarding_v5`), single Fly
machine **`48ee715b763048`** — **never touched directly; exactly two calls all window, `stop` and
`start`**. Web **`095073c9-ecba-47ca-99de-ab3c8781deb2`** (tag `refresh-a296765c`, 100% since
2026-09-17 15:14:46Z).

**Secrets rule (unchanged from all three prior runbooks).** The fly token and the DSN are
substituted INLINE inside one pipeline only — never assigned to a shell variable, never echoed,
never in argv. Every `flyctl` below is shorthand for `FLY_API_TOKEN="$(grep -E '^access_token:'
~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>`; every `<probe dsn pipe>` is `flyctl ssh
console -a clara-runtime --machine <probe-id> -q -C "sh -c 'printf %s
\"\$WORKFLOW_POSTGRES_URL\"'" </dev/null 2>/dev/null | tr -d '\r\n' | node scripts/ops/dsn-pipe.mjs
-- <cmd>`. From Git Bash, a `wsl` argument that is a `/mnt/c` path needs `MSYS_NO_PATHCONV=1`, and
`wsl -- bash -c '…$VAR…'` expands `$VAR` in the OUTER shell — single-quote it. `fly ssh console`
has exited 1 with "The handle is invalid." after streaming on this Windows host: verify any
streamed artefact by sha256, never by exit code alone.

---

## 0. Rehearsal — a 0224 → 0233 REPLAY, which is not what the wave has already measured

The wave measured `0001 → 0233` from scratch, twice (`integration-merge.md` §3.1,
`integration-fix-2.md` §4.1). **That is not the run hosted will perform.** Hosted starts at an
applied 219 and replays nine files onto a chain with real rows in it. Two of the nine carry hazards
a virgin cluster structurally cannot reproduce:

- **0227's backfill.** `update clara.fa_depreciation_authorities set authority_from =
  clara._fa_month_start((signed_at at time zone 'Asia/Kuala_Lumpur')::date) where signed_at is not
  null and authority_from is null` runs with `t_fa_authorities_transition` DISABLED and is followed
  immediately by `ck_fa_authorities_window`, which demands a non-null `authority_from` on every
  `live`/`retired` row. A virgin cluster has zero authorities; hosted may have some. The file's own
  header says the MYT-vs-UTC month hazard "is a release-time read in the runbook and is never
  assumed zero" (its rig measured 157 signed rows, 0 divergent).
- **0228's census.** Its prestate refuses unless `clara.document_capabilities` holds exactly **240**
  rows at exactly **one** distinct `registry_version`. That is a statement about hosted DATA.

Plus 0225's two additive subledger arms (LADDER 3T and the item belt's second lawful source), which
a rig with no approved payable/receivable history exercises only against fixtures.

**The rehearsal to run, and it has not been run:** build a fresh cluster, point
`CLARA_MIGRATIONS_DIR` (`packages/db/README.md`, "Migration and deployment behavior") at a copy of
the `a296765c` tree's `packages/db/migrations/` truncated at `0224` (219 files) and run
`pnpm db:migrate` → expect `219 new migration(s) applied · 219 total`; `pnpm db:seed`; then re-point
`CLARA_MIGRATIONS_DIR` at the RELEASE_SHA tree's full directory (228 files) and run again — **this
second run is the rehearsal of record**: expect **`9 new migration(s) applied · 228 total`**, every
prestate printing `clean`/`OK` and every tail `OK`, and record the wall time as **T**. Use a port
that is not in live use. State in the rehearsal note that an empty, seeded-only cluster proves DDL
and guard logic, **not** the three row-shaped hazards above — those are answered only by step 3's
reads against hosted.

Preflight read-relations probe shape (unchanged): `packages/runtime/lib/rollback-preflight.mjs`'s
own relation list.

## 0a. Gates before any production step

- `main` = **`ede1df83`**, `ci` SUCCESS on that sha, build tree = RELEASE_SHA, `git status
  --porcelain` empty apart from this untracked plan directory. RELEASE_SHA is the sha that is
  actually on `main` at window time — never a literal written before.
- **Owner says go**, in-session, for this specific window. The 2026-09-17 ceremony cites the
  literal word "go"; this draft has none to cite and none may be assumed.
- **The beta ruling still holds** (#826, owner 2026-09-15, carried in `ARCHITECTURE.md` §5.F and in
  operator memory): hosted users and data are test data; a Work parked on a superseded body needs
  no preservation and may be cleared through the cancel gate. Confirm with the owner that this is
  still true before treating any parked run as disposable — it is the premise the whole
  stranded-body posture rests on.
- **No hard STOP of the #810 class this time.** That wave DELETED `chatTurn_v1`; this one deletes
  nothing. `reports/successors-final.md` §4: "**v1…v20 and v1…v4 stay imported, exported and
  rostered. No export removed, no roster entry removed**", `retired` is byte-identical, and
  `--compare-base origin/main` is **additions only** (296 retained · 16 added · 0 mutations · 3
  recorded retirements, 296 → 312). The boot census therefore cannot be refused by this cut for a
  body it dropped. The census is still read (step 3), because a run parked on a body that was
  ALREADY retired before this wave would still refuse the world.
- **DB RESTORE POINT** — see step 3f. Take it before the first hosted write; re-take it if the
  window opens more than ~2 h after the stamp. A restore returns no Storage bytes, no managed Auth
  config and no engine state (`packages/db/README.md`, "Backup and recovery").
- **Web rollback lever** (one command, no DB implication): `pnpm --dir apps/web exec wrangler
  versions list` → confirm the active version is `095073c9-ecba-47ca-99de-ab3c8781deb2` at 100% →
  `pnpm --dir apps/web exec wrangler versions deploy
  095073c9-ecba-47ca-99de-ab3c8781deb2@100% --yes`.

## 1. fly auth — inline only

`FLY_API_TOKEN="$(grep -E '^access_token:' ~/.fly/config.yml | awk '{print $2}')" flyctl <cmd>` on
every call. Expected identity `tools@belcort.com` — re-run `flyctl auth whoami` at window start
rather than trusting memory.

## 2. Probe machine (OLD image, world off) — destroyed before step 7's deploy

```
… flyctl machine run registry.fly.io/clara-runtime:refresh-a296765c --app clara-runtime \
    --name probe-ede1df83 --region sin --vm-memory 512 \
    --env CLARA_START_WORLD=0 --env PORT=3200 --command "sleep infinity"   → <probe-id>
```

The probe is the DSN source for every read below and for the backup, and it is the only DSN source
once the live machine is stopped in step 6.

## 3. Read-only reads over the probe DSN

All of step 3 is **one script**: `ceremony/reads-0225-0233.mjs`, run as the child of
`scripts/ops/dsn-pipe.mjs`. It opens `begin transaction read only` and issues nothing but SELECTs —
no DDL, no DML, no `set role`, no advisory lock. Run it offline first (`--print-pins`, no database)
so the parse is proven before the window: it must report **75 pins · 13 bank anchors · 0 parse
gaps**.

```
<probe dsn pipe> node docs/plan/active/refresh-wave-2026-09-18/ceremony/reads-0225-0233.mjs --prod
```

3a. **Ledger.** `select count(*), max(version) from clara.schema_migrations` → expect **219 /
`0224_preview_invite`**; the checksums of the **last five** ledger rows re-derived from the files on
disk; then the full drift gate over all 219 applied rows. `migrate.mjs` aborts the whole run on one
checksum mismatch, so any drift here is a STOP before the window, not a surprise inside it. Expect
exactly nine pending files `0225…0233` and 228 files on disk.

3b. **Every prestate pin, hosted sha beside the pin PARSED FROM THE FILE.** The script reads the
expected value out of the migration text rather than carrying a transcription, so it cannot drift
from the files. **75 pins across the nine files**, which is the whole answer to "did a sibling recut
land on hosted that this tree does not know about":

| file | pins | what they are |
|---|---|---|
| 0225 | **8** | the **three recut targets** (`_record_journal_entry_core` — the sixth copy, `_subledger_classify_entry`, `_tf_subledger_item_belt`; DECISIONS §6.2.1 ratified three, not one) + five non-regressions incl. `_tf_subledger_entry_belt`, which is pinned precisely because it is **not** recut |
| 0226 | **7** | five recut targets (`list_bank_match_candidates`, `_agent_get_bank_pack_core`, `_match_bank_line_core`, `_agent_verify_inputs_digest`, `_agent_bank_receipt`) + two non-regressions (`match_bank_line/6`, `_wdb_line_booking_block`). Three of the five are NOT readable from any single file's text — `match_bank_line/6` was patched in place by 0040, `_match_bank_line_core` recut whole at 0121:1863, `_agent_bank_receipt` CoR-patched twice |
| 0227 | **13** | ten recut + three non-regression. **Two are 0042 STRING SPLICES** (`_fa_oldest_unmet_period`, `_fa_run_period_core`) applied with `replace()` over `pg_get_functiondef` — a `grep` for `create or replace function` finds neither and the file text is not the live body; the script also re-proves both carry `clara._wdb_rerun_breach(` |
| 0228 | **13** | recuts NOTHING; thirteen opening-lane bodies (five of them splices) pinned so the tail's "0228 recut nothing" is a measurement |
| 0229 | **12** | recuts NOTHING; four of the twelve are splices |
| 0230 | **8** | recuts NOTHING; `get_context_pack` is eleven generations deep and `answer_work_question` is a five-file splice |
| 0231 | **5** | recuts NOTHING; read-only dependencies, declared as `v_pin_*` constants |
| 0232 | **5** | recuts NOTHING |
| 0233 | **4** | ONE recut (`get_llm_usage_summary`) + three non-regressions |

3b(ii). **0226's thirteen CoR anchors.** The re-patch loop refuses by name if any of the thirteen
`_agent_*_core` bodies does not carry 0129's `perform clara._agent_verify_inputs_digest(<var>,
p_inputs_digest, p_op_key); -- H2, C2` call site **exactly once** — *"the core has DIVERGED from
0129's shape; STOP and report rather than patching"*. The script counts the anchor in each live
`prosrc`. (The **thirteen shas** in 0226's tail are POST-images, asserted after the patch; they are
deliberately not compared here.)

3c. **File-declared prestate facts that are about hosted DATA or hosted CATALOG SHAPE.** These are
the refusals a pin census cannot see, read one by one against hosted: 0225's subledger-hook caller
census (exactly the six 0216 measured) and `open_items` writer census (exactly
`{_subledger_on_approve}`), `t_je_subledger_belt` still DEFERRABLE INITIALLY DEFERRED, both purpose
CHECKs at 0194's three-valued text; 0227's `_fa_run_period_core` caller count = 3 and `close_prep`
still disabled; **0228's 240 registry rows at exactly one distinct `registry_version`**; 0229's
`uq_accounting_work_id_firm_client`; 0230's "zero non-runtime roles hold EXECUTE on
`get_knowledge_pack`" (#783 must not have been re-litigated on hosted); 0231's two installed names
still free and its three ordered paths present; 0232's `journal_entries.close_receipt_id`,
`clara.book_today()` free and `clara._book_today()` still closed to `clara_authenticated`; 0233's
`firm_document_limits` SELECT grant and the three new doors absent.

3d. **Pre-images of every body this wave recuts** — 34 names: 0225's three, 0226's five plus the
thirteen re-patched cores plus its two non-regressions, 0227's ten, 0233's one. `pg_get_functiondef`
of each to scratchpad `pre-images/` with an `INDEX.txt` of sha256 per body
(`--pre-images <dir>`). This is the rollback record; nothing in this wave drafts a
below-frontier successor migration.

3e. **0226's one destructive signature change.** `clara._agent_verify_inputs_digest` overloads on
hosted: expect exactly one row, at `(uuid,text,text)`. 0226 DROPs that form (after re-checking its
sha) and creates `(uuid,text,uuid)`.

3f. **DB RESTORE POINT — the full dump, through the probe DSN into WSL.** `backup.mjs --profile
full` (`pg_dump` 17.11 lives in WSL; Windows has none), ~50–100 s and ~215 MB observed in the last
two ceremonies. **The CA-path workaround the 2026-09-17 ceremony recorded is still required and
still unfixed:** `scripts/ops/dsn-pipe.mjs` pins `sslrootcert=<CA>` onto the DSN itself with the
WINDOWS spelling of `ops/tls/pooler-ca.crt`, which a WSL child cannot open (`ENOENT`). There is no
`--child-os wsl` spelling in `dsn-pipe.mjs` on `ede1df83` (checked) — the follow-up was filed and
not implemented. So the dump runs under the same small WSL wrapper: it respells **only that one
pin** to `/mnt/c/…` (same committed CA, `verify-full` kept, DSN env-only, never printed), with

```
export WSLENV='PGHOST:PGPORT:PGUSER:PGPASSWORD:PGDATABASE:PGSSLMODE:PGSSLROOTCERT/p:CLARA_BACKUP_DIR/p'
```

(no `DATABASE_URL` in `WSLENV`) and `NODE_EXTRA_CA_CERTS=/mnt/c/Users/zhant/Desktop/clara-rebuild/ops/tls/pooler-ca.crt`.
Record the artefact path and byte count; copy off-machine if the window is delayed.

3g. Keep the probe alive through the end of step 6 (the live machine is stopped during the
migration, so the probe is the only DSN source then); destroy it at the end of step 6, **before**
step 7's deploy.

## W. Deploy order, decided from the headers

**ORDINARY ORDER for all nine: database first, then the runtime image, then the web promotion.**
Not assumed — derived:

- **No file in this wave claims an inversion — and that is a measurement, not an inference.**
  `grep -niE 'deploy order|consumer-first|consumer order|runtime-first|writer[ -]quiescence|quiesce'`
  over `0225…0233` returns **zero** hits in all nine files. The phrase lives in exactly two places
  in this estate: `packages/db/migrations/0178_accounting_work_journal_successor.sql`'s own header
  (which says it owes **none**, and why) and `packages/db/README.md` (which carries the inverting
  case, `0177_classify_after_extraction` — it requires the extraction-aware `facts_gate` consumer
  deployed before the migration, and the README says the hosted rollout "applied it in that
  consumer-first order inside the quiescence window" (that exact sentence, not the paraphrase this
  draft's first pass wrongly quoted) — and the no-obligation paragraphs for 0214,
  0222 and 0231). **ARCHITECTURE §5.F is what makes silence readable**: *"部分迁移会**倒转**默认顺序
  （先部署 consumer 再迁移），该义务写在迁移文件头部"* — the obligation is written in the file's header,
  so a header that does not carry one does not owe one. What still applies to all nine is the
  general rule in `packages/db/README.md`: *"Before deploying a change to an active writer body,
  stop new writes and drain in-flight calls, apply the migration, then resume."*
- **The positive statement is in the runtime's own README**, written by the cut that consumes these
  doors (`packages/runtime/README.md`, "The two pins the wave 2026-09-18 cut moved"):
  `chatTurn_v21` — *"Deploy 0225, 0227 and 0230 first"*; `claraWork_v5` — *"**Deploy 0230 first —
  without it EVERY Work stops, which is the correct failure for a deploy-order mistake.**"* The
  v21 tools call doors that **0225 creates** (`clara.admit_trade_invoice_work`, nine arguments),
  **0227 creates** (`clara.run_depreciation_period_for(uuid,date,text,uuid)` — a NEW verb name) and
  **0230 creates** (`clara.retrieve_knowledge`; plus v5's `record_work_knowledge_read`,
  `work_knowledge_drift_for`, `read_knowledge_record_for`, `read_knowledge_history_for`).
- **What a missing migration looks like to the model, measured rather than imagined.** A door that
  is not there is **42883** — `integration-fix-2.md` §2 caught exactly that shape on its red chain
  (`error: 'function "clara.book_today()" does not exist'   code: '42883'`), and
  `successors-final.md` §7.1.3 leg 3 records the other side: the depreciation tool *reaching* its
  `clara_runtime`-only door "is the grant measured rather than assumed". On the chat lane a 42883 is
  a typed refusal and the turn survives; **on the Work lane it is TERMINAL** — v5's knowledge
  preload is a required step and any failed read settles `knowledge_read_failed` (failed/internal,
  recoverable, nothing posted; DECISIONS §6.2.0 R-D made that all-or-nothing deliberately). That is
  why 0230 cannot trail the image.
- **The reverse direction is free for all nine**, which is what makes DB-first safe: every new door
  is either `clara_runtime`-only with no deployed caller (0225's admission door, 0227's OBO run
  door, 0230's five runtime doors) or `clara_authenticated`-only with a browser consumer that ships
  in the SAME web version (0226's two reads, 0229's four doors, 0231's two, 0232's three, 0233's
  three). 0228 recuts nothing and only republishes a registry version the deployed image never
  writes.
- **The one order-shaped risk that is not one: 0229's reconciler belt.** `lib/reconciler.mjs`'s new
  `belt("intake batch cancellations", …)` feature-probes with `to_regprocedure`, so the NEW image
  tolerates a pre-0229 database (it reports `batchOk:false` and the sweep behind it completes —
  that containment was DECISIONS §6.3 §5.2's ruling and integration fix round 1's change), and the
  OLD image has no such belt at all. Order-free in both directions.
- **The one behaviour that changes under the ALREADY-DEPLOYED image: 0233's admin floor** on
  `clara.get_llm_usage_summary`. Its header measured **zero** callers in `apps/web` and
  `packages/runtime`, so nothing in the tree breaks; the hosted estate could hold an out-of-repo
  PostgREST consumer, and 0233's header routes that explicitly to the owner (step 10.6).

**The quiescence window covers the whole nine-file run**, one `migrate.mjs` invocation, exactly as
both prior ceremonies did — splitting it per file buys nothing and adds risk. What it is buying,
named:

| file | why it rides the window |
|---|---|
| 0225 | three live-body recuts **and** `create constraint trigger t_je_open_item_birth` on `clara.journal_entries` + `create trigger t_operation_receipts_trade_invoice_posted` on `clara.operation_receipts` — `CREATE TRIGGER` takes a lock class that conflicts with the `ROW EXCLUSIVE` an INSERT holds |
| 0226 | five live-body recuts + thirteen `_agent_*_core` bodies re-patched in place + a DROP/CREATE of `_agent_verify_inputs_digest` |
| 0227 | ten live-body recuts, `alter table clara.fixed_assets` ×3 (2 `add column` + 1 `add constraint … check`), `alter table clara.fa_depreciation_authorities` ×4 (3 `add column` + 1 `add constraint … check`, all ACCESS EXCLUSIVE), plus a separate trigger disable → backfill `UPDATE` → re-enable on the same table |
| 0228 | `update clara.document_capabilities set registry_version = registry_version + 1` over 240 rows, under 0207's monotonicity trigger |
| 0229 | `create trigger t_document_intakes_batch_member_stamp` on `clara.document_intakes` and `t_accounting_work_batch_member_stamp` on `clara.accounting_work` — both live tables |
| 0230/0231/0232 | new relations and read doors only (0232 also seeds one `event_types` + one `trigger_taxonomy` row) — no live-table lock, but they ride the same window for free |
| 0233 | one live-body recut (`get_llm_usage_summary`) |

**NO FILE IN THIS WAVE SETS A `lock_timeout` OR A `statement_timeout`** (checked: zero hits across
all nine), and `migrate.mjs` sets none either — `packages/db/scripts/migrate.mjs:286-295` states in
its own comment that the runner "arms no `statement_timeout`, `lock_timeout` or query deadline on
this client", deliberately, because the F10 advisory wait must be unbounded. **So a blocked
`CREATE TRIGGER` or `ALTER TABLE` waits on the server default, which is unset on the pooler as far
as is known.** Step 6b's `pg_locks` read on the twelve affected tables is the only guard; if one
blocks, `pg_cancel_backend` the blocker, **never** the migration.

## 4. Runtime image first (build-only + push, by digest)

```
… flyctl deploy --config packages/runtime/fly.toml --build-only --push \
    --image-label refresh-ede1df83 --build-arg CLARA_BUILD_SHA=<full sha of ede1df83>
```

(~5 min) → record the `sha256:` digest; **release by
`registry.fly.io/clara-runtime@sha256:<digest>` in step 7**, never by tag. Expect the bundle gate at
build time to report **`12 pinned class(es) … 55 superseded body(ies) still ship for parked runs,
chatTurn pinned at v21 with its step directive, engine stamp and freeform_result emitter (40
checks)`** and the freeze-lint to report **312 frozen files · 55 "use workflow" modules · 3 retired**
(`successors-final.md` §6). Nothing built here is released until step 7.

## 5. Web build + upload (WSL as root) — this release DOES ship a new web build

Mechanism unchanged from the 2026-09-17 runbook step 5: detached checkout at RELEASE_SHA in
`/home/runner/clara-deploy`, `corepack pnpm install --frozen-lockfile`, the two
`NEXT_PUBLIC_SUPABASE_*` vars exported from `apps/web/.env.local`, `CLARA_BUILD_SHA=<full sha>
corepack pnpm --filter @clara/web cf:build`, then `corepack pnpm --dir apps/web exec wrangler
versions upload --tag refresh-ede1df83` → record the Worker Version ID. **Not promoted until step
8.** All ten tickets carry `apps/web` changes that assume their own migrations are live (Firm Home's
portfolio board, the client-home cash/profit dashboard, the bank Matching tab, trade invoices, the
five-tab asset detail, intake batch cards, the opening source panels, firm settings' legal/plan/
usage cards, knowledge retrieval faces, and #642's chat-stream work), which is why web is promoted
LAST.

## 6. Writer quiescence → migrate (all 9 files, one run)

6a. `flyctl machine stop 48ee715b763048` → confirm `stopped`. Chat and Clara return 502
`runtime_unreachable` during the window; the rest of the app works.

6b. Re-run the census through the probe (`reads-0225-0233.mjs --census --prod`). It must come back
CLEAN, and specifically: no `clara_authenticated` writer holding a lock on any of
`clara.journal_entries`, `clara.journal_lines`, `clara.operation_receipts`, `clara.open_items`,
`clara.accounting_work`, `clara.document_intakes`, `clara.document_capabilities`,
`clara.fixed_assets`, `clara.fa_depreciation_authorities`, `clara.bank_agent_receipts`,
`clara.bank_statement_lines`, `clara.knowledge_records`. The web app talks to PostgREST directly and
can still hold a lock while the runtime is down — this read is what makes the window real rather
than nominal. Also: **no holder of the F10 advisory lock** (`classid 439041101`, `objid 794746`), or
the migrate step hangs silently.

6c. From the RELEASE_SHA checkout:

```
(cd packages/db && <probe dsn pipe> | node ../../scripts/ops/dsn-pipe.mjs -- node scripts/migrate.mjs)
```

→ expect **`migrate: 9 new migration(s) applied · 228 total`**. Expected wall ≈ T (step 0) plus
pooler latency; the 2026-09-17 run took 99 s for 26 files through the ssh hop, so nine files should
be well under that. **Do not kill it.** If it passes ~10× T without returning, read
`pg_stat_activity` on a second connection and decide from the ledger.

**Expected notices, per file, in order** (each file's own prestate and tail; the full text is in the
migration and in the as-run log, these are the lines to look for):

| file | prestate | tail |
|---|---|---|
| 0225 | `#655 prestate:` clean (8 pins, the six-caller subledger census, the one-writer `open_items` census, both 0194 purpose CHECKs, `t_je_subledger_belt` deferrable) | `#655 tail OK (1/6)` … `(6/6)` — incl. *"the open_items writer census is now TWO (was 0037's ONE)"* and *"`t_je_open_item_birth` is a deferred constraint trigger sorting before `t_je_subledger_belt`"* |
| 0226 | `#657 prestate:` 5 recut + 2 non-regression pins, the ungranted-block check | `#657 C33.8: all 13 rostered _agent_*_core bodies now bind a TYPED task`; `#657 C33.8: clara._agent_bank_receipt now writes bank_agent_receipts.wake_task_id`; `#657 tail: OK — …` |
| 0227 | `#651 prestate: clean -- … the TEN recut bodies and the three non-regression bodies are at their measured pre-images; both 0042 splices are live; _fa_run_period_core has exactly three callers; close_prep is still disabled.` | `#651 tail: the classification columns and their CHECK are in place; the authority window is backfilled and CHECKed; … the authority transition trigger is enabled with its graph intact; and close_prep is still disabled.` |
| 0228 | `#656 prestate: OK -- 13 opening-lane bodies at their measured shas, 240 registry rows at one distinct registry_version = 1, 0207's monotone wall installed, both corrected kinds still stored_only.` | `#656 tail: OK -- clara.document_capabilities republished at registry_version 2 across all 240 rows by UPDATE (never DELETE-then-INSERT, #846), under 0207's monotone wall. …` |
| 0229 | `#636 prestate:` the twelve non-regression pins + the tenant-carrying composite | `#636 tail OK (1/6)` … `(6/6)` — incl. *"the twelve non-regression bodies are byte-identical — 0229 recuts nothing"* |
| 0230 | `#658 prestate: clean -- none of the eight function names and no work_knowledge_reads relation exists; no non-runtime role holds EXECUTE on get_knowledge_pack (#783 base state); the eight non-regression bodies are at their measured pre-0230 sha256; the CORE tier enumerates N key(s).` | `#658 tail: OK -- SEVEN granted functions … the EIGHT non-regression bodies are byte-identical …` |
| 0231 | `#659 prestate: clean -- the five read-only dependencies are at their pinned bodies, clara.clients admits onboarding/archived, the ordered paths exist, and neither name this file installs is taken.` | `#659 tail: OK -- … Zero relations, columns, policies, triggers or indexes were created and NOTHING was recut` |
| 0232 | `#660 prestate: clean -- … clara.book_today() is not taken, clara._book_today() exists with its ACL still closed to clara_authenticated, and all five read-only dependency bodies are at their pinned (measured) bodies.` | `#660 tail: OK -- three doors plus the book-day delegate exist exactly once each … BOTH reads take their money as-of from the delegate …` |
| 0233 | `#635 prestate: clean -- the three new doors do not exist; … and get_llm_usage_summary (the one recut), get_current_legal_documents, accept_legal_document and _accounting_work_egress_live are at their measured pre-0233 bodies.` | `#635 tail: OK -- … clara.get_llm_usage_summary has been recut with the admin floor as its FIRST statement, ahead of an intact CLR11 firm wall …` |

6d. **FAILURE BRANCHES — decided from the LEDGER, never from which prestate spoke.** One
transaction per migration and `migrate.mjs` stops at the first failure, so **a refusal leaves NO
partial state** — the file that raised is rolled back whole and the ledger's `max(version)` is the
definite frontier. Re-read `select count(*), max(version) from clara.schema_migrations` and decide:

- **A PRESTATE PIN REFUSED → hosted drift. STOP.** The message names the body, the expected sha and
  the found sha. It means a body this tree believes it measured has moved on hosted since — which
  no step of this ceremony can repair, because the recut below the refusal was derived from the
  exact text the pin names. Report to the owner with the body name and both shas; do not re-pin, do
  not edit the migration (applied bytes are immutable and these are not applied yet, but editing a
  file to make it apply is how a wave loses its own evidence). Step 3b exists so this is discovered
  **before** the window, against a running estate, not inside it.
  - **0225** — a drift on any of its **three recut bodies** (`_record_journal_entry_core`,
    `_subledger_classify_entry`, `_tf_subledger_item_belt`) means the sixth posting-core copy and
    the two additive ladders would silently fork whatever is actually live. A drift on
    `_tf_subledger_entry_belt` (pinned, not recut) means the belt's ARM 1 text that 0225's whole
    design rests on has moved.
  - **0226** — the bank family. Five pins, plus **the thirteen re-patched cores**: a core that does
    not carry 0129's anchor exactly once refuses with *"the core has DIVERGED from 0129's shape;
    STOP and report rather than patching"*. Three of the five pinned bodies are demonstrably not
    their creating file's text (0040's in-place patch, 0121's whole recut, 0134's second CoR), so a
    drift here is a genuine finding, never a transcription error.
  - **0227** — the FA family. Ten recut pins incl. **the two 0042 string splices**
    (`_fa_oldest_unmet_period`, `_fa_run_period_core`), plus the separate probe that both live
    bodies still carry `clara._wdb_rerun_breach(`. A splice that has moved means this file's own
    `replace()` would produce something nobody measured.
  - **0233** — `get_llm_usage_summary` at its pre-image. It is the one body this file recuts; a
    drift means somebody has already floored (or otherwise moved) the door on hosted.
- **A DATA PRESTATE REFUSED.** Three can fire on hosted rows rather than on catalog shape, and all
  three are read in step 3c so they never first appear here:
  - **0228** — registry row count ≠ 240, or more than one distinct `registry_version`.
  - **0227** — `ck_fa_authorities_window` after the backfill: a `live`/`retired`
    `fa_depreciation_authorities` row with `signed_at` NULL is skipped by the backfill and then
    refused by the CHECK, as a raw 23514. Pre-0227 `retire_depreciation_authority` coalesces
    `signed_at` on retirement, so this should be zero — **read it, don't assume it** (step 10.2).
  - **0225** — the subledger-hook caller census (six) or the `open_items` writer census (one).
- **Ledger-position branches.** (i) `max(version)` < `0225` → nothing of this wave landed; the
  deployed image `refresh-a296765c` is a legal boot target — `machine start`, report, stop, and do
  **not** promote web. (ii) `0225`–`0232` committed, the next did not → `refresh-a296765c` still
  boots (it predates every new pin requirement, and the one `FRONTIER_BODY_RULES` entry at `0195`
  requires only `claraWork_v3`, which it carries), but the new web build assumes all nine — **hold
  web at `095073c9-…`**, start the old image, report. (iii) all nine committed, ledger reads **228 /
  `0233_firm_commercial_settings`** → drive forward to steps 7–8.
- **A `55P03 lock_not_available` / an indefinite wait** on any `CREATE TRIGGER` or `ALTER TABLE`
  (0225, 0227, 0229): there is no `lock_timeout` anywhere in this chain, so it WAITS rather than
  failing. Find the blocker in `pg_locks`, `pg_cancel_backend` it, and re-run step 6c from the
  ledger's current frontier.

## 7. Release the runtime (by digest) and start

Destroy the probe first (`flyctl machine destroy <probe-id> --force`), then:

```
… flyctl machine list -a clara-runtime                                   # exactly one machine
… flyctl deploy --config packages/runtime/fly.toml --image registry.fly.io/clara-runtime@sha256:<digest>
… flyctl machine start 48ee715b763048                                     # a deploy onto a STOPPED machine leaves it stopped
… flyctl machine list -a clara-runtime                                    # one machine, new image
```

`fly deploy` does not start a stopped machine, and the 2026-09-17 run lost ~8 minutes to a transient
`replacing` state defeating a scripted start-if-stopped — start it by hand and watch. Wait `/ready`
200, then `flyctl logs`.

**Expected boot lines:**

```
serving git_sha=<full sha> frontier=0233_firm_commercial_settings(228) bodies=55 pins … \
        chatTurn=chatTurn_v21 claraWork=claraWork_v5 clientOnboarding=clientOnboarding_v5
stranded bodies n=0            ← BEFORE `durable world started`; that order is the law
durable world started
clara-work/v1  clara-work/v2  clara-work/v3  clara-work/v4  clara-work/v5     ← FIVE bundle banners
CONTROL listening
LEADER acquired
```

- **`bodies=55`** is read off `packages/runtime/workflows/registry.ts` (`workflowBodies`, counted:
  55 entries, `chatTurn_v2…v21`, `claraWork_v1…v5`, the rest unchanged) and matches
  `successors-final.md` §4's measured boot line. The previous image reported 53.
- **FIVE claraWork bundle banners, and the fifth is new for a reason.** `plugins/startWorld.ts`
  emitted a banner per retained claraWork body and **stopped at v4**; the missing v5 line silently
  failed seven work-lane World legs before `5f2dfded` added it (`successors-final.md` §7.1). If the
  v5 banner is absent on hosted, the image is not the one that was tested.
- **`stranded bodies n=0`.** This cut removed no export, so the only way this is non-zero is a run
  parked on a body retired BEFORE this wave. Step 3's census answers it in advance.
- Signed-in `GET /api/build-info`: `git_sha` = the full sha, `frontier` `0233_firm_commercial_settings(228)`,
  `bodies: 55`, pins `chatTurn_v21` / `claraWork_v5` / `clientOnboarding_v5`.
- **The two-build cutover is already proven on this chain** (`integration-fix-2.md` §4.4): both
  successor pairs drilled on a fresh cluster at `frontier=0233_firm_commercial_settings(228)` — W1
  completed on `claraWork_v4` *inside* build B, C1's clarification completed on `chatTurn_v20`
  inside build B, and the preflight refused a target missing a parked body by name. That is local
  evidence, not hosted.

## 8. Promote web + smoke

`pnpm --dir apps/web exec wrangler versions view <id>` (six secrets, `ASSETS` + four bindings) →
`pnpm --dir apps/web exec wrangler versions deploy <id>@100% --yes`.

**Signed out** (`https://app.clarabook.com`), the same roster as both prior ceremonies: `/login`,
`/favicon.ico`, `/icon.png` 200; `/pending`, `/api/build-info`, `/checkout/cancel` 307→`/login?next=…`;
`/settings/registrations`, `/admin/registrations` 307→`/operator`; cross-origin POST
`/auth/confirm/resend` 403.

**Signed in, through the owner's browser, read-only — nothing clicked that writes.** One surface per
ticket:

| # | surface | what to see |
|---|---|---|
| #659 | `/` (Firm Home) | the portfolio table renders from `get_firm_portfolio_pack`; the needs-you band; a compliance-watch disposition. The `work_question` deep link is deliberately withdrawn (R-E) |
| #660 | `/clients/<id>` | the cash and profit dashboard: period selector, the six-month series, the drilldown; the Asia/Kuala_Lumpur calendar stated on the face; any coverage disclosure shown rather than hidden |
| #635 | `/settings/firm` | legal standing, the commercial card (**"Beta, not yet priced" — not RM 0.00**, D1) and the AI-usage card. Admin rank required; a viewer must not see the commercial/usage halves |
| #636 | `/clients/<id>/documents` | the intake batch card; Cancel reachable; EN copy reads **"Stopping"** (R-C) |
| #642 | `/clara` or `/clients/<id>/clara` | a chat turn admits (202), live tool state renders, transcript scroll behaves, a revocation shows as `revoked` rather than "Reconnecting…" |
| #651 | `/clients/<id>/registers/assets/<assetId>` | the five-tab strip in its ruled order: Particulars & policy → **Policy & effective revisions** → Schedule → … → History |
| #655 | `/clients/<id>/accounting/invoices` (+ `/new`) | a trade invoice / supplier bill and its open item; money rendered as `RM 1,060.00`, never raw sen |
| #656 | `/clients/<id>/registers` | the opening source header, the tied-seed dialog and the target document panel |
| #657 | `/clients/<id>/bank` | the Matching tab: candidates carrying the counterparty NAME, the deterministic `candidate_basis` (never a score), the "no new journal entry" statement |
| #658 | `/clients/<id>/knowledge` and `/settings/knowledge` | the retrieval faces and the recorded read-set; a read that did not succeed says so rather than reading as "nothing recorded" |

## 9. Rollback-preflight demonstration (READ ONLY — do NOT roll back)

Run **immediately after step 7**, before real traffic can create a run on a new body:

```
node packages/runtime/scripts/rollback-preflight.mjs --target-bundle <extracted v-previous index.mjs>
```

through the LIVE machine's DSN (or `--target-build-info -` against the previous image's own answer).
Extract the previous bundle from a SECOND old-image probe, not from the live machine. **Two separate
gates, and say which is being demonstrated:**

(a) **`FRONTIER_BODY_RULES`.** The only rule is still `0195` requiring `claraWork_v3`, which
`refresh-a296765c` carries — so it **passes** this gate at the new frontier. A *positive control*,
recorded as such. (b) **The stranded-body census.** `refresh-a296765c` does not carry
`chatTurn_v21` or `claraWork_v5`. It is a legal rollback target only until the first non-terminal
run of either exists — **so gate (b)'s clean result is a snapshot, not a standing guarantee**, and
it degrades within minutes of the image serving. Exit 0 = allowed, 1 = REFUSED with the body names,
2 = could not answer; the last two are deliberately distinct.

**Nothing in this wave drafts a below-frontier database rollback.** Rolling the DB below `0225`
(the posting-core recut), `0226` (the thirteen re-patched cores), `0227` (the backfill and its
CHECK) or `0233` (the admin floor) has no successor migration anywhere in this tree — the only
route is the step-3f dump, which returns no Storage bytes, no managed Auth config and no engine
state. If a below-frontier rollback is ever wanted, it must be drafted **before** a window, never
during an incident.

## 10. The reads this wave owes on hosted, after the release

Run `ceremony/reads-0225-0233.mjs --post --prod` through the live machine's DSN. It issues the same
SQL step 3 issued, so the "pre" and "post" readings sit side by side.

1. **#660 — the unmarked closing-transfer population.** 0232's own detector, estate-wide: approved
   entries with `closing_transfer = false` that carry their own `close_receipt_id`, or a
   `reversal_of` naming an entry that does. `packages/db/README.md`'s KNOWN COVERAGE LIMIT says in
   as many words that *"the affected hosted row count is a release-time read, not an assumption"*.
   Report the count and the number of distinct clients; a non-zero count means those clients' P&L
   coverage reads `partial` with `closing_transfer_unmarked_history`, which is disclosure working,
   not a defect.
2. **#651 — how many `fa_depreciation_authorities` rows the `authority_from` backfill stamped**, by
   status, plus the two numbers the file's own header asks for: the rows where the MYT and UTC month
   differ (its rig measured 157 signed / 0 divergent) and — the one that could have aborted the
   migration — `live`/`retired` rows with `signed_at` NULL, which must be zero.
3. **#660's D1 — does any client have a published cash account set?** The ruling (SYNTHESIS D1,
   restated as binding in `brief-660.md` D19.a) is that **a human, never the code, decides which
   accounts are cash**: there is no structural marker for petty cash and
   `0121_f_a3_pr1b_agent_limb.sql:4749` is house law — *"no name or code heuristic, ever — structure
   and declared facts only"*. So until somebody publishes a set, the dashboard's cash arm has
   nothing to draw, and that is correct rather than broken. `clara.cash_account_set_versions` does
   not exist before 0232, so the "pre" reading is its absence; after, read versions, distinct
   clients and current versions. If it is zero, say so plainly in the evidence comment — and tell
   the owner, because the empty state is what every firm will see on the new client home until the
   first publish.
4. **0228 — `clara.document_capabilities.registry_version` must read 2 everywhere.** 240 rows, one
   distinct version, value 2. Anything else means the republication did not land uniformly, and
   0207's monotonicity trigger makes a partial republication unrepairable by re-running.
5. **#847's carry — the `clara.work_execution_traces` run-id census.** `claraWork_v5` now drops a
   whole trace row whose run id 0210's grammar would refuse (`boundedRunId`, via
   `lib/work-trace-bounds.mjs`), so the hosted shape decides whether that can ever fire: total rows,
   distinct run ids, how many take the `^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$` arm, and how many
   would be refused (13+ consecutive digits without that arm — expected **0**). Also the
   `registry_version` values already stored, since v5 stamps `clara-capability-registry/v2`. This is
   the census #682 already carries as a next step.
6. **The owner question: out-of-repo callers of `clara.get_llm_usage_summary`.** 0233 recut it to
   put an **admin rank floor as its first statement**; before this release a *viewer* could read the
   firm's entire model spend, and that was measured on the rig. The header measured zero callers in
   `apps/web` and `packages/runtime`, and says the hosted estate "could in principle hold an
   out-of-repo consumer; that question goes to the owner in the wave report rather than deferring
   the recut". The database cannot see a PostgREST caller, so what the script reports is what is
   knowable: in-catalog callers, the door's ACL (unchanged by a body floor, and 0233's tail asserts
   it is byte-identical), and `pg_stat_user_functions` call counts if `track_functions` is on.
   **Ask the owner directly: does anything outside this repository call
   `clara.get_llm_usage_summary` with a non-admin identity?** If yes, it breaks at this release and
   the answer is a wrapper for that consumer, not an un-flooring of the door.

Also re-read the ledger (**228 / `0233_firm_commercial_settings`**), the stranded-body census and
the quiescence census one more time, and record them.

## 11. Lock the frozen manifest, then close the tickets

11a. `node scripts/check-frozen-workflows.mjs --lock-deployed` — the manifest's newly-deployed
entries become deploy-locked. Expect the **16 additions** from this cut
(`chatTurn.v21.{ts,impl,prompt,tools,usage}.ts`, `claraWork.v5.{ts,impl,prompt,tools,errors,bundle}.ts`,
`lib/trade-invoice-basis.ts`, `lib/depreciation-run.ts`, `lib/knowledge-retrieval.mjs`,
`lib/capability-registry-v2.mjs`, `lib/work-trace-bounds.mjs`) to be the unlocked set; confirm that
before running, since the command locks every unlocked entry. Then plain freeze-lint (312 frozen
files, 55 modules, 3 retired). Commit with this as-run; note in PROGRESS that `main`'s tip then
differs from the deployed image's `git_sha` by this one docs/manifest commit.

11b. **Ticket closures with hosted evidence.** Ten tickets, all currently open, all carrying
*"Hosted evidence is pending on all ten tickets"* in `reports/WAVE-DIGEST.md` §5. The descriptions
below are that report's own section headings, **not** the GitHub titles — read each ticket's real
title with `gh issue view <n>` before commenting:

| # | `WAVE-DIGEST.md` §5's description | Migration |
|---|---|---|
| #655 | trade invoices, the sixth posting-core copy, and the due-date basis | 0225 |
| #657 | match bank evidence to an already-approved booking | 0226 |
| #651 | fixed-asset classification, locked-period wall and depreciation authority window | 0227 |
| #656 | opening basis with a document source, provenance, and the registry republication | 0228 |
| #636 | the durable intake batch | 0229 |
| #658 | knowledge retrieval, the recorded read-set and the drift detector | 0230 |
| #659 | firm home: portfolio, needs-you and compliance-watch disposition | 0231 |
| #660 | client-home cash and profit dashboard | 0232 |
| #635 | firm settings shows the firm's real legal, commercial and usage state | 0233 |
| #642 | chat-stream admission, live tool state, transcript scroll and revocation | none (no migration) |

Comment shape, unchanged from the three prior ceremonies: *"Hosted release evidence — `<migration>`
(`<date>`, release session)"*, carrying the migration's own `applied_at` from the ledger, its
prestate/tail notice text, and — where the AC named a hosted behaviour — the specific reading step
7/8/10 produced. Ending: *"Closing per the awaiting-release rule: local and CI evidence in the lane
comment above, hosted evidence here."*

**Four tickets need one extra sentence each, so the comment does not imply more than shipped:**
**#655** — the chat arm closes at this release (it is `chatTurn_v21`'s `start_trade_invoice_work`),
but the same-document-number duplicate is measured-and-named as NOT probed. **#658** — the Work-lane
behaviour and the replan close at the v5 cut; the per-tier failure isolation is deferred by
DECISIONS §6.2.0 R-D and the durable per-inspection-read row is a ratified follow-up, not shipped.
**#656** — Work-and-receipt is descoped (residual R1) and `prior_gl.business_operation` stays
`stored_only`; `read_opening_source` belongs to a FUTURE `chatTurn_vN` and was not cut this wave.
**#659** — the `work_question` deep link is withdrawn to its pre-#659 fall-through (R-E), with the
follow-up filed.

Then update `docs/PROGRESS.md` "Current State" with the new rollback points, the web rollback
command and the runtime/database asymmetry.

---

## What this draft could not verify

- **Everything hosted.** This agent has no hosted access by instruction. The frontier, the pin
  shas, the registry row count, the authority rows, the trace census and the machine/web ids are all
  taken from `docs/PROGRESS.md`, the 2026-09-17 as-run and the migration files — not read.
- **The 0224 → 0233 replay rehearsal (step 0) has not been run**, so **T is unmeasured**. The wave's
  two `0001 → 0233` chains (104 s each) are not a substitute.
- **`bodies=55`** is counted off `registry.ts` on `ede1df83` and corroborated by
  `successors-final.md` §4; the previous ceremony's draft guessed 54 and the real number was 53, so
  treat this as an expectation to check against the boot line, not a fact.
- **`ci` on `ede1df83`** — not checked from here. `integration-merge.md` and `integration-fix-2.md`
  report their own gates green at `13f2c76e`; the merge commit itself is a different sha.
- **Whether Supabase PITR is enabled** — asked in the 2026-09-14 runbook, still unanswered.
- **The out-of-repo `get_llm_usage_summary` consumer** — unknowable from the database; it is step
  10.6's owner question.
- **`integration-merge.md` §5.1's tier ruling landed as a fix**, and §5.2/§5.3 were ruled in
  DECISIONS §6.3 — but the runtime-suite red `637.pf: B3` was left standing by ruling
  (`integration-fix-2.md` §4.6: 18 `queued` `document_processing_tasks` on a shared rig, a
  cell-scoping question for #637's owner). Step 3's census reads that table on hosted so the same
  shape is not mistaken for a release defect.

---

## § RESULTS (as run)

**RUN 2026-09-19 22:40–22:50 MYT (14:40–14:50Z) by the wave's agent session, end to end, no failure branch taken.**
Every row below is a reading. As-run logs: the session scratchpad `release/` (`reh-phase2.log`,
`reads-hosted-pre.log`, `backup.log`, `image-build.log`, `web-build.log`, `census-6b.log`,
`migrate-hosted.log`, `deploy.log`, `boot-logs.log`, `rollback-preflight.log`,
`reads-hosted-post2.log`, `ledger-nine.log`, `census-post.log`).

Owner authorisation (the literal sentence, 2026-09-19 ~22:05 MYT, in-session, after asking whether
the runbook was the go-live deploy): **"如果合适and 一切都通过的话, 就直接去吧,不用问我."** The agent's stated
conditions for "everything passes": this runbook verified, the read-only preflight all MATCH, the
backup succeeded; any failure branch → STOP and report. All three held.

Build tree: `git rev-parse HEAD` = `ede1df83d38f4e6d79582352f89ca3ae642f2f15` = `origin/main`, `ci`
SUCCESS on that sha (lint, build, db-estate, db-live-gates, storage-policy-battery, render-drill,
db-split-partition-total) · `git status --porcelain` = only this untracked plan directory.

| Step | Reading |
|---|---|
| 0 rehearsal (0224 → 0233 replay, T) | Fresh cluster `rigreh` 127.0.0.1:55730 / `clara_reh` (0 `clara%` roles before). Phase 1 with `CLARA_MIGRATIONS_DIR` = a 219-file copy (`git diff --name-status a296765c ede1df83 -- packages/db/migrations` = nine `A`, nothing else, so the first 219 are byte-identical to the released tree): `219 new · 219 total`; seed 2 files. Phase 2, the rehearsal of record: **`9 new migration(s) applied · 228 total`, T = 2 s**, every prestate `clean`/`OK`, every tail `OK`. A seeded-only cluster proves DDL and guard logic, not the three row-shaped hazards; step 3 answered those on hosted. **Script finding:** a dry run of `ceremony/reads-0225-0233.mjs` on a second 0224-state cluster (`rigreh2` 55731) crashed — one soft `42P01` (no `workflow` schema on a rig) aborted the read-only transaction and every later read raised `25P02`; the `.catch` arms could not help. Fixed before the window: each read now runs under its own `SAVEPOINT` (lawful in a read-only transaction; writes nothing). Re-run: exit 0, 75/75, verdict CLEAN. |
| 1 auth (`fly auth whoami`) | `tools@belcort.com`; flyctl v0.4.103; one machine `48ee715b763048` started 2/2 on `sha256:b67163f3…` |
| 2 probe (id, image, created) | `d89547ea430228` (`probe-ede1df83`), `registry.fly.io/clara-runtime:refresh-a296765c`, sin, 512 MB, world off, created ~14:32Z; destroyed 14:44:43Z (before the deploy) |
| 3a ledger + last-five checksums + drift gate | 14:33:35Z, identity `postgres@2406:da18:…:5432`, db `postgres`, PG 17.6, 19 `clara%` roles (no wave file asserts a role count). **219 / `0224_preview_invite`**; last five checksums match; drift gate 219/219; exactly nine pending `0225…0233`; 228 files on disk |
| 3b the 75 prestate pins (match / drift / absent) | **75 match · 0 DRIFT · 0 ABSENT** |
| 3b(ii) 0226's 13 CoR anchors | 13/13 carry the 0129 call site exactly once |
| 3c file-declared data & catalog facts | all 16 `ok`: six subledger-hook callers; `open_items` writer set `{_subledger_on_approve}`; `t_je_subledger_belt` deferrable initially deferred; no `trade_invoices`; `_fa_run_period_core` 3 callers; `close_prep` disabled; both 0042 splices live; **240 registry rows at one `registry_version`**; `uq_accounting_work_id_firm_client` present; zero non-runtime EXECUTE on `get_knowledge_pack`; 0231's two names free; `close_receipt_id` present; `book_today()` free and `_book_today()` closed to `clara_authenticated`; `firm_document_limits` SELECT grant present; 0233's three doors absent |
| 3d pre-images (34 names → `pre-images/`) | 34 bodies + `INDEX.txt` written to scratch `release/pre-images/` (35 files) |
| 3e `_agent_verify_inputs_digest` overloads | exactly one, at `(uuid,text,text)` |
| 3f backup (path, bytes, wall, CA workaround used?) | `packages/db/backups/clara-clara-graphile-worker-workflow-workflow-drizzle-2026-09-19T14-37-11-128Z.sql` **216,868,575 bytes**, sha256 `888852de82555a46ea5360e0c8f4993c59f8e609c1013bc2ea155fa339b79678`, ends with pg_dump's `\unrestrict` trailer and carries the 0224 ledger row; globals `clara-globals-2026-09-19T14-38-16-009Z.sql` 12,177 bytes; 76 s wall incl. the ssh hop. CA workaround used: **yes** — WSL wrapper (scratch `release/backup-full.mjs`); `NODE_EXTRA_CA_CERTS` and `PGSSLROOTCERT` passed at launch through `env` with the `/mnt/c/…` spelling of the committed CA; `WSLENV` carried only the six PG identity/mode variables, never `DATABASE_URL`. The `--child-os wsl` follow-up is still unfiled |
| 4 image (tag → `sha256:` digest, bundle gate counts) | `registry.fly.io/clara-runtime:refresh-ede1df83` = **`sha256:2c6e7b4acf3b5126365ebb892b47f5c7af6d2e06d76dc1fa49975a3b5f0898ff`** (265 MB), `--build-arg CLARA_BUILD_SHA=ede1df83d38f4e6d79582352f89ca3ae642f2f15`. **Draft correction:** the Docker build runs `nitro build` only; it does not run the bundle gate or the freeze-lint, so those counts are not image-build output. They are `ci`'s (`build`, `lint` green on `ede1df83`) and step 11a's (312 / 55 / 3, below) |
| 5 web (Worker Version ID, tag, uploaded at) | **`c550d944-352c-46de-b6f8-cc44b1e52733`**, tag `refresh-ede1df83`, uploaded 14:40:43Z from the WSL checkout detached at `ede1df83` (porcelain empty; `check-public-key` accepted `legacy-anon-jwt`; 147 asset files); six secrets, `ASSETS` + four bindings, `CLARA_PUBLIC_ORIGINS=https://app.clarabook.com` |
| 6a stop (`48ee715b763048`, timestamp) | stopped **14:43:03Z**, state `stopped` confirmed 14:43:13Z |
| 6b re-census (locks on the twelve tables, F10) | CLEAN — identical to step 3 except the twelve `clara_runtime_login` sessions are gone; no lock on any of the twelve tables; no F10 holder; non-terminal `workflow_runs` 0 |
| 6c migrate (`9 new · 228 total`? wall, per-file notices, ledger re-read) | **`migrate: 9 new migration(s) applied · 228 total`**, 14:43:47Z → 14:44:29Z (42 s wall incl. the ssh hop; every file on backend pid 2811395); every prestate `clean`/`OK`, every tail `OK`. Ledger `applied_at`: 0225 14:43:55Z · 0226 14:43:59Z · 0227 14:44:03Z · 0228 14:44:07Z · 0229 14:44:11Z · 0230 14:44:15Z · 0231 14:44:19Z · 0232 14:44:23Z · 0233 14:44:27Z; re-read **228 / `0233_firm_commercial_settings`** |
| 7 release (probe destroyed, deploy, start, `/ready`, boot lines, `bodies=`, five banners, outage window) | probe destroyed 14:44:43Z; `fly deploy --image …@sha256:2c6e7b4a…` 14:44:47Z → 14:45:23Z (machine left `stopped` on the new image, as expected); `machine start` 14:45:31Z; **`/ready` 200 at 14:45:52Z** (`db`, `world`, `control`, `taxonomy`, `relay`, `matcher`, `autodraft` … ok; both fly checks 2/2). Boot lines 14:45:39–40Z: `serving git_sha=ede1df83d38f4e6d79582352f89ca3ae642f2f15 frontier=0233_firm_commercial_settings(228) bodies=55 pins … chatTurn=chatTurn_v21 claraWork=claraWork_v5 … clientOnboarding=clientOnboarding_v5`, then `stranded bodies n=0`, then `durable world started`, **five** bundle banners `clara-work/v1`…`v5` (v5 digest `fe641982…`), `CONTROL listening`, `LEADER acquired`. Runtime outage window **14:43:03Z → 14:45:52Z (2 min 49 s)** |
| 8 promote (version, signed-out smoke, the ten signed-in surfaces) | `wrangler versions deploy c550d944…@100% --yes` **SUCCESS 14:46:50Z** (previous active confirmed `095073c9…` at 100% just before). Signed-out smoke 14:47:10Z, all as expected: `/login` `/favicon.ico` `/icon.png` 200; `/pending` `/api/build-info` `/checkout/cancel` 307→`/login?next=…`; `/settings/registrations` `/admin/registrations` 307→`/operator`; cross-origin POST `/auth/confirm/resend` 403. **Signed-in walk DONE 2026-09-20 00:48–01:00 MYT** through the owner's Chrome (Claude in Chrome bridge, signed in to BELCORT as Owner), read-only, nothing clicked that writes, no chat turn sent. `/api/build-info` → `git_sha` `ede1df83d38f4e6d79582352f89ca3ae642f2f15`, pairing with the runtime boot line. **#659** `/` renders the needs-you band, the client portfolio table (2 clients: status, running, needs attention, recent success) and a compliance-watch row. **#660** `/clients/<id>` renders the period selector, the six-month income/expense series and the drilldown; money as `RM 4.00`; the cash card reads "Nobody has said which accounts count as cash … This is not a figure of zero" (the ruled empty state, zero published sets); figures ran "to 20 Sept 2026" while UTC was still 19 Sept, which is the book-day delegate of DECISIONS §6.4 seen on hosted. **#635** `/settings/firm` renders legal standing, the plan card ("Beta — no price has been set for this plan yet", not RM 0.00) and the model-usage card. **Finding for the owner:** legal standing reads NOT CURRENT — Terms of Service v1 (effective 13 Sept 2026) is not accepted for BELCORT, and the page states Clara cannot use a model on any client's books until an owner accepts; the Accept control was not clicked. **#636** `/clients/<id>/documents` renders; no batch exists, so the batch card and its "Stopping" copy were not reachable without an upload. **#655** draft correction: there is no `/accounting/invoices` list page by design (tree.ts: recorded invoices are read on `/registers` and `/journals`); `/accounting/invoices/new` renders the form, with the due-date copy counting terms from the document date. **#656** `/registers?tab=opening` renders; this client has a zero first-year opening, so the source header, tied-seed dialog and target document panel had nothing to show. **#651** `/registers?tab=fixedAssets` renders the register, account profiles, tie-out and depreciation-authority sections; hosted holds no fixed asset, so the five-tab asset detail was not reachable. **#657** `/bank?tab=matching` renders ("Every line on this statement is matched"), so no candidate row was visible; **defect found:** both select triggers show raw values (an account row id, `__all`). It is estate-wide (Activity and knowledge filters too): Base UI's `Select.Value` renders the raw value unless `items` is passed to the root; filed as #1005. **#658** `/clients/<id>/knowledge` and `/settings/knowledge` render at knowledge version 0 with the Kuala Lumpur as-of date. **#642** draft correction: the full-page chat is `/clients/<id>/clara/<threadId>`; it renders the transcript, a tool-state chip ("Queueing journal Work · done"), the "Accounting work accepted" part and the composer with attachment; no "Reconnecting…"; admission (202) and revocation were not exercised because sending a turn writes |
| 9 preflight (gate (a) verdict, gate (b) verdict, exit code, snapshot caveat) | previous bundle `/app/.output/server/index.mjs` (10,424,318 bytes, sha256 `d052518d…` equal in-container and locally) pulled by sftp from a second OLD-image probe `2865d4efd44d38`, run through that probe's DSN at 14:48:51Z: `target supports 53 body(ies)`; GLOBAL: 0 non-terminal runs, 0 unbound live tasks → **ALLOWED**; the database's own rule: frontier `0233_firm_commercial_settings`, rule `0195…` → `ok` → **ALLOWED**, exit 0. Gate (a) is the positive control; gate (b) is a **snapshot** that degrades with the first `chatTurn_v21` / `claraWork_v5` run. Probe destroyed 14:50:05Z; one machine remains, `/ready` 200 |
| 10.1 #660 unmarked closing entries (pre / post) | 0 entries, 0 clients / 0 entries, 0 clients (16 approved entries on the estate, none year-end) |
| 10.2 #651 authorities stamped (pre / post, by status, ck-risk rows, MYT-vs-UTC rows) | hosted holds **zero** `fa_depreciation_authorities` rows: 0 stamped, 0 ck-risk rows, 0 MYT-vs-UTC divergent, pre and post |
| 10.3 #660 D1 published account sets | pre: relation absent (expected). post: **0 versions, 0 clients, 0 published** — every client home shows the cash arm's empty state until a human publishes a set. **Script finding:** the draft query named a column `is_current` that 0232 does not have (`42703`); corrected to `state = 'published'` and re-run |
| 10.4 0228 `registry_version` (pre 1 / post 2, 240 rows) | pre 240 rows · 1 distinct · min 1 max 1; post **240 rows · 1 distinct · min 2 max 2** |
| 10.5 #847 `work_execution_traces` run-id census | 0 rows, pre and post: no trace exists yet, so no stored run id can take `boundedRunId`'s refusal arm; no stored `registry_version` values |
| 10.6 `get_llm_usage_summary` — in-catalog callers, ACL, owner's answer | pre: no in-catalog caller; post: one, `get_firm_ai_usage` (0233's own door). EXECUTE unchanged: `clara_authenticated`, `clara_fn_owner`. `track_functions` = none, so call counts are unknowable. **Owner's answer, 2026-09-20: "没有"** — nothing outside the repository calls it. #962 closed on that answer (no further action; reopen only if a real out-of-repo consumer appears, and then the answer is a narrow wrapper, never un-flooring the door) |
| 11a `--lock-deployed` (entries locked, freeze-lint counts) | the unlocked set was confirmed first as exactly the 16 additions of this cut; `locked 16 newly-deployed entr(ies); every manifest entry is now deploy-locked`; plain freeze-lint `OK — 312 frozen file(s) … 55 "use workflow" module(s) … 3 retired` |
| 11b ticket closures (ten, with the four extra sentences) | hosted-evidence comments posted and #635 #636 #642 #651 #655 #656 #657 #658 #659 #660 closed 2026-09-19 (see each ticket's last comment) |
| post census | ledger 228 / 0233; `agent_tasks` non-terminal 0; interruptions pending 0; `accounting_work` non-terminal 0; `workflow_runs` 1066 completed / 1430 failed / 5 cancelled / 0 non-terminal; twelve `clara_runtime_login` sessions back; no lock, no F10 holder; CLEAN. Carried, not a release defect: one `document_processing_tasks` row `statement_facts · running` with no live run behind it (present before the window too) |

**Rollback points AFTER (from the ledger):** DB **228 / `0233_firm_commercial_settings`** — below the
frontier only via the step-3f dump (no Storage bytes, no managed Auth config, no engine state) ·
runtime **`refresh-ede1df83`** = `sha256:2c6e7b4acf3b5126365ebb892b47f5c7af6d2e06d76dc1fa49975a3b5f0898ff`
(previous `refresh-a296765c` = `sha256:b67163f3…`, preflight-ALLOWED at 14:48:51Z only) · web
**`c550d944-352c-46de-b6f8-cc44b1e52733`** (previous `095073c9-ecba-47ca-99de-ab3c8781deb2`; one
command: `pnpm --dir apps/web exec wrangler versions deploy 095073c9-ecba-47ca-99de-ab3c8781deb2@100% --yes`).
