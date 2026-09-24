# Riders wave 4 — lane 05 fix round (tickets #933, #871)

**Branch** `riders/w4-lane05` · **base** `cd2925391` · **head before this round** `0d119de80` ·
**NEW HEAD `7d6c9b3c410474bcd95c2ab5a2a609d84cd88e2f`**

Two commits added, one per axis of change:

| commit | what |
|---|---|
| `7a58adca5` | `fix(db): #871 the invite-preview door stops pinning a hosted census and stops sliding its own wall` — ADV-L05-01 (blocker), ADV-L05-04, SPEC-871-B, SPEC-871-C, ADV-L05-07, ADV-L05-08, plus the redo-safety that made re-applying 0309 possible at all |
| `7d6c9b3c4` | `fix(runtime): #933 the proposal keeps the bounds the door has, and only the grounds that speak for the row` — ADV-L05-02, ADV-L05-03, ADV-L05-05, ADV-L05-06, STD-1 |

`git status` in the worktree is clean. Nothing was pushed, no PR was opened, no GitHub object was
written, no other worktree was touched. `apps/web/lib/firm/needs-you.ts` was not touched.

---

## Verdicts, one line each

| id | severity | verdict |
|---|---|---|
| ADV-L05-01 | blocker | **FIXED** — reproduced on `clara_l05` (CLR10 `expected 18 … found 19`), then the absolute census replaced by a named roster |
| ADV-L05-02 | major | **FIXED** — reproduced (214-char description → `safeParse false`; 401-char reason → `safeParse false`); both invented bounds resolved, one by deletion and one by making the producer honour it |
| ADV-L05-03 | major | **FIXED** — reproduced (a `Date` gives `start_date` = `2026-09-14T16:00:00.000Z` and a `Tue Sep 15 2026 00:00:00 GMT+0800` in the prose); the derivation now refuses it by name, and the corrected contract SQL is restated below |
| ADV-L05-04 | major | **FIXED** — reproduced with the shipped body in a rolled-back transaction (waits 120 s → 180 s → 240 s, 8 rows); the wall now counts before it writes (~60 s → ~60 s, 5 rows) |
| ADV-L05-05 | minor | **FIXED** — one account rule on all three grounds |
| ADV-L05-06 | minor | **FIXED** — the knowledge arm gets the siblings' disagreement rule; `residualCents` deleted from all three ground types and the sibling sentence sharpened |
| ADV-L05-07 | minor | **FIXED** — the census cell keys on the file STEM |
| ADV-L05-08 | minor | **FIXED** — `roles-bootstrap.sql`'s VERIFY census trued (21 = 20 schema lanes + `clara_storage_docs`) |
| SPEC-871-A | minor | **NOT A CODE CHANGE — needs the owner's ratification.** See below |
| SPEC-871-B | minor | **FIXED** — the signed-in preview is now driven for the same five invites |
| SPEC-871-C | minor | **FIXED** — the mask gets a live drift pin in the tail and in the battery |
| STD-1 | minor (smell) | **FIXED** — one hook, `components/registers/use-fa-particulars-proposal.ts` |

---

## ADV-L05-01 (BLOCKER) — the hosted role census

**Reproduced first.** On `clara_l05`, inside a rolled-back transaction carrying one deploy-shaped
extra role, the shipped prestate block raised

```
ERROR CLR10 #871 prestate: expected 18 clara-prefixed roles before this file, found 19
```

which on hosted would have stopped the wave-4 migrate step at 0309, inside the release window, with
a message pointing the operator at `scripts/role-census-reset.mjs` — a destructive act on a live
cluster.

**The fix.** §0(b) no longer compares a cluster-wide count with a literal. It lists the **eighteen
chain-minted `clara%` roles by name** and requires them present (`to_regrole(name) is null` ⇒ raise),
which is the premise this file actually depends on and the precedent 0160 and 0163 already set
(both assert role presence/absence, never a count). The count is still **recorded**, so §D.T4 can
prove the file moved it by exactly two — a relative delta, and mode-aware (a redo moves it by zero).

