# `ceremony-wC/reads-wC.mjs` - the riders CUT-PHASE hosted preflight

One read-only script. It answers, before the window opens, every question the cut's three migration
headers ask of hosted, and every question a VERSION CUT asks that a wave which only adds classes
does not. It answers them by PARSING the migrations and the release tree's own `registry.ts` and
`frozen-workflows.json`, rather than by transcribing them. The design is
`../ceremony-w4/reads-w4.mjs`, unchanged, with six differences, each of which is a finding rather
than a preference.

## How to run it

Offline, no database, proves the parse:

```
CLARA_REPO=<RELEASE_SHA tree> \
CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
  node docs/plan/active/riders-2026-09-20/ceremony-wC/reads-wC.mjs \
       --plan --frontier-before 0318_knowledge_fye_pair_applicability
```

Against a rig (libpq `PG*` vars), or against hosted as a child of `scripts/ops/dsn-pipe.mjs`
through the probe:

```
# export a baseline from a rig database at the HOSTED frontier (309 / 0318)
... reads-wC.mjs --export-fingerprint fp-wC-hosted.json

# the pre-window read
PROBE=<probe-id> via-probe.sh node ... reads-wC.mjs --prod --baseline fp-wC-hosted.json

# the quiescence census plus the version-cut reads, re-run after the machine stop
PROBE=<probe-id> via-probe.sh node ... reads-wC.mjs --census --prod

# the version-cut reads ALONE. This is what step 9's rollback snapshot re-reads, immediately
# after step 7, because the rollback target degrades within minutes of the image serving.
PROBE=<probe-id> via-probe.sh node ... reads-wC.mjs --cut-only --prod

# after the migrate, against a baseline exported from an UPGRADED rig database.
# PASS --frontier-before: it always wins over the state file, and it is what lets a --post run
# re-derive `309 + 3 = 312` on a machine that did not take the pre-window reading.
PROBE=<probe-id> via-probe.sh node ... reads-wC.mjs --post --prod \
     --frontier-before 0318_knowledge_fye_pair_applicability --baseline fp-wC-upg.json
```

`--pins-only` runs the body-pin ledger alone. `--state <f>` carries the pre-window ledger reading
forward so `--post` can re-derive the arithmetic; `--no-state` suppresses the write.

**`CLARA_REPO` is load-bearing in this script in a way it was not in wave 4's.** The version-cut
reads parse `packages/runtime/workflows/registry.ts` and `frozen-workflows.json` out of it, so
pointing it at the wrong tree gives the wrong boot line and the wrong successor set. Both failures
are visible rather than silent: a missing registry is a GAP, and a tree at `main` prints
`bodies=57 pins ... chatTurn=chatTurn_v21 ...` and `SUCCESSOR BODIES ... (none)`, which is control
NC9 below.

Exit code is non-zero when any check says STOP. A literal the script cannot parse out of a
migration is a **PARSE GAP** and also counts as a STOP, because an unchecked precondition is
unchecked.

## What it reads

1. **Identity and ledger.** `--prod` refuses anything that is not the hosted pooler estate. The
   ledger is read, the pending set is derived as the files above the live frontier, the drift gate
   runs over every applied row, and the arithmetic `309 + 3 = 312` is printed rather than assumed.
2. **The estate fingerprint** against a baseline exported by the same script from a rig database at
   the hosted frontier: every function (signature, `sha256(prosrc)`, owner, SECURITY DEFINER,
   `proconfig`, ACL), every relation (columns, constraints with `convalidated`, indexes, RLS,
   policies, triggers, view definitions, owner, ACL), the schema's types, and the `clara%` roles
   with their memberships. Role-level differences print as `env` and never STOP.
3. **The data preconditions**, generated from the executed statements and hand-written where a
   file's own DO block hides them. Nine hand checks; every expected value is parsed from the file.
4. **The body-pin ledger** - 40 pins, all measurable, none chain-internal.
5. **The version-cut reads** - new, and the reason this script exists rather than wave 4's being
   re-pointed.
6. **The quiescence census**, over relations parsed from the executed statements.

## The six changes from wave 4, and why each is a finding

