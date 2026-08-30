# F-T3 PR-2 / PR-9 — the design lane's own adversarial pass (2026-08-30)

> **What this is.** The design lane's **self-gate** over the two documents it just wrote —
> `tax-computation-pr2-design.md` (the computation increment) and
> `tax-prep-wake-design.md` + `-annexes.md` (the 裁-44 wake). It is **not** the independent
> review: review law 1 still binds, and the lead owes a fresh-context pass plus a cross-model
> leg before either builds. This record exists so that pass starts from a real list rather than
> from a blank page, and so the findings the author already knows about are not re-discovered at
> the author's expense.
>
> **Instrument and its ceiling.** Every DB claim in the set was measured on a throwaway
> `postgres:17` replayed `0001` → `0155` (150 files, all green), read through
> `pg_get_constraintdef` / `pg_proc.prosrc` / real row counts. **What that instrument cannot
> see:** a body another lane's in-flight branch will replace before these PRs author (the shas
> below WILL move — the migrations' prestate blocks are what catch it), anything in
> `apps/web` beyond a source read, and anything about live, which this lane never touched.
>
> **Verdict: BUILD-READY for PR-2 through PR-6 subject to GB-1's routing question; PR-9 is
> DESIGN-COMPLETE but GATED on five unbuilt PRs and one ceremony act that does not yet exist.**
> **Four blockers**, eight materials, five cards. Every blocker carries a proposed fold.
>
> *(GB-4 was added 2026-08-30 from the lead's census — the citation the card is required to show
> is stored but ungranted and unreadable. The 裁-33 / 裁-44 reading the census also raised is
> **resolved, not carried as a finding**: they constrain different verbs, and the resolution plus
> the surface P6 builds is `tax-prep-wake-annexes.md` §12.)*
>
> **LEAD DISPOSITIONS, 2026-08-30 — recorded so no reviewer re-litigates a settled call.**
> **OQ-A RULED (a), five PRs** (§4, card closed). **ACCEPTED as designed:** the `direct_queue`
> carrier with `task_kind='tax_prep'` (wake design §2) · the reuse of `agent_act_receipts` with
> no new `agent_receipt_surfaces` row (§3.4) · the tax-draft card on the needs-you page's second
> feed rather than a tenth `list_review_queue` `row_kind` (§6) · **`tax_prep`'s `call_kind`
> riding PR-9's own migration, not G1 PR-2a's** (§3.5), with the G1 PR-2a lane told not to
> phrase its roster as final. **OQ-B / OQ-C / OQ-D / OQ-E go to the owner's batch with the
> recommendations below verbatim**, plus the per-carrier framing of the Wave-G producer question
> (annexes §11.1) and the standing INFORM that **SST-02 and the CP204 reminders have no lane and
> no date**. **Still open here: nothing.** GB-1's routing question is answered; GB-2, GB-3 and
> GB-4 are folds the named PRs owe, not questions.

---

## 1 · Blockers — must be settled before the named PR authors

### GB-1 · The work order's file name collapses a ladder the ordering law forbids collapsing

**Found in:** `tax-computation-pr2-design.md`, its own header. **Severity: blocker (routing,
not correctness).**

The lead's order names one deliverable, `tax-computation-pr2-design.md`, and lists content
spanning the design of record's **PR-2, PR-3, PR-4, PR-5 and PR-6**. Those five are separated by
a law the PR-0 gate minted, and it is a property of PostgreSQL, not a preference: `create
function` does not validate a plpgsql body's referenced relations, so the frozen member must be
the **last DDL-dependent PR**, and it is frozen the instant its `evaluator_versions` row lands.

**What I did:** wrote the file under the ordered name, and kept the ladder inside it, with §8
stating plainly why one file would be unbuildable *as a review instrument* — the eighteen-relation
census becomes self-satisfying (asserting what it created two hundred lines above), four
judgement surfaces lose their independent passes, and a D1 write-quiesce window ends up in the
same file as a frozen registration, so a quiesce failure at deploy strands the freeze.

**Proposed fold:** the lead confirms the file name is a label, not a scope instruction, and the
build lanes take PR-2…PR-6 as five PRs. **If the lead intends a genuine single PR, this is a
design collision and it goes back before any code is written** — it is not something a build lane
should discover.

### GB-2 · `tax_prep_due()` cannot name a YA, and my own §3.6 did not notice

**Found in:** `tax-prep-wake-design.md` §3.6, by re-reading my own predicate against the
measured catalog. **Severity: blocker (my own defect).**