**The cells, and they are not vacuous.**
`p871.prestate.hosted_shaped` (a) derives the expected roster from `rig-cluster-reset.mjs`'s
`CHAIN_MINTED_ROLES` — itself derived from `deploy/roles-bootstrap.sql` at module load — minus this
file's own pair, and compares it with the roster parsed out of the migration text; (b) asserts no
`rolname like 'clara%' … <> <literal>` appears anywhere in the prestate; (c) inside a rolled-back
transaction creates a deploy-shaped role, shows the roster predicate still admitting on a
hosted-shaped census of 21, and shows the **removed** absolute form reading 19 on the same
transaction — the blocker, kept as a permanent reproduction. Checked against the pre-fix file: the
roster block is absent (length 0), the absolute-census regex matches, and neither redo-safe shape is
present, so all three assertions fail on the old text.

`p871.prestate.first_or_redo` pins the redo-safe statement shapes, the half-applied refusal and the
mode-aware delta.

### The redo-safety this required, and the FIRST-APPLY proof

0309 as shipped had a bare `create table` and a prestate that refused if any of its objects existed,
so `CLARA_MIGRATION_REDO` could not re-apply an edited file at all. It is now redo-safe by
construction (`create table if not exists`, `create index if not exists`, `drop policy`/`drop
trigger if exists` before each create, `create or replace function`), and the prestate reports
**FIRST** (all four of its own objects absent) or **REDO** (all four present) and **refuses every
half** rather than repairing it. The pins in §0(c) are *not* bimodal: this file recuts no body.

The wave-3 addendum requires the branch a redo cannot enter to be driven by hand. Done, on
`clara_l05`, in one rolled-back transaction:

```
PRE-IMAGE: {"clara_roles":18,"door_gone":true,"table_gone":true}
HOSTED-SHAPED CENSUS (pre-apply): 19
FIRST APPLY: OK
  [notice] #871 prestate: the 18 chain-minted clara roles this file relies on are all present;
           the cluster-wide clara% census reads 19 and is RECORDED, not pinned …
  [notice] #871 tail OK: …
POST: {"clara_roles":21,"door":1,"tbl":1}
AFTER ROLLBACK: {"clara_roles":20,"probe_role":0,"door":"clara.preview_invite_by_token(text,bytea)",
                 "tbl":"clara.invite_preview_attempts"}
```

So the first apply was proven **on exactly the census that used to abort it**, and the lane database
is unmoved. The REDO branch is proven by the re-apply itself:
`CLARA_MIGRATION_REDO=0309_invite_preview_public_door node scripts/migrate.mjs` →
`redid 0309_invite_preview_public_door · new checksum 63a57bdc36a610a88f245358f07518f5e5e20e7c0dfe597d8e7c9a27fa036200`.

> **Integrator, two things.** (1) 0309's checksum moved; that is expected for an unmerged file.
> (2) The file still has to pass a true from-scratch chain, which it now does **without** depending
> on the cluster's total role count.

---

## ADV-L05-04 (major) — the wall that fed itself

**Reproduced first**, with the shipped body restored inside a rolled-back transaction and a worked
example planted rather than produced (five attempts on one token at 14, 13, 12, 11 and 10 minutes
ago, so the expected numbers come from the timestamps and not from re-running the door's own
arithmetic):

```
SHIPPED (insert-first) body:
  1st refusal retry_after_seconds = 120
  2nd refusal retry_after_seconds = 180
  3rd refusal retry_after_seconds = 240
  rows for this token after 5 planted + 3 refused calls = 8
```

Each refusal pushed the wait **further out** and left another unprunable row — from a public,
unauthenticated page GET. Anyone holding a forwarded invite link could keep a real invitee's preview
shut indefinitely.

**The fix.** The wall counts both windows **before** it writes anything, under the two advisory
locks it already took (so this is the same serialized decision, one statement earlier — not a
check-then-act race). A refused call writes nothing. Because no row is inserted to carry, the retry
arithmetic becomes the plain one: with `v_count` rows in a limb's window a future call is admitted
once `v_count - 4` have expired, the last of which is the ascending row at `offset v_count - 5`; a
limb under its ceiling constrains no future call and contributes a wait of zero. The maximum of the
two limbs is still what is advertised, and the answer still names no limb.