**1. Frontier and pending set.** 309 applied / `0318_knowledge_fye_pair_applicability`, three files
above it: `0320`, `0321`, `0323`. `0319` and `0322` were reserved by `CUT-PLAN.md` §1.2 A4 and §3.2
and went UNUSED, which is lawful - `migrate.mjs` does not ask for gapless numbering, and the same
was true of wave 4's `0294` and `0312...0314`.

**2. NO PIN IN THIS CUT IS CHAIN-INTERNAL, and the script measures that rather than asserting it.**
Wave 4 carried 189 pins of which 53 were chain-internal, because its lanes recut each other on
purpose. This cut's three files touch three disjoint families: 0320 recuts
`clara.get_client_financial_pack`, 0321 recuts `clara.revise_document_fact` and
`clara._question_source_corrected`, and 0323 recuts nothing at all. No file pins a signature an
EARLIER pending file produces, so all **40 pins are measurable on hosted before the window** and
the run reports `0 CHAIN-INTERNAL`. That is the strongest thing a preflight can say about a
multi-file run, and it is said because it was measured.

One subtlety the classifier has to survive is this cut's own: all three files add an OVERLOAD of a
signature they also PIN. 0321 pins `clara._fact_value_changed(jsonb,jsonb)` and creates
`(jsonb,jsonb,text)`; 0323 pins `clara._trade_invoice_probe_core(uuid,text,jsonb)` and
`clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` and creates the one-argument-wider
sibling of each. Wave 4's producer map is keyed on the BARE NAME, which is the conservative
direction and is kept - a pin is chain-internal only when an EARLIER file produces it, and here the
producer is the pinning file itself. Six such pins are printed under an ARITY NOTE so nobody
re-derives that reasoning at the window.

**3. A RECUT PIN IN THIS CUT IS BIMODAL IN A WAY A SHA LEDGER CANNOT HOLD.** Wave 4's bimodal
admissions were two shas in one roster tuple. All three of this cut's recut pins admit their
pre-image OR "a body carrying this file's own attribution", tested with
`position('<literal>' in v_src) > 0`. There is no second sha to record. So a target that has
ALREADY taken the file reads as a STOP PIN on exactly the recut signatures and on nothing else -
measured: the dry run against `clara_cutint` at 312 reported **37 of 40**, the three failures being
precisely those three bodies. That is the right direction for a pre-window read, because hosted
takes the FIRST APPLY branch; and the refusal now prints the file's own REDO literals beside it so
an operator tells drift from a redo by reading the live body rather than by guessing.

**4. THE TAILS CALL THEIR OWN UNGRANTED BODIES AFTER `reset role`, and that is a capability
question only hosted can answer.** All three files `set role clara_fn_owner`, create their objects,
`reset role`, and then run a §TAIL that CALLS functions owned by `clara_fn_owner` and granted to
nobody: 0321 drives `clara._fact_value_changed(jsonb,jsonb,text)` fifteen times,
`clara._fact_calendar_day(text)` and `clara._source_correction_rederivation_brief(text)`; 0323
drives `clara._trade_invoice_probe_core`; 0320 additionally does
`set_config('role','clara_agent_ro',true)` inside a subtransaction. On every rig the migration runs
as a SUPERUSER, which bypasses the ACL, so no rig run of these files has ever exercised the
privilege path. `D-TAIL-REACH` reads `current_user`, `rolsuper`, `pg_has_role(...,'clara_fn_owner',
'MEMBER')`, `...'USAGE'` and `...'clara_agent_ro','MEMBER'` - the four facts that decide whether
those tails run or raise `42501` inside the window. **It is the one check in this script that a rig
structurally cannot stand in for**, and every rig run of it reads `superuser=true`.

