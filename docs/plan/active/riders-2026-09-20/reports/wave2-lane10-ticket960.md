# Wave 2 · Lane 10 · ticket #960 — the firm sets its own document-processing caps

**Branch** `riders/w2-lane10` · **base** `23cfad947b5598214168ba9c43d391b4e16aa745` · **head** `6f5b708c87e781dfcc6881ba838a5b9cfb7e03c3`
**Database** `127.0.0.1:55750/clara_l10`, frontier **231 files**, top version `0270_firm_document_limits_writer`
**Status: DONE.**

## The ticket was still live

`gh issue view 960 --comments` on 2026-09-20: OPEN, labels `enhancement`, `ready-for-agent`, one
comment by `belcorttao` dated 2026-09-19T19:47:37Z carrying the **owner's ruling (2026-09-20)** and
the newest Agent Brief. That ruling OVERRULES the ticket body's own recommendation (option A, an
operator-only door) with **option C**: the firm's own owner or admin sets all four caps freely, with
no operator gate; every change is receipted and audited as usage-billing evidence; the estate's own
safety limits stay the absolute ceiling above whatever a firm sets.

Measured on this branch before building: `clara.firm_document_limits` had **no human writer at all**
— the only routine in the whole schema whose body writes it was `clara._tf_firm_document_limits_upsert`,
EXECUTE-granted to nobody (asserted live by C-26 in `packages/db/tests/rig-docs-metering.test.mjs`,
which went RED the moment this ticket's door landed and is updated below). Nothing in wave 1 or in
this lane's earlier tickets (#871 stopped, #872 = migration 0269, #996 = web only) had touched it.

## Commits (7, all on the lane branch, none pushed)

| commit | what |
|---|---|
| `5fcac5852` | feat(db): the door, minimal — cell 1 green |
| `6649a4f42` | feat(db): the receipt's before-image + the audit row's both-sides — cells 2, 3 |
| `122bd3b2b` | feat(db): the estate ceiling, the floor mirror, the no-cap-named refusal — cells 4, 5 |
| `e5852b443` | docs(db): the migration's full header/prestate/tail; C-26, #692's header, CONTEXT.md |
| `015ce968f` | feat(web): `lib/firm/capacity-doors.ts` — the door wrapper + the deterministic op key |
| `8ba1e046c` | feat(web): the card's control and the panel's wiring; `apps/web/README.md` |
| `6f5b708c8` | test(web): the browser walk over the control |

## The seams I tested at (written before the first test)

The brief names these and no others; no cell reaches around them.

1. **`clara.set_firm_document_limits(int,int,int,int,text)`** — the new governed write, driven
   through `humanQuery` as a real `clara_authenticated` session with a real
   `request.jwt.claims.sub`. (`packages/db/tests/firm-document-limits-writer.test.mjs`)
2. **`clara.get_firm_commercial_state()`** — the shipped read the card already calls; the seam at
   which "a firm with no stored row is a named zero" and "the caps a firm wrote are what it reads"
   are both observable.
3. **The doors that ENFORCE a cap** (`_reserve_document_ingest`, `_reserve_processing_call`,
   `claim_document_processing_task`, `settle_ingest_reservation`, `_resize_document_reservation`,
   `_settle_document_reservation`) — observed as a catalog census of unmoved bodies, which is the
   honest proof of "keeps its existing fallback".
4. **`setFirmDocumentLimits` / `processingCapsOpKey`** in `apps/web/lib/firm/capacity-doors.ts` —
   the app's write seam, driven through a mocked `fetch` at the PostgREST boundary.
5. **`ProcessingCapacityCard`'s rendered behaviour** — mounted, with a stub `save` recording what
   the card hands it.
6. **`/settings/firm` in a real browser** — `apps/web/e2e/firm-commercial-walk.spec.ts`.

## How it was built (vertical slices, one at a time)

Each row is one red-for-the-right-reason → minimal code → green cycle. The migration was re-applied
between rounds with the #957 redo mode (`CLARA_MIGRATION_REDO=0270_firm_document_limits_writer`,
destructive guard set, highest applied version) — **six redos**, recorded here as the work order asks.
The file is `create or replace` throughout and its prestate asserts nothing about the absence of its
own objects, so a redo over its old effects is safe.

