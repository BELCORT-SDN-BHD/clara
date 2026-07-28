# Autopost vendor binding — DESIGN v4 (task #33) — PART 1: the authority object

**Part 2 — machinery, adversarial set, build, per-finding register —
`docs/plan/autopost-vendor-binding-design-part2.md`** (split per repo precedent
`wave-b-migration-0017-design-part2/3.md`, rather than compressing arguments away).

**v4 (2026-07-28)** answers the third adversarial review — the **final design round**, whose job is a
shape with **no impossible laws and no false claims**. Rounds 1–3 cumulatively **cut** four
subsystems (auto-suspension, atomic supersession, admission stamping, cross-extraction geometry) and
**withdrew** five claims: v1's "self-healing" and "structurally impossible"; v2's "three-attempt cap
on re-extraction" and "Slot C does not depend on the marker at all"; and now **v3's own lock-order
law**, which placed the binding lock after the function that performs the approval transition and so
could never have been obeyed. Section numbering is preserved so every review's §-refs resolve.
§9/§10 owner rulings remain law (amendment A narrowed, amendment D added on the Q9 ruling).

**Status:** DESIGN ONLY — nothing built, no migration cut, no code changed. **Owner ruling
implemented:** 2026-07-28 option A — *autodraft MAY resolve a document's vendor from VERIFIED
IN-SYSTEM HUMAN APPROVALS when X6 page evidence is absent*; the same ruling rejected **option B**
(widening X6's walls) and **option C** (hand-drafts autopost-eligible). **Branch:**
`feat/autopost-vendor-binding-design`; migrations **0027 + 0028**, landing after 0026 (task #32).

## 0. What this decides — and one correction to the framing

It decides the shape of a new **typed posting-authority object** that lets the autodraft lane
resolve a supplier's identity from documents a human already approved, when — and only when — the
page yields no machine-readable registered identity. It does **not** change X6, add an extraction,
or loosen `_resolve_counterparty`. Every wall standing today still stands; this adds a
wall-guarded bypass around exactly one of them, and the bypass is itself walled.

**The correction, up front, because it moves the object.** The work order calls this a
"human-approval KB" binding. It cannot live in the knowledge base. PRD invariant 14
(`docs/prd/PRD.md:129`) and §6a (`:135-142`) are explicit:

> "The knowledge wiki informs but never decides — wiki content never selects an account or lowers a
> gate." … "**The wiki informs; the typed layer decides.**"

A vendor binding decides an identity a posting authority then consumes. That is Layer 2 — the typed
authority, beside `coding_rules` — not the wiki. The wiki may *cite* a binding; it may never be one.

## 1. The measured problem

Both blockers measured live 2026-07-28, recorded in
`C:\Users\zhant\.clara-tools\captures\runway-log-2026-07-28.md` §13.4.

**#30 — hand-drafts are structurally autopost-ineligible.** `execute_rule_post` requires
`coding_kind` non-null (`0023:411-415`), but the public `clara.draft_entry` passes
`p_coding_kind => null` unconditionally (`0009:1414-1430`, core call at `0009:1425`); the only
wrapper that supplies it is `clara.wake_draft_entry` (`0009:1432-1458`), granted to
`clara_wake_interactive` alone. **No `clara_authenticated` verb can stamp `coding_kind`.** Ruled
INTENDED; Part 2 §F says where that gets written.

**#31 — the autodraft lane refuses every EZSEC bill `vendor_unresolved`, at ADMISSION not drafting.**
`request_autodraft` (`0011:2599`) → `admit_autodraft_task` (`0011:2441`) → `_coding_lane_core`
(`0015:2358`), whose vendor block (`0015:2418-2447`) reads `invoice.vendor_name` /
`invoice.vendor_registration` off the latest done `invoice_facts` extraction and calls
`_resolve_counterparty`; a `birth` decision appends `vendor_unresolved` (`0015:2439-2440`), the lane
becomes `needs_review` (`0015:2484`), and admission returns `lane_changed` (`0011:2519-2530`).

Document evidence, read live from `616388d4-4102-49f3-8f81-a9523813d07b`:

| where | value |
|---|---|
| `invoice.vendor_name` (pinned facts extraction) | `ez` ⏎ `易计` ⏎ `ezAccount` ⏎ `COUNT` |
| `invoice.vendor_registration` | **no region — the field does not exist** |
| `envelope.vendor_identity` (X6's receipt) | `{"outcome":"absent","candidates":[],"absent":1,…}` |
| `ocr` extraction `pages.1.lines.4` | `EZACCOUNT & SECRETARY SDN. BHD.` |
| `ocr` extraction `pages.1.lines.5` | `202301030264 (1524187-D)` |
| `invoice.invoice_id` | `EZSEC-IV-00721` |

X6's receipt is the signal that matters: **zero candidates were even considered.** The letterhead
prints the registration as a bare unlabelled number, and X6's `LABEL_VOCABULARY`
(`packages/runtime/lib/invoice-vendor-identity.mjs`) is closed and exact-prefix by design — `sst no`
is deliberately excluded, and that exclusion is load-bearing. Accepting unlabelled numerals re-opens
the hazard the module is shaped around: emitting the *buyer's* registration as the vendor's.

So the identity **is on the page** — registered name on line 4, registration on line 5 — and the
machine correctly declines to swear to it, while a human already swore to it three times in-system:
counterparty `348dc9cd` (`EZACCOUNT & SECRETARY SDN. BHD.`, reg `202301030264`) was **born at the
first human approval**, sighting floor `610-S01 | debit | 3`. That asymmetry is the design space —
and §10 ruling 9 settles that reading the page to *confirm* that human's party is not the thing the
owner rejected.

## 2. The doctrine the design must satisfy

| source | constraint | satisfied how |
|---|---|---|
| `wave-b-contract.md:25-31` (WB-R2) · `PROJECTLOG.md:32` (ADR-046) | "no autopost rules from seeding, ever"; authority from verified in-system approvals only | The evidence set *is* the approvals — in-system, human-approved, unreversed, non-rule-checked — and cannot be hand-authored (§3.2) |
| `PRD.md:129` + `:135-142` (inv. 14, §6a) | wiki informs, typed layer decides | Typed object beside `coding_rules`, not a wiki page (§0) |
| `PRD.md:116` (inv. 1) · `:124` (inv. 9) | the DB owns every number; maker/checker on high-stakes | The binding resolves an **identity**; no number moves, and `is_high_stakes` (`0023:495-499`) is untouched |
| `PRD.md:117` · `ARCHITECTURE.md:11-14,74-78` | four structural invariants | Provenance *strengthened* — the resolver pins and records its extractions per phase; every new verb role-floored |
| `PRD.md:123` (inv. 8) | reverse-not-delete | Bindings revoked never deleted; resolutions append-only |
| `CLAUDE.md` | one audited fn per mutation class · DB-structural guards · op-key · role floor · `_vN` workflows | §3–§4 + Part 2; **no workflow body changes** (Part 2 §A.6) |

## 3. Q1 + Q2 — the binding record, and how it is born

### 3.1 The object

A new typed table `clara.vendor_identity_bindings`, mirroring `coding_rules`' lifecycle but **not**
reusing that table: `coding_rules.account_code` is `not null`, `ck_coding_rules_tier`
(`0015:301-306`) partitions rows by `rule_type`, and `uq_coding_rules_one_live_vendor`
(`0011:791-792`) keys uniqueness on `(client_id, counterparty_id, rule_type)`. A binding has no
account; forcing one in corrupts the tier CHECK or invents a sentinel code.

**The feature vocabulary is closed by COLUMNS, not by a `jsonb` blob** (r1 finding 10). A free-form
`features jsonb` would make "closed vocabulary" a comment rather than a constraint, and a
security-definer defect writing an unexpected key would not be rejected structurally. Every feature
is a typed column with its own CHECK.

**The full DDL contract — every column, CHECK, unique anchor, foreign key and trigger — is Part 2
ssG**, rebuilt in v4 against the live constraint anchors (`0009:798-810`). It moved there because
this part is the *authority argument* and ssG is the *build spec*; the round-3 reviewer is now
checking DDL buildability, and that belongs beside the build list it feeds.

Three objects: **`clara.vendor_identity_bindings`** (the authority) · **`..._binding_evidence`**
(the three approvals, one row each, with the extraction ids pinned at proposal) ·
**`clara.vendor_binding_resolutions`** (append-only, one row per phase - `draft`, `revision`, `post`
- each carrying its own pins, the model's `raw_proposal`, the `entry_revision_token`, and for post
rows the `compared_to_resolution_id` naming the draft row it was checked against).

**Provenance does not ride the fingerprint** (round-1 finding 1, **closed** at round 2). v1's
`match_fingerprint={"decision":"binding_match"…}` was incompatible with the approval contract:
`_approve_entry_core` recomputes `_resolve_counterparty(proposed_counterparty)` and raises `CLR23`
unless the result equals the stored fingerprint exactly (`0015:1313-1317`) — the first EZSEC approval
would have failed — and it would also have dropped R2's `vendor_account` snapshot, gated on the
decision value (`0016:4167`). **The fingerprint stays ordinary.** The binding reference lives in a
nullable `journal_entries.vendor_binding_id` — provenance only, never an input to resolution — and
the durable record is the resolutions row, which survives approval's fingerprint nulling
(`0015:1460-1463`).

### 3.2 The features — DB-computed, and only F3 proves identity

**The signer never types a pattern.** The proposal names only `{client_id, counterparty_id}`; the DB
derives the features from the evidence window and refuses if they disagree. A hand-authored pattern
is a human *claim* about future documents; a derived one is a *fact* about documents a human already
approved — which is what ADR-046 demands.

**The division of labour, which v1 got wrong** (finding 5): the three features are not walls of
comparable strength. F1 is a single typed `invoice.vendor_name` string, not a whole-letterhead
signature; F2 is a shared numbering habit. Neither proves *who issued the document*. So: **F1 and F2
are STABILITY features** (same recurring document family?), **F3 is the IDENTITY feature** (does this
document assert the bound party?). All three are required; the identity claim rests on F3 alone.

**F1 `vendor_name_norm`** — `clara._binding_normalize()` of the `invoice.vendor_name` region on the
pinned facts extraction. Deliberately **not** the `[^a-zA-Z0-9]→''` folder `_resolve_counterparty`
uses (`0015:1163-1165`): that exists for company-name matching where punctuation is noise, and would
delete the CJK characters that are real evidence here. Unicode handling is specified, not left to
chance (finding 6) — without it, visually identical OCR compares unequal and the signer's receipt is
visually ambiguous:

**v3 correction — v2's normalizer was not buildable.** PostgreSQL's ARE flavour supports
`normalize(t, NFC)` but **does not implement `\p{UnicodeProperty}` classes**, so `[\p{Cf}]` is an
invalid pattern, not a `Cf` stripper. v3 uses an `immutable` DB function with an **explicitly
enumerated** strip list — no property classes, no locale dependence:

```sql
-- IMMUTABLE. The strip list is enumerated, auditable, and versioned with the migration.
clara._binding_normalize(t text) :=
  lower(btrim(regexp_replace(
    translate(normalize(t, NFC),
      U&'\00AD\200B\200C\200D\2060\2061\2062\2063\2064\FEFF'
      U&'\200E\200F\202A\202B\202C\202D\202E\2066\2067\2068\2069', ''),
    '\s+', ' ', 'g')))
-- soft hyphen · ZWSP/ZWNJ/ZWJ · word joiner · U+2061..2064 invisible math operators
-- (r3 finding 5 — FUNCTION APPLICATION and INVISIBLE TIMES were missing) · BOM · LRM/RLM
-- · bidi embedding/override · bidi isolates.
```

**The completeness residual, now registered** (r3 finding 5). This list is *enumerable, not
provable*: Unicode's invisible-format class can grow, and a codepoint outside the list survives
normalization. The bounded consequence, stated precisely: a repeated unknown invisible would make F1
compare **equal** where it should differ — it does not make F1 refuse. F1 is only a stability
feature, so the identity claim still rests on F3, which no invisible character can satisfy. Bounded,
not fatal, and it is now in the §E residual register instead of being called complete.

For EZSEC: `ez 易计 ezaccount count` — identical across every bill checked.

**F2 `invoice_prefix`** — the longest common prefix of `invoice.invoice_id` across the evidence
window, normalized as above. **v1's floor of "≥4 chars with a non-digit" was too weak, and the
review broke it with real data**: the live ROME PUBLIC ADVISORY series `INV250714` / `INV250810` /
`INV250910` yields the permitted prefix `inv2`, which matches essentially any invoice from any vendor
numbering from `INV2`. The v2 floor, all required:

- length ≥ 6;
- ≥ 3 alphabetic characters;
- the leading alphabetic run is **not** in a maintained generic-token denylist — `inv`, `invoice`,
  `bill`, `tax`, `doc`, `no`, `rcpt`, `receipt`, `cn`, `dn`, `so`, `po`, **`binv`** (v3: the review
  measured `BINV…` passing because it was missing);
- else `prefix_too_weak`.

**The denylist is a heuristic, not a wall, and v3 says so.** Measured against the real corpus it is
uneven: EZSEC and PKLG pass, RPA `INV…`/`IV-…` and the bare numeric `202509230` fail. That asymmetry
is acceptable **only because F2 resolves nothing on its own** — it is a stability feature (§ above),
its false-refusals cost a vendor the ability to carry a binding (safe), and its false-passes are
inert without F1 and F3. A design that leaned on F2 for identity would not survive this list.

**F3 `issuer_identity_present`** — structural, always on, never configurable. The bound
counterparty's `registration_normalized` **or** `name_normalized` must appear, under
`_binding_normalize`, in a **page-1 top-band line of the document's own `ocr` extraction** — the same
`topBandFraction` X6 uses, evaluated entirely inside that one extraction's geometry.

**v3 narrowed this deliberately, and does not claim it proves issuership.** v2 added a
vendor-anchor/customer-anchor comparison on top of the band. The review broke that on two grounds and
both are conceded:

1. **Coordinate frames.** X6 compares anchors *within one Azure result*; v2 crossed an
   `invoice_facts` polygon against a separate `ocr` extraction with no frame congruence — the units
   bug X6's own header warns about twice. v3 removes the cross-extraction geometry entirely.
2. **Role-blindness.** The band test cannot tell an issuer from a `c/o X` / `prepared by X` /
   `company secretary X` line in the same block. **Named residual** (Part 2 §C.1), not a wall — and
   legitimate, since such a document need not be a forgery. Mitigations are operational: the cap, the
   window, the divergence surface, and the owner's bounded-forgery ruling at §10 (5).

**The doctrine question this raised is RULED** — §10 ruling 9 / amendment D: F3 is corroboration of
an authority a human created, not creation of identity by the page, and it stays.

**Bank-account details are OUT** — §10 ruling 6, closed not deferred.

**Refusals** — each named and visible, never a silent pass:

| condition | refusal |
|---|---|
| two or more live bindings on the client match one document | `binding_ambiguous` |
| F1/F2 match but F3 finds no attributed identity | `binding_uncorroborated` |
| page cannot be banded, or no typed `VendorName` region to anchor F3 | `binding_unattributable` |
| document has no done `ocr` extraction | `binding_no_corroboration_source` |
| canonical counterparty's registration ≠ `registration_at_signing` | `binding_identity_drifted` |
| counterparty retired or merged away | `binding_counterparty_inactive` |
| expired / revoked | `binding_expired` · `binding_revoked` *(v4: `binding_suspended` is PURGED — suspension was cut in v3 and the refusal outlived it, r3 finding 9)* |

### 3.3 The ceremony — explicit, two verbs, mirroring propose/sign

Automatic-at-the-Nth-approval is **rejected**: under WB-R2 authority is a deliberate human act, and
authority that accrues by counting is the shape ADR-046 refused. Both verbs are op-key idempotent via
`_reserve_op`/`_finish_op`, audited, `clara_authenticated`.

**`clara.propose_vendor_identity_binding(p_proposal jsonb, p_op_key text)`** — floor
`_human_ctx(role_rank('bookkeeper'))`, matching `propose_autopost_rule` (`0016:1612`). Refuses unless
**all** hold:

1. client in the caller's firm; counterparty canonical, not retired, `kind='vendor'`;
2. the counterparty carries a `registration_normalized` (§10 ruling 3);
3. **the evidence window** — the **three most recent** qualifying approvals by `approved_at`, where
   qualifying means `approved`, `reversed_by is null`, `checked_via_rule_id is null` (the H2
   carve-out, `0015:1474-1476`), `document_id is not null`, canonical counterparty = this one. The
   window is DB-determined, so the caller cannot cherry-pick — but it is **not** all of history. v1
   required every historical document to agree, which the review showed makes a binding unrecoverable
   forever after one old letterhead variant, and falsely claimed the design was self-healing. A
   most-recent-three window is what actually heals: three approvals of a changed format make the
   window agree again;
   **3a. DWELL (v3, the recency-takeover answer).** A most-recent-three window with no time
   requirement lets one actor approve, propose and sign three quickly-steered documents and take over
   an established vendor's identity in an afternoon. So the window must additionally show **three
   distinct `posting_date`s spanning ≥ 14 days**, else `window_too_recent`. A recurring-vendor
   binding is *by definition* a claim about a repeating relationship; a burst that never repeats has
   not demonstrated one. This is a bound on speed, not a proof of good faith — the residual is named
   in Part 2 §C.6;
4. every window document has a done `invoice_facts` **and** a done `ocr` extraction, and **both ids
   are pinned into `vendor_identity_binding_evidence`**. **v3: the pins must be the extractions the
   humans actually approved** (finding 6) — v2 pinned "latest at proposal time", which is not the
   same thing and left post-approval re-extraction free to steer every feature. So the proposal
   **refuses `evidence_restated`** if any window document's newest facts or `ocr` extraction was
   created *after* that document's entry was approved. Re-extracting after approval does not
   silently change what a binding rests on; it disqualifies the document until a human approves the
   restated evidence;
5. F1 identical across the window — else `features_unstable`;
6. F2 meets the §3.2 floor — else `prefix_too_weak`;
7. F3 holds, attributed, on every window document;
8. **no live binding exists for `(client, counterparty)`.** Flat, with no exception — v4 removes v3's
   `supersedes_binding_id` relaxation (r3 finding 6), which contradicted §4's deferral of atomic
   supersession and left a ceremony that could not be built: a proposal naming a live predecessor
   would either hit `uq_vendor_binding_one_live` at signing or need the very transition §4 defers.
   Renewal is **revoke, then propose, then sign** — full stop, coverage gap accepted (§4).

**`clara.sign_vendor_identity_binding(p_binding uuid, p_op_key text)`** — floor
`_human_ctx(role_rank('admin'))`, matching `sign_autopost_rule` (`0016:1781`). It re-derives
conditions 1–8 against live rows (the ADV-5 discipline at `0016:1820-1830`) **and additionally
requires the re-derived features, evidence window and content hash to equal the stored proposal
byte-for-byte** — else `proposal_drifted`, re-propose. Without that equality check (finding 6) a
coherently changed extraction set between proposal and signature could activate a row whose stored
features no longer describe the evidence. Then `status='live'`, `signed_by`, `signed_at`; audit;
`kb_binding.signed`. **Signing touches no predecessor** — v4 removed v3's supersession step here too
(r3 finding 6); a live predecessor must already have been revoked for condition 8 to pass.

**The visible receipt:** the sign return carries the derived features in full — the signer reads
`ez 易计 ezaccount count` and `ezsec-iv-`, plus the evidence document ids and both pinned extraction
ids — *before* it goes live.

## 4. Q3 — scope, expiry, revocation

**Client-scoped. Firm scope is refused outright**, not deferred. `clara.counterparties` rows are
client-scoped (`0009:812-839`), RLS isolates by firm *and* client, and a firm-scoped binding would
let one client's approvals mint posting authority over another client's books — a cross-client
authority leak and a direct violation of client attribution (`ARCHITECTURE.md:75`). The same vendor
billing two clients needs two bindings and two sets of three approvals. Slower; correct.

**Expiry: 12 months**, matching `ck_coding_rules_autopost_bounds` (`0016:2889-2895`). Letterheads and
secretarial providers change; an authority nobody re-reads is an authority nobody owns.

**Expiry is a status transition, not just a timestamp** (finding 7). v1 left an expired row at
`status='live'`, squatting `uq_vendor_binding_one_live`. The partial unique index cannot carry
`expires_at > now()` (a partial-index predicate must be immutable), so **every read path treats
`expires_at <= now()` as not-live** and refuses `binding_expired`, and the row is transitioned to
`status='expired'` by whichever verb next touches it, freeing the index.

**Renewal is revoke-then-propose-fresh. Atomic supersession is DEFERRED** (v3 narrowing,
orchestrator-ruled). v2 promised a one-transaction supersession that "retires" the predecessor —
against a vocabulary with no `retired` or `superseded` value, so it would have written a state that
does not exist. The honest answer: **renewal has a coverage gap** — revoke, propose, sign, with an
interval during which the client has no binding and its bills land in the human queue. **For one
binding at one firm that is an accepted operational cost, stated as a cost.** Atomic supersession and
its reserved `superseded` status are a **named deferral**, to be designed when more than one firm
carries bindings and the gap starts costing something.

**Revocation: `clara.revoke_vendor_identity_binding(p_binding, p_reason, p_op_key)`, floor
`bookkeeper`** — deliberately a *lower* floor than signing. Creating authority should be harder than
destroying it; any bookkeeper who sees something wrong can pull the brake. Sets `status='revoked'`,
`revoked_by/at/reason`; the row is never deleted (invariant 8).

**The total lock order, rebuilt AGAIN in v4 from every live participant** (r2 finding 7, r3 findings
2 and 3). v3's law was doubly wrong: it put the binding lock *after* `_approve_entry_core`, which is
the function that performs the `status='approved'` transition (`0016:1445-1449`) — so the control
would have run after the post it was meant to gate — and it moved the executor to entry-before-rule,
which deadlocks against `persist_invoice_facts`. Both are corrected here, and the corrected law is
one the design can actually obey.

Every live acquirer, read from the bodies:

| path | lock sequence, verified |
|---|---|
| `persist_invoice_facts` (`0022:452-459`) | `document_filings` **FOR UPDATE** → draft `journal_entries` **FOR UPDATE** → task FOR UPDATE |
| `_approve_entry_core` (`0016:1257,1265`) | filing **FOR SHARE** → entry **FOR UPDATE** → *(transition at `0016:1445-1449`)* |
| `execute_rule_post` (`0023:403,483-487`) | entry read **unlocked** → `coding_rules` **FOR UPDATE** → `_approve_entry_core` |
| `revise_entry` (`0016:4807`) | entry **FOR UPDATE** (no filing) |

The live system therefore already agrees on **filing → entry**, and the rule is only ever taken by
the executor, before everything else. v3 proposed entry-before-rule and thereby created the cycle the
r3 reviewer reconstructed: post holds the entry and waits on the filing inside the approve core,
while `persist_invoice_facts` holds the filing and waits on that same entry.

**v4 law — one global order, and the binding is NOT last:**

> **`coding_rules` → `document_filings` → `journal_entries` → `vendor_identity_bindings`**

Every acquirer takes a *prefix-consistent subsequence* of it, which is what makes the order
cycle-free:

- **`execute_rule_post` (recut in 0028):** rule → **filing FOR SHARE → entry FOR UPDATE (taken by the
  executor itself, in the live order)** → binding FOR UPDATE + the §A.5 re-resolution and its receipt
  → *then* `_approve_entry_core`, whose filing/entry locks are re-entrant no-ops in the same
  transaction. The binding control now runs **before** the approval transition, which is what r3
  finding 2 required, and the executor stops reading the entry unlocked (`0023:403`);
- **`persist_invoice_facts`:** filing → entry. A prefix. Unchanged;
- **`_approve_entry_core`:** filing → entry. A prefix. Unchanged;
- **`revise_entry`:** entry → binding. A subsequence. Consistent;
- **`revoke` / `sign`:** binding alone. The tail;
- **the resolver `_resolve_vendor_binding`: takes NO lock at all.** It is `stable` and read-only.
  v3 let lazy expiry write from inside it, which (as r3 noted) leaves a row lock held across the
  caller — and Slot B's subsequent FK checks take `FOR KEY SHARE` on parent rows, i.e. locks acquired
  *after* the binding. Making the resolver lock-free removes that whole class. Expiry is instead a
  status transition performed only by the verbs (`propose` / `sign` / `revoke`) and by a reconciler
  pass; every read path independently treats `expires_at <= now()` as not-live, so correctness never
  depends on the transition having happened yet.

**Why this is cycle-free, checkably.** Every path's sequence is a subsequence of the single global
order above, and no path takes a lock that precedes one it already holds. That is a stronger and more
checkable claim than v3's "binding last", and unlike v3's it is compatible with the binding control
needing to run before the approval transition. The rig test named in Part 2 §D asserts it; the
pre-existing `file_document` / `confirm_attribution_candidate` hazard (task #29) is a filing-vs-filing
ordering issue that predates this design and is untouched by it.

**Revocation is a real brake only because of the lock above.** A post-time liveness *read* would not
be one: the sweep could read the binding live, revocation could commit and truthfully report zero
posted entries, and the sweep could then post under the binding it had already read. The `FOR UPDATE`
on the binding row is what serializes them, which is why its position in the order matters enough to
have its own law.

**In-flight drafts on revocation.** Existing drafts are **not** retro-edited: a draft's
`proposed_counterparty` and its resolution row are evidence of what was decided, and rewriting
evidence to match a later decision is the opposite of an audit trail. They simply stop being
postable, because `execute_rule_post` re-derives against live rows under the lock above. A draft
whose binding is no longer live skips `binding_revoked` and sits in the human queue.
**Already-posted entries stand** (reverse-not-delete); the revoke verb returns the count of entries
posted under that binding — accurate, because the lock serializes it against in-flight posts — so the
revoker knows exactly what to review and can reverse deliberately.

## 5-8. Moved to Part 2 (numbering kept so both reviews' §-refs resolve)

**§5 (the gate change) → Part 2 §A**, where v1's three code-level errors were fixed (the fingerprint
marker raising `CLR23` on the first EZSEC approval; liveness-recheck instead of re-resolution; the
over-broad X6 `absent` precondition) and v3 unified the post phase into one receipt-writing
re-resolution. **§6 (#30) → §F** · **§7 (adversarial) → §C** · **§8 (build) → §D**.

## 9. Open questions — the original eight are ruled; v3 raises ONE

Eight questions were raised here — maker/checker, human-lane conflict, the registered-counterparty
requirement, the two-pin, expiry, bank details, the skip vocabulary, the shipping shape. **All eight
are closed**, each restated with its ruling and consequence in §10.

**Q9 (raised by v3, RULED 2026-07-28 — §10 ruling 9 / amendment D).** *Does an F3-shaped predicate
fall inside the rejection of option B?* **The owner ruled it does not: F3 stays.** No longer a gate.

## 10. Rulings (2026-07-28) — every §9 question closed

Ruled by the **owner** (via AskUserQuestion, 华语) and by the **orchestrator** as marked. These bind
the build. Where a ruling amends the design above, the amendment is stated here and the earlier
section is read subject to it.

| # | question | ruling | by |
|---|---|---|---|
| 1 | maker/checker on the binding | **Matches `sign_autopost_rule`'s existing posture** — one person may propose and sign. A distinct-actor requirement is **Wave-C material**, not this slice | orchestrator |
| 2 | human-lane conflict | **ADVISORY, NEVER BLOCKING** — amendment A | owner |
| 3 | registered-counterparty requirement | **REGISTERED-ONLY** — amendment B | owner |
| 4 | the two-pin (§5.6) | **ACCEPTED** — record both extraction ids in `vendor_binding_resolutions` exactly as designed | orchestrator |
| 5 | expiry | **TWELVE MONTHS STRAIGHT, no probation.** Consistency with `ck_coding_rules_autopost_bounds` (`0016:2889-2895`) wins over a shorter first-binding trial | owner |
| 6 | bank details as a fourth feature | **OUT — CLOSED, not deferred.** A new page region is option B by the back door | orchestrator |
| 7 | skip-vocabulary split (§6.2) | **APPROVED** — the zero-consumer grep is the evidence | orchestrator |
| 8 | shipping shape | **SPLIT** — amendment C | orchestrator |
| 9 | *(v3)* is an F3-shaped predicate option B? | **NO — F3 STAYS** (裁定：不算 option B) — amendment D | owner |
| 10 | *(v3)* admission stamping cut instead of `admit_autodraft_task` replaced | **ACCEPTED AS FINAL** — do not build the replacement; the admission-provenance residual stays honestly named | orchestrator |

**Amendment D (ruling 9) — F3 is corroboration, not identity creation.** The reasoning of record,
because it is the line every future feature in this family will be measured against:

> **Option B was "the page creates identity → identity creates authority." F3 is "the human creates
> authority → the page only corroborates."** The rejected *direction of authority flow* is what made
> option B option B.

Three properties keep F3 on the right side of that line: its **failure can only refuse**; its
**success only releases what a human already approved** (the counterparty was named and signed by a
professional before any document reached it); and it **emits and stores no new identity evidence** —
nothing is written back to the extraction, no `invoice.vendor_registration` region is created, and
X6's emission walls are untouched. A false pass resolves to the *same human-approved counterparty*,
never an arbitrary one.

The review's contrary reading is recorded rather than erased — it is reasonable, and the ruling is
what settles it, not the argument. **The `c/o` residual (Part 2 §C.1) is unaffected**: it was never
about whether F3 may exist, only about what F3 cannot see, and it remains open and named.

**Operational note (not a gate), corrected in v4.** v3 said "a fourth bill" without checking that the
window is ordered by **`approved_at`**, not `posting_date` — r3 was right that this is only
conditionally true. Read live: the three approvals are `2b2a267a` (posted 29/08, approved last),
`a8253e24` (25/08), `b93b0f1e` (25/08, approved **first**). A fourth approval evicts `b93b0f1e`,
leaving `{25/08, 29/08, new}` — three distinct dates, so **one** fourth bill does suffice here, but
only because the oldest approval happens to be a 25/08 one. The span must reach 14 days from 25/08,
so the bill must post **on or after 08/09/2025**: **IV-00846 (13/10, `7ecc83c2`) or IV-00847 (14/10,
`aef22972`) qualify; IV-00744 (25/08) and IV-00745 (03/09) do not.**

**Amendment A (ruling 2) — the human lane surfaces, records, and yields.** On a human-lane draft
whose document has a live binding match and whose chosen counterparty differs, the DB **never**
blocks: the human's choice always stands. It must (i) surface a **visible warning citing the
binding** — its id, its signer, and the counterparty it names — and (ii) **record the divergence
durably**, so the binding's next reviewer sees that a professional looked at a bound document and
decided otherwise. Mechanism: a `vendor_binding_resolutions` row with `outcome='divergence'` and a
`divergence jsonb` naming the human-chosen counterparty and the actor.

**v3 (finding 9, orchestrator-narrowed): divergence is VISIBLE-ONLY. Auto-suspension is CUT.** v1
promised an early warning it never designed; v2 over-corrected into an automatic state change and the
review broke that too — `_record_notification_core` is wrapped in `exception when others then null`
(`0023:690-697`), so "notifies the signer" was a promise the mechanism cannot keep, and a counter of
*rows* could be tripped by one draft revised three times. v3 keeps what a read surface can deliver:

- **`revise_entry` writes the divergence row** (Part 2 §A.4) — the recording gap is closed;
- the binding read surface shows a divergence count **by DISTINCT `document_id`**, not by row, so
  one draft edited repeatedly counts once;
- **no automatic state change and no notification-delivery promise.** A human reads the surface and
  decides whether to revoke. `suspended_pending_resignature` is removed from the status vocabulary.

The early-warning claim shrinks accordingly: **this is a place to look, not an alarm that fires.**
That is worth more than an alarm whose delivery the code swallows — and it removes the overcount and
denial-of-service classes outright, since nothing automatic hangs off the count.

**Amendment B (ruling 3) — registered-only, and this is status quo preserved, not a new
restriction.** A binding requires the counterparty to carry a `registration_normalized`
(§3.3 condition 2). Unregistered sole-proprietors and individuals therefore stay on **human review
permanently for now** — which is exactly where they are today. Nothing they can do is taken away
and no lane they have is closed; they simply do not gain this one. What a deterministic identity
looks like for a party with no SSM number is **a future wave's design problem**, deliberately not
smuggled into this slice.

**Amendment C (ruling 8) — two migrations, the X5 "last and alone" discipline.** *(v2: the split
needs an ACTIVATION INTERLOCK — finding 10. 0027 installs Slots A/B and the signing ceremony while
0028 installs the post-time control; released independently, a bound draft could reach the OLD
executor with no binding gate at all. The interlock is specified in Part 2 §D.)*

- **0027** — the binding table, `vendor_binding_resolutions`, `_binding_normalize`,
  `_resolve_vendor_binding`, the three verbs, and Slots A (`_coding_lane_core`) and B
  (`_draft_entry_core`). The §6.2 skip-vocabulary split rides here.
- **0028 — micro-migration, LAST and ALONE** — Slot C only: `execute_rule_post`'s binding liveness
  re-check. That function has been re-cut three times (`0016:2297` → `0022:986` → `0023:379`) and is
  the most security-critical in the system; it ships in its own migration with its own review.

**Build-order constraint — the build starts only when BOTH clear:**

1. **migration 0026 lands** (in flight on `feat/0026-lane-widen`). This design touches none of its
   surface, but 0027 must be cut against a tree that already carries it.
2. **a Codex adversarial design review of this document clears** — fired by the orchestrator on this
   push. Findings are resolved *here, in the design*, before any SQL is written.
