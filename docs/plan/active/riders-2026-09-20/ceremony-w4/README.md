# `ceremony-w4/reads-w4.mjs` — the riders wave-4 hosted preflight

One read-only script. It answers, before the window opens, every question the wave's 21 migration
headers ask of hosted, and it answers them by PARSING the migrations rather than by transcribing
them. It is the same design as `../ceremony-w3/reads-w3.mjs`, with six wave-4 changes, each of
which is a finding rather than a preference.

## How to run it

Offline, no database, proves the parse:

```
CLARA_MIGRATIONS_DIR=<RELEASE_SHA tree>/packages/db/migrations \
  node docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.mjs \
       --plan --frontier-before 0293_fa_arrears_judgement_scope
```

Against a rig (libpq `PG*` vars), or against hosted as a child of `scripts/ops/dsn-pipe.mjs`
through the probe:

```
# export a baseline from a rig database at the HOSTED frontier
... reads-w4.mjs --export-fingerprint fp-w4-hosted.json

# the pre-window read
PROBE=<probe-id> via-probe.sh node ... reads-w4.mjs --prod --baseline fp-w4-hosted.json

# the quiescence census alone, re-run after the machine stop
PROBE=<probe-id> via-probe.sh node ... reads-w4.mjs --census --prod

# after the migrate, against a baseline exported from an UPGRADED rig database.
# PASS --frontier-before: it always wins over the state file, and it is what lets a --post run
# re-derive `288 + 21 = 309` on a machine that did not take the pre-window reading.
PROBE=<probe-id> via-probe.sh node ... reads-w4.mjs --post --prod \
     --frontier-before 0293_fa_arrears_judgement_scope --baseline fp-w4-upg.json
```

`--pins-only` runs the body-pin ledger alone. `--state <f>` carries the pre-window ledger reading
forward so `--post` can re-derive the arithmetic; `--no-state` suppresses the write.

Exit code is non-zero when any check says STOP. A literal the script cannot parse out of a
migration is a **PARSE GAP** and also counts as a STOP, because an unchecked precondition is
unchecked.

## What it reads

1. **Identity and ledger.** `--prod` refuses anything that is not the hosted pooler estate. The
   ledger is read, the pending set is derived as the files above the live frontier, the drift gate
   runs over every applied row, and the arithmetic `288 + 21 = 309` is printed rather than assumed.
   The server's collation is printed on its own line, because this wave has a check that depends on
   it being irrelevant.
2. **The estate fingerprint** against a baseline exported by the same script from a rig database at
   the hosted frontier: every function (signature, `sha256(prosrc)`, owner, SECURITY DEFINER,
   `proconfig`, ACL), every relation (columns, constraints with `convalidated`, indexes, RLS,
   policies, triggers, view definitions, owner, ACL), the schema's types, and the `clara%` roles
   with their memberships. Role-level differences print as `env` and never STOP.
3. **The data preconditions**, generated from the executed statements and hand-written where a
   file's own DO block hides them. Every expected value is parsed from the file.
4. **The body-pin ledger** — new in wave 4, and the largest single addition.
5. **The quiescence census**, over relations parsed from the executed statements.

## The six changes from wave 3, and why each is a finding

**1. Frontier.** 288 applied / `0293_fa_arrears_judgement_scope`, 21 files above it.

**2. The `sha256(prosrc)` pins are read and re-measured, not left to the fingerprint.** Wave 3 had
a handful and let the fingerprint cover them in one place. Wave 4 carries **189 (file, signature)
pins** across the 21 files, in FIVE spellings: a `values ('sig','sha')` roster, an
`array[['sig','pre','post'], …]` roster, a scalar `if v_sha <> '…'` after a
`p.oid = '<sig>'::regprocedure` read, that same scalar form reached through a declared signature
VARIABLE, and a DISJUNCTIVE OVERRIDE, `or (<roster>[i][1] = '<sig>' and v_sha = '<sha>')`, which
widens ONE entry of a roster whose tuple carries a different value. Section 1 parses all five;
section 5b re-measures each signature on the target and compares it against the set of values its
own file admits (two where the file is bimodal for `#957` redo-safety). A mismatch is the refusal
that would fire inside the window.

The fifth spelling is how the wave-4 INTEGRATION recorded its two cross-lane bimodal admissions.
0308 admits `clara.create_accounting_plan` at either its own measured pre-image or the body 0300
splices, and `clara._plan_admit_occurrence` at either its pre-image or the body 0303 recuts, because
both lanes measured their pins on rigs that carried no sibling lane. A reader that saw only the
array tuple under-reported what the file admits: the two entries read one admitted value where the
file admits two. Both are CHAIN-INTERNAL, so no verdict moved, but the printed ledger was wrong as
evidence and is now right.

