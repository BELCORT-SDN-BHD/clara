# 裁-18b — the Clara vendor-binding PROPOSAL door: GATE RECORD

> **STATUS: OPEN.** Eight questions stand for the owner (Tao). Each carries the 大白话 briefing,
> the cost of each arm, and **the lane's recommendation with its reason**. Per the standing grill
> protocol the sitting runs **one question per turn**; this file is the minute-book and is
> updated in place as each is ruled.
>
> **No DB PR opens before G1, G2 and G4 are ruled** — those three change what gets built. G3 and
> G6-G8 change scope; G5 changes sequencing only.
>
> Set of record: `binding-proposal-survey.md` (as-found) · `binding-proposal-design.md` (the
> design) · `binding-proposal-annexes.md` (verbs · battery · D1 · risks · cross-lane).
> Ruling of record: `docs/plan/active/mohe-grill-rulings-2026-08-28.md` §裁-18(b), with 裁-18(a),
> 裁-18(c) and 裁-22 as its neighbours.

---

## What the owner already ruled (not re-opened here)

裁-18(b) settled **that** the door is built, **what** it proposes from (her own observation — a
stable fingerprint, repeatedly approved), **what** it must carry (rationale + model on the
receipt), and **when** (before beta, its own design gate + backend + frontend train). None of
that is a question below. What the gate must settle is the **kind**, the **trigger**, the
**basis contract**, the **registry key**, and four scope edges the survey turned up.

---

## G1 · Which wake kind carries the proposal, and what fires it

**大白话.** Clara only ever acts through a "wake" — a short-lived credential that says which
*kind* of job she is doing. Each kind has its own list of doors it may open. We must say which
kind may open this new door, and what makes her open it.

**The options and what each costs.**

| arm | what it costs | what it buys |
|---|---|---|
| **A — `filing` + `interactive`** (recommended) | 4 allowlist rows, 4 grants. **Zero** new roles, zero cluster-role bootstrap, zero credential-CHECK change, zero engine registry row. | `filing` is the estate's identity lane and already owns a dedicated role, `clara_wake_filing`, separated from every posting verb. `interactive` is what a human's "ask Clara" runs on — **required** by 裁-18c. |
| **B — `autodraft`** | the same 2 rows, but the grant lands on `clara_wake_interactive` anyway | nothing extra. **Measured (survey S2a): there is no `clara_wake_autodraft` role.** The coding lane is not a grant boundary, so `autodraft` gives strictly less separation than A. |
| **C — a new kind, e.g. `binding_agent`** | a `wake_credentials` CHECK **pair** widening (a named shared surface), a new `clara_wake_*` role **and** its `roles-bootstrap.sql` twin in the same commit, a login role, a `pools.mjs` entry, a `wake_engine_sources` row, a workflow export, an enable ceremony | a private role for one door. |

**The trigger, same question.** (i) the **filing lane's own turn** — after she files an invoice she
asks the DB which of that client's vendors are now eligible and proposes one; (ii) the **human
ask** from the *admin / vendor-bindings* panel; (iii) a **clock sweep** — a new engine source (both existing
sources are still disabled, survey §4).

> **RECOMMENDATION — arm A, triggers (i) + (ii), no sweep.** (i) and (ii) are both carried by
> credentials that already exist, and (ii) is not optional: under 裁-18c a single-admin firm has
> exactly two ways out and "let Clara propose" is one of them, so the human must be able to ask.
> The design also adds a read verb, `wake_list_binding_candidates`, so Clara learns eligibility by
> **asking the DB** rather than by triggering a refusal — without it trigger (i) degenerates into
> probing every vendor and reading the error. The sweep is recorded as the named future extension
> (annexes E, N3), not built.

**RULED:** *(pending)*

---

## G2 · The 裁-22 basis contract — this door has THREE documents, not one

**大白话.** 裁-22 says: when Clara proposes something, every piece of evidence she cites must be a
real, checked row in the database — not a sentence she typed. The lane building that shared
checker is writing it for a door that has **one** triggering document. This door's evidence is
**three approved invoices**. If the shared checker only accepts one document, this door cannot use
it, and 裁-22's own words — *both doors in ONE migration pair, one contract, never one door* —
break on a function signature.

