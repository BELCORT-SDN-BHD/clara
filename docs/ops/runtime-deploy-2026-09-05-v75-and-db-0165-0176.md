# The 2026-09-05 production ceremony — DB `0165`–`0176` → runtime **v75** → web Worker, as-run

**Outcome: ALL THREE ARMS DEPLOYED.** The database moved `0164 → 0176` (159 → **171** applied
migrations) inside a **9 m 46 s** write-quiesce window; `clara-runtime` went **v74 → v75** on the
image the 裁-199 recall gate had already run against; and `clara-web` was promoted from version
**I** (`c5b1e051…`) to **`90c1a5d0-f808-4b88-bd28-d2395d9bc26a`** at 100 %. Run by the CEREMONY
lane as the lead's hands, the lead acting as the owner's **DELEGATE** (裁-189), from merged `main`
at **`0351f0225a93dcc6fa53989633f5ce5427bf82de`** under the window 裁-198 opened.

Order: "scratchpad/order-CEREMONY-0905.md". The fixed sequence (裁-189) was **DB → runtime →
Worker**, and it is not cosmetic: `chatRoutes.ts:168-171` states in code that the session-list
`archived_at` read 500s on every call until `0174` is applied, and `apps/web` already shipped code
reading it.

**The one finding that outlives the deploy is in §5.1: the recall gate PASSED while the defect it
was built to close turned out to lie somewhere else entirely.** Read that section before treating
H-04 as addressed.

---

## 0 · Preflight

**0.1 Merge state.** `main` tip `0351f022`, working tree clean, `gh pr list --state open` → `[]`.
Hand sweep **`33967641251`** dispatched 13:00:32Z; **conclusion `success`, 13 jobs / 13 SUCCESS**,
concluded **14:14:39Z**, read from `gh run view --json jobs`. `closed-wave-drills` ran 73 m 57 s
(13:00:35Z → 14:14:32Z), within a second of the three prior sweeps' 73 m 12 s – 73 m 42 s; its
ceiling is `timeout-minutes: 120`.

**The sweep's sha is ONE commit behind the tip, and that was proved harmless rather than assumed.**
The sweep ran on `f57f6af4`; the only commit between it and `0351f022` is **#561, docs-only**, and
`git diff --stat f57f6af4..HEAD -- . ':(exclude)*.md' ':(exclude)docs/**'` is **EMPTY**. The code
tree the sweep proves is byte-identical to the tip's.