**3. A pin may be CHAIN-INTERNAL, and a chain-internal pin is not measurable before the window.**
This wave's lanes recut each other on purpose: 0299 pins `clara._assert_field_path` to the body
0296 produces, 0298 pins `clara._post_payroll_run` to the body 0297 produces, 0300 pins three
bodies 0299 produces, 0318 pins the three knowledge bodies 0310 produces, and six files splice
`clara.list_review_queue` one after another. Measuring such a pin against hosted before the window
compares the pre-wave body against a post-0296 expectation and invents a STOP. So every pin is
classified: a signature an earlier pending file PRODUCES — recuts outright, or splices by reading
its own `prosrc` into a variable and re-executing it — prints as `note CHAINED`, naming the file
that produces it, and is never counted. **136 of the 189 are measurable; 53 are chain-internal.**
The classification is parsed, never listed.

**4. An added column may carry a DEFAULT, and then the CHECK on it is not vacuous.** Wave 3's
generic CHECK reader assumed a column a pending file adds is NULL on every existing row and that
the CHECK admits NULL. 0304 adds `side text not null default 'expense'` and then constrains
`side in ('expense','revenue')`; 0305 adds `term_source text not null default
'document_service_period'` and constrains a four-column carrier rule over it. Postgres fills the
DEFAULT into every existing row as part of the ADD. So the ADD COLUMN parser captures the type and
the default, and the CHECK reader substitutes EVERY column the wave adds to that relation — its
default, or `null` where it has none — and runs the predicate as an ordinary row read. A default
it cannot parse is a GAP, never a pass. The same substitution runs for a UNIQUE index whose key or
predicate names a column the wave adds, so 0317's `uq_prepayment_schedules_source_live` is a real
duplicate census rather than a skipped one.

**5. A constraint SWAP is read with its live definition text.** Fifteen of this wave's twenty
CHECK constraints arrive as `drop constraint if exists X` + `add constraint X check (…)`. The
reader prints the CURRENT `pg_get_constraintdef` beside the new predicate, so a widening and a
narrowing are told apart by reading rather than by trusting a header.

**6. The wave MINTS two roles, and a role read is still never a STOP on drift.** 0309 creates
`clara_invite_preview` and `clara_invite_preview_login`. Their ABSENCE before the window is a
first-apply precondition and is checked (0309 refuses a half-applied set of its four objects).
The wave-3 rule is otherwise unchanged: `role:` and `rolemember:` FINGERPRINT differences print as
`env` with both sides and never count, because the rig is a trust cluster and hosted is a managed
estate whose role catalog differs for reasons no migration touches. What does still STOP is the
`fn:` ACL key for the new door's grant.

## The one check that is about collation, and why

0295 does **not** pin `my_sme_starter` v1's stored `content_sha256`. That value moves with the
server's `lc_collate`: GitHub Actions run 35954298990 and hosted Supabase are `en_US.UTF-8` and
read `673ede91…`, while every rig here is `C.UTF-8` and reads `d02a786a…`. What 0295 pins instead
is a STRUCTURAL digest — 0150's own canonical form with `collate "C"` written onto both ORDER BYs,
identical on every server by construction. `D-CHART-V1` parses that helper's body out of the file
and runs it as a plain SELECT, so the read and the refusal ask the same question on any server,
and it separately proves the stored digest reproduces from v1's own rows on THIS server. Both
halves were exercised on both collations (below).

## Dry-run evidence, rig only, 2026-09-24

Migrations directory: `clara-wt/int2` on `integration/riders-w4` at **`fb1dae78a`, the FINAL
integration head** (all seven lanes merged). Re-derived at `89e0a408f`, `2f7ada3a8`, `bb102839c`
and `fb1dae78a`; the pending set, the file count, the 189/136/53 pin split and both verdicts are
the same at every one. No database was created, altered or dropped for any of
this: every negative control acts on a COPY of the migrations directory or a COPY of the exported
fingerprint, never on a database.