Measured after the fix on the same worked example: **~60 s, then ~60 s, five rows.**

**Consequences recorded rather than hidden.** The table is bounded at five rows per key per
quarter-hour but is still append-only and still has no retention sweep. `clara._tf_append_only()`
raises for **every** role including the table's owner (measured: `set role clara_fn_owner; delete
from clara.invite_preview_attempts …` → `invite_preview_attempts is append-only`) and TRUNCATE is
blocked, so a retention lane must disable and re-enable that trigger **inside its own migration**,
as the table owner — it cannot be written as a job against the shipped surface. That sentence is now
in 0309's header, in `packages/db/README.md`, and in the follow-up below; the previous follow-up
wording ("one small lane could give both a retention job") was wrong and is corrected.

**Cells.** `p871.wall.bounded` (twelve reads of one link from twelve addresses → 5 served, 7 walled,
exactly 5 rows), `p871.wall.no_slide` (the planted worked example above, asserting the wait is the
oldest *admitted* attempt's own expiry and that a second refusal never pushes it out), and
`p871.wall.origin_limb`'s evidence assertion corrected from six rows to five.

---

## SPEC-871-C — the mask now has the drift guard the status had

`§D.T7b` pins the masking block on the **live catalog**, whitespace-normalised, in both directions,
exactly as T.7 already did for the status CASE — and `p871.derivation` drives both, each with its
own mutated-string vacuity control (`left(inv.email, 1)` → `left(inv.email, 3)`). The reason it
earns its own pin: a fork of the status would make two readers disagree about one invite; a fork of
the mask would make the **public, signed-out** page publish more of a stranger's address than the
signed-in one does, silently — and the masked address is the one field the 2026-09-23 ruling says
must never widen.

## SPEC-871-B — AC3's five-state equality is now driven, not inferred

`p871.door.five_states` drives **all three readers** for the same invite in each of the five states:
the roster (`clara.firm_invites_visible`, as the owner), the **signed-in** `clara.preview_invite`
(as the invited address — it reports its own effective status in all five, which
`p625.preview.status_faces` already establishes), and this door. It asserts: the roster and the
signed-in preview agree in all five; the signed-out door reports that same status **and firm name
and role and masked address** verbatim in the two open states; and the single refusal in the other
three, where naming the status would be the existence oracle the ruling forbids. That is AC3 met in
the form the ruling actually allows, measured rather than inferred from a shared expression.

## ADV-L05-07 / ADV-L05-08 — the census twins

`role-census-reset.test.mjs` keys #871's file on `/_invite_preview_public_door\.sql$/` beside the two
merged files' numbers (those are immutable, so their numbers are part of their identity; #871's is
not yet). `deploy/roles-bootstrap.sql:293`'s VERIFY census reads **21 clara_% roles total (20 schema
lanes + clara_storage_docs)**, matching its own header 260 lines above.

---

## SPEC-871-A — the one thing I did NOT change, and why it needs the owner

The 2026-09-23 re-brief says the read is *"rate-limited by the estate's existing entry rate wall"*.
0309 does not call `clara.claim_confirmation_attempt`; it mints `clara.invite_preview_attempts` and
re-implements 0163's wall shape over it. **That divergence stands, and it should be ratified rather
than patched**, for the reason the migration header already argues and which I re-read against
0163's own body this round: `clara.confirmation_attempts` IS the applicant's five OTP guesses, and an
`'accepted'` stamp removes a row from both of that wall's windows. Routing previews through it
either settles them `'rejected'` — five invite-link loads then lock out every signup behind the same
NAT for fifteen minutes — or settles them `'accepted'`, which 0163's counting predicate excludes,
leaving the preview unwalled. A wall that cannot both hold and stay honest is not the wall to reuse.

Two things changed this round that the ratification should be read against: the new table is now
**bounded** (ADV-L05-04), and its unprunability is stated in the header rather than left to a
follow-up. If the owner wants the literal brief instead, that reopens #871 — it is not a patch to
this branch.

---

## ADV-L05-02 (major) — two bounds the particulars door does not have

**Reproduced first.** A 214-character vehicle description (`registration … chassis … invoice …`)
and a single realistic recorded-policy label both made `faParticularsProposalSchema.safeParse`
return `false`, which by the contract's own §5 drops the **whole** proposal with no log and no
refusal — indistinguishable from "no ground was found".

**Measured against the estate, not asserted.** `clara._fa_validate_particulars` (0041:2977-3033)
imposes no length bound on `description` and has no `reason` field at all;
`clara.fixed_assets.description` is `text` with `character_maximum_length` NULL and no length CHECK.

**The fix is different for each, deliberately.**

* `description`: **the bound is gone**, on both sides of the contract (`faParticularsProposalSchema`
  and `readFaParticularsProposal`). Truncating was rejected on a measurement, not a preference:
  `particularsFromProposal` pre-fills this exact value straight back **into** the door, so a
  truncating producer would quietly shorten a real asset's description at the moment a person
  confirms the form.
* `reason`: the 400-character cap **stays** — that string is this module's own prose, not a person's
  data, and a question is durable — but the header no longer claims it is the door's, and the
  producer now **guarantees** it: the account label is capped at 40, a recorded-policy label at 100,
  each clipped on a word boundary with an ellipsis, and the composed line clamped to 400. Worst case
  by construction is 395 (the knowledge branch).

Cells: `p933.wire.long_description`, `p933.wire.reason_ceiling` (which also asserts the trim takes
the label's tail and never the in-service-date/residual sentence a person acts on), and the web
reader's own long-description cell.

## ADV-L05-03 (major) — the calendar day, and the corrected successor contract

**Reproduced first**: handed a `Date`, the derivation produced `start_date` =
`2026-09-14T16:00:00.000Z` (the previous calendar day, because the host is Asia/Kuala_Lumpur),
`safeParse` false, and a reason line reading `… a Time) — the acquisition's own posting date …`.

