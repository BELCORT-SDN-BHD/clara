# F-A5b PR-0 — the gate record

> **The gate ran 2026-08-23** against design **v1** (`sandbox-export-design.md`, the survey and the
> annexes — 917 lines), as one set in a six-set Track-B sweep. **Five lenses** (accounting · security
> · law · build · ruling-translation) raised 17 findings; 16 went to adversarial verification, and
> **every finding was re-derived by an independent verifier under a refute-style brief** — the
> verifier's re-graded severity governs. **Five were REFUTED. Eleven were CONFIRMED: 4 blockers ·
> 6 materials · 1 (raised as material, downgraded to) nit.** One raw nit did not go to verification.
>
> **Verdict: the shape holds; the WALLS do not. Four blockers and six materials bind the build.**
> Eight of the ten bind-the-build findings are FOLDED into v2 by this record — it is the fold's
> spec, and v2's change note points here. **Two are OWNER CARDS and are NOT closed** (§6): they are
> a hard-constraint-1 collision and a professional-authority question, and neither is a gap a design
> may close by itself.
>
> **The law-28 cross-model adversarial pass has NOT been run and must not be run against v1.**
> §3.1's body shape, §3.2's derivation, §3.6's render wall and §3.7's authority scope all moved in
> the fold, so a pass run now would have attacked a body nobody will build (the F-A6 precedent,
> `freeform-read-gate-record.md:14-17`). **It runs against v2, before PR-1 merges** — the severance
> imposed it (`reporting-agency-gate-record.md:250-253`), and **this fold does not discharge it.**
> The brief moved to Annex G and now has eight arms.
>
> Standing caveat unchanged: migration-source reads are predictions about the live catalog; PR-1's
> rig replay confirms them. **Nothing in this lane is built** — `sandbox_views`, `sandbox_exports`,
> `export_recipients`, `layoutSandbox`, `sandbox_export_payload` and `watermark_policy_versions`
> exist nowhere outside `docs/plan`, so this is a 100%-prospective design and PR-0 is where these
> defects are catchable at all.

## 1 · What was attacked and HELD

- **The two-relation answer to gate defects 1 and 2.** The immutable/lifecycle split, the
  `0079:136-140` lifecycle-wall idiom, the hash-comes-IN completion (`0071:121-124`), the refusal of
  a third artifact relation on law-74 grounds, and the content-addressed `storage_key` — all
  re-derived and confirmed. **Ships as designed.**
- **The `firm_closure` posture itself.** A firm-wide free read cannot name its clients
  (`0002:308-315`), so deriving the whole roster is TA-P10 C′ (2)'s own test applied honestly, not a
  narrowing bolted on. Q3 puts it to the owner correctly. What the gate found was the *predicate*
  under it (M2), never the posture.
- **The recipient model.** X8's "the schema has no recipient concept" is exact — `recipient` returns
  zero rows across all 102 migrations. The two-kind mint, computed-never-stored firm-member
  coverage, immutable+supersede, and the three-valued absent/superseded/inactive refusals all hold.
- **The battery's method**, which is the strongest part of the v1 packet: differential cells over
  self-referential ones, a wall proven by making it REFUSE, named-and-counted skips, fixtures that
  throw on construction. **Every battery failure the gate found is a failure of the design the
  battery was testing, not of the battery's method** — and the fold's new cells are written in that
  same discipline.
- **The one-architecture commitment.** G-1/G-2 in both directions, the `chart_kind_unknown` refusal
  with no fallback to bars, and the ceremony sequencing behind F-A5 PR-4 are all sound as written.
- **The ruling translation, clause by clause,** with one exception: clauses (1), (2), (3) and the
  rider are built as ruled. **Clause (4) is built only in its "never authoritative" half** — the
  export half is owner card 1.

## 2 · Blockers — the build may not start until each is folded