**5. 0323's §TAIL DRIVES ITSELF AGAINST A REAL RECORDING, and only a populated server has one.**
Its `(T4)` arm SELECTs a trade invoice under a keyed, still-postable Work with an unreversed entry,
copies that invoice's own particulars, and runs the probe twice. Its FIRST assertion is a VACUITY
CONTROL: if the UNNARROWED core does not match the invoice its particulars were built from, the
tail raises CLR10 and the whole migration rolls back. On a freshly seeded rig the selector finds
nothing and the arm is skipped by notice, which is what every rig run of this file has exercised.
`D-PROBE-DRIVEN` re-runs the file's own selector, extracted from the file rather than retyped, and
where it finds a row runs the vacuity control read-only. Exercised for real: on `clara_cutint`
(53 keyed invoices) it picked one, the unnarrowed core matched it, and the control held.

**6. THE VERSION-CUT READS, which wave 4 did not owe.** Wave 4 added two brand-new CLASSES and
repointed nothing, so `stranded bodies n=0` was trivially true in both directions. This cut
REPOINTS three pins. Section (v) therefore reads:

- the boot line the image will print, derived from `registry.ts` rather than written down
  (`bodies=60 pins ... chatTurn=chatTurn_v22 claraWork=claraWork_v6 statementFacts=statementFacts_v4 ...`);
- the frozen manifest's UNLOCKED set - **35 paths at the integrated head**, which is what step 11a's
  `--lock-deployed` will lock, and which is this cut's 25 plus wave 4's 10 that were never locked;
- the SUCCESSOR BODIES, derived as the intersection of "a class with a predecessor, pinned at its
  newest" and "a body whose module is still unlocked". That is exactly
  **`chatTurn_v22`, `claraWork_v6`, `statementFacts_v4`** and nothing else: `payrollFacts_v1` and
  `agreementFacts_v1` are unlocked but have no predecessor, and `documentIngest_v2`,
  `witnessFacts_v3`, `autoDraft_v10`, `firmInterview_v3` and `clientOnboarding_v5` have a
  predecessor but are already deploy-locked, so a rollback does not strand them;
- every non-terminal `workflow.workflow_runs` row BY BODY, using the runtime's own derivation
  (the identifier after the last `//` in `name`) and its own non-terminal set
  (`status not in completed, failed, cancelled`);
- the STRANDED-BODY CENSUS the engine computes at boot, run here against the bodies the RELEASE_SHA
  registry exports. A run parked on `chatTurn_v21` or `claraWork_v5` is NOT stranded: policy (c)
  keeps every superseded body exported and this image carries all sixty. A non-zero reading means
  `getWorld().start()` refuses DATABASE-WIDE and the crash-only supervisor exits 1, which under Fly
  is a restart loop;
- the successor bodies must carry ZERO non-terminal runs before the window, because no served image
  exports them yet;
- and the ROLLBACK DIRECTION as a timestamped snapshot rather than a guarantee.

**An unreadable run census is a STOP, and that was a real defect found by the first dry run.**
`clara_rt_test` on `rigw4h` carries no bootstrapped WDK World, so `workflow.workflow_runs` answered
`42P01` and the two derived checks reported `ok` for zero rows - "I could not look" wearing
"I refuse"'s clothes, which is the distinction `rollback-preflight.mjs` keeps exit 2 and exit 1
apart for. The census now fails closed and the derived checks print `NOT COMPUTED`.

## One more difference, in the fingerprint, and the control that proves it

**The `names` heuristic is narrowed to EXECUTED statements.** Waves 3 and 4 collected every
identifier in a pending file's whole text, so a fingerprint difference on any object the file merely
MENTIONED printed as `TOLERATED`. 0320 is 1,354 lines of which about 720 are #660's accounting body
carried verbatim into a new core, naming `clara.journal_lines`, `clara.journal_entries`,
`clara.cash_account_set_versions` and a dozen more relations this cut does not touch. The map is
now built from `execOf` (create-function BODIES blanked, DO blocks kept, exactly as the
data-precondition generator already reads them).

Measured both ways on the same corrupted baseline, same key, same database (control NC7 / NC11
below): under wave 4's rule `rel:cash_account_set_versions:meta` printed
`ok TOLERATED (0320_client_financial_pack_wake_read names this object and rewrites it)`; under this
script's rule it prints `STOP DRIFT`. The parsed pin ledger remains the primary source of "which
objects are PINNED"; this narrows only the weaker half.

## Dry-run evidence, rig only, 2026-09-25