**The fix in code.** `FaProposalAsset.acquiredDate` is documented as a `YYYY-MM-DD`
Asia/Kuala_Lumpur **calendar string**, never a `Date`, with the reason and the required `::text`
cast named; and `deriveFaParticularsProposal` now **refuses** anything else:

```
TypeError: fa-particulars-proposal: acquiredDate must be a YYYY-MM-DD calendar string or null,
got [object Date] "…" — read the column as `fa.acquired_date::text`, because node-postgres maps a
`date` onto a JS Date at local midnight and its UTC spelling is the previous calendar day
```

This is the one input shape the module refuses rather than tolerates, and the module says why: a
mis-shaped date cannot degrade — it is either a silently dropped proposal or a wrong day recorded
under a person's signature, on the driver every depreciation charge from then on is computed from.
Cell: `p933.wire.acquired_date_must_be_a_calendar_string`.

### The successor contract, CORRECTED (supersedes §2 and §3 of `wave4-lane05-ticket933.md`)

That report lives in the main checkout and this lane may not edit it, so the corrected sections are
restated here **in full**. Everything else in that contract (§1 imports, §4 the door call and
argument order, §5 refusal mapping, §6 part kind, §7 prompt stanza, §8 the web) is **unchanged**.

**§2 — the zod object, as it now is.** Two fields changed: `description` loses the bound the door
does not have, and the regex is the module's own `CALENDAR_DAY` constant.

```ts
z.object({
  v: z.literal(1),
  method: z.enum(["straight_line","reducing_balance","none"]).nullable(),
  useful_life_months: z.number().int().positive().nullable(),
  rate_bps: z.number().int().min(1).max(10000).nullable(),
  residual_cents: z.number().int().min(0).nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  description: z.string().trim().min(1).nullable(),        // NO max — the door has none
  basis: z.array(z.enum([
    "enrolment","client_knowledge","retired_account_policy",
    "account_siblings","acquisition_date","firm_default_residual",
  ])),
  reason: z.string().max(400),                              // this module's own, and it honours it
}).strict()
```

**§3 — the read, with the cast, and without the column nothing reads.**