**0.2 Live frontier and freeze.** `clara.schema_migrations` → **count 159, max
`0164_checkout_gate_c6_web_reads`**. *(The runsheet's "expect 170 / 0175" described `main`, not
live; PROGRESS's 0164 was right.)* `clara.verify_evaluator_freeze()` →
`{"ok":true,"verified_deployed":7,"verified_registered":8}`. 19 `clara%` roles. Server
**PostgreSQL 17.6**.

**File-census cross-check:** 171 `.sql` files numbered 1–176 with gaps at 0032, 0073, 0074, 0075,
0076; files ≤ 0164 = **159**, exactly the applied count. Pending = **12**. Post-apply prediction:
**171 / 0176**.

**0.3 Backup, banked first.** The machine id was **re-read live** rather than reused: it is
**`d895470c6024e8`** — the SAME id `wave-b-0019-ceremony-runbook.md` names. *The runsheet's warning
that the id predates the 2026-09-03 factory reset is unfounded; it is current.*
Run **`2026-09-05T13-15-28-593Z`**: `/usr/lib/postgresql/17/bin/pg_dump` over `clara`,
`graphile_worker`, `workflow`, `workflow_drizzle` wrote **204,616,454 bytes**; migration-head
**159**, head sha256 `6990c2842a4b4433…`; firm-docs mirror 9 objects, 0 new;
**`clara-backup: DONE — bundle 17813791 bytes -> r2:clara-dr/db-snapshots/2026/2026-09-05T13-15-28-593Z/`**;
plaintext staging purged; healthcheck **`ping: success`**; machine exited 0 at 13:16:31Z.

**0.4 In-flight, Fly, Worker.**
- **`workflow.workflow_runs` non-terminal = 1, not 0 → STOP-AND-ESCALATE raised.** See the
  deviations register, D-1.
- `fly status`: machine `48ee715b763048`, **VERSION 74**, `started`, checks 2/2, image
  `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ` — identical to v71's, so nobody had deployed since.
- Pre-window `/ready` **true**, OLD shape: `held_outbox 8`, `pending_intents 0`, wakeEngine
  `lag 158` / `heldForDisabledSource 8`, matcher/autodraft/sstWatch/factsGate `lag 0`,
  `firmsTracked 4`.
- **The Worker baseline could NOT be taken at preflight** — see D-2.

**0.5 Clients, build, freeze.** No v17 client on the host (v16.13 only, `PG_DUMP`/`PSQL` unset) —
**no impact on the ordered path**: the backup ran pg_dump 17 ON the backup machine, the runner is
Node/`pg`, and every read went through Node/`pg` inside `BEGIN TRANSACTION READ ONLY`. Local
`psql` was never pointed at live. `pnpm --filter @clara/runtime build` **exit 0**.
Local bundle proof (".output/server/index.mjs", **9,006,130 bytes**, sha256 `464918d1792ba5fe…`),
binary-safe counts as lines/occurrences: `archived_at` 2/2 · `build_frontier` 4/4 ·
"api/build-info" 1/1 · `lane-probe` 2/2 · `laneProbe` 5/8 · `chatTurn_v17` 9/14 · `checks.pools`
2/2 · `pooler-ca.crt` **0/0**. **The zero is correct**: the CA ships as a FILE
(`COPY ops/tls/pooler-ca.crt /app/ops/tls/pooler-ca.crt`, Dockerfile:86) and its path constant
lives in `packages/runtime/lib/tls-ca.mjs`, copied separately at line 72, outside the nitro bundle.
Freeze compare-base: `check-frozen-evaluators.mjs` **OK — 9 evaluators**;
`check-frozen-workflows.mjs` **OK — 244 frozen files, 46 `use workflow` modules**.

**0.6 The two failed admissions.** **Correction: `clara.agent_tasks` has NO `last_refusal` column**
— it is on `clara.autodraft_attempts` (`0011:712`). Both were read.
`agent_tasks`: exactly two failures, both `kind=autodraft, status=failed, error_code=internal`,
client `7a045c7f…` — `31be58f4…` (run `wrun_01M1MGFRXS9YXY90YHCGKM81V1`) and `1a268852…`
(run `wrun_01M1MG8PJQM9AZFYVD672J41DS`); census completed 14 / failed 2 / held 8.
`autodraft_attempts`: exactly ONE row carries `last_refusal` — `ae22c9c6…`, document `d7cb5098…`,
origin `one_click`, state `parked`, `attempt_count` 2, `reserved_tokens` 0,
`last_refusal = {"code":"CLR23","type":"refusal","message":"The counterparty could not be resolved as proposed."}`.
**A read only; nothing asserted about cause.**

### Preflight the order did not ask for, added because its failure mode was the window itself

`migrate.mjs` **aborts the whole run** before applying anything on a missing/renamed/checksum-
drifted applied migration, or a pending file numbered at or below the frontier. Reproduced
read-only, importing the runner's **own exported `migrationChecksum`**: applied rows **159**,
checksums matching disk **159**, history drift **0**, late inserts **0** — *the preflight would
PASS*. The twelve pending checksums were pinned in advance and **every one matched the ledger
after the apply** (§2).

---

## 1 · The write-quiesce window — **opened 16:05:03Z, closed 16:14:49Z, 9 m 46 s**

**1.1 Stop.** Kill signal 16:05:03Z → *"48ee715b763048 has been successfully stopped"*.
**Positive read: `fly status` STATE `stopped`, 16:05:07Z.** Corroborating negative read: `/health`
**000, unreachable**, having been 200 at 16:04:09Z.
*Instrument note against the operator:* the polling loop written for this printed the REGION
column, not STATE (wrong awk field), so it read "sin" thirty times and never matched. **The verdict
rests on `fly status`**, the correct instrument; the loop was cosmetic and wrong.

**1.2 Sessions — ZERO, and stronger than the order asks.** Non-idle `clara\_%`: **0 rows**. The
whole-population control ALSO returned **0 rows** — not one `clara_%` session in any state, idle
included. **No session was terminated**; they drained on the stop.

**1.3 The statement lane was NOT zero** → the second stop condition. See D-3.
**The predicate was DERIVED and shown, as ordered**: `clara.document_processing_tasks` has no
`task_kind` column; its discriminator is `lane` (`0007:158`, roster widened 0009 → 0015 → 0016 →
0038) and `0098` states the statement witness task KEEPS the `statement_facts` lane. In-flight =
the three statuses `ix_document_processing_dispatch` is partial on (`0007:180-181`). The full
`lane × status` census ran beside it as a positive control, so the zeros elsewhere are proven real
and not a mis-named lane.

**1.4 Heartbeat guards.** `grep runtime_heartbeats` across all twelve files → **no match**.
`0151`'s stop-then-wait-95 s pacing is not owed.

**Tripwire, captured pre-window and re-captured with the runtime STOPPED: byte-identical.** All 23
prosrc hashes, catalog 1068 functions / 280 relations, 19 roles, freeze ok/7/8, frontier 159/0164,
`counterparty_aliases` **0 rows**, `uq_counterparty_aliases_live_name` still the kind-blind
`(client_id, alias_normalized) WHERE retired_at IS NULL`. Nothing drifted in the 2 h 45 m between
captures.

**`counterparty_aliases` holding ZERO rows made `0176`'s ACCESS EXCLUSIVE index rebuild — the
runsheet's named lock risk — a rebuild of an empty index.** Its `lock_timeout='15s'` was never
approached.

---

## 2 · Apply — **12 new · 171 total · max `0176`**

```sh
fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" \
  | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs
```

**Exit 0.** Summary line: `migrate: 12 new migration(s) applied · 171 total · target
aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`. All twelve applied **in order**,
**16:12:41.072Z → 16:13:26.228Z (45 s)**. **26** prestate/tail notices, **every one OK**. Zero
exceptions, zero refusals, zero rolled-back files.

| version | applied_at (UTC) | ledger checksum (16) — **each equal to the value pinned BEFORE the window** |
|---|---|---|
| `0165_document_kind_codeability` | 16:12:41.072 | `bc8f3cd11862471e` |
| `0166_close_gate_codeable_population` | 16:12:45.100 | `8b58ef0a0f5d0afa` |
| `0167_close_gate_bank_enrolment` | 16:12:49.058 | `ec63d5d9175ed473` |
| `0168_coding_lane_kind_exclusion` | 16:12:53.346 | `c6f3b99a27f55465` |
| `0169_set_document_kind_resolves_classification` | 16:12:57.401 | `21eb2d41dbe0fe78` |
| `0170_coa_chart_state_reports_open_plan_state` | 16:13:01.523 | `f5ed273723c5da58` |
| `0171_opening_approval_isolation_pin` | 16:13:05.220 | `f972aa715adb6a38` |
| `0172_bank_gate_outstanding_items` | 16:13:09.200 | `e85efc302cc85860` |
| `0173_apply_coa_template_refuses_open_plan` | 16:13:13.363 | `ae9a54d0a4bee25c` |
| `0174_web_reads_and_small_doors` | 16:13:17.827 | `db3ef4f06061a83e` |
| `0175_stmt_witness_totals_and_institution_code` | 16:13:22.133 | `59c49ce96ef534f0` |
| `0176_counterparty_alias_kind_scope` | 16:13:26.228 | `5b45aae82b1299ea` |

The runner also noted the single isolation-pinned migration (`0057`) as already applied and
skipped. No pending file matched that pin by checksum, version or name family, so all twelve
applied under the `read committed` default.

---

## 3 · Post-apply reads — **all pass**

- **Frontier: `count 171`, `max 0176_counterparty_alias_kind_scope`** — exactly 159 + 12.
- **`clara.build_frontier()` → `{"count":171,"max_version":"0176_counterparty_alias_kind_scope"}`**
  — the shape "/api/build-info" serves.
- **ALL SIX audited bodies RECUT; ALL SEVENTEEN witnesses BYTE-IDENTICAL.**

| body | pre sha256 (8) | post sha256 (8) |
|---|---|---|
| `_gate_outstanding_items` | `2df52b8f` | **`162571b8`** |
| `_persist_statement_core_v2` | `d931067a` | **`6f694ac0`** |
| `_tf_chat_session_update` | `89a66964` | **`6118109f`** |
| `_tf_counterparty_update_0011` | `cfb2313b` | **`b4ad0083`** |
| `apply_coa_template` | `26ddd7f3` | **`09d03a71`** |
| `set_document_kind` | `611bc543` | **`74bb929e`** |

Volatility, `prosecdef`, `search_path`, owner and ACL preserved on every one. Witnesses unchanged:
`_active_document_filing` `8d75cb02` · `_approve_entry_core` `d5ab4afc` · `_canonical_counterparty`
`bbbe4a5e` · `_control_tie_core` `46d9e3aa` · `_finish_op` `c2beaa13` · `_human_ctx` `d1a8a194` ·
`_identifier_promotion_core` `02fbd581` · `_persist_statement_core` `13b78739` · `_reserve_op`
`8816acb4` · `agent_user_id` `0b958c48` · `attest_close_exception` `f78de046` · `classify_document`
`572806fa` · `finalize_close` `59ebaa4f` · `jwt_firm` `43338e83` · `resolve_open_question`
`ebed8b99` · `retire_document_filing` `69373f5e` · `set_sales_lane_activation` `23977c7e`.

**Cross-instrument confirmation:** `0175`'s own splice notice printed *"legacy core byte-untouched
at sha 13b78739ef941d69f3403bd3b37f7f7e1684b783b7d1310a8a4977f409a6821b"* — the SAME value the
tripwire measured independently from `pg_proc`. Two instruments, one answer.

**Note on the order's §3.3 as written:** it asks to compare the six bodies against *"the values
each migration's tail printed"*. **The tails do not print a body hash** — they print prose OK
notices (only `0175` prints a sha, and for the legacy core it does NOT touch). The instrument used
instead is the 2026-08-30 ceremony's: capture pre, capture post identically, prove exactly six
moved and the witnesses did not.

- Catalog **1068 → 1080** functions (+12), **280 → 284** relations (+4) — the new objects and
  nothing else.
- RLS **enabled AND forced** on `document_kind_codeability` (2 policies) and `dr_canary_subjects`
  (1 policy, 2 triggers). **`clara.dr_canary_subjects` = ZERO ROWS** (裁-160/172).
- `uq_counterparty_aliases_live_name` rebuilt to `(client_id, kind, alias_normalized) WHERE
  retired_at IS NULL`, unique and **valid**.
- `set_firm_sales_lane_activation(boolean, timestamptz, text, text)` → `clara_authenticated`; the
  ORIGINAL `set_sales_lane_activation(uuid,…)` stays `clara_fn_owner`-only, **no application
  role**. `build_frontier()` and `_stmt_institution_code(text)` → `clara_runtime` only.
  `_is_codeable_kind(text)` → `clara_authenticated` + `clara_agent_ro`.
- `chat_sessions.archived_at` nullable `timestamptz`; `counterparty_aliases.kind` `text NOT NULL`.
- `document_kind_codeability`: **20 rows, 12 codeable** — matching the 20-value live
  `documents_document_kind_check` roster.
- **Roles still 19. `verify_evaluator_freeze()` still `{"ok":true,"verified_deployed":7,"verified_registered":8}`.**

---

## 4 · Un-quiesce

**4.1** `fly machine start 48ee715b763048` 16:14:47Z. **`fly status`: VERSION 74, `started`, checks
2/2 PASSING**, 16:14:49Z. `/health` **200**. `/ready` **200, `ready:true`, ~20 s after start**, in
the OLD shape (no `checks.pools` — correct, still the v71-lineage image). The world came back
**identical to its pre-window baseline** (`held_outbox 8`, wakeEngine `lag 158` /
`heldForDisabledSource 8`, the four consumers `lag 0`, `firmsTracked 4`). Post-restart session
census: **zero non-idle, twelve idle `clara_runtime_login`** — a pool reconnecting normally, no
zombies.

**4.2 Smoke — PASS ×4**, driven by the lead in a Playwright browser **the owner signed into
themselves** (16:22Z), against the still-OLD Worker: sign-in → firm home; Journals with every read
200 including **`rpc/coa_chart_state`, a re-cut body**; Documents with `document_regions`,
`document_extractions`, **`rpc/list_uncoded_filings` and `rpc/list_coding_lanes`, both re-cut**, all
200; a chat turn `POST … /turns` **202** → stream **200** → *"I can read ROME SECRETARY SDN BHD's
client books context at books_version 201"*. **0 console errors.** Enter-to-send did nothing — a
#547 change, **expected until §6**; the Send button worked.

---

## 5 · Runtime **v75**

### 5.0 Build-only — the image exists, nothing released

```sh
fly deploy --config packages/runtime/fly.toml --remote-only --build-only --push \
  --image-label v75-gate-0351f022 --build-arg CLARA_BUILD_SHA=0351f022…
```

**Why split at all:** the recall harness exists ONLY in the new image, but 裁-199 gates the image,
and a plain `fly deploy` builds and releases in one act. `--build-only --push` breaks the
circularity.

**IMAGE `registry.fly.io/clara-runtime:v75-gate-0351f022`, DIGEST
`sha256:9d9049287c83b4d7678cece58bef51d8b63404865acf9a66397dab13eefd6201`, 207 MB**, built
16:16Z → 16:20:51Z. **No-release proof, read three ways:** `fly releases` latest still **v74**;
`fly status` still VERSION 74 on the old image; machine census **exactly one**.

*Two non-fatal build-log notes.* The nitro step printed three lines styled **`ERROR`** —
*"failed to read input source map"* for `@ai-sdk/openai`, `@ai-sdk/gateway`,
`@ai-sdk/provider-utils`, each shipping "dist/index.js" with no `.map`. **The build exited 0 and
the image pushed**: missing-sourcemap warnings wearing an error's clothes, recorded because a
future reader grepping this log for "ERROR" will find them. And *"Build context is 1.6 GB across
68,573 files"* — the repo root IS the Docker context, which `fly.toml` requires deliberately; a
`.dockerignore` is a follow-up.

### 5.1 The 裁-199 recall gate — **PASSED, and the pass is not what it looks like**

> **The gate passed while the defect it was created for turned out to lie elsewhere.**
>
> The baseline arm did NOT reproduce H-04 (live scored the same three statements `other` at ≤0.05
> on 09-03; the harness's baseline arm scores them 100 % at gate), so this run shows v75's prompt
> is **not WORSE** on any kind and does **not** show it is **BETTER**; the defect the harness
> exists to close was never reproduced by the control.

**n=3 `bank_statement`, n=1 `invoice`.**

| arm | prompt sha256 (12) | n | overall at ≥0.8 | bank_statement | invoice | off-diagonal |
|---|---|---|---|---|---|---|
| baseline | `98fc27adede4` | 4 | **100.0 %** | n=3 · at-gate 100.0 % · any 100.0 % | n=1 · 100.0 % · 100.0 % | **0** |
| current | `191776db0036` | 4 | **100.0 %** | n=3 · at-gate 100.0 % · any 100.0 % | n=1 · 100.0 % · 100.0 % | **0** |

Model **`gpt-5.6-terra`**, gate `>=0.8`, both arms over ONE input set.
**`--allow-contaminated-fixtures` was NEVER passed.**

**裁-199 verdict: PASS.** Per-kind non-regression — neither kind regresses. Confident-and-wrong —
**ZERO**: no off-diagonal cell under the current prompt, so nothing is misclassified at ANY
confidence, which is stronger than the threshold asks. Per-document: all four correct and all four
≥ 0.8 — *an inference from at-gate 100 %, stated as one, because the harness reports per-kind
aggregates and a confusion matrix rather than four printed rows.*

**裁-201** (owner, ≈22:20 MYT, AskUserQuestion (b) of 3, **AGAINST the lead's recommendation** to
tighten to 0.95; **dissent recorded**): deploy v75 with `classify_document`'s auto-accept gate
**UNCHANGED at 0.8**.

**The manifest** was derived from HUMAN acts only: a `doc_classify` extraction under
`clara-classify-human:v1` with `envelope.source = 'human'`, PLUS the document's CURRENT
`document_kind` equal to that verdict, PLUS the label being a `CLASSIFY_KINDS` member **imported
from the shipping module**, PLUS persisted OCR regions. **4 candidates, 4 accepted, 0 rejected.**
The accounting closes: the database holds exactly four human-verdict rows and all four are in the
manifest. Resolved classification questions number 0. The `consent_evidence` letter is excluded on
two independent grounds (no human receipt; a `DB_REFUSED_KINDS` member); the unlabelled EZSEC
quotation is excluded because labelling it would assert a ground truth no human set.

**How it ran, under the four binding conditions of the lead's option-(a) ruling:** on a **one-off
machine of the gated image** (`fly machine run … --rm -- sleep 2400`, explicit command, never the
server). (1) The migration DSN reached it **only down the sleeper pipe into stdin**, assigned by a
shell `read`; the transport proof printed **`dsn_len=113 scheme_ok=yes`** and the value was never
emitted, written, or placed in argv. (2) Before anything ran: `CLARA_START_WORLD` **UNSET**,
**NODE PROCESSES = 0**, harness present, `CLARA_BUILD_SHA` read back as the tip. (3) Reaped on a
shell trap at 16:35:49Z; **census after = only the live machine**. (4) `OPENAI_API_KEY` never read,
moved or printed.

*Safety-proof correction:* the plan promised to prove "PID 1 is `sleep`". **PID 1 actually reads
"/fly/init"**, because Fly's init always supervises and execs the command as its child — that check
would have been AMBIGUOUS. **The unambiguous proof is zero node processes.**

### 5.1a — ⚠ **H-04's ROOT CAUSE IS NOT THE PROMPT**

The baseline arm scored 100 % on three statements LIVE had scored `other` at 0.05 / 0.00 / 0.05.
Both cannot describe one system. **Measured, not assumed** — every classify task FINISHED before
its OCR extraction was persisted:

| document | verdict | conf | classify finished (UTC) | OCR persisted (UTC) | OCR landed |
|---|---|---|---|---|---|
| `RS-MBB-Bank-Statement-2506` | other | 0.05 | 21:05:33.701 | 21:05:39.425 | **+5.72 s LATE** |
| `RS-ALB-Bank-Statement-2510` | other | 0.00 | 21:09:49.547 | 21:09:52.688 | **+3.14 s LATE** |
| `2505_BANK STATEMENT_ROME PROPERTIES` | other | 0.05 | 09-04 00:12:22.548 | 00:12:23.905 | **+1.36 s LATE** |
| `RS-AI-Authorization-Letter` | task failed (`consent_inactive`) | — | 20:23:18.892 | 20:23:24.705 | **+5.81 s LATE** |

Each document has **exactly ONE** `ocr` extraction (`version_n` 1), so there was no earlier row to
read. `readExtractionText` requires `status='done'`; at every moment of each task's ~2 s life no
such row existed. **The classifier was handed an EMPTY STRING**, and `other` at 0.00–0.05 is the
correct answer to that question.

**The two competing explanations were ruled out, not assumed away.** *Wrong baseline?* No —
`git log 344f7ad8..HEAD -- packages/runtime/lib/classify-llm.mjs` returns **only #558**, and
`packages/runtime/lib/classify.mjs` is untouched since the deployed commit, so the baseline file IS the deployed
prompt (its sha256 matches what the harness printed). *Wrong model?* No — `classify.mjs:40` reads
`CLASSIFY_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra"`, and `CLARA_CHAT_MODEL` is set
neither in `fly.toml` nor in the app secrets.

**Consequences, ruled by the lead:** v75 is still safe to ship on this evidence; **H-04 STAYS OPEN**,
re-described; and a **NEW P0** row is opened for the classify/OCR ordering race, with these four
rows as its reproduction and a cell that plants a classify task ahead of its extraction and asserts
it **WAITS**.

### 5.2 Release

```sh
fly deploy --config packages/runtime/fly.toml \
  --image registry.fly.io/clara-runtime:v75-gate-0351f022 --yes
```

Released **BY IMAGE, never a rebuild**, so what serves is the exact artefact the gate ran on.
16:39:42Z → **exit 0 16:40:18Z**. Rolling update: lease acquired → config updated → `started` →
Fly's smoke, machine and health checks → lease cleared → DNS verified.

**IDENTITY PROOF, not a name match** (review law 3): the deploy log resolved the tag to image id
**`img_wd57v5d3lej9p38o`**; the one-off that RAN THE GATE resolved the same tag to **the same id**
and digest. **Same image id ⇒ the released image IS the gated image.**

### 5.3 Post-release reads

- `fly status`: **VERSION 75**, image `clara-runtime:v75-gate-0351f022`, `started`, **checks 2/2
  PASSING**, 16:40:05Z. `fly releases`: **v75 `complete`, 16:39:45Z**, ImageRef distinct from v74's.
  Census: **exactly one machine**. `/health` **200**.
- **`/ready`: `ready: true`, `checks.pools` PRESENT — the NEW shape. SEVEN lanes, settled on the
  FIRST poll, no `pending`, no `stalled`:** `runtime` ok 116 ms · `read` ok 115 ms · `write` ok
  245 ms · `freeform` ok 246 ms · `stripe_webhook` ok 333 ms · `auth_wall` ok 325 ms · **`bank`
  skipped, `dsn_not_configured`**.
- **"/api/build-info" → `401 {"error":"no_bearer"}` unauthenticated** — itself a positive read: the
  route now EXISTS and refuses, where v74 returned an empty-200 catch-all. Session-gated by design.
- **§5.3 smoke — PASS**, through the web proxy in the signed-in page:
  `{service: clara-runtime, git_sha: 0351f0225a93dcc6fa53989633f5ce5427bf82de, image_ref:
  registry.fly.io/clara-runtime:v75-gate-0351f022, machine_id: 48ee715b763048, workflows: 11 named,
  frontier: {count: 171, max_version: 0176_counterparty_alias_kind_scope}, frontier_reason: null}`;
  "chat/sessions" **200** and the thread's messages **200** against v75 — the `archived_at` filter
  live. **0 console errors.**

**H-47's note is STALE and is trued here: only `bank` is skipped. `stripe_webhook` and `auth_wall`
probe healthy** — their DSNs were configured by the C-5 secrets ceremony.

**§5.4 (H-43, the `verify-full` flip) was NOT part of this ceremony** and remains owed; the DSN
secrets still carry `sslmode=require`. The pooler CA is in the image since #558, which is the
prerequisite that ceremony needs.

---

## §6 onward is in part 2

**The web Worker arm, the deviations register (D-1 … D-9) and the instruments note continue in
[`runtime-deploy-2026-09-05-part2-worker-and-deviations.md`](runtime-deploy-2026-09-05-part2-worker-and-deviations.md).**
This file reached the repo's 500-line ceiling; the split follows the FS-10 cutover as-run's own
precedent. Same ceremony, same run, one record in two files.