Migrations directory and `CLARA_REPO`: `clara-wt/int2` on `integration/riders-cut` at
**`34b125e6f`**, the integrated head. No database was created, altered or dropped for any of this:
every negative control acts on a COPY of the migrations directory or a COPY of an exported
fingerprint, never on a database, and every run opened `begin transaction read only`.

| run | target | result |
|---|---|---|
| `--plan` | no database | **3 pending, 312 files, 0 relations created, 0 CHECK reads, 0 FK reads, 0 ADD COLUMN reads, 0 index reads, 0 UPDATE reads, 0 DELETE reads, 0 revokes, 0 drops, 40 pins (40 measurable / 0 chained), 9 hand checks, 0 GAP, exit 0** |
| pre-window + `--baseline` | `clara_rt_test` (rigw4h 55701, **309 / 0318**, `C.UTF-8`), baseline `fp-wC-hosted.json` (the gate worker's, exported from `clara_w4_coll` on rigw4c at the same frontier and at **`en_US.UTF-8`**) | **13 ok, 3 STOP.** 11346 keys compared, **11346 equal, 0 env**; **40 of 40** pins at a value their own file admits; all **nine** hand checks ok, including `D-PROBE-DRIVEN` (no row picked on that rig). The three STOPs are section (v)'s run census and the two checks derived from it, because no rig database on this host carries a bootstrapped WDK World |
| `--post` + `--baseline` | `clara_w4_hosted` (rigw4h 55701, **312 / 0323**, `C.UTF-8`), baseline `fp-wC-upg.json` | ledger **309 + 3 = 312 at 0323**, all three rows at their file checksums, drift gate 312/312, fingerprint **11356 keys, 11356 equal, 0 env**, every (f) read answered. Same run-census STOPs (2 in `--post`, where the successor-run check is a note rather than a check) |
| `--post` + `--baseline` | `clara_w4_coll` (rigw4c 55702, **312 / 0323**, `en_US.UTF-8`), the SAME `C.UTF-8` baseline | identical: **11356 keys, 11356 equal, 0 env**. This cut pins no content digest, so the collation is irrelevant by construction rather than by care - and that is now measured on both |

**The PRE reading was NOT taken on `clara_w4_hosted` itself**, and the reason is recorded rather
than glossed: by the time this script existed the gate worker had already upgraded that database to
312. Its own pre-window export, `scratchpad/wC/fp-wC-hosted.json` (309 / 0318, 11346 keys, taken
from `clara_w4_coll` BEFORE its upgrade per `reports/waveC-gates.md` §2.5), is the baseline used
above, and `clara_rt_test` - still at 309 / 0318 - is the target the pre-window mode was dry run
against.

**That makes the pre-window run a cross-collation comparison, which is better evidence than it was
designed to be.** The baseline came from an `en_US.UTF-8` database on one cluster; the target is a
`C.UTF-8` database on another; **11346 keys compared, 11346 equal, 0 env, 0 STOP**. This cut pins no
content digest, so collation was expected to be irrelevant by construction rather than by care, and
that expectation is now measured in both directions: pre across two collations, and post likewise.

**Both of the cut's data-dependent branches have now been ENTERED for real, in a migration**, by the
gate worker planting rows through the real doors (`waveC-gates.md` §2.2): 0321 read 1
source-corrected cancellation receipt where the from-scratch chain read 0, and **0323's §TAIL ran
its whole driven block** - the vacuity control, the narrowing, the `match_count` restatement, the
unknown-key control and the null-or-blank-key control - rather than its notice. On `clara_w4_coll`
both branches took the EMPTY arm. So both arms of both branches are measured, and this script's
`D-PROBE-DRIVEN` is the read-only half of the one that can refuse.

### Negative controls: every check family was proved to STOP

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | `STOP --prod: hosted estate` |
| 2 | an applied file deleted from a COPY of the directory | 3 STOPs, incl. `309 applied vs 308 file(s) at or below 0318` and `DRIFT 0100_… applied but ABSENT from the directory` |
| 3 | one applied file's bytes changed in a COPY (`0268`) | `DRIFT 0268_work_source_correction_supersede - checksum differs from the file`, drift gate STOP |
| 4 | a MEASURABLE pin's literal corrupted in a COPY (0320's `clara.wake_context()`) | `STOP PIN 0320 clara.wake_context()`, with both sides, **39 of 40** |
| 5 | a baseline value corrupted on a PINNED object (`fn:clara.wake_context()`) | `STOP DRIFT (PINNED by 0320_client_financial_pack_wake_read)` |
| 6 | a baseline value corrupted on an UNNAMED object (`fn:clara._abandon_close_core`) | `STOP DRIFT` |
| 7 | a baseline value corrupted on an object named ONLY inside 0320's carried body (`rel:cash_account_set_versions:meta`) | `STOP DRIFT` - the change-5 refinement, working |
| 8 | the SAME corrupted baseline, same key, run through **wave 4's** `reads-w4.mjs` | `ok TOLERATED (0320 … names this object and rewrites it)` - the measurement that makes change 5 a finding rather than a preference |
| 9 | `--post` against a stale chain (`clara_rt_test`, 309) | STOPs on `the ledger reads 309 + 3 = 312 at 0323`, `no ledger row` per absent file, and `STOP DRIFT (PINNED by 0320) fn:clara._client_financial_pack_core` |
| 10 | the pre-window mode against a chain ALREADY at 312 (`clara_cutint`) | 9 STOPs: the pending-set arithmetic, `D-CUT-NEWBORN` naming all ten signatures, `D-PACK-ALLOWLIST`, `D-REDERIVE-BACKLOG` (4 settlement receipts), `D-PROBE-ARITY` (2 overloads), and the pin ledger at **37 of 40** with the three failures being exactly the three recut bodies |
| 11 | `CLARA_REPO` pointed at the MAIN checkout | `bodies=57 … chatTurn=chatTurn_v21 claraWork=claraWork_v5 statementFacts=statementFacts_v3`, manifest `322 entries, 10 UNLOCKED`, `SUCCESSOR BODIES … (none)` - the script reads the tree rather than a memory |
| 12 | `CLARA_REPO` pointed at a tree with no `registry.ts` | the plan prints `(registry.ts did not parse …)`; against a database it is a `GAP` and therefore a STOP |
| 13 | a database with no WDK World (every rig here) | `STOP workflow.workflow_runs is readable …`, and the two derived checks print `NOT COMPUTED` rather than `ok` |