```sql
-- (a) this asset's own account, acquisition date and completeness.
--     `::text` IS LOAD-BEARING: without it node-postgres returns a JS Date at local midnight,
--     whose UTC spelling under Asia/Kuala_Lumpur is the PREVIOUS calendar day. The derivation
--     refuses a Date by name, so a forgotten cast is a loud failure rather than a wrong date.
select fa.asset_account_code,
       fa.acquired_date::text as acquired_date,
       (fa.depreciation_start_date is not null and fa.depreciation_method is not null)
         as particulars_complete
  from clara.fixed_assets fa
 where fa.client_id = $1::uuid and fa.id = $2::uuid;

-- (b) the account's OTHER completed, live rows. `residual_cents` is NOT selected: the proposal's
--     residual is the firm's nil default by the owner's #932 decision and is never read off a
--     ground, so carrying it would only invite a half-adoption.
select fa.asset_account_code, fa.depreciation_method, fa.useful_life_months,
       fa.depreciation_rate_bps
  from clara.fixed_assets fa
 where fa.client_id = $1::uuid
   and fa.asset_account_code = $3::text
   and fa.id <> $2::uuid
   and fa.superseded_at is null
   and fa.status in ('active','pending')
   and fa.depreciation_method is not null
   and fa.depreciation_start_date is not null
 order by fa.created_at desc
 limit 50;
```

mapped to `FaProposalInputs`:

```ts
{
  asset: { assetId, description, costCents, nonDepreciable,   // from loadPendingFixedAssetStepV4
           particularsComplete,
           assetAccount,                                      // from (a); may be null
           acquiredDate },                                    // from (a); a YYYY-MM-DD STRING
  siblings: rows.map((r) => ({
    assetAccount: r.asset_account_code, particularsComplete: true,
    method: r.depreciation_method, usefulLifeMonths: r.useful_life_months,
    rateBps: r.depreciation_rate_bps,                         // no residualCents — the type has none
  })),
  // knowledge / retiredPolicy: OMITTED on this frontier — unchanged.
}
```

Two notes for the transcriber, both consequences of this round's other fixes:

* `asset.assetAccount` may be null, and a null now **narrows** every ground: with `$3` null,
  statement (b) yields nothing (`= null` is never true), which is exactly the derivation's own rule
  — a row on no account grounds only on inputs that are also on no account. The two readings agree;
  before this round they did not.
* Nothing else in §3's mapping moves. `FaProposalSibling`, `FaProposalKnowledgeNote` and
  `FaProposalRetiredPolicy` no longer carry `residualCents` at all.

## ADV-L05-05 / ADV-L05-06 (minor) — the grounds, held to one another's rules

* **One account rule, three grounds.** `speaksFor(asset, groundAccount)` is `groundAccount ===
  asset.assetAccount`, applied by the sibling, retired-policy and knowledge arms alike.
  `clara.fixed_assets.asset_account_code` is nullable, so "no account" is an account like any other:
  a ground about 1500 does not speak for a row that has none, and a client-wide ground does not
  speak for a row that has one. Before, the first two arms skipped the filter entirely for a null,
  so a sibling from **any** account grounded a proposal whose reason then named an account the
  ground never came from. Cell: `p933.core.a_null_asset_account_narrows_every_ground`.
* **Disagreement grounds nothing, on every ground type.** `agreedOn()` is now shared by the sibling
  and knowledge arms. The knowledge arm reads two **tiers** — records naming this account, and
  client-wide records — the narrower tier governs outright, and within the governing tier the
  records are peers: peers that disagree ground nothing, and a split at the narrow tier does **not**
  fall back to the wide one (that would be choosing a side by another route). Before, it took the
  first admissible record, so two people's judgements resolved by array order. Cell:
  `p933.core.two_disagreeing_recorded_notes_ground_nothing`, including an order-independence
  assertion.
* **`residualCents` is gone from all three ground types**, and the header says why: the owner's #932
  decision fixes the residual at the firm's nil default, so a ground's own residual could only ever
  be half-adopted — drivers taken, residual discarded — under a sentence claiming Clara proposed
  *"the same"*. That sentence now names the drivers it read: *"…so I propose those drivers."* Cell:
  `p933.reason.a_sibling_ground_claims_the_DRIVERS it read`.

  *Recorded for a later ticket, not built here:* if the owner ever wants Clara to **disclose** that
  the ground she cited carried a different residual (rather than only state the default), that is a
  product decision with a named home — `reasonFor`'s ground branches — and it needs the field back
  on the input types plus a money formatter this module does not have.