`tax_prep_due()` returns `(firm_id, client_id, fiscal_year_id, ya, reason)`. **Nothing in the
estate maps a fiscal year to a year of assessment.** Measured: the only relations carrying a `ya`
column at `0155` are PR-1's six platform law tables, and every one of them is keyed on `ya` as a
bare integer **with no client dimension** — they are rate tables, not a mapping. The relation
that does the mapping, `tax_basis_periods`, is **PR-2's and does not exist yet**.

And the oracle must not derive it. A Malaysian company's YA is the year its basis period ends,
but a non-calendar fiscal year, a change of accounting date or a cessation short period make
that a **judgement under s.21A(3)-(7), which turns on a DGIR direction Clara cannot see** — the
exact thing the design of record refuses by name as `basis_period_not_coextensive_with_close`.
A due-oracle that computed a YA from `ends_on`'s calendar year would be the runtime computing a
figure, which is the F11 law `close_prep_due`'s own header states in capitals.

**Proposed fold, two parts:**

1. **`tax_prep_due()` hard-depends on PR-2**, and returns a row **only** where a
   `tax_basis_periods` row exists for the sealed fiscal year. This joins the gate list in
   annexes §11.
2. **A sealed year with no basis-period row is NOT due — it is a visible gap, not a wake.**
   Waking a model nightly to report a fact a human must key spends tokens to produce a refusal
   nobody needed a model for. It surfaces instead on the Tax tab and through the readiness read,
   named. **Battery cell T-7 gains an arm**: a sealed year with no `tax_basis_periods` row
   returns **no** due row, and the readiness read names it.

**The general principle this mints, and it should bind the whole lane:** *the due oracle must
not wake her for a state whose only possible outcome is a named refusal a human has to clear
anyway.* GB-3 is the second instance.

### GB-3 · With zero signed treatment codes, every wake is structurally a refusal

**Found in:** the same re-read. **Severity: blocker (economics + honesty), cheap fold.**

Measured: `clara.tax_treatment_codes` holds **13 rows and all 13 have `owner_signed_by IS NULL`**
— OQ-7's fail-closed default, working as designed. Until a named licensed tax agent signs them,
**every** treatment on **every** account refuses `treatment_code_unsigned`. So a `tax_prep` wake
in that state can only ever produce a fully-refused night — one model call per client per
cadence period, forever, until somebody signs.

Because the codes are **platform rows with no `firm_id`** (measured: `relacl` NULL, no `firm_id`
column), "are any codes signed?" is a single estate-level read, not a per-client one.

**Proposed fold:** `tax_prep_due()` gains a rung — **no signed code in the YA's window ⇒ no
client is due**, with the state surfaced as a firm-visible gap rather than a wake. One cheap
read gates the whole belt. Battery cell T-7 gains the arm; the fold also makes the lane's launch
behaviour honest: it does nothing until the professional act that unlocks it has happened.

---

### GB-4 · The card is required to cite law it cannot read

**Found at:** the lead's 2026-08-30 census, item 2, followed to its consequence. **Severity:
blocker for the card, not for the ladder.**

裁-44 requires that **"every rung carries its statutory citation"**, and the design's answer
(wake design §5) is that the citation is bound once to the `tax_treatment_codes` row —
`statutory_ref` NOT NULL, `authority_id → tax_authorities` NOT NULL. That is where the citation
**is stored**. It is not where it can be **read**.

Measured: all six `0152` relations carry `relacl` **NULL** — no grant to `clara_authenticated`,
to `clara_runtime`, to anything — and the migration minted exactly one function, the immutability
trigger. **There is no grant and no reader.** So a tax-draft card rendered today could name the
code (`ADDBACK_ENTERTAINMENT_50`, which it holds in its own `rungs` array) and could **not**
render `s.39(1)(l) ITA 1967` or the authority behind it. A card that looks like it cites law and
cannot is worse than one that admits it does not — and this is the surface a professional signs
against.

**Proposed fold — a reader, not a grant.** PR-4 ships
`clara.list_tax_treatment_codes(p_as_of_ya int)` (bookkeeper floor, `_human_ctx`) returning
`(code, direction, fraction_bp, requires_apportionment, statutory_ref, authority_label,
authority_url, accessed_at, owner_signed_at, conflict)`. Three reasons a reader beats a table
grant: the law tables stay ungranted and keep the `llm_price_table` closed-world posture `0152`
deliberately chose; the reader can project the **signature state** and the **conflict** (§1's
C-1) into the same row the card renders, so "unsigned" and "conflicted" are visible where the
decision is made, not two joins away; and a reader is the estate's established shape for exactly
this (`list_agent_act_receipts`, `list_review_queue`).