**B0 · The coverage check binds to the caller-supplied BASIS, not to the body's actual content.**
*(accounting lens, CONFIRMED blocker; verifier: "I tried three refutations and none survived the
bytes".)* `wake_mint_sandbox_view(p_body, p_basis, …)` (`design:196`) takes two independent
arguments, and every row of §3.2's derivation table keys off a *basis* row. So the wall is encoded as
*"the recipient covers every client the caller pointed at"* where ADR-0074:234-236 ruled *"the
recipient must cover every `client_id` in the file"*. **The failure path:** compose a chart comparing
clients A and B, cite only A's read, `client_set` derives `{A}` with `client_set_basis='exact'`, an
external recipient covering only A passes, and B's turnover leaves the firm **with a
`coverage_proof` on file asserting the wall held**. Nothing recovers the difference —
`freeform_read_log` stores the query text and no result rows, and no Annex-B cell tested the body at
all (B1.1-B1.7 all test the derivation). The design's own §3.9 attack 2 named this exact hole and
handed it to the law-28 pass — but a pass has nothing to defeat where no mechanism exists, unlike
attack 1 where `typstString()` plus the §3.6 control is a real target. **Precedent fixes the
severity:** GM-7 failed F-A5's PR-0 and severed this very lane for a *"half-blind wall"* of this
class (`reporting-agency-gate-record.md:210-219`).
**Fold (C-18/C-19, design §3.1-§3.2, cells B1.8-B1.10):** the verifier's correction is taken —
per-block *client tags* would be model-supplied and re-import F5-D14's forbidden shape, so the fold
uses a **POINTER**. `basis` becomes a labelled map; every body block carries `basis_ref`, **a label
and never a client id**; a block with no ref refuses `sandbox_view_block_basis_absent` and a ref
outside the view's own basis refuses `sandbox_view_block_basis_unknown`. Closed-world both ways, so
**omitting a pointer refuses instead of silently narrowing the set**. `coverage_proof` additionally
records `body_sha256`, so the proof names the exact body it covered. **B1.9 is the differential the
gate's failure path walks:** a two-block body deriving `{A,B}`, whose twin dropping block 2's ref
REFUSES rather than deriving `{A}`. **What this does NOT close is said in the design, not hidden:**
the transcription channel is owner card 1.

**B6 · §3.2's derivation reads basis rows with no same-firm predicate, inside a core that runs as
`clara_fn_owner`.** *(security lens, CONFIRMED blocker.)* The design places the cores under
`clara_fn_owner` (`annexes:39`), whose bootstrap policy is `for all … using (true) with check (true)`
on every relation in the `0002:485-491` loop — `freeform_read_log` included. `clara_fn_owner` is not
BYPASSRLS, and that buys nothing: **its own policy admits every firm's rows.** `freeform_read_log.id`
is a single global identity sequence (`0002:309`) so a foreign id is guessable, and `firm_id` is
still nullable (`0002:310`). **Either branch is a defect:** if the `scope='firm'` arm resolves from
the log row's firm, firm B's client uuids are frozen permanently into a firm-A `client_set` and
surfaced through `list_sandbox_exports` — a cross-tenant read of client identifiers; if it resolves
from `wake_firm()`, the coverage proof is fabricated from an unauthenticated input. No token and no
cell would have made it refuse: B2.4 covers a cross-firm *recipient*, and B6.6 only proves a firm-A
session cannot SEE a firm-B row — never that a firm-A row's *content* can be contaminated.
**The estate has a documented prior fail-open of exactly this class, and it was caught as a round-2
blocker:** `0083_wave_e_zeta_render_human_doors.sql:102-108` — *"An earlier draft relied on 'RLS
still scopes the artifact' — which is FALSE inside a definer body: this runs as `clara_fn_owner`,
whose owner policy on `clara.report_artifacts` is `using (true)`, so the table returns EVERY firm's
rows"*, exposing another firm's sealed manifest, digests and storage key.
**Fold (C-20, design §3.2, Annex A.2, cell B1.11):** `_sandbox_client_set(p_firm, p_basis, p_body)`
takes the firm as its **first argument**, resolved by the wrapper from `wake_context()` and never
read off a basis row; every basis lookup carries `and firm_id = p_firm` as an explicit conjunct
**written as equality, never `is not distinct from`**, so a NULL `firm_id` is the unknown and
refuses. Absent, foreign and NULL-firm all raise the same `sandbox_view_basis_unknown` — **no
existence oracle** (`0083:109-111`'s CLR11 rule, matching B2.4's own posture). A.2 additionally
states that the `clara_fn_owner` containment is about *who may invoke*, never about scoping the body.

**B7 · The watermark's only wall is at the request door, and the renderer's string can be empty.**
*(security lens, CONFIRMED blocker.)* §3.6 puts the presence check at request time *"not at render
time"* and proves unconditionality by the **absence of a `decision.watermark` branch**
(`design:246-257`; B3.5). But unconditional is a property of the BRANCH, not of the STRING:
`typstString(value)` is `'"' + String(value ?? "") …` (`layout.mjs:73-79`) — it **coerces null and
undefined to the empty string and never throws**. Any payload path that loses the pinned row's
string — a jsonb key-name mismatch, a locale resolving no row in the payload builder, a lookup
returning nothing — yields `text(60pt, fill: rgb("#00000014"), "")`: the render completes,
`complete_sandbox_export` records `done` with a sha256, and **an unwatermarked sandbox PDF is
byte-indistinguishable from a sealed one** — the precise harm §3.6 exists to prevent, and what
TA-P10 C′ (3) refuses. The sealed lane is safe only by accident (`watermarkText()` returns one of
three literals). B3.5's decision-shape enumeration never touches the payload-content axis, and
B3.1's PDF-text extraction is a test-time control, not a runtime refusal.
**Fold (C-23, design §3.6, cell B3.6):** `layoutSandbox` resolves the string through the file's own
fail-closed accessor `need(map, key, kind)` (`layout.mjs:81-88`), raising **`watermark_text_unresolved`**
— **ahead of `typstString`, rejecting blank as well as absent** (reading after the coercion would be
reading the projection, review law 3). **Both doors keep their wall** (law 78's rider R-TA-P1-walls);
B3.5 is re-cut to the decision axis it actually proves, and B3.6 forces the payload-content axis by
mutating the payload — absent, null, `""`, whitespace-only — with no bytes and no
`complete_sandbox_export` on any arm.

**B1 · Every exported figure is a model-TYPED string. — NOT FOLDED. OWNER CARD 1, §6.**
*(accounting lens, CONFIRMED blocker.)* Recorded here so the build cannot mistake its absence from
§3 for a disposal.

## 3 · Materials — each folds into v2

**M2 · `firm_closure` is status-unqualified, and the estate's house form points the wrong way.**
*(accounting lens; the verifier confirmed it and widened it.)* `clara.clients.status` is
three-valued — `('active','archived','onboarding')` (`0003:38`, widened `0017:658-659`) — clients are
archived, never deleted, and a firm-wide free read has **no client predicate at all** (F-A6's arm
returns NULL for HOME), so non-active clients' rows are inside the aggregate. The word "status" does
not appear anywhere in the three sandbox files. **The reflex is not a habit but a documented rule
pointing the wrong way:** both roster enumerators filter `status='active'` (`0016:866`,
`0017:4927-4928`), and `0036:1010-1013` records an O8.4 active-client guard on all seven enumerators.
A builder following it produces an under-covering set that §3.3 accepts silently, and B1.4 — written
from the same unqualified prose — passes against both implementations. **The verifier's widening:**
the archived narrative is not reachable today (the only writer of `'archived'` is
`cancel_client_onboarding`), but **`onboarding` carries the live risk** — `create_opening_seed`
admits `status in ('active','onboarding')` (`0017:2902`), so such a client has an opening seed, a tie
document and a plan inside a firm-wide aggregate. **Fold (C-21, design §3.2/§3.3, cell B1.12):** the
predicate is pinned as every `clara.clients` row of the firm **at any status**, `covered_clients` is
validated the same way (an active-only validation would make the wall *unsatisfiable* rather than
fail-closed), and B1.12 forces an archived AND an onboarding fixture with a twin an active-only
derivation FAILS.

**M4 · The acceptance fixture names the wrong entity, and two acceptance items are unrunnable.**
*(accounting lens.)* `annexes:253` said *"On RPR (the synthetic sandbox firm)"*. **RPR is ROME
PROPERTIES SDN BHD**, a real BELCORT test *client* created by `create_client`
(`onboard-rpr.mjs:4-5,:54,:101,:202`; `rpr-coa.csv:3`), with no clients of its own; the synthetic
sandbox *firm* is **ROME PUBLIC ADVISORY `39008536`** (digest law 66, `README.md:381-382`; ADR-0045),
which has exactly one client (`f-a2-window-ab-ceremony-asrun.md:141-147`). So item 2's *"two RPR
clients"* is unbuildable under **either** reading, item 3 rides the same fixture, and item 1's
"exported to a firm member" presupposes RPR is a firm. The error was **inherited verbatim** from
`reporting-agency-annexes-2-record.md:179`, whose own `:207` proves RPR there means ROME PROPERTIES —
review law 3's shape, and the repo warns against this conflation by name
(`tax-computation-survey.md:87-89`). **Swept the whole set: the conflation appears exactly twice,
both in F.3** (`annexes:253`, `:256`); design and survey are clean.
**Fold (annexes F.3):** the fold **makes the choice visibly** rather than leaving it to PR-4. (a)
Minting a second ROME PUBLIC ADVISORY client is rejected — **ADR-0072 ⑤ ruled the sandbox firm NOT
re-created at the Wave-G reset** (`f-a2-window-ab-ceremony-asrun.md:151-153`), so the fixture has a
shelf life. (c) A TA-P14 (4) deferral is unnecessary. **(b) is TAKEN:** the walkthrough runs on
**BELCORT** over ROME PROPERTIES and ROME SECRETARY, with BEE CREATIVE SOLUTION making item 3's
`firm_closure` refusal real rather than arranged. The ground is restated correctly — hard constraint
13 and ADR-0075 §1 make them authorised test fixtures — **not** the "no client harm" gloss, which
was wrong about which entity it described. *Two verifier corrections folded:* the coverage wall is
already forced independently by B2.2-B2.5, so what failed was the real-books walkthrough TA-P14 A
demands, not the mechanism; and no bytes reach an outside party either way, since §7's non-goal keeps
delivery out of scope. **This is a fixture-identity defect, not a live-exfiltration risk.**

**M8 · §3.7 asserts a named refusal from three writers that no lane builds and one writer cannot
raise.** *(security lens.)* F-A5 scopes its wall precisely — *"the **receipt schema** refuses a
sandbox citation in any field typed as an authoritative basis … The wall lands **with the receipt
table** in PR-1"* (`reporting-agency-design.md:321-324`; survey X10 restates it unchanged). v1
broadened it to *"a posting's provenance, a `client_facts` row and a report cell each REFUSE"*. Two
of those have no owning PR (§7 puts the posting and claim paths out of scope), and the third
**cannot raise the token**: `record_client_fact` validates only a non-blank `p_basis`, a
`basis_kind` in four literals, and a document for the document kind (`0055:394-397`, `:499-501`,
`:532-545`) — so a `sandbox_view_id` typed into free-text `p_basis` under `owner_instruction`
**succeeds**, which the design's own residual at `:281-283` concedes. **B4.2's refuse arm was a green
that proved nothing and its twin was self-referential.** And **G-3** — the census meant to prove the
"nothing may cite it as basis" clause — appeared exactly once in the whole set (`design:286`), absent
from §4's census list and from Annex B: no home, no name list, no cell.
**Fold (C-24, design §3.7, Annex A.3, cells B4.1-B4.5):** the refusal is scoped back to **the receipt
schema**, whose cell **skips, named and counted, until F-A5 PR-1 merges** — asserted, not claimed.
**A real validation replaces the free-text one:** what walls the rest is the **absence of a typed
slot**, and **G-3 is now defined** — a closed-world catalog census asserting no FK and no uuid column
in the posting, reporting or knowledge layers is typed to reference `sandbox_views` or
`sandbox_exports`, **in both directions** (F5-D30), with a home (Annex H), a name list and a cell
(B4.5). B4.2 is retired. The free-text path becomes a **registered residual with a detective
control** — PR-4 publishes the count of `client_facts` rows whose `basis` contains a sandbox id,
expected zero, and **B4.3 proves the detector fires by planting one**, so the cell measures the
detector rather than pretending to be a wall. *A catalog census is a wall; a substring match on a
free-text column is not, and the fold says which is which.*

**M9 · An owner-pending policy call is presented under "the ruled shape (fixed, not designable)".**
*(law lens.)* §1's item 7 — *"the recipient register is a human act"* — sat under that heading as the
**only item with no ADR-0074 clause cite**, while §3.3 and Annex E Q2 disclose three sections later
that the question is open. TA-P1 C ruled the register OPEN, and the ratified text is explicit:
**"adding a reservation is an owner ruling"** (`0074:339`). The same wave built the closest analogue
the other way — `wake_add_bank_account` (`bank-agency-annexes-1-mechanics.md:53`) is an
agent-reachable wake verb behind a mechanical check. A builder reading §1 as what is not designable
would ship verbs #7/#8 as permanently agent-inaccessible (no wrapper, no core, no allowlist row),
which is a **structural** exclusion, not a default — and if the owner later devolves the
`firm_member` kind, that is a rebuild rather than a config flip.
**Fold (design §1, Annex E Q2):** item 7 is **moved out of the heading** into a named fold note that
says plainly it is a fail-closed default pending Q2, cites `0074:339` and the bank analogue, and
tells the builder not to read §3.3 as a reservation. **Q2 stays OPEN and unchanged** — the fold fixes
the heading, never the question. §3.3 additionally **prices** the devolution (one wake sibling verb
over the same ungranted core plus one allowlist row), so Q2 is a decision and not a rebuild.
*Verifier correction folded:* "the only two write verbs with no wake wrapper" was inexact —
`complete_sandbox_export`/`fail_sandbox_export` also lack one; the defensible fact is that #7/#8 are
the only writes with **no machine or agent path of any kind**.

**M10 · The coverage predicate is vacuously satisfied by an empty client set.** *(build lens.)*
§3.3's external predicate is `view.client_set ⊆ recipient.covered_clients`, and containment over the
empty set is **TRUE** — `ARRAY[]::uuid[] <@ anything` — which is arithmetic, not a Postgres quirk, so
every implementation inherits it. §3.2's refusal table named only "no basis rows at all"; the design's
own ground column even concedes the distinction (*"an unresolved set is the unknown, not the
empty"*), and §5's three-valued list has no fourth case. **So a `firm_closure` mint on a firm with
zero clients passes coverage for EVERY registered external recipient**, including one covering none
of the firm's clients — the ruled mechanical check never fires. Realistic in this estate: a firm
before its first client, or the window after a Wave-G/ADR-0075 factory reset before the fixtures
re-seed (hard constraint 13). No B2 cell instantiates it. **Fold (C-22, design §3.2/§3.3, cells
B1.13 and B2.7):** an empty derived set **refuses at the mint** (`sandbox_view_client_set_empty`) and
`_recipient_covers` **asserts non-empty before it compares anything**, in the estate's own explicit
zero-cardinality idiom (`0020:640-643` — a named branch ahead of the general comparison, never a
fall-through). Two doors, because a judgement function must never answer YES on an input it cannot
judge (review law 2), and B2.7 constructs the empty set directly so the second door is proven on its
own rather than through the first.

**M5 · Q4's brief argues only against the model-provider register. — NOT FOLDED. OWNER CARD 2, §6.**

## 4 · Nits — folded without argument

- **Q1's second key had no emitter.** Annex E Q1 hands the owner a **two-key** payload (stamp +
  footer line) and §3.6 consumed one, so the footer was unbuilt by construction. *(Raised material,
  **downgraded to nit** by the verifier: the stamp string is itself disclaiming and owner-signed, on
  every page, with the request refusing when the row is absent — the recipient does not receive "a
  clean statement of figures", and "the reader cannot see an 8% wash" is a perception assertion, not
  repo evidence, against a marking the estate already ships.)* **Folded, with the verifier's
  mechanical correction:** the stamp is what §3.6 emits, per page; a signed footer emits **once in
  flow** in the `layout.mjs:152` idiom — that box sits before the sections loop, so **B3.1's per-page
  assertion applies to the stamp alone**, and no cell is written that cannot pass.
- **`firm_id` was prose, not schema.** Two of the three relation sketches omitted it, while every
  firm-scoped relation in the estate carries it NOT NULL (`0079:102`, `0066:191`) — and the one
  counter-example this lane depends on is `freeform_read_log`'s nullable `firm_id` (`0002:310`), a
  hole a `firm_id = jwt_firm()` policy hides in both directions. **Folded:** named, NOT NULL, in all
  three sketches.
- **Section moves to keep every file under 500 lines** (the F-A6 fold's precedent): design §2's
  X1-X12 restatement retired in favour of the survey, and §3.5, §3.8, §3.9's brief, §4 and §6's
  dependency table moved to **Annexes I, J, G, H and K**. The design keeps the rule at each site and
  the annex keeps the enumeration; the annex map in the design's preamble is trued.

## 5 · Refuted register

**Five of the sixteen verified findings were REFUTED** and are recorded so nobody re-raises them.
**Their individual texts were not carried into the gate's result payload — only the count was**, so
this record states the count as the fact it is and does not reconstruct the five from memory
(review law 2: a derivation is not evidence). The eleventh confirmed finding was **re-graded
downward** rather than refuted, and is folded in §4 above. Two further verifier corrections that
narrowed a confirmed finding without refuting it are folded inline: M4's harm leg (§3) and M9's
"only two write verbs" cite (§3).

## 6 · Owner cards — NOT decided by the fold

**Card 1 — may a figure the model TYPED be exported in a durable, sha'd, externally-handed PDF?**
*(gate B1, blocker, upheld with two additional grounds the verifier found.)*

*The collision, in one line:* TA-P10 C′ (4) permits Clara to **export** a free-query aggregate, and
PRD §6 invariant 1 (LAW) requires that *"narration and charts take figures by **placeholder
substitution** from the evaluated artifact, never model-retyped"* (`PRD.md:156`).

*What v1 built:* `body jsonb` where **every figure is a `displayed_text` STRING**
(`design:81-82`), policed by exactly one guard — `sandbox_view_body_malformed`, *"a figure arrived as
a number rather than a `displayed_text` string"* (`annexes:53`). **A type assertion, not a
provenance one.** The model reads a free-query result of RM1,970,432, types "RM1,970,342", and the
PDF renders, hashes, gets an export record and reaches an external group owner. Nothing in the estate
can contradict it: `freeform_read_log` holds the query text and **no result** (`0002:308-315`), and
re-running ad-hoc SQL later reads a moved book. Q5 then compounds it — *"an export older than 24
months can be re-rendered from its frozen view"* reproduces the same wrong number byte-for-byte and
calls that reproducibility.

*Why the design's authority does not cover it:* E-R8 floor ①'s mechanism is the **ABSENCE OF A
TYPEABLE SLOT** — *"the layout AST has no numeric literal node … no user and no model can type a
number into a report in any layer"* (`wave-e-design-reporting-part2.md:341-344`; `0081:146-151`
extends it to *"and neither can the typesetter"*). The design kept the string SHAPE and **reintroduced
the typeable slot** as `p_body`. ADR-0074 expressly did not move the boundary: *"Not taken: C's
fourth element … would amend PRD §6.1"* (`0074:244-245`), and the owner's own briefing framed the
ruling as *inputs are the DB's, the aggregation is unversioned* — which permits exporting a
**DB-executed** aggregate whose formula is unversioned, and nowhere permits a numeral the model
transcribed. E-R4's round-3 binding interpretation is decisive on scope: *"'Authoritative' = every
product-presented or persisted quantitative or assurance claim. Transient UI is NOT an escape hatch"*
(`wave-e-contract.md:114-115`).

*A buildability check rides it, found by the verifier:* `chart.mjs` is `@frozen —
determinism-critical`, and `readSeries` (`:69-73`) requires every plotted point to carry exact-integer
`dimensions.exact_numerator`/`_denominator` or refuse `chart_point_unreadable`. A body whose only
rule is "every figure a string", policed by a guard that REFUSES a number, either cannot feed
`readSeries` at all — breaking G-1/C-12 and TA-P11 A's one-architecture test — or must carry
model-supplied exact rationals, i.e. a model-authored number through a second door.

*Why this is the owner's:* it is a **hard-constraint-1 collision** — accounting-correctness against
the ruling's own export permission — and constraint 1 sends those to the owner, never a unilateral
call. §3.1's `basis_ref` fold closes the *omitted-basis* channel and cannot close this one; **a
pointer cannot fix a transcription.**

*Recommendation:* **a substitution seam.** Figures are substituted at mint from a durable result row
the basis pins — which means the free-read lane gains a result-carrying row (a hash or the values),
moving this design's §6 dependency table. That reconciles the ruling and §6.1 instead of choosing
between them. *The alternative, priced:* export prose and DB-owned chart geometry only, with no
model-typed figure blocks at all — cheap, and narrower than the ruling reads.

*Fail-closed default the lane proceeds on:* **the `displayed_text` figure path is NOT built.**
Registered as **R-7** with its early warning.

**Card 2 — does an EXTERNAL export need a client-level authority?** *(gate M5, material.)*

*What Q4 says today:* *"recipient coverage is the whole gate; do not widen the purpose CHECK"*
(`annexes:208-213`) — argued **only** against `client_egress_purpose_consents`, the model-provider
register. That argument supports "not THIS register"; the recommendation asserts the strictly
stronger "no authority instrument is needed", and the gap is total: a grep of all three files for
`MIA|R114|confidential|disclos|authoriz|PDPA|invariant 16` returns **zero** hits outside the egress
rows.

*What the repo already holds, unnamed in the brief:* **PRD §6 invariant 16** (LAW) draws the very
distinction — *"a DPA regulates the processor but does not by itself confer the authority to disclose
client information outside the firm"* (`PRD.md:171`). And
`docs/ops/legal/client-ai-authorization-letter-template.md:26-32` quotes the governing rule: **MIA
By-Laws R114.2(a)** — *"shall not: (a) Disclose confidential information acquired in the course of
professional and business relationships"* — and **R114.3(b)**, disclosure permitted where *"**This is
authorized by the client** or any person with the authority to permit disclosure"*. **The letter the
firm actually holds is scoped shut against this case:** it is titled an authorization to disclose to
*an artificial-intelligence processor* and states *"we disclose it to no other third party under this
letter"* (`:119-120`, `:138-139`). So under R114.3(b) there is **currently no authority on file for
the act Q4 is closing** — and `covered_clients`'s only write-time validation is that the ids belong
to this firm (`design:162-163`), with a free-text `basis` an admin types. The mechanical check
answers *"did an admin type these ids"*, which is not *"did this client authorize disclosure to this
person"*.

*Two corrections the gate folded into the card, so it is not overstated:* (a) Q4 **does** name the
alternative in one clause (*"it is a new register, not a widened one"*) — the real defect is that it
is named but **not priced and not shaped**, uniquely among Annex E's six questions, each of the
others carrying its alternative's cost; (b) the By-Law says *"authorized by the client **or any
person with the authority to permit disclosure**"*, and the template's own reading notes that the
Nov-2024 text **does not say "specific"** — so a group holding-company officer may well be such a
person. **A hard per-client-row requirement is one option, not the compelled answer**, which makes
this a brief-completeness defect rather than proof the recommendation is wrong.

*Recommendation:* **keep the recommendation, fix the brief before the owner rules.** Q4 should cite
R114.2(a)/R114.3(b) and PRD.md:171, state that the existing letter covers processors only, and price
a new per-client authorization register the way Q3 prices its alternative. *Fail-closed default while
it is open:* Q4's own — recipient coverage is the gate, `client_egress_purpose_consents` untouched —
carried meanwhile by the admin+ human register and by §7's delivery non-goal (*"this lane produces a
file and a record; who sends it and how is out of scope"*).

**The fold did NOT edit Q4.** Rewriting an owner question's argument is the thing this card exists to
ask permission for; the card carries the missing instruments in hand, per the standing posture.

**Owner ruling 2026-08-23 (the sitting) — Card 1 (B1) and Card 2 (M5/Q4) are BOTH RULED.** Each
card's text above stands as written; these are the dispositions.

- **Card 1 → RULED: the SUBSTITUTION SEAM**, the recommendation as written — the model writes
  **placeholders**; the render substitutes DB-read values from the pinned basis row at mint time;
  **no model-typed numeral reaches the sealed bytes.** This reconciles TA-P10 C′ (4)'s export
  permission with PRD §6 invariant 1 without amending either. Design mechanism recorded:
  `sandbox-export-design.md` §3.6b. **The figure path unblocks** — the seam ships in place of v1's
  `displayed_text` type-assertion shape. R-7's early warning is discharged.
- **Card 2 → RULED: a FIRM-level disclosure authorization register**, alongside the already-ruled
  mechanical recipient-covers-every-`client_id` wall (§3.2/§3.3) — Q4's recommendation, adopted as
  written, with the brief's missing citations (R114.2(a)/R114.3(b), `PRD.md:171`) now on record
  above. **A per-client STRICT MODE stays a future OPTIONAL TIER** — the architecture keeps the
  seam for it (the recipient-coverage model is not narrowed to force it now). The external export
  path unblocks on the firm-level register landing in PR-1. Design mechanism recorded:
  `sandbox-export-design-part2.md` §7.

**Also SIGNED at the same sitting, discharging a separate lane obligation (not a gate card, but
recorded here for one source of truth): the `sandbox_watermark` trio (Q1/OQ-1/OQ-2)** — EN/BM/ZH
text verbatim in `sandbox-export-design.md` §3.6a. The lane's DARK condition (survey X12) lifts at
build once PR-1 seeds the three rows.

## 7 · What binds before PR-1

1. **The law-28 cross-model adversarial pass, against v2** (Annex G, eight arms). Outstanding —
   **NOT discharged by the 2026-08-23 rulings**, which settled accounting/architecture cards only.
2. ~~Owner card 1 ruled, or the figure path stays unbuilt.~~ **RULED 2026-08-23 — the substitution
   seam** (above). Discharged.
3. ~~Owner card 2 ruled, or Q4's brief re-cut and re-put, before the external path is walked.~~
   **RULED 2026-08-23 — the firm-level register** (above). Discharged.
4. **F-A5 PR-1 merged** — it owns both the `watermark_policy_versions` DDL and the receipt-schema
   wall B4.1 forces; until then B4.1 skips, named and counted.
5. **PR-1's rig replay** confirms every migration-source read in this set (survey U3).
