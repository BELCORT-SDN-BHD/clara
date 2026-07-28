# Autopost vendor binding — DESIGN v2 (task #33) — PART 1: the authority object

**Part 2 — the machinery, the v2 adversarial set, the build, and the per-finding register — is
`docs/plan/autopost-vendor-binding-design-part2.md`.** Split per repo precedent
(`wave-b-migration-0017-design-part2/3.md`) rather than compressing arguments away.

**v2 (2026-07-28)** answers a Codex adversarial design review that returned ten findings against v1.
Section numbering is preserved so every §-reference in the review still resolves. Where a finding
killed a claim, the claim is **withdrawn**, not reworded — v1's "self-healing" and
"structurally impossible" both go. §9/§10 owner rulings are unchanged and remain law.

**Status:** DESIGN ONLY — decision-ready, nothing built. No migration cut, no code changed.
**Owner ruling implemented:** 2026-07-28, option A — *autodraft MAY resolve a document's vendor
from VERIFIED IN-SYSTEM HUMAN APPROVALS when X6 page evidence is absent.* Rejected by the same
ruling: **option B** (widening X6's page-evidence walls), **option C** (hand-drafts autopost-eligible).
**Branch:** `feat/autopost-vendor-binding-design`. **Lands after** migration 0026 (task #32); this
design's migration is **0027** and touches none of 0026's surface.

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

A vendor binding decides an identity a posting authority then consumes. That is Layer 2 — the
typed authority, beside `coding_rules` — not the wiki. The wiki may *cite* a binding on a
counterparty page; it may never *be* one.

## 1. The measured problem

Both blockers measured live 2026-07-28, recorded in
`C:\Users\zhant\.clara-tools\captures\runway-log-2026-07-28.md` §13.4.

**#30 — hand-drafts are structurally autopost-ineligible.** `execute_rule_post` requires
`coding_kind` non-null (`packages/db/migrations/0023_extraction_slice_x5.sql:411-415`). The public
human verb `clara.draft_entry` has 11 parameters and passes `p_coding_kind => null`
unconditionally (`0009_coding_floor.sql:1414-1430`, core call at `0009:1425`); the 19-parameter
`clara._draft_entry_core` (`0016_a21_compliance_watch.sql:3970`) is where it lives, and the only
wrapper supplying it is `clara.wake_draft_entry` (`0009:1432-1458`), granted to
`clara_wake_interactive` alone. **No `clara_authenticated` verb can stamp `coding_kind`.** Ruled
INTENDED; §6 says where that gets written.

**#31 — the autodraft lane refuses every EZSEC bill `vendor_unresolved`.** The refusal is at
**admission**, not drafting: `clara.request_autodraft` (`0011_daily_loop.sql:2599`) →
`clara.admit_autodraft_task` (`0011:2441`) → `clara._coding_lane_core`
(`0015_ar_myinvois_rules.sql:2358`), whose vendor block (`0015:2418-2447`) reads
`invoice.vendor_name` / `invoice.vendor_registration` off the latest done `invoice_facts`
extraction and calls `_resolve_counterparty`; a `birth` decision appends `vendor_unresolved`
(`0015:2439-2440`), the lane becomes `needs_review` (`0015:2484`), and `admit_autodraft_task`
returns `lane_changed` (`0011:2519-2530`).

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
is deliberately excluded, and that exclusion is load-bearing. Accepting unlabelled numerals
re-opens the hazard the module is shaped around (emitting the *buyer's* registration as the
vendor's). The owner rejected that; this design does not revisit it.

So the identity **is on the page** — registered name on line 4, registration on line 5 — and the
machine correctly declines to swear to it. Meanwhile a human already swore to it three times
in-system: counterparty `348dc9cd-b4b5-4405-a858-03bfe3874287` (`EZACCOUNT & SECRETARY SDN. BHD.`,
`registration_normalized 202301030264`) was **born at the first human approval**, and the sighting
floor reads `610-S01 | debit | 3`. That asymmetry is the whole design space.

## 2. The doctrine the design must satisfy

| source | constraint | satisfied how |
|---|---|---|
| `docs/plan/wave-b-contract.md:25-31` (WB-R2, LAW) | "no autopost rules from seeding, ever" | Binding derives **only** from in-system human-approved, unreversed, non-rule-checked entries |
| `docs/PROJECTLOG.md:32` (ADR-046) | authority from verified in-system approvals, not another system's claims | The evidence set *is* the approvals; it cannot be hand-authored (§3.2) |
| `PRD.md:129` + `:135-142` (inv. 14, §6a) | wiki informs, typed layer decides | Typed object beside `coding_rules`, not a wiki page (§0) |
| `PRD.md:116` (inv. 1) | the DB owns every number | The binding resolves an **identity**; no number moves |
| `PRD.md:117` · `ARCHITECTURE.md:11-14,74-78` | four structural invariants | Provenance *strengthened* — the resolver pins and records its extractions; every new verb role-floored |
| `PRD.md:124` (inv. 9) | maker/checker on high-stakes | Binding cannot raise an amount; `is_high_stakes` skip (`0023:495-499`) untouched |
| `PRD.md:123` (inv. 8) | reverse-not-delete | Bindings revoked never deleted; resolutions append-only |
| `CLAUDE.md` | one audited fn per mutation class · DB-structural guards · op-key · role floor · `_vN` workflows | §3–§5; **no workflow body changes** (§5.5) |

## 3. Q1 + Q2 — the binding record, and how it is born

### 3.1 The object

A new typed table `clara.vendor_identity_bindings`, mirroring `coding_rules`' lifecycle but **not**
reusing that table: `coding_rules.account_code` is `not null`, `ck_coding_rules_tier`
(`0015:301-306`) partitions rows by `rule_type`, and `uq_coding_rules_one_live_vendor`
(`0011:791-792`) keys uniqueness on `(client_id, counterparty_id, rule_type)`. A binding has no
account; forcing one in corrupts the tier CHECK or invents a sentinel code.

**The feature vocabulary is closed by COLUMNS, not by a `jsonb` blob** (review finding 10). A
free-form `features jsonb` would make "closed v1 vocabulary" a comment rather than a constraint, and
a security-definer defect writing an unexpected key would not be rejected structurally. Every
feature is a typed column with its own CHECK.

```
clara.vendor_identity_bindings
  id uuid pk · firm_id, client_id uuid not null · counterparty_id uuid not null
  status text default 'proposed'
    check in ('proposed','live','revoked','declined','expired','suspended_pending_resignature')
  f1_vendor_name_norm  text not null check (btrim <> '')      -- the ONLY F1 shape
  f2_invoice_prefix    text not null check (length >= 6)      -- the ONLY F2 shape (§3.2)
  registration_at_signing text not null   -- counterparty registration_normalized, frozen
  content_hash text not null · created_by/at · signed_by/at · revoked_by/at/reason
  expires_at timestamptz not null · supersedes_binding_id uuid
  foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id)   -- congruence, not mere existence
  uq_vendor_binding_one_live unique (client_id, counterparty_id) where status='live'
  trigger t_vendor_binding_frozen — once status='live', UPDATE of f1/f2/registration_at_signing/
    content_hash/expires_at RAISES (the _tf_coding_rule_update idiom, 0015:1096)

clara.vendor_identity_binding_evidence      -- the 3 approvals, one row each (finding 10)
  binding_id · firm_id · client_id · entry_id · document_id
  facts_extraction_id uuid not null · ocr_extraction_id uuid not null  -- PINNED at proposal (§3.3)
  foreign key (entry_id, firm_id, client_id) references clara.journal_entries(id, firm_id, client_id)
  unique (binding_id, entry_id)

clara.vendor_binding_resolutions            -- append-only, the rule_post_skips idiom (0015:337-370)
  id · firm_id · client_id · binding_id · document_id · entry_id
  facts_extraction_id · ocr_extraction_id   -- BOTH pins, per §10 ruling 4
  entry_revision_token uuid                 -- the revision this resolution justified (finding 8)
  raw_proposal jsonb                        -- the model's ORIGINAL claim, preserved (finding 8)
  outcome text check in ('bound','divergence')   -- amendment A's divergence is a row here
  divergence jsonb · created_at
```

**Provenance does not ride the fingerprint — a v1 error the review caught.** v1 proposed
`match_fingerprint = {"decision":"binding_match", …}`. That is **incompatible with the existing
approval contract**: `_approve_entry_core` recomputes `_resolve_counterparty(proposed_counterparty)`
and raises `CLR23` unless the result is *exactly equal* to the stored fingerprint
(`0015:1313-1317`), so the first EZSEC approval would have failed — and `execute_rule_post` does not
convert that `CLR23` into a skip. A `binding_match` decision would also have dropped R2's signed
`vendor_account` rule snapshot, gated on the decision being one of `registration_match` /
`name_match_unregistered` / `alias_match` (`0016:4167`). **The fingerprint therefore stays an
ordinary fingerprint.** The binding reference lives in a dedicated nullable
`clara.journal_entries.vendor_binding_id` column — provenance only, never an input to resolution —
and the durable auditor record is the resolutions row, which survives approval's fingerprint nulling
(`0015:1460-1463`).

### 3.2 The features — DB-computed, and only F3 proves identity

**The signer never types a pattern.** The proposal names only `{client_id, counterparty_id}`; the DB
derives the features from the evidence window and refuses if they disagree. A hand-authored pattern
is a human *claim* about future documents; a derived one is a *fact* about documents a human already
approved — which is what ADR-046 demands.

**What v1 got wrong about the division of labour** (finding 5): v1 presented three features as three
walls of comparable strength. They are not. F1 is a single typed `invoice.vendor_name` string — not a
whole-letterhead signature — and F2 is a shared numbering habit. Neither proves *who issued the
document*. Only F3 does, and only if the identity it finds is attributed to the issuer. v2 states the
roles plainly: **F1 and F2 are STABILITY features** (is this the same recurring document family?);
**F3 is the IDENTITY feature** (does this document assert it was issued by the bound party?). A
binding needs all three, but the identity claim rests on F3 alone.

**F1 `vendor_name_norm`** — `clara._binding_normalize()` of the `invoice.vendor_name` region on the
pinned facts extraction. Deliberately **not** the `[^a-zA-Z0-9]→''` folder `_resolve_counterparty`
uses (`0015:1163-1165`): that exists for company-name matching where punctuation is noise, and would
delete the CJK characters that are real evidence here. Unicode handling is specified, not left to
chance (finding 6) — without it, visually identical OCR compares unequal and the signer's receipt is
visually ambiguous:

```sql
clara._binding_normalize(t text) :=
  lower(btrim(regexp_replace(
    regexp_replace(normalize(t, NFC), '[\p{Cf}]', '', 'g'),   -- strip format/bidi controls
    '\s+', ' ', 'g')))
```

For EZSEC: `ez 易计 ezaccount count` — identical across every bill checked.

**F2 `invoice_prefix`** — the longest common prefix of `invoice.invoice_id` across the evidence
window, normalized as above. **v1's floor of "≥4 chars with a non-digit" was too weak, and the
review broke it with real data**: the live ROME PUBLIC ADVISORY series `INV250714` / `INV250810` /
`INV250910` yields the permitted prefix `inv2`, which matches essentially any invoice from any vendor
numbering from `INV2`. The v2 floor, all required:

- length ≥ 6;
- ≥ 3 alphabetic characters;
- the leading alphabetic run is **not** in a closed generic-token denylist — `inv`, `invoice`,
  `bill`, `tax`, `doc`, `no`, `rcpt`, `receipt`, `cn`, `dn`, `so`, `po`;
- else `prefix_too_weak`.

EZSEC's `ezsec-iv-` passes (9 chars, `ezsec` is not generic). RPA's `inv2` fails twice over. A vendor
whose numbering is genuinely generic cannot carry a binding — correct, since its numbers distinguish
nothing.

**F3 `issuer_identity_attributed`** — structural, always on, never configurable, and **attributed**
(finding 5). The bound counterparty's `registration_normalized` **or** `name_normalized` must appear
in the document's OCR text **inside the issuer block**, where "issuer block" is defined exactly as X6
already defines it: within the top band of page 1, and geometrically nearer the typed `VendorName`
region than the typed `CustomerName` region. v1 searched the *whole* OCR text, which is why the
review's sibling-company attack worked — a bill from company Y naming the bound firm X anywhere on
the page (as company secretary, preparer, or payment agent) satisfied an unattributed F3.

**This reuse of X6's geometry is not option B.** Option B was rejected because it would widen what X6
is willing to *emit* as a vendor registration — letting the machine decide identity from an
unlabelled number. Here nothing is emitted and no identity is created: a human-signed binding already
names the counterparty, and X6's band-plus-anchor test is reused as a *predicate* asking "does this
page assert that party in its issuer block?". If the page cannot be banded, or has no typed
`VendorName` region to anchor against, F3 **fails closed** — X6's own rule that a wall never degrades
to a no-op when its input goes missing.

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
| expired / revoked / suspended | `binding_expired` · `binding_revoked` · `binding_suspended` |

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
4. every window document has a done `invoice_facts` **and** a done `ocr` extraction, and **both ids
   are pinned into `vendor_identity_binding_evidence`** (finding 6) — features derive from *those*
   extractions, never from "latest", so a later `request_reextraction` cannot steer a proposal's
   features without a fresh human approval;
5. F1 identical across the window — else `features_unstable`;
6. F2 meets the §3.2 floor — else `prefix_too_weak`;
7. F3 holds, attributed, on every window document;
8. no live binding exists for `(client, counterparty)` **unless** the proposal names it as
   `supersedes_binding_id` — the relaxation that makes renewal possible without a coverage gap (§4).

**`clara.sign_vendor_identity_binding(p_binding uuid, p_op_key text)`** — floor
`_human_ctx(role_rank('admin'))`, matching `sign_autopost_rule` (`0016:1781`). It re-derives
conditions 1–8 against live rows (the ADV-5 discipline at `0016:1820-1830`) **and additionally
requires the re-derived features, evidence window and content hash to equal the stored proposal
byte-for-byte** — else `proposal_drifted`, re-propose. Without that equality check (finding 6) a
coherently changed extraction set between proposal and signature could activate a row whose stored
features no longer describe the evidence. Then `status='live'`, `signed_by`, `signed_at`, atomic
supersession per §4; audit; `kb_binding.signed`.

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
`status='live'`, where it kept squatting `uq_vendor_binding_one_live` — so a successor could not even
be *proposed* (v1 condition 8 forbade it) and renewal degenerated into revoke-then-propose-then-sign,
opening exactly the coverage gap this section claimed to avoid. Two corrections, both structural:

- the partial unique index cannot carry `expires_at > now()` (a partial-index predicate must be
  immutable), so **every read path treats `expires_at <= now()` as not-live** and refuses
  `binding_expired`; the row is additionally transitioned to `status='expired'` by whichever verb
  next touches it, so the index frees itself;
- **renewal is ATOMIC SUPERSESSION**: a proposal naming `supersedes_binding_id` is permitted while
  the predecessor is live (§3.3 condition 8), and `sign_vendor_identity_binding` retires the
  predecessor and activates the successor **in one transaction under a row lock**. There is no
  interval in which the client has no binding, and no interval in which two live bindings exist —
  which also means the ceremony can never be the thing that manufactures `binding_ambiguous`.

**Revocation: `clara.revoke_vendor_identity_binding(p_binding, p_reason, p_op_key)`, floor
`bookkeeper`** — deliberately a *lower* floor than signing. Creating authority should be harder than
destroying it; any bookkeeper who sees something wrong can pull the brake. Sets `status='revoked'`,
`revoked_by/at/reason`; the row is never deleted (invariant 8).

**One serialization point, or revocation is not a brake** (finding 7). v1 assumed a post-time
liveness *read* made revocation effective. It does not: the sweep can read the binding live,
revocation can commit and truthfully report zero posted entries, and the sweep can then approve and
commit a post under the binding it just read. So **the binding row is the lock**. Every path that
depends on a binding's liveness — `execute_rule_post`, `revoke`, `sign` (including supersession), and
the lazy expiry transition — takes `select … from clara.vendor_identity_bindings where id = … for
update` before deciding. This is the identical discipline `execute_rule_post` already applies to the
`coding_rules` row it matches (`0023:484-487`), so it introduces no new lock-ordering hazard: the
binding lock is taken in the same phase as the rule lock, after the entry lock.

**In-flight drafts on revocation.** Existing drafts are **not** retro-edited: a draft's
`proposed_counterparty` and its resolution row are evidence of what was decided, and rewriting
evidence to match a later decision is the opposite of an audit trail. They simply stop being
postable, because `execute_rule_post` re-derives against live rows under the lock above. A draft
whose binding is no longer live skips `binding_revoked` and sits in the human queue.
**Already-posted entries stand** (reverse-not-delete); the revoke verb returns the count of entries
posted under that binding — accurate, because the lock serializes it against in-flight posts — so the
revoker knows exactly what to review and can reverse deliberately.

## 5. Q4 — the gate change: where resolution slots in

**Moved to Part 2 §A and rebuilt at v2.** The v1 text in this section was wrong in ways the
adversarial review proved against live code — the fingerprint marker broke
`_approve_entry_core`'s recompute-and-compare contract (`0015:1313-1317`) and would have raised
`CLR23` on the *first* EZSEC approval; the post-time control rechecked liveness instead of
re-resolving current evidence; and the X6 `absent` precondition conflated an empty candidate list
with nine distinct refusal reasons. Part 2 §A carries the corrected three-slot design, the
precondition, and the post-time re-derivation. Part 2 §E records each finding's disposition.

## 6. Q5 — writing down #30, and naming the missing field

### 6.1 Where "hand-drafts are not autopost-eligible BY DESIGN" is written

**Primary home: `docs/prd/PRD.md` §6a** (`:135-142`), the typed-authority section — because autopost
eligibility *is* a typed-authority property and §6a is where "the typed layer decides" is stated.
One sentence, as LAW:

> Auto-posting is a machine-lane authority. Only a draft produced by the autodraft lane — carrying
> `coding_kind` — is autopost-eligible. A hand-authored draft is never auto-posted: a human who
> drafts has already exercised judgment, and the maker/checker path (invariant 9), not a rule,
> completes it.

**Also:** an ADR in `docs/PROJECTLOG.md` recording the 2026-07-28 ruling (decisions live there per
`CLAUDE.md`), and a comment in `execute_rule_post`'s eligibility block, which today states the
mechanism (`0023:411-415`) but not the intent.

**Not** `ARCHITECTURE.md` (it names DB objects; the object is `journal_entries.coding_kind`, already
described). **Not** the 0020 design doc — that is the typed-consent surface and unrelated.

### 6.2 The skip-reason fix

Today one reason covers three distinct missing fields (`0023:411-415`):

```sql
if e.coding_kind is null or e.document_id is null or e.proposed_counterparty is null then
  … values(…, 'not_eligible_shape');
```

**Recommendation: split into three named reasons** — `ineligible_no_coding_kind`,
`ineligible_no_document`, `ineligible_no_counterparty` — returned in the JSON as well as written to
`rule_post_skips`. `rule_post_skips.reason` is free text with only a non-blank CHECK
(`0015:337-348`), the table is append-only, and **no runtime or dashboard code matches on the
literal** (grepped `packages/runtime`, `apps/`, `scripts/` — zero hits outside SQL and tests), so
widening the vocabulary breaks nothing. The alternative (keep the reason, add a `detail jsonb`
column) was rejected: the reason string is what an operator groups by.

Worth stating for the operator: hand-drafts on a client with a live rule keep producing one skip row
per draft, forever. That is correct — the skip is the visible receipt that the sweep saw the draft
and declined it — but only a specific reason makes those rows filterable instead of noise. This is
the diagnostic the runway needed and did not have on 2026-07-28.

## 7. Q6 — adversarial: how could this post to the wrong vendor?

**Moved to Part 2 §C and rebuilt at v2.** Two claims made here in v1 are now **withdrawn as false**,
not reworded: the "self-healing" claim (v1 §7.1 — an all-history evidence rule means one old
letterhead variant blocks a binding forever, so fresh approvals could never heal it) and the
"structurally impossible" claim about broad bindings (v1 §7.5 — the review derived the permitted
4-character prefix `inv2` from the real ROME PUBLIC ADVISORY series, and showed a sibling /
"issued on behalf of" bill clearing all three features). Part 2 §C carries the v2 attack set,
including the issuer-attribution attack v1 did not have, and states each residual it does not close.

## 8. Build shape

**Moved to Part 2 §D**, which adds the activation interlock (§10 amendment C's split must not let
0027 confer usable authority before 0028's post-time control exists), the structural constraints
the sketch owed (closed feature vocabulary, composite firm/client FKs, signed-content immutability),
and the rig matrix the v2 mechanics require.

## 9. Open questions — ALL RULED 2026-07-28

Eight questions were raised here — maker/checker, human-lane conflict, the registered-counterparty
requirement, the two-pin, expiry, bank details, the skip vocabulary, the shipping shape. **All eight
are closed**, each restated with its ruling and consequence in §10. Nothing here remains open.

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

**Amendment A (ruling 2) — the human lane surfaces, records, and yields.** On a human-lane draft
whose document has a live binding match and whose chosen counterparty differs, the DB **never**
blocks: the human's choice always stands. It must (i) surface a **visible warning citing the
binding** — its id, its signer, and the counterparty it names — and (ii) **record the divergence
durably**, so the binding's next reviewer sees that a professional looked at a bound document and
decided otherwise. Mechanism: a `vendor_binding_resolutions` row with `outcome='divergence'` and a
`divergence jsonb` naming the human-chosen counterparty and the actor.

**v2 correction (finding 9): as written in v1 this control was decorative, and the fix is a real
consumer.** v1 promised divergence would reach "the binding's next reviewer" while designing no
review surface, no queue item, no notification and no consumption rule — and `revise_entry` bypassed
recording entirely, so a bound draft could be revised to another counterparty leaving no trace. v2
closes both ends: **`revise_entry` writes the divergence row** (Part 2 §A.4), and divergence has a
**consumer that acts** — after **3 divergences within 30 days** the binding transitions to
`suspended_pending_resignature` and its `signed_by` is notified, reusing verbatim the mechanism
`execute_rule_post` already uses to suspend an OCR-sales autopost rule after repeated skips
(`0023:684-698`). A suspended binding resolves nothing until an admin signs a successor.

**This does not touch the owner's ruling.** The ruling protects the *human's* counterparty choice,
which remains unblockable in every case. Suspending the *binding* after repeated human disagreement
is the machine standing down from an authority the professionals keep overriding — the opposite of
blocking a human.

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