**And it changes the PR-4 acceptance:** a cell asserting the reader returns the citation **and**
the unsigned state for all 13 seeded codes, plus a cell asserting a firm viewer's JWT cannot
`select` the underlying tables directly — the direct-path floor `0138` FIX-6 had to retrofit
once already.

---

## 2 · Materials — fold before the named PR merges

**GM-1 · `bound_digests` had no defined key set.** `tax-prep-wake-design.md` §6 names the column
as "the staleness target" and stops. Undefined, it is decorative. **Fold — the digest covers, by
name:** the active `close_receipt` id **and** the digest of its `snapshot->'pl_rows'` · the set of
`(code, owner_signed_at)` for every code the draft's rungs reference · the `ca_asset_years` rows
for the YA · the `client_tax_attributes` rows resolved as-at the basis-period start · the
`tax_carryforwards` rows for the YA · **and `evaluator_version_id`**. The last is the one most
easily forgotten and the most consequential: a `_v2` member must invalidate every open draft, or
a human adopts a computation the current evaluator would not reproduce.

**GM-2 · Nothing ordered `wake_propose_tax_draft` after `wake_run_tax_computation`.** Both are
allowlisted for the same credential, and a model pass may call them in any order. A draft written
first would name no cells — a card pointing at nothing. **Fold:** `wake_propose_tax_draft`'s core
**refuses by name** when no `metric_cells` exist for `(client, ya)` at the current
`evaluator_version_id`. Ordering is a wall, never a hope about a prompt.

**GM-3 · Reusing `agent_act_receipts` widens what an existing UI renders.** `list_agent_act_receipts`
is the bookkeeper-floor reader and P6 owes its card. Once `act_kind` admits `propose_tax_treatment`
and `run_tax_computation` and `subject_kind` admits `coa_account`, that surface starts returning
rows whose kinds have **no i18n label** and whose subject the existing renderer cannot resolve to a
name. **Fold:** PR-9 names the P6 obligation (two act labels, one subject resolver) in its PR body,
and the frontend renders an unrecognised kind **honestly** ("not built yet") rather than blank —
the ⌘K "Do" precedent, which `apps/web/AGENTS.md` already makes law.

**GM-4 · The credential TTL is unstated and the pass is long.** The closePrep.v1 infra module mints
per `withWriteWakeScoped` call with a lane-local TTL constant. A tax pass over many accounts is
plausibly longer than a close pass. **Fold:** state `TAX_CREDENTIAL_TTL` explicitly, mint **fresh
per wrapper group** (never cache), and add a cell proving an expired credential refuses CLR03
rather than half-completing a draft. A retried attempt mints fresh rather than reusing a
credential that may have aged past its own TTL.

**GM-5 · `_tf_assert_close_agent_receipt` was not checked against tax acts.** `0138` §B installs
a **deferred** constraint trigger enforcing "act and receipt" on the close domain. I read its
scope as `close_runs` and concluded it does not fire on tax acts — **but I did not probe it**,
and a deferred trigger fires at commit, which is exactly where an unproven assumption becomes an
apply-time surprise. **Fold:** PR-9's battery adds a probe — write a tax act receipt in a
transaction and commit — rather than carrying my source read as evidence. *Absence from the
wrong instrument is this estate's most expensive recurring class.*

**GM-6 · The prompt is an injection surface, and the set says so only implicitly.** The wake body
reads the books unattended, so account names, memos and counterparty descriptions — client-supplied
text — enter the model's context. **The severance is the answer and it holds**: she can emit only
a `code` from a migration-seeded closed set, only through five allowlisted verbs, into a row with
**no numeric column**, and a human signs. **Fold:** say this explicitly in the PR body and make
it the cross-model pass's stated target, rather than leaving the reviewer to reconstruct why the
surface is safe. The strongest evidence the severance was designed right is that this paragraph
is short.

**GM-7 · The two D1 shas in annexes §10 will be stale by the time PR-9 authors.**
`_tf_agent_task_update` (`f44a2f17…`) is the same body **G1 PR-2 is in flight against right
now**, and `mint_wake_credential` (`7422e9d9…`) is a frequent extension target. **Fold:** the
migration's prestate re-reads `pg_proc` and aborts CLR10 on drift — already specified — and the
PR-9 author **re-measures both against merged `main` before authoring**, never against this
document. This file's shas date the design; they do not authorise a build.

**GM-8 · "13 close_prep allowlist verbs" is a count, and a count is not a roster.** The design
cites it as evidence of the shape being copied. It is fine as context and useless as a wall.
**Fold:** PR-9's tail enumerates the `tax_prep` rows **by name** and asserts the four forbidden
verbs are absent — which annexes §8's cell T-4 already specifies. Recorded so the count is never
mistaken for the proof.