**What the design already does, and why it is stronger than the floor.** Nothing the model types
enters the binding row: the fingerprint, the prefix, the registration and the evidence are all
computed by the database (survey S1). The design goes further and makes **`sightings` a forbidden
argument** — the count of matching approved invoices is derived by the DB and refused if supplied
(design §3.2). What remains model-authored is her *rationale* (prose, receipt-only) and the
*regions she says she read*, and those regions are exactly what the shared resolver must check.

> **RECOMMENDATION — the shared resolver takes a document SET.** `_resolve_proposal_basis(p_firm
> uuid, p_documents uuid[], p_citations jsonb)`, with the single-document doors passing a
> one-element array. This is a small change to a function that is not yet merged, and it is the
> only shape under which 裁-22's "one contract" survives contact with this door. **If the owner
> prefers to freeze the single-document signature, this door's PR-2 HOLDS** until a follow-up
> widens it — it does not ship a local copy of the resolver, because that mints exactly the
> fourth un-verified basis 裁-22 exists to abolish.

**RULED:** *(pending)*

---

## G3 · Does `_coding_lane_core` count the fingerprint?

**大白话.** The brief floated a trigger where the coding lane counts "I have seen this vendor's
fingerprint N times" and proposes at N. The database already computes that fact — the derivation's
window is three approved invoices, on three distinct dates, at least fourteen days apart, with one
stable name fingerprint (survey S1a). Putting a second count in the coding lane would mean two
places computing one fact, which the estate's own rule (TA-P11's test) forbids — and
`_coding_lane_core` is a 13.5 KB body many lanes share.

> **RECOMMENDATION — no.** `_coding_lane_core` is untouched. Eligibility is read from the DB
> through `wake_list_binding_candidates`, which is the same predicate the derivation uses, so
> there is exactly one definition of "ready to propose".

**RULED:** *(pending)*

---

## G4 · The receipt-surface registry key for a pre-beta item

**大白话.** Every act Clara takes writes a receipt, and every receipt table is registered in one
small table so nothing can be written where a human cannot read it. The register's key today must
look like `f_a7`, `f_a7b` — a Wave-F item number. This item is a **pre-beta ruling item** with no
Wave-F number, and the pre-beta queue will mint more receipt-bearing doors (裁-17, 裁-19).

| arm | cost | honesty |
|---|---|---|
| **A — widen to admit a `pb_*` family** (recommended) and register `pb_binding` | two closed-world CHECK widenings, both directions proven in the tail | honest: the key says what the item is |
| **B — take the next free `f_a` number**, e.g. `f_a11` | zero CHECK change | the key claims a Wave-F item that does not exist |
| **C — suffix an existing item**, e.g. `f_a2c` | zero CHECK change | worse: it claims to belong to F-A2 (entry posting), which it does not |

> **RECOMMENDATION — arm A.** The widening is a small, mechanically-proven extension of a pattern
> `0142` already extended once (digits-only → one optional trailing letter), the pre-beta queue
> will use it again, and a register whose keys lie is a register nobody can audit. Cost stated
> honestly: it touches a named shared surface twice (item + shim_relname), so the conductor is
> told before authoring.

**RULED:** *(pending)*

---

## G5 · The needs-you inbox row — now, or after 裁-17?

**大白话.** The "needs you" inbox lists everything waiting for a human. 裁-17 is adding a ninth
kind of row (seeding proposals) to that list right now. A binding proposal would be the tenth. Both
edits land in the same database function, and the estate has paid before for two lanes changing
one shared body in the same window.

> **RECOMMENDATION — after.** Train 1 ships the proposal on the existing
> the *admin / vendor-bindings* panel panel, where the sign ceremony already lives and where the human is
> already looking; train 2 adds the tenth row kind once 裁-17's ninth has merged. The proposal is
> visible from day one either way — the inbox row is a convenience, not the surface.

**RULED:** *(pending)*

---