Control 10 is the richest of these, because it is the only one that exercised **D-PROBE-DRIVEN's
positive arm**: `clara_cutint` holds 53 trade invoices under a keyed Work, the file's own selector
picked `488a8583-6ec7-43f7-887f-6ff8f6eb8f5f`, the unnarrowed core MATCHED it and the vacuity
control held, `match_count 1`.

## What this script does NOT verify

- **Anything hosted.** It was written and exercised by an agent with no hosted access. Every number
  above is a rig reading.
- **`D-TAIL-REACH` in the negative direction.** Every rig here runs the migration as a superuser, so
  the check has only ever returned `superuser=true`. Whether hosted's migrating role INHERITS
  `clara_fn_owner` and can `SET ROLE` to `clara_agent_ro` is unread until the window, and it is the
  single most load-bearing unknown this cut carries.
- **The version-cut run census on any rig.** No rig database on this host carries a bootstrapped WDK
  World, so `workflow.workflow_runs` is absent on all four and section (v)'s first three lines have
  never returned a row. The SQL is the runtime's own (same table, same non-terminal set, same
  `bodyIdentifierOf` derivation, mirrored rather than imported); its shape is unexercised.
- **`D-PROBE-DRIVEN`'s FAILING arm.** The positive arm was driven twice: read-only here against
  `clara_cutint`, and for real by the gate worker's own migrate. A row for which the unnarrowed core
  does NOT match cannot be constructed read-only, so only the refusal path is reasoned.
- **The `--post` baseline.** `fp-wC-upg.json` is the gate worker's, exported from `clara_w4_hosted`
  after its own upgrade with the merged tree. This script did not produce it and did not verify how
  it was produced beyond reading its ledger line (312 / 0323).