| # | the red | the minimal code it drove |
|---|---|---|
| 1 | cell 1: `clara.set_firm_document_limits` is absent | the door: admin floor, required op_key, `_reserve_op`/`_finish_op`, the write riding 0196's trigger, a `_audit` row, a receipt stating all four resulting caps |
| 2 | cell 2: `receipt.previous` is `undefined` | the per-firm advisory key + `for update` before-image; `previous`, `changed`, `created` on the receipt |
| 3 | cell 3: `audit.args.changes` is `undefined` | `changes` (old/new per moved cap) and `previous` on the audit args |
| 4 | cell 4: `docs_per_day = 10001` SUCCEEDED | `clara._firm_document_limit_ceiling(text)` + the ceiling refusal naming cap and number |
| 5 | cell 5: `docs_per_day = 0` raised a raw `23514` | the floor mirror (`invalid_cap`) and the `no_cap_named` refusal |
| 6 | cell 7(c): the op-key reuse refusal carried no `detail.reason` | the `exception when sqlstate 'CLR10'` wrap → `op_key_conflict`, plus the `pending` → CLR13 arm |
| 7 | web cell 1: `lib/firm/capacity-doors` does not resolve | the wrapper module |
| 8 | card cells 1, 2, 4, 5: no control, no fields | the card's overlay fields, the edit set, the receipt/refusal faces |
| 9 | panel cell `p960.web.save_rereads`: `setCaps` is not a prop | the panel's `saveCaps` (deterministic op key + unconditional re-read) |

Cells 6, 8 and 9 of the DB battery were **green on arrival** and say so in their own headers: they
pin the estate's shared preamble (`_human_ctx`'s CLR04, `_reserve_op`'s replay) and the catalog
census that the repo's documented standard asks for (work order rule 4's carve-out). They are worth
their place because a door that read `clara.jwt_firm()` directly, or one that re-derived a receipt
instead of returning the stored one, would be green everywhere else in the battery and wrong here.

**One honest deviation.** In web slice 7 I wrote the decoder and the refusal mapping in the same
cut as the call-shape cell, ahead of the cells that pin them (capacity-doors.test.ts cells 2 and 3).
That is speculative code by the work order's definition. I ran the vacuity control rather than
leave it unproven: the subject was deliberately broken (`||` → `&&` in the positive-check guard,
and `err.reason ?? null` → `null`), both cells went RED, and the subject was restored byte for byte
from a copy taken before the edit — the restored file is what `015ce968f` contains.

## Acceptance criteria, each with its evidence