---

## 3 · Refuted — things that look like defects and are not

- **"`close.finalized` is `ignore`, so the close seal is invisible."** No: the seal is fully
  visible as a **state** — an active `close_receipts` row, one per fiscal year by
  `uq_cr_one_active_close`. What is absent is a *routed wake*, which is why the carrier is
  `direct_queue`. The design reads the state, not the event.
- **"`login_pool='write'` on the registry row is wrong because close_prep says `runtime`."** The
  column is decoration — measured, `wake-engine.mjs` reads it at line 169 and uses it nowhere.
  裁-49's correction to `close_prep`'s value is a documentation fix. The taxPrep.v1 infra module
  independently chooses the write pool, and that is the enforcement.
- **"F-T3 must register a new `agent_receipt_surfaces` row."** No — reusing `agent_act_receipts`
  means F-A4's `f_a4` row already covers the surface. Minting a row for a table nobody added
  would be the half-registration in reverse.
- **"A new `clara_wake_tax` role is owed for least privilege."** The estate does not work that
  way and measurably never has: `close_prep`'s 13 verbs are executable by `clara_wake_interactive`,
  which already reaches 33 `interactive` verbs. The narrow wall is `assert_wake_allowed`, per
  credential kind, per verb. A new role would add a deployment ceremony (a LOGIN, a password, a
  DSN, a pool) for no additional wall.

---

## 4 · Cards — what genuinely needs a ruling

Each card: **one question · the options · what each costs · the recommendation · the fail-closed
default if the sitting is not reached.**

### OQ-A · Is `tax-computation-pr2-design.md` one PR or five? *(the lead's, not the owner's)*

Options: **(a)** the file name is a label and the ladder stands as five PRs — **recommended**,
and what the file is written for; **(b)** a genuine single PR, which §8 argues is unbuildable as
a review instrument and which would need the ordering law re-opened with the owner (it came from
the PR-0 gate). **Fail-closed default: (a).** Five PRs is strictly reversible into fewer; a
merged single PR carrying a frozen evaluator is not reversible at all.

**— RULED 2026-08-30 (lead): (a), FIVE PRs.** The PR-0 gate's ordering law stands and the
filename is a label. **This card is closed; the build lanes take PR-2 … PR-6 as five PRs with
the D1 window on PR-3 and the frozen member last.**

### OQ-B · How often does she re-ask? — the `tax_prep` cadence

`close_prep_due` re-asks **daily**, which is right for a close: the work is genuinely due now.
A tax deadline is months out, and (GB-3) the early answer is a refusal.

| Option | Cost | Risk |
|---|---|---|
| (a) daily, copying `close_prep` | one model call per due client per **night**, for months | real spend for a refusal that does not change day to day |
| **(b) weekly, tightening to daily inside the filing window** | ~1/7th of (a) | a draft appears up to six days after its input lands |
| (c) once per seal, never re-asked | cheapest | the one-shot failure §2 refutes: the draft never appears once the tax agent signs a code the next morning |

**Recommendation: (b).** With GB-2 and GB-3's gates in front of it, a weekly cadence only ever
fires when the work is genuinely possible. **Fail-closed default: (b)** — it cannot silently
spend, and a six-day lag on a months-long deadline is not a professional risk.

### OQ-C · 裁-44 names three things. Is that one wake or three sources?

The ruling bundles the income-tax draft, **SST-02 drafting**, and **proactive CP204 reminders**.
Measured, they are three different shapes: annual + client-scoped; bi-monthly + F-T1's tables
(`0153`); and firm-scoped `proactive` + F-T2's `statutory_deadlines` (`0139`) — where `proactive`
has exactly **one** allowlist verb today, `wake_record_notification`.

| Option | Cost | Risk |
|---|---|---|
| **(a) three sources on the one engine, each owned by the lane that owns its tables** | three registry rows, three due predicates | none obvious — it is what the engine is for |
| (b) one `tax_prep` source doing all three | one row | one oracle answering three unrelated period questions and one **frozen** body carrying three domains — unchangeable once deployed (constraint 9) |

**Recommendation: (a).** **Fail-closed default: (a) partially — PR-9 builds only `tax_prep` and
names the other two as currently UNOWNED**, which is exactly what this design set does. The
owner should know that 裁-44's SST and CP204 halves have **no lane and no date** today; that is
the honest state, not a plan.

### OQ-D · 裁-40's fourth switch is very likely unreachable on the G1 ceremony's own date

