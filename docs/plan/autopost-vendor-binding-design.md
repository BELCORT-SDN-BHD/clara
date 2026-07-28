# Autopost vendor binding — DESIGN (task #33)

**Status:** DESIGN ONLY — decision-ready, nothing built. No migration cut, no code changed.
**Owner ruling implemented:** 2026-07-28, option A — *autodraft MAY resolve a document's vendor
from VERIFIED IN-SYSTEM HUMAN APPROVALS when X6 page evidence is absent.* Rejected by the same
ruling: **option B** (widening X6's page-evidence walls), **option C** (hand-drafts autopost-eligible).
**Branch:** `feat/autopost-vendor-binding-design`. **Lands after** migration 0026 (task #32); this
design's migration is **0027** and touches none of 0026's surface.

---

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

---

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

---

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

---

## 3. Q1 + Q2 — the binding record, and how it is born

### 3.1 The object

A new typed table `clara.vendor_identity_bindings`, mirroring `coding_rules`' lifecycle
(`proposed → live → revoked`) but **not** reusing that table. Reuse was considered and rejected:
`coding_rules.account_code` is `not null`, `ck_coding_rules_tier` (`0015:301-306`) partitions rows
by `rule_type`, and `uq_coding_rules_one_live_vendor` (`0011:791-792`) keys uniqueness on
`(client_id, counterparty_id, rule_type)`. A binding has no account; forcing one in corrupts the
tier CHECK or invents a sentinel code. A separate table costs one migration and keeps both honest.

```
clara.vendor_identity_bindings
  id uuid pk · firm_id, client_id uuid not null · counterparty_id uuid not null
  status text default 'proposed' check in ('proposed','live','revoked','declined')
  features jsonb not null              -- §3.2, DB-computed, NEVER caller-supplied
  registration_at_signing text not null -- counterparty's registration_normalized, frozen (§7.6)
  evidence_entry_ids uuid[] · evidence_document_ids uuid[]   -- the >=3 approvals
  content_hash text · created_by/at · signed_by/at · revoked_by/at/reason
  expires_at timestamptz not null      -- <= created_at + 12 months
  supersedes_binding_id uuid           -- genealogy, coding_rules shape
  uq_vendor_binding_one_live unique (client_id, counterparty_id) where status='live'
  ck_vendor_binding_expiry · ck_vendor_binding_revoked

clara.vendor_binding_resolutions          -- append-only, the rule_post_skips idiom (0015:337-370)
  id · firm_id · client_id · binding_id · document_id · entry_id
  facts_extraction_id uuid not null · ocr_extraction_id uuid not null
  features_matched jsonb not null · created_at
```

**Why a separate resolutions table and not `journal_entries.match_fingerprint`.** A finding, not a
preference: `_approve_entry_core` **nulls `match_fingerprint` on approval** —
`update … set proposed_counterparty=null, match_fingerprint=null …` (`0015:1460-1463`). Provenance
written only into the fingerprint is erased by the very act it justifies. The fingerprint still
carries the marker while the draft is open; the auditor's durable record is the resolutions row.

### 3.2 The features — and the decision that the DB computes them

**Recommendation: the signer never types a pattern.** The proposal names only
`{client_id, counterparty_id}`; the DB derives the features from the ≥3 approved documents and
refuses if they disagree. This is the most important choice here and it is what makes the object
satisfy ADR-046 rather than gesture at it: a hand-authored pattern is a human *claim* about future
documents; a derived one is a *fact* about documents a human already approved.

Closed v1 vocabulary — three features, all required, all exact-match, none fuzzy:

**F1 `vendor_name_exact`** — `clara._binding_normalize()` of the `invoice.vendor_name` region on the
pinned facts extraction. The normalizer is deliberately **not** the `[^a-zA-Z0-9]→''` folder
`_resolve_counterparty` uses (`0015:1163-1165`): that exists for *company-name* matching where
punctuation is noise, and it would delete the CJK characters that are real evidence here.

```sql
clara._binding_normalize(t text) := lower(btrim(regexp_replace(t, '\s+', ' ', 'g')))
```

For EZSEC: `ez 易计 ezaccount count` — identical across every bill checked. The fragmentation *is*
the signature; preserving it is the point.

**F2 `invoice_id_prefix`** — the **longest common prefix** of `invoice.invoice_id` across the
evidence documents, lowercased (EZSEC: `ezsec-iv-`). Refused unless ≥4 characters **and**
containing a non-digit — a purely numeric prefix is a date or a counter, not a series.

**F3 `registered_identity_present`** — **structural, always on, never configurable.** The new
document's OCR text must contain the bound counterparty's `registration_normalized` **or** its
`name_normalized`. For EZSEC both are present (line 5 and line 4).

F3 is what turns this from pattern-matching into evidence. F1+F2 say "this looks like the usual
bill"; F3 says "and this document still asserts, in its own text, that it comes from the party the
human approved." A document that does not print the vendor's identity can never be bound, however
familiar its layout.

**Bank-account details were considered and rejected as a feature:** no region for them exists in
any extraction, so adding one is a new deterministic page reader — option-B-adjacent work with its
own slice. Recorded as §9 Q6, not smuggled in.

**Refusals when features conflict** — each named and visible, never a silent pass:

| condition | refusal |
|---|---|
| two or more **live bindings on the client** match one document | `binding_ambiguous` (X6 uniqueness-or-nothing) |
| F1+F2 match, F3 fails | `binding_uncorroborated` |
| document has **no done `ocr` extraction** | `binding_no_corroboration_source` — the wall never degrades to a no-op when its input goes missing (X6 `height_missing` precedent) |
| canonical counterparty's registration ≠ `registration_at_signing` | `binding_identity_drifted` (§7.6) |
| counterparty retired or merged away | `binding_counterparty_inactive` |
| `expires_at <= now()` / status not `live` | `binding_expired` / `binding_revoked` |

### 3.3 The ceremony — explicit, two verbs, mirroring propose/sign

Automatic-at-the-Nth-approval is **rejected**: under WB-R2 authority is a deliberate human act, and
authority that accrues by counting is exactly the shape ADR-046 refused. Two verbs, both op-key
idempotent via `_reserve_op`/`_finish_op`, both audited, both `clara_authenticated`.

**`clara.propose_vendor_identity_binding(p_proposal jsonb, p_op_key text)`** — floor
`_human_ctx(role_rank('bookkeeper'))`, matching `propose_autopost_rule` (`0016:1612`). Refuses
unless **all** hold:

1. client in the caller's firm; counterparty canonical, not retired, `kind='vendor'`;
2. **the counterparty carries a `registration_normalized`** — without one there is nothing for F3
   to corroborate against (see §9 Q3 for what this excludes);
3. ≥3 **distinct** `journal_entries` on this client: `approved`, `reversed_by is null`,
   `checked_via_rule_id is null` (never a rule's own output — the H2 carve-out at `0015:1474-1476`),
   `document_id is not null`, canonical counterparty = this one. Deliberately the *same* evidence
   predicate `propose_autopost_rule` uses (`0016:1717-1727`), keyed on the counterparty rather than
   the account, because identity is not account-specific;
4. every such document has a done `invoice_facts` **and** a done `ocr` extraction;
5. **F1 byte-identical across all of them** — else `features_unstable`;
6. **F2's longest common prefix** ≥4 chars with a non-digit — else `prefix_too_weak`;
7. **F3 holds on every one of them.** A human may have approved a document that does not print the
   vendor's identity; that document is not evidence for a binding;
8. no live binding exists for `(client, counterparty)`.

On success: a `proposed` row with the derived features, evidence ids, `registration_at_signing`, a
content hash, `expires_at = now() + 12 months`; audit; `kb_binding.proposed` on the spine.

**`clara.sign_vendor_identity_binding(p_binding uuid, p_op_key text)`** — floor
`_human_ctx(role_rank('admin'))`, matching `sign_autopost_rule` (`0016:1781`). **Re-derives the
entire floor at signing** — conditions 1–8 again against live rows — so evidence reversed between
proposal and signature strips the authority before it goes live. This is the ADV-5 discipline
`sign_autopost_rule` already applies to the OCR-sales floor (`0016:1820-1830`). Then `status='live'`,
`signed_by`, `signed_at`; audit; `kb_binding.signed`.

**The visible receipt:** the sign return carries the derived features in full — the signer reads
`ez 易计 ezaccount count` and `ezsec-iv-`, plus the evidence document ids, *before* it goes live —
the spine event is queryable, and thereafter every resolved draft writes a
`vendor_binding_resolutions` row naming the binding, the signer, and both pinned extractions.

---

## 4. Q3 — scope, expiry, revocation

**Client-scoped. Firm scope is refused outright**, not deferred. `clara.counterparties` rows are
client-scoped (`0009:812-839`), RLS isolates by firm *and* client, and a firm-scoped binding would
let one client's approvals mint posting authority over another client's books — a cross-client
authority leak and a direct violation of client attribution (`ARCHITECTURE.md:75`). The same vendor
billing two clients needs two bindings and two sets of three approvals. Slower; correct.

**Expiry: 12 months**, matching `ck_coding_rules_autopost_bounds` (`0016:2889-2895`). Letterheads
and secretarial providers change; an authority nobody re-reads is an authority nobody owns. Renewal
means signing a successor via `supersedes_binding_id`, which re-runs the whole floor — so renewal is
itself evidence that the vendor still bills the way it billed.

**Revocation: `clara.revoke_vendor_identity_binding(p_binding, p_reason, p_op_key)`, floor
`bookkeeper`** — deliberately a *lower* floor than signing. Creating authority should be harder than
destroying it; any bookkeeper who sees something wrong can pull the brake. Sets `status='revoked'`,
`revoked_by/at/reason`; the row is never deleted (invariant 8).

**In-flight drafts on revocation — and it costs nothing.** Existing drafts are **not** retro-edited:
a draft's `proposed_counterparty` and its resolution row are evidence of what was decided, and
rewriting evidence to match a later decision is the opposite of an audit trail. They simply stop
being postable, because `execute_rule_post` **re-derives every gate against live rows** — its
founding doctrine (`packages/runtime/lib/rule-post.mjs:9-13`) — and the binding is one more gate in
it. A draft whose binding is no longer live skips `binding_revoked` and sits in the human queue.
**Already-posted entries stand** (reverse-not-delete); the revoke verb returns the count of entries
posted under that binding, so the revoker knows exactly what to review and can reverse deliberately.

---

## 5. Q4 — the gate change: exactly where resolution slots in

### 5.1 Precondition — absence only, never ambiguity

Consulted **only** when the machine honestly found nothing. All three must hold on the **pinned**
facts extraction:

1. `envelope->'vendor_identity'->>'outcome' = 'absent'`. If X6 said `ambiguous` or
   `typed_disagreement` (`invoice-vendor-identity.mjs:415,480`) the binding **never** fires — a
   contested page outranks a standing authority and a human must look. If `matched` /
   `typed_collapsed`, normal resolution already works and the binding is never reached;
2. no `invoice.vendor_registration` region exists;
3. `_resolve_counterparty` on the page's own vendor name returned `birth` (or the region is absent).

This answers the sub-question directly: **absence only, not ambiguity.**

### 5.2 Slot A — `_coding_lane_core`, the admission gate

At `0015:2431-2447`, after the existing block yields `vendor_unresolved`, call the new private
resolver `clara._resolve_vendor_binding(p_client, f.document_id)`. On a hit set `v_counterparty` and
append the reason **`vendor_bound`** — visible, because an auditor must see *which* authority
resolved the vendor, and the reasons array is where the lane explains itself.

`vendor_bound` must not block admission, so `0015:2484` changes from
`array_remove(v_reasons,'rule_backed')` to remove `vendor_bound` too. That exemption list exists for
exactly this purpose (`rule_backed` is informational, not blocking) — a one-expression change with
an established precedent, not a new concept.

### 5.3 Slot B — the draft, so the model never judges identity

**Not optional: fixing Slot A alone makes the system worse.** Today
`packages/runtime/workflows/autoDraft.v3.tools.ts:141-163` passes `JSON.stringify(input.vendor)` —
the model's raw proposal — as `wake_draft_entry`'s `p_proposed_counterparty`. Admit an EZSEC bill
without changing this and the model proposes `{new:{name:"ez 易计 ezAccount COUNT"}}`,
`_draft_entry_core` calls `_resolve_counterparty` (`0016:4064`), and a **junk counterparty is born**
— strictly worse than today's clean refusal.

The fix is DB-side, so it is structural rather than model discipline. In `_draft_entry_core`, when
`p_document is not null` and the document has a live binding match:

- proposal resolves to the **same** canonical counterparty → proceed unchanged;
- proposal resolves to a **different existing** counterparty → **`CLR23 vendor_binding_conflict`**
  on the agent lane. Never silently override a stated identity;
- proposal would **birth** → on the agent lane (`p_is_human = false`) the birth is **refused** and
  the binding's counterparty substituted. `proposed_counterparty` is written as the **resolved**
  form `{"existing_id": <bound cp>, "kind":"vendor"}`, and `match_fingerprint` records
  `{"decision":"binding_match","binding_id":…}`.

Writing the resolved form (not the model's raw text) is what keeps the most security-critical
function in the system nearly untouched — see 5.4.

**On the human lane (`p_is_human = true`) the binding is advisory, never blocking.** Recorded in the
fingerprint and nothing else. A human who decides the familiar letterhead is now a different entity
must be able to say so — that judgment is the authority the whole system runs on, and a binding
derived from their own past approvals must not trap them. (§9 Q2: judgment call, opposite reading
defensible.)

### 5.4 Slot C — `execute_rule_post`, minimal by construction

Because Slot B stores the *resolved* `{"existing_id": …}` form, the executor's existing
`_resolve_counterparty` call (`0023:468-481`) resolves cleanly by id and needs **no change**. Its
only new work is a **liveness re-check** keyed off `match_fingerprint->>'binding_id'`: a
binding-resolved entry requires the binding still `live`, unexpired, un-drifted, and its
counterparty still canonicalizing to the rule's — else a named skip (`binding_revoked` /
`binding_expired` / `binding_identity_drifted`), placed beside the existing `not_corroborated`
admission gate (`0023:635-639`).

Everything else is untouched: high-stakes, control-leg-ties-to-gross, account identity enumeration,
cap, window, expiry, revision, corroboration. **The binding changes who the counterparty is; it
changes no number and lowers no other gate.**

### 5.5 Workflow bodies: none change

`autoDraft.v3` and its tools are **not** modified. The model keeps proposing a vendor exactly as it
does now; the DB overrides it on bound documents. Deliberate: it keeps the frozen workflow manifest
untouched (`scripts/check-frozen-workflows.mjs`), avoids an `_vN` bump, and puts the guard in the
layer that cannot be prompted around.

### 5.6 What the auditor sees

1. `clara.vendor_binding_resolutions` — binding id, document id, entry id, **both pinned extraction
   ids**, features matched. Append-only. Survives approval.
2. Spine event `counterparty.binding_resolved` at draft time.
3. Lane reason `vendor_bound` on `coding_lane` / `list_review_queue`, so the review UI can say
   *"vendor resolved by binding signed by \<name\> on \<date\>, from 3 approvals"* rather than
   presenting it as though the page proved it.

### 5.7 The two-pin tension, named rather than glossed

F1/F2 read the pinned `invoice_facts` extraction; F3 reads the latest done `ocr` extraction — a
**different row**. `execute_rule_post`'s ADV-R2 discipline binds exactly one extraction per post
(`0023:417-445`) precisely to avoid disagreeing evidence. Honest resolution: the resolver pins
**both**, once, at its top, by the same `order by version_n desc, id desc limit 1` rule, and
**records both ids**. Zero done `ocr` extractions ⇒ refuse (`binding_no_corroboration_source`),
never proceed unpinned. Live coverage is 47/47 documents with a done `ocr` extraction, so this costs
nothing operationally — but the refusal must exist so the wall cannot quietly become a no-op.
§9 Q4 asks the owner to accept the two-pin or drop F3 for a weaker binding.

---

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

---

## 7. Q6 — adversarial: how could this post to the wrong vendor?

Each attack, then the wall. Walls are structural (DB) unless stated.

**7.1 The vendor changes its invoice format.** F1 and/or F2 stop matching → no hit →
`vendor_unresolved` → human queue. **Fail-closed and self-healing**: after three fresh human
approvals of the new format a successor binding can be signed. A changed letterhead is precisely
when you want a person to look.

**7.2 Two vendors share an invoice-number prefix.** F2 alone resolves nothing — F1, a full
letterhead signature, must match too. Two live bindings matching one document is
`binding_ambiguous`, refuse. And a shared prefix cannot be *authored* into existence: F2 is the
derived longest common prefix of approved documents, floored at 4 chars with a non-digit.

**7.3 A forged document mimicking the pattern.** The real threat. To post it must clear, in order:
intake and filing to the right client; X6 reporting `absent`; F1 exactly; F2 exactly; **F3 — the
bound party's registration or registered name in its own OCR text**; two-reader corroboration of net
*and* tax (`0023:635-639`); MYR; the entry shape (exactly one payable credit **equal to the stated
gross**, ≥1 signed-account debit, zero outside legs — `0023:546-591`); the cap (RM1,700); the
monthly window (≤3); high-stakes; non-expiry.

Stated honestly: that is a **bounded small-ticket exposure with a complete audit trail** naming the
binding and its signer — and it should be compared to the status quo, not to zero. Today the same
forgery lands in the review queue and a bookkeeper approves it. The binding does not create the
exposure; it changes who is in the loop for recurring bills under the cap. That comparison is the
owner's to rule on (§9 Q5 proposes a shorter probationary expiry as the cheap mitigation).

**7.4 The client switches secretarial firm mid-year.** New letterhead, new registration → F1 and F3
both fail → refuse → human codes → new counterparty at approval → three approvals → a new binding
may be signed. Correct by construction. The nastier variant — **a practice sale where the acquirer
keeps the template and the numbering** — is caught by F3: the acquirer prints *its own* registration,
the bound one is gone, refuse. The residual case is transitional stationery still printing the old
registration; there the invoice itself asserts it is from the old entity, the cap and window bound
the damage, and the 12-month expiry forces a re-look. **Recorded as residual risk, not claimed
solved.**

**7.5 Authoring a deliberately broad binding to launder many vendors into one counterparty.**
Structurally impossible in the recommended design: **features are DB-derived, never caller-supplied**
(§3.2). F1 must be byte-identical across ≥3 approved documents; F2 is a floored longest common
prefix; F3 must already hold on every one. There is no input through which to widen a pattern.

**7.6 Counterparty merge or identity drift.** `merge_counterparties` (`0015:2242`) can repoint the
bound counterparty. Every resolution canonicalizes, so a merge is followed — but if the canonical
counterparty's `registration_normalized` differs from `registration_at_signing`, the resolver
refuses `binding_identity_drifted` and demands re-signature. Fail-closed: a binding attests to a
*specific registered identity*, and a merge that changes it invalidates the attestation.

**7.7 Rules breeding rules.** Untouched: the sighting + auto-proposal block is human-only
(`checked_via_rule_id is null`, `0015:1472-1476`), so binding-resolved rule-posts breed nothing; and
the binding's evidence predicate excludes rule-checked entries, so a binding can never be born from
autopost output.

**7.8 An unregistered counterparty.** Refused at proposal (§3.3 condition 2). Without a registration
there is nothing for F3 to corroborate, and a name-only binding is exactly the CLR23 hazard the R2
ceremony proved correct on 6 of 12 ticks.

---

## 8. Build shape (for the implementation lane, not decided here)

- **Migration 0027**, one migration: the two tables · `_binding_normalize` · `_resolve_vendor_binding`
  (private, `revoke all from public`) · three verbs (`propose`/`sign`/`revoke`, all
  `clara_authenticated`, role-floored, op-key idempotent, audited, spine events) ·
  `create or replace` of `_coding_lane_core` (Slot A), `_draft_entry_core` (Slot B) and
  `execute_rule_post` (Slot C + §6.2 vocabulary). Next free error code appears to be **CLR35** —
  verify against as-built before cutting, per the 0017-design convention.
- **Sequencing:** `execute_rule_post` is the most security-critical function in the system and has
  been re-cut three times (`0016:2297` → `0022:986` → `0023:379`). Recommend cutting it **last and
  reviewing it separately**, the way X5 was kept alone.
- **Rig first, then live:** new-object tests, the §3.2 refusal matrix, the Slot-B birth-refusal, the
  revocation-stops-in-flight-drafts test, and an exact-diff proving `draft_entry` stays
  byte-identical for unbound documents.
- **Live vehicle already standing:** counterparty `348dc9cd`, 3 approvals, rule `90a07e89` live,
  8 corroborated EZSEC documents, IV-00743 (`671786e5…`, filing `0586d531…`) filed with no open
  draft. After deploy the resume is a single `request_autodraft(0586d531…)`.
- **Cross-model review before merge** — security-critical work under the house rules.

---

## 9. Open questions for the owner (each changes scope)

1. **Maker/checker on the binding.** `sign_autopost_rule` has an admin floor but no distinct-actor
   requirement, so one person can propose and sign. Match that precedent, or require a different
   signer / a `self_approval_attestation` (the mechanism exists on entries)? At BELCORT today owner =
   admin = bookkeeper, so a distinct-actor rule would be unimplementable.
2. **Human-lane conflict behaviour.** Recommended advisory (recorded, never blocking) — a human must
   be able to say "this is a different entity now." Raising even for humans is stricter and
   defensible. Owner's call.
3. **Registered-counterparty requirement (§3.3 cond. 2).** Recommended as a hard wall — but it
   permanently excludes unregistered sole-proprietors and individuals from ever carrying a binding,
   and Malaysian small suppliers are frequently unregistered. Accept the exclusion?
4. **The two-pin (§5.7).** Accept F3 reading the `ocr` extraction alongside the pinned facts
   extraction, or drop F3 and accept a binding that never checks whether the new document actually
   asserts the vendor's identity? *Strong recommendation: accept the two-pin.*
5. **Expiry.** 12 months mirroring the autopost bound, or a shorter probation (3 months) for the
   *first* production binding, renewed on evidence? Cheapest mitigation for §7.3.
6. **Bank-account details as a fourth feature.** Not available today; needs a new deterministic page
   reader and its own slice. Wanted later, or closed?
7. **Skip-vocabulary change (§6.2).** No code consumer found, but it changes strings appearing in
   past receipts and runway logs. Confirm it may change.
8. **Shipping shape.** One migration 0027, or split (object + resolver first, `execute_rule_post`
   second) given how security-critical that function is?