| AC | verdict | evidence |
|---|---|---|
| A firm's own owner or admin can set each of the four caps independently, with no operator-side surface | **met** | `#960 cell 1` (owner, first write), `#960 cell 3` (admin, two caps), `#960 cell 4` (all four at the ceiling, one at a time above it). The door takes **no `p_firm` argument**, asserted in the migration tail (T.5). No operator surface exists or was added. |
| A write naming one cap leaves the other three at their stored values | **met** | `#960 cell 2`: baseline 11/22/3/4, a write naming `pages_per_day: 77`, receipt `caps` = 11/77/3/4 and `changed` = `["pages_per_day"]`; the stored row re-read agrees. The baseline shares no value with the relation's first-insert values, so "preserved" cannot be mistaken for "reset to a matching default". |
| Any identity below the firm's admin floor is refused with a typed error, not a silent no-op | **met** | `#960 cell 6`: bookkeeper and viewer both raise **CLR04 `insufficient role`** (the estate's own sentence, verbatim); a person with no membership raises CLR04 `actor has no active membership`; after three refusals the cap has not moved and the audit trail still holds exactly one row. |
| No value above the stated estate maximum is accepted, and the refusal names the ceiling | **met** | `#960 cell 4`: each cap ACCEPTED **at** its ceiling (10000 / 100000 / 16 / 16) and REFUSED at ceiling+1 with `CLR10` + `detail.reason = cap_above_ceiling`, the message containing both the cap name and the number. The ceiling lives in `clara._firm_document_limit_ceiling`, granted to nobody (`#960 cell 9`, migration tail T.4). |
| Every accepted write produces a readable receipt and an audit entry naming the actor, the firm, and the before and after value of every changed cap | **met** | `#960 cell 3`: the audit row carries `firm_id`, `actor` (the ADMIN, not the firm's owner), `outcome = ok`, and `args.changes = {pages_per_day:{old:22,new:77}, llm_witness_concurrency:{old:4,new:9}}` — a cap re-named at the value it already held is absent, because the comparison is between the two ROW IMAGES, never between the arguments. `#960 cell 7`: the receipt is durable (a replay under the same op key returns the ORIGINAL receipt and writes no second audit row) and a re-affirmation under a NEW key is still receipted with `changed: []`. |
| The card shows a working control only to the firm's owner or admin | **met** | `ticket 960 — the card renders one field per cap…` and `…a denied or still-loading read renders NO control at all` (unit); `p635.web.rank_shaping` + the four axe scans still clean; the browser walk's bookkeeper cell now asserts **no save button and no cap field**, and its owner cell drives the control end to end. The control rides the same admin-floored read as the figures — never a client-side rank guess — and `clara.set_firm_document_limits` re-derives the floor for itself. |
| A firm with no stored row still renders as a named zero until its first write | **met** | `#960 cell 8`: `get_firm_commercial_state().capacity` is four NULLs before the first write and the stored four after it. `ticket 960 — a firm with no stored row keeps its NAMED ZERO…`: the card keeps the "No per-firm processing caps are recorded" sentence and its fields start **empty** — it never pre-fills the relation's first-insert values. |
| Every door enforcing a cap keeps its existing fallback when no row exists | **met** | `#960 cell 9(a)`: nine bodies pinned by `sha256(prosrc)` and re-measured — the six enforcing doors, the upsert trigger and `get_firm_commercial_state` are byte-identical to the pre-image measured before 0270 applied; the probe is proven non-vacuous against a body 0270 did write. The same nine pins are asserted in the migration's prestate AND again in its tail. |

## The migration

**`packages/db/migrations/0270_firm_document_limits_writer.sql`** — the number reserved for me; one
file; no applied migration and no other ticket's migration edited. Stable stem
`firm_document_limits_writer$`.

It adds exactly two routines and one grant:

- `clara._firm_document_limit_ceiling(text) returns int` — `immutable sql`, owner `clara_fn_owner`,
  pinned `search_path`, **granted to nobody** (PUBLIC's default EXECUTE revoked). `docs_per_day`
  10000, `pages_per_day` 100000, `ocr_concurrency` 16, `llm_witness_concurrency` 16, NULL for any
  other name.
- `clara.set_firm_document_limits(int,int,int,int,text) returns jsonb` — `security definer`, owner
  `clara_fn_owner`, pinned `search_path`, EXECUTE to `clara_authenticated` alone (PUBLIC revoked).

**Why those four numbers**, stated in §A's header: the estate runs ONE always-on `clara-runtime`
machine (`docs/ARCHITECTURE.md`'s deployment table — `min_machines_running = 1`,
`auto_stop_machines = false`, and the paragraph under it that says this is deliberately not high
availability), so a per-firm concurrency ceiling of 16 is already far above anything this deployment
runs in parallel; it exists so a firm cannot write a number that queues unbounded vendor calls
against a shared machine. The two daily ceilings are 100× the relation's own first-insert values
(0196's trigger: 100 / 1000). **This is a door-carried bound, not a column CHECK** — the brief's own
sentence ("the door carries it"), and a CHECK would be the estate telling every existing row it is
illegal. Nothing in the file touches the relation's constraint set.

### Prestate pins, MEASURED on this rig before 0270 applied

`sha256(prosrc)`, hex — nine bodies this file must not touch, all re-measured in the tail:

| body | pin |
|---|---|
| `clara._tf_firm_document_limits_upsert()` | `e07fabd4e475ae29ac8b5fa6a4f8477f72698df26110bfe8d4f3e456aa1f8eb2` |
| `clara._reserve_document_ingest(uuid,uuid,integer,timestamp with time zone)` | `074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734` |
| `clara._reserve_processing_call(uuid,integer)` | `a713fa374a9069e08862a5a234ad0df6f5303a4223de3bdaaeafc99ae4358043` |
| `clara._resize_document_reservation(uuid,uuid,integer)` | `41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf` |
| `clara._settle_document_reservation(uuid,uuid,integer)` | `b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6` |
| `clara._settle_processing_call(uuid,integer)` | `e8b50f0d10da45be4caf6e278248750a4b1e862148dc879fbe38e7a5b4a02408` |
| `clara.claim_document_processing_task(uuid,text,boolean)` | `01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0` |
| `clara.settle_ingest_reservation(uuid,integer,text)` | `a7b8d4eeed2c17bfaf252fe73e2185c78255ce4d1e10fac2b933619ff50a9aab` |
| `clara.get_firm_commercial_state()` | `347141ee22b52c125ff845451051f03354f1f0e9d57cc43d759253f3273ed19e` |

Plus, as canonical strings: the relation's seven columns in order; its seven constraints
(`sha256` = `46f4fb30d8e3d03cfe8d78d3b32aefb5afaadea73c4da3571aac15f9f420c6d4`); its four trigger
names; and its application-role grant matrix `clara_authenticated:SELECT` — asserted in **both
directions** (the brief forbids narrowing the read grant; this file widens nothing either). The six
shared preamble routines (`_human_ctx`, `role_rank`, `_reserve_op`, `_finish_op`, `_audit`, `_hash`)
are checked to resolve.

### Tail census (§D)

Both routines resolve; the ceiling answers the four caps and NULL for anything else; both postures
and ACLs are byte-exact (no PUBLIC entry on either); the door's body carries the admin floor, the op
reservation, the audit call, the finish call and the ceiling call, and **no `p_firm`**; the door
raises exactly 6 times and carries exactly 6 `detail.reason` payloads (the seventh refusal, CLR04, is
`_human_ctx`'s own and deliberately carries none — the code alone is the discriminant); the nine pins
are unmoved; and the relation's columns, constraints, triggers, FORCE RLS and grant matrix are
unmoved.

**Applied checksum on the lane database:** `c8704828dcd45f548f59728b2f0c695fa627a0f81ce56e86dafd9e036a2d117d`.

### Gate plumbing that ships with it

- `packages/db/tests/firm-document-limits-writer-preintegration-gate.mjs` (stem-probed readiness,
  env `CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS_WRITER`);
- its `--import` token appended in migration order in `packages/db/package.json`'s `test` script
  (one-token hunk, after `invite-issuer-lapsed`, this lane's own 0269 gate);
- `packages/db/tests/rig-meta.mjs`: cohort `FIRM_DOCUMENT_LIMITS_0270_COHORT`, bimodal like 0234's,
  added to `ALLOWED[clara_authenticated]` and to the cohort sweep, so `operation-census` can
  attribute the new grant (it fails `unattributed` otherwise).

## Gates, with counts

| gate | command | result |
|---|---|---|
| the new DB battery, full gate chain | `node --test --test-concurrency=1 $GATES tests/firm-document-limits-writer.test.mjs` | **9 pass / 0 fail / 0 skip** |
| every DB test file I touched + the two mandated sweeps + the gate chain | `… tests/firm-document-limits-writer.test.mjs tests/firm-document-limits.test.mjs tests/rig-docs-metering.test.mjs tests/operation-census.test.mjs tests/rig-isolation.test.mjs tests/preintegration-gate-chain.test.mjs` | **62 tests, 59 pass / 0 fail / 3 skip** |
| focused pre-integration acceptance (gate chain NOT preloaded, variable UNSET) | `node --test --test-concurrency=1 tests/firm-document-limits-writer.test.mjs` | **9 pass / 0 fail / 0 skip** |
| `pnpm typecheck` | worktree root | **Done** (web + runtime) |
| `pnpm lint` | worktree root | **Done** (web incl. token-contrast, test-manifest, message-keys, ui-add guards; db; runtime; reporting-render) |
| the WHOLE web unit suite, once | `node scripts/run-tests.mjs` from `apps/web` | **4780 tests, 4778 pass / 0 fail / 2 skip** |
| the browser walk I touched, on MY triple | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3590 CLARA_E2E_NEXT_PORT=3591 CLARA_E2E_RUNTIME_PORT=3592 pnpm --filter @clara/web e2e firm-commercial-walk` | **10 passed (23.2s)**, including the new cap cell and its axe scan |

`operation-census` and `rig-isolation` were run **without** `CLARA_RIG_ALLOW_RESET` /
`CLARA_RIG_ALLOW_ROLE_SWEEP`, as the rig requires.

**The three skips, named.** `rig-isolation` T10b and T10b-AC2 skip because a Workflow/WDK World is
bootstrapped on this lane database (RIG.md's known #866 disposition — PUBLIC EXECUTE on the World's
own functions is upstream default behaviour, not a clara RBAC leak). `rig-isolation` T19 skips
because it is destructive and needs `CLARA_RIG_ALLOW_RESET`, which the rig forbids. The 2 web-suite
skips are the pre-existing environment skips (no `pg_dump` on PATH / the Defender-EICAR arm), not
anything this ticket touched. `packages/runtime` was not touched, so its frozen-workflow and
parts-parity gates were not required and were not run.

**No known Windows-only red was "fixed".** None fired in these runs.

## Docs, in the same commits

- `packages/db/migrations/0270_…sql` — the header IS the design record (the ruling verbatim, why
  the door rides 0196's trigger rather than re-expressing preservation, why there is no `p_firm`,
  why the floor is admin, why the ceiling is a function and not a CHECK, why the receipt states all
  four caps, and the four "does not do" items).
- `packages/db/tests/rig-docs-metering.test.mjs` — **C-26's writer census updated**: the roster is
  now two names with their reachability spelled out (`_tf_firm_document_limits_upsert` reachable by
  0 app roles, `set_firm_document_limits` reachable by 1), and its header records that the TABLE is
  still unwritable by every application role — the half that did not move. This cell went red on the
  first apply and is what caught the change; it was not weakened, it was re-stated.
- `packages/db/tests/firm-document-limits.test.mjs` — #692's header no longer claims the relation
  has no human writer, and says why that battery still runs as root.
- `CONTEXT.md` — new entry **“Processing cap / 处理上限”** in the house `term / _Avoid_` shape,
  appended under a `<!-- #960 -->` marker (minimal hunk in a nine-lane shared file).
- `apps/web/README.md` — `/settings/firm`'s "what this page deliberately does not have" loses the
  processing-caps line and gains the three properties that matter at the surface.
- `apps/web/messages/en.json` — `capacitySubheading` and `capacitySourceNote` rewritten (they said
  the operator sets the caps and there is no control), plus eight new keys.
- `apps/web/test/manifest.txt` — two new entries at their sorted positions.

## Successor contract

Nothing here needs it *today*: this ticket ships no chat tool and no Work part, and no frozen body
was edited (`packages/runtime` is untouched). Recorded for the wave-4 `chatTurn_v22` / `claraWork_v6`
cut, should the owner want Clara to be able to change a firm's caps conversationally.

- **Name:** `set_firm_processing_caps`
- **Zod input:**
  ```ts
  z.object({
    docs_per_day: z.number().int().positive().max(10_000).optional(),
    pages_per_day: z.number().int().positive().max(100_000).optional(),
    ocr_concurrency: z.number().int().positive().max(16).optional(),
    llm_witness_concurrency: z.number().int().positive().max(16).optional(),
  }).refine((v) => Object.keys(v).length > 0, { message: "name at least one cap" })
  ```
  The `.max()` bounds are a COURTESY that must be kept in step with
  `clara._firm_document_limit_ceiling`; the door is the wall, and a tool that dropped them would
  still be correct, only ruder.
- **Door call, argument order:** `clara.set_firm_document_limits(p_docs_per_day, p_pages_per_day,
  p_ocr_concurrency, p_llm_witness_concurrency, p_op_key)`. All five have defaults, so the call is
  by NAME; a cap the turn does not mean to move is **omitted**, never sent as null-with-intent and
  never re-sent at its current value. `p_op_key` is required and must be deterministic in
  (actor, exact edit) — `apps/web/lib/firm/capacity-doors.ts`'s `processingCapsOpKey` is the shape.
- **Refusal mapping:** `CLR04` (no `detail`) → "only an owner or admin of this firm may change its
  processing caps"; `CLR10 · invalid_op_key` → internal, retry with a key; `CLR10 · no_cap_named` →
  ask which cap; `CLR10 · invalid_cap` → the message names the cap, render it; `CLR10 ·
  cap_above_ceiling` → render the message VERBATIM (it names the estate's number, and that sentence
  is the only place a caller learns it); `CLR10 · op_key_conflict` → this key already did something
  else, mint a fresh one for a genuinely different edit; `CLR13 · operation_in_flight` → the same
  change is already being recorded, wait and re-read.
- **Part kind:** `receipt` (the existing kind), rendering `caps`, `previous`, `changed` and
  `created` — never a fresh figure derived in the part; the numbers come from
  `clara.get_firm_commercial_state` afterwards.
- **Prompt stanza:** "A firm's four document-processing caps are the firm's own. An owner or admin
  may set any of them; nobody else may, and BELCORT does not set them for a firm. Change only the
  caps the person actually asked about — the others keep whatever they hold. Clara's estate has its
  own ceiling above whatever a firm sets; if a number is refused for exceeding it, repeat the
  refusal as written rather than guessing a number that would fit. A firm that has never set a cap
  has none stored: say so, rather than quoting the figures the processing lanes fall back to."

## Follow-ups worth filing

1. **The ceiling is not readable from the surface.** The card learns the estate's maximum only from
   a refusal. Exposing it would mean either recutting `clara.get_firm_commercial_state`'s `capacity`
   object (a 0233 body, which this ticket deliberately did not touch) or a second read; both were
   out of this ticket's minimal path. Until then a person discovers the bound by hitting it, which
   is the AdmissionCapacityPanel precedent but is not lovely.
2. **`clara.firm_limits.max_concurrent_runs` still has no surface**, and the brief puts it out of
   scope deliberately. It is now the only per-firm cap with no human writer.
3. **No "reset to Clara's defaults" affordance**, because no door can unset a cap — a row, once
   written, keeps its four numbers. If a firm wants "whatever Clara thinks is right", the only
   honest answer today is to type the first-insert values back in, which is not the same thing.
4. **The audit trail is not readable as history anywhere.** These rows are billing evidence by the
   owner's own ruling, and `clara.audit_log` has no human read in the estate (CONTEXT.md's "Access
   history" entry already names this gap for the membership lane; this ticket adds a second
   constituency for it).

## Unverified

- **The four ceiling numbers are a judgement, not a measurement.** The reasoning is grounded in a
  checkable fact (one always-on runtime machine, `docs/ARCHITECTURE.md`) and in the relation's own
  first-insert values, but no load test establishes that 16 concurrent OCR tasks for one firm is
  where the estate actually starts to hurt, and no usage data establishes that 10,000 documents a
  day is past what a Malaysian firm ingests. They are deliberately generous and deliberately
  finite; the owner may want to rule on them.
- **Admin rank is not walked in the browser**, for the reason `firm-commercial-walk.spec.ts`'s own
  header already records as a named residual: `e2e/serve-built.mjs` derives the persona from the
  email prefix and has no rank-2 one, and adding one would edit a CORE arm nine lanes share. Admin
  is proven in the DB battery (`#960 cell 3` drives the ADMIN, not the owner) and in the unit cells.
- **Concurrency is argued, not driven.** The advisory key + `for update` are reasoned about in the
  migration header (two admins would otherwise claim the same `previous` on receipts that are
  billing evidence), and the lock's presence is asserted, but no two-session race cell drives it.
  `rig-docs-metering`'s own storm cells cover the adjacent ingest lock; this door's has no equivalent.
- **The redo path was exercised six times on this rig and never on a fresh chain.** The integrator's
  from-scratch proof on a disposable cluster is what establishes that 0270 applies cleanly from
  0001; my evidence is that its prestate and tail both pass against the 230-file frontier this lane
  was handed.