## STD-1 (smell) — fixed, because the fix is small and the invariant is fragile

`apps/web/components/registers/use-fa-particulars-proposal.ts` owns the three rules both
register-side entrances were each carrying: read on open (never on mount), seed only an untouched
form, clear on close. The seed guard (`current === EMPTY_PARTICULARS ? … : current`) is the reason
this was worth extracting — it is the kind of invariant that drifts once it is written twice. The
conversation entrance is deliberately **not** a caller: it is handed the whole question record and
reads the block straight off `source_ref`, with no read of its own to seed from. Behaviour is
unchanged, and the four existing render cells for the two components stay green.

STD-2 and STD-3 were notes rather than findings and are **left as they are**, for the reasons their
own entries give: STD-2's two note components read different types through different entrances (a
shared one would need an adapter, and there is no fourth entrance yet), and STD-3's cross-package
duplication is a real module boundary (`apps/web` has no `@clara/runtime` dependency) that the file's
own header already discloses with its drift-detection mechanism named.

---

## Gates, with counts

All db work on `clara_l05` at `127.0.0.1:55745`; all web work on this lane's triple
(`https://127.0.0.1:3540` / 3541 / 3542). `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP`
were never set and no second from-scratch chain was run.

| gate | command | result |
|---|---|---|
| migration re-apply | `CLARA_MIGRATION_REDO=0309_invite_preview_public_door node scripts/migrate.mjs` | **redone**, new checksum `63a57bdc…36200` |
| migration FIRST branch | by hand, rolled-back transaction, hosted-shaped census | **tail OK**, roles 19 → 21, lane database unmoved |
| db (touched + census + isolation) | full 107-module gate chain + `invite-preview-public` `role-census-reset` `chain-minted-roles-drift-guard` `fa-particulars-proposal` `operation-census` `rig-isolation` | **70 tests, 69 pass, 0 fail, 1 skipped** |
| the one skip | `T19 poison-role … # SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1` | expected — RIG.md forbids that flag |
| runtime unit | `node --test tests/fa-particulars-proposal-unit.test.mjs` | **24/24** |
| runtime unit (db-backed) | `node --test tests/p871-invite-preview-db.test.mjs` with the PG env | **9/9** |
| frozen closure | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, 55 workflow modules, 3 retired entries |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| web unit (whole suite, once) | `node scripts/run-tests.mjs` from `apps/web` | **5022 tests, 142 suites, 5020 pass, 0 fail, 2 skipped** |
| typecheck | `pnpm typecheck` | **exit 0** (both projects) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| browser walk | `pnpm --filter @clara/web e2e depreciation-walk` | **5 passed** |
| browser walk | `pnpm --filter @clara/web e2e members-invite-walk` | **7 passed** |

No e2e spec was edited this round. The two walks above were run anyway: `depreciation-walk` because
it is the closest real-browser exercise of the two components STD-1 refactored (and because a new
`"use client"` module can only break a production `next build`, which a jsdom cell cannot see), and
`members-invite-walk` because it is #871's own walk.

### Docs updated, in the same commits

* `packages/db/README.md` — 0309's section rewritten where it was now wrong: the census paragraph
  (named roles, not an absolute count, with the hosted reason), a new count-first paragraph with the
  120/180/240 → ~60/~60 measurement, the unprunability sentence, the mask pin, the redo-safety and
  the FIRST-branch proof, and the battery list (12 → 16 cells). The #867 section's "0309 carries its
  own census of 18" sentence corrected.
* `packages/runtime/README.md` — the #933 section gains the one-account rule, the disagreement rule,
  the residual sentence, the `acquiredDate` contract and which bound is whose.
* `CONTEXT.md` — "Depreciation particulars proposal": the account rule, the disagreement rule and
  the residual's provenance, with the `_Avoid_` list extended to match.

---

## Follow-ups worth filing (none of them this lane's to build)

1. **Retention for the two append-only attempts tables** (`clara.confirmation_attempts`,
   `clara.invite_preview_attempts`) — **corrected wording**: this is a MIGRATION, not a job. Both
   tables' append-only trigger raises for every role including the owner, and TRUNCATE is blocked,
   so the lane must disable and re-enable the trigger inside its own migration as the table owner.
   With #871 now bounded at five rows per key per window it is housekeeping rather than an
   availability question.