## G6 · The post-time re-check is GONE — is restoring it in scope?

**大白话, and this one is a finding the owner has not seen.** When `0029` was built, a binding was
checked twice: once when Clara drafted the entry, and again at the moment the entry was posted, so
a binding revoked in between could not sneak an entry through. **That second check no longer
exists.** The rules tier it lived in (`execute_rule_post`) was retired whole at `0118`, and the
survey measured that nothing in the live database writes the post-time record any more — the
column that carries it is unreachable (survey S5). Today a binding is re-checked at draft and at
revision only.

**The exposure is narrow but real:** an entry drafted under a live binding and approved after the
binding is revoked is posted with the binding's identity attribution and no re-check. It is not a
wrong number — the accounts, amounts and direction were always Clara's judgement under the other
walls — it is a stale *identity* authority.

> **RECOMMENDATION — record it, do not build it here.** Restoring the check means replacing
> `_approve_entry_core`, one of the estate's most-shared audited writers, with a D1 write-quiesce
> window — a blast radius several times this item's, and a different ruling (it is about the
> *posting* lane, not the *proposal* door). It belongs on the pre-beta hardening batch beside
> 裁-18a, sized honestly. **If the owner wants it inside 裁-18, it becomes its own PR with its own
> ceremony and this item's dates move.**

**RULED:** *(pending)*

---

## G7 · `decline` and expiry — two live gaps in the same neighbourhood

**大白话.** Two more things the survey found:

- **A human cannot say no.** The binding's status column allows the value `declined`, but **no
  verb anywhere ever writes it** (survey A3). An admin who disagrees with a proposal can only
  leave it sitting there. Once Clara proposes, that gap becomes visible immediately.
- **Nothing expires a stale proposal.** A proposal older than twelve months is marked expired
  only opportunistically, when someone happens to propose again (survey A4).

> **RECOMMENDATION — the `decline` verb RIDES this item; the expiry sweep does not.** Declining is
> the other half of the two-party shape 裁-18b is building: a card a human cannot answer "no" to is
> not a consent surface. It is a small additive verb (admin floor, reason required, audited,
> `proposed → declined`), and once it exists the loop brake in
> `wake_list_binding_candidates` can also read it, so Clara does not re-propose what a human
> refused (risk R7). The expiry sweep needs a clock and belongs with the G1 engine work.

**RULED:** *(pending)*

---

## G8 · One open proposal per vendor — confirm the human door's behaviour changes

**大白话.** Today two people can propose the same binding twice and both proposals sit there. The
design adds a database rule: **one open proposal per (client, vendor) at a time.** This is what
stops Clara re-proposing on every new invoice from the same vendor. It also changes the *human*
door's behaviour without changing a line of its code — a second manual proposal now refuses with
the existing "binding conflict" message.

> **RECOMMENDATION — yes, take it.** Without it the agent trigger loops, and even for humans a
> queue of duplicate proposals for one vendor is a defect rather than a feature. The refusal is the
> estate's existing typed one (`binding_conflict`), so nothing new appears in the UI's error
> vocabulary; the battery proves it on both paths (annexes C, W7-a/b).

**RULED:** *(pending)*

---

## Recorded, no ruling needed

- **The `trigger_id` looseness rides in.** The new receipt table follows the estate's current
  contract, where `trigger_kind='wake_task'` carries the **credential** uuid rather than the task
  id — the same looseness 裁-22's own record already minutes as a backlog item against the receipt
  contract. This item inherits it verbatim and does not invent a private fix.
- **No egress authorization.** Measured: of six live `wake_propose*` verbs, exactly one takes an
  egress authorization, and it is the intake-time door that proposes from a document not yet
  attributed (survey S9). This door reasons over already-attributed DB facts, so requiring one
  would force a shared-surface widening of the egress purpose CHECK for no security gain.
- **The T10 copy must flip when 裁-18a lands.** `apps/web/messages/en.json:1898` and `:1915-1917`
  currently tell the admin that the same person may propose and sign. True today, false the day the
  wall merges. Carried as a cross-lane obligation (annexes G-c), not a question.