**This is the card the owner most needs.** 裁-40 as amended by 裁-44 opens **four** switches
together, each after its wake body is "built and reviewed". Measured, three of the four are
ready — `bank_agent` and `close_prep` have merged bodies (#437), and the binding-expiry sweep is
built. **`tax_prep` has none of its chain:** it needs PR-2, PR-3 (with a D1 window), PR-4 (with a
cross-model pass), PR-5, PR-6, then PR-9 — **and then a second ceremony act nobody has scheduled**,
because the estate's evaluators self-refuse `CLR10 evaluator_undeployed` until their closure is
flipped (measured in `evaluate_fs_pack_agent_v1` and `evaluate_metric_v2`).

| Option | Cost | Risk |
|---|---|---|
| (a) hold the whole G1 ceremony until F-T3's chain lands | three ready sources stay dark for weeks | the close and bank lanes wait on tax for no reason |
| **(b) open three switches at the G1 sitting; `tax_prep` gets its OWN later sitting, whose act list is: the evaluator deploy flip FIRST, then the switch** | a second short sitting | none — the acts are independent |
| (c) open all four at G1 anyway | none now | every `tax_prep` run refuses `evaluator_undeployed` nightly, per client, to `max_attempts`, then dead-letters — a launch that looks broken on the lane the owner asked for so tax would stop feeling like a form |

**Recommendation: (b).** **Fail-closed default: (b)** — and note it does not amend 裁-44 at all:
the fourth switch still opens, with the same door, the same operator and the same "built and
reviewed first" precondition. Only its **date** separates from the other three, and the ruling's
own precondition is what separates it.

### OQ-E · Who settles a tax draft?

A draft is **not** an issue (裁-33: nothing reaches `issued`, PR-7 is not built), so settling one
marks it professionally reviewed — a lower-stakes act than signing a treatment code.

| Option | Cost | Risk |
|---|---|---|
| (a) any bookkeeper+ | least friction | a draft computation reviewed by someone who does not hold the tax judgement |
| **(b) admin+, on `close_proposals`' own settle shape (`settle_close_proposal`)** | matches the sibling card exactly | none obvious |
| (c) only the named tax lead from 裁-38 | tightest | a single point of failure on a routine review act, on a card that is explicitly not a filing |

**Recommendation: (b).** It reuses a shape the estate already reviewed and it keeps 裁-38's
signature wall exactly where it is — on the **code**, not on the card. **Fail-closed default:
(b).**

---

## 5 · What this lane could NOT verify, and why

- **Anything about live.** This lane never touched the live project and holds no DSN. Every
  claim is about a throwaway replayed from `packages/db/migrations/`. Whether live is at `0155`
  is `PROGRESS.md`'s to say; when this lane started it recorded LIVE 148/`0153`.
- **The runtime at runtime.** `wake-engine.mjs`, `leader.mjs`, `pools.mjs`, `registry.ts`,
  `startWorld.ts` and `closePrep.v1.*` were **read**, not executed. The claim that
  `login_pool` is unused is a whole-file grep (one hit, line 169) — strong, but it is a source
  read, and a dynamic property lookup would defeat it.
- **`_tf_assert_close_agent_receipt`'s scope** — GM-5. A source read, deliberately not promoted
  to evidence.
- **The 18-member `parts[]` union's exact shape.** `apps/web`'s renderer was located
  (`docs/design/PRODUCT_DESIGN.md`, `apps/web/lib/firm/needs-you.ts:92-96`,
  `needs-you-gaps.ts`) but the union's member list was not enumerated; "the nineteenth member"
  is an architectural statement, and P6 owes the exact contract.
- **Whether G1 PR-2's in-flight branch moves either D1 sha.** It plausibly moves
  `_tf_agent_task_update`. GM-7's fold is the answer; this lane cannot read another lane's
  unmerged branch.

---

## 6 · Rig disposal

Container `ft3design-rig` (port 33701) stopped and removed at the close of this lane; its volume
pruned; the credential was minted per-run into the process environment only and never written to
any file. Nothing was applied to any live project. No migration was authored. **No file outside
`docs/plan/active/` and `docs/plan/index.md` was touched by this lane.**

**Re-proving every claim in this record:** replay `packages/db/migrations/` `0001` → the frontier
on a throwaway `postgres:17`, then read `pg_get_constraintdef` for the seven CHECKs in
`tax-prep-wake-annexes.md` §10's prestate list; `select * from clara.wake_engine_sources`;
`select wake_kind, count(*) from clara.wake_fn_allowlist group by 1`;
`select evaluator_name, version, deployed from clara.evaluator_versions`; and
`select decision from clara.trigger_taxonomy where event_type='close.finalized' and version =
(select version from clara.taxonomy_active)`.