2. **Ratify or reopen SPEC-871-A** — the owner's call, framed above.
3. **ADV-L05-09 / SPEC-933-E** (notes, not findings, and untouched): the contract's
   `particulars_complete` is narrower than v4's own predicate, and
   `loadAssetParticularsProposal` matches a pending question on `asset_id` alone without checking
   `ref.kind === "fixed_asset"`. Neither is reachable today; both are one line each whenever those
   modules are next opened.
4. **AC4 of #933** (the World e2e leg covering park-with-proposal then confirm) must be carried
   explicitly into the `claraWork_v6` cut's own work order — the successor contract does not name
   it, so the cut could land without it.

## Anything unverified

* The Supabase platform roles (`anon`, `authenticated`, `service_role`, `authenticator`) do not
  exist on this cluster, so 0309 §D.T2's `to_regrole`-guarded arms and `p871.grant.only_the_group`'s
  third principal still rest on the exact ACL text rather than on a probe that fired. Unchanged this
  round; the hosted apply is the first exercise of that arm.
* The true from-scratch 0001 → 0309 chain remains the integrator's, on a disposable cluster. What
  changed is that 0309 no longer depends on that cluster's total `clara%` role count, which is the
  exact respect in which a disposable cluster differs from hosted.

## Fix round 2 (SPEC minor: unique probe tokens)

RECHECK-01 (minor, ticket #871): `p871.door.no_oracle` keyed its "unknown token" probe on the fixed
literal `"f".repeat(64)`, and `p871.wall.origin_limb` keyed its four enumeration probes on
`String(i).repeat(64)` for `i` in 0..3. Both hash to the same `token_hash` on every invocation.
`clara.invite_preview_attempts` is append-only and bounded at five rows per key per 15-minute
window (by design, per ADV-L05-04's own fix), never emptied, so a re-run of
`invite-preview-public.test.mjs` against the same persistent lane database within that window could
find the fixed token's budget already spent by the prior run and flip a real assertion from
`not_previewable`/`preview` to `rate_limited`.

Fix: added a `probeToken()` helper next to the file's existing `originDigest()` helper
(`packages/db/tests/invite-preview-public.test.mjs`), returning a fresh
`randomBytes(32).toString("hex")` per call — the same freshness convention `originDigest()` already
uses for the wall's other limb. Replaced both fixed literals with calls to `probeToken()`:

* `p871.door.no_oracle`'s `unknown` probe (was `previewByToken("f".repeat(64))`).
* `p871.wall.origin_limb`'s four enumeration probes inside the `for` loop (was
  `previewByToken(String(i).repeat(64), digest)`).

No other cell in the file needed the same fix: `p871.wall.bounded`, `p871.wall.no_slide` and
`p871.wall.token_limb` already key on `issued.token`, a real invite token minted fresh per run via
`inviteMember()`. The window, the ceiling of five, and the attempts table's append-only/unprunable
behaviour are untouched — only the two probe-token literals changed.

**Verification.** Ran the exact `--import` gate chain from `packages/db/package.json`'s `test`
script, targeted at this one file (`node --test --test-concurrency=1 <all 96 --import flags>
tests/invite-preview-public.test.mjs`), against the lane's persistent database
(`clara_l05`, `127.0.0.1:55745`):

* **Run 1:** 16/16 pass (0 fail, 0 skip).
* **Run 2**, immediately back to back (well inside the 15-minute window that previously caused the
  flip): 16/16 pass (0 fail, 0 skip).
* **Run 3**, immediately after run 2, as an extra margin beyond what was asked: 16/16 pass, with
  `p871.door.no_oracle` and `p871.wall.origin_limb` both individually confirmed `ok` in the output.

Also ran `CI=true GITHUB_ACTIONS=true pnpm lint` at the worktree root: exit 0.

Head after this round: `7d6c9b3c410474bcd95c2ab5a2a609d84cd88e2f` → new commit on
`riders/w4-lane05` (see git log for the exact hash).