| run | target | result |
|---|---|---|
| `--plan` | no database | 21 pending, 309 files, 8 new relations, 20 CHECK reads (15 of them swaps), 4 FK reads, 9 ADD COLUMN reads, 20 index reads, 10 UPDATE reads, 4 DELETE reads, 1 revoke, 2 drops, 189 pins (136 measurable / 53 chained), 16 hand checks, **0 GAP**, exit 0 |
| `--export-fingerprint` | `clara_w4_hosted` (rigw4h 55701, 288 / 0293, `C.UTF-8`) | 10976 structural keys, 58 reference counts |
| `--state` written | beside the export | `{frontier_before: 0293…, applied_before: 288, pending: [21]}`, so a later `--post` can re-derive the arithmetic on another machine |
| pre-window + `--baseline` | `clara_w4_hosted` | **verdict CLEAN, exit 0** |
| pre-window + `--baseline` (the C.UTF-8 baseline) | `clara_w4_coll` (rigw4c 55702, same frontier, `en_US.UTF-8`) | **verdict CLEAN, exit 0** — 10976 keys compared, all equal, 0 env; the structural digest MATCHES the pin on both while the stored digest reads `d02a786a…` on one and `673ede91…` on the other |

### Negative controls: every check family was proved to STOP

| # | what was changed | result |
|---|---|---|
| 1 | `--prod` against a rig | STOP `--prod: hosted estate` |
| 2 | an applied file deleted from a copy of the directory | 3 STOPs, incl. `288 applied vs 287 file(s) at or below 0293` |
| 3 | one applied file's bytes changed | drift gate STOP |
| 4 | a MEASURABLE body pin's literal corrupted (0295's `_coa_template_content_sha256`) | `STOP PIN 0295 …`, 135 of 136 |
| 5 | 0295's collation-independent structural pin corrupted | `STOP D-CHART-V1 … structural digest DIFFERS`, with both sides |
| 6 | 0311's twelve-row catalogue digest corrupted | `STOP D-FIRM-SETUP … digest DIFFERS`, with both sides |
| 7 | 0296's registry row-count literal changed 240 → 241 | `STOP D-REGISTRY-W4 … rows=240 (expected 241)` |
| 8 | 0309's minted role renamed to one that already exists | `STOP D-ROLE-PAIR … role pair present=1/2` |
| 9 | 0295's structural-pin anchor sentence removed | `GAP literal 0295's collation-independent structural digest`, exit 1 |
| 10 | a CHECK narrowed in a file copy, on a POPULATED relation | `STOP … 240 existing row(s) would fail` |
| 11 | 0315's `drop function if exists` rewritten as a BARE drop of an absent body | `STOP D-DROP-… A BARE drop: the signature must exist today` |
| 12 | `--post` against a stale chain (`clara_w4int`, 303 / the pre-renumber `0317`) | STOPs on `the ledger reads 288 + 21 = 309 at 0318` plus `no ledger row` per absent file |
| 13 | a baseline value corrupted on a PINNED object | `STOP DRIFT (PINNED by 0295_wave4_chart_rows) fn:clara._coa_template_content_sha256(uuid)` |
| 14 | a baseline ROLE attribute corrupted AND a membership invented | two `env` lines with both sides, **verdict CLEAN, exit 0** |
| 15 | a baseline value corrupted on an UNNAMED object | `STOP DRIFT fn:clara._abandon_close_core(…)` |

Control 13 is the reason this script differs from wave 3's in one more place than the six above.
On its first run it came back **CLEAN** — a corrupted pin on a pinned body printed as TOLERATED.
The cause: wave 3's prestate detector takes the first DDL statement as the end of a file's
prestate, and 0295 opens with a `create function pg_temp.p295_struct_sha256(…)` helper, so the
detector truncated 0295's prestate to nothing and saw none of its three pins. The fix has two
halves, both principled: the PARSED pin ledger is now the primary source of "which objects are
pinned" (a parsed pin is not a guess), and the prestate boundary skips a file's own `pg_temp` and
`create temp table` scratch. Controls 13 and 15 then separate correctly.

## What this script does NOT verify

- **Anything hosted.** It was written and exercised by an agent with no hosted access. Every
  number above is a rig reading.
- **The `--post` baseline.** It must be exported from a rig database upgraded with the MERGED
  tree. `clara_w4int` on `rigw4` (55700) is stale by construction and was used only as negative
  control 12. Gate A owns the real baseline and the real `--post` run.
- **The populated-row behaviour of the wave's constraint swaps.** On the rig
  `document_processing_tasks`, `document_extractions`, `entry_post_receipts`,
  `accrual_adjustments` and `prepayment_schedules` all hold ZERO rows, so every "would this pass"
  read returned a trivially clean answer. The negative control that needed real rows was run
  against `clara.document_capabilities` (240 rows) instead. Hosted's own row counts are what the
  pre-window read will print.
- **The registry raise's cost at hosted scale.** The wave rewrites all 240 capability rows TWICE,
  each row firing four triggers. That is 1,920 trigger firings, measured as a count and not as a
  duration.
