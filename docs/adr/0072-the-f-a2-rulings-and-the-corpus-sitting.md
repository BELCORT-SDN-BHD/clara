### ADR-0072 — THE F-A2 RULINGS AND THE WAVE-G CORPUS SITTING: the old era is deleted, the agent's authority is re-confirmed at any amount, and the corpus splits into two tiers (2026-08-20)

**Five ruling blocks, minted in one in-session sitting on the night the F-A1 witness-pair
cutover went live. Blocks ① - ④ finish the F-A2 design's open authority questions; block ⑤
is the Wave-G corpus sitting `wave-g-e2e-corpus-design.md` was written for — the first time
any of its eleven OD points is ruled. Each ruling was briefed in plain language with its cost
stated in advance, per the ADR-0071 convention; every recommendation the build made and the
owner declined is recorded as declined rather than dropped. The mechanisms of record are
`docs/plan/active/f-a2-agentic-posting-design.md` (+ its three annexes) and
`docs/plan/active/wave-g-e2e-corpus-design.md`; this entry minutes the rulings and points at
them.**

---

#### ① F-A2 opener ⑥ — RATIFIED; and the "delete the old era" directive

**Opener ⑥ is RATIFIED for build.** `clara._coding_lane_core`'s four
`engine_kind='invoice_facts'` sub-selects are blind to the witness regime, so after the
`0097` cutover a corroborated witness document does not reach the coding lane at all. The
defect was proven behaviourally by rig replay against the live-shaped catalog — never by
reading migration text, because the live body is three `pg_get_functiondef` splices past
its last static `create or replace`. It joins openers ① (the three-locks nil-tax arm),
② (the type_code classification prompt) and ③④⑤ (the runtime riders) as a hard prerequisite
of F-A2's acceptance: at 0/33 corroboration the posting ladder posts nothing, which is safe
and indistinguishable from a broken build.

**THE DIRECTIVE — DELETE THE OLD ERA.** The owner ruled that the two architectures must not
be allowed to coexist by inertia. Four consequences, each with its own moment:

1. **The rules machine's EXECUTION TIER retires inside Wave F**, at F-A2's own retirement PR
   — not deferred to a later wave. ADR-0071/G1.4 ruled that it retires; this ruling fixes
   *when*. History rows stay as knowledge fuel; the verbs and the writes go.
2. **The full-64 re-extraction backfill is a RETIREMENT PRECONDITION.** It runs after the
   first F-A2 ceremony window, the legacy fallback arms die in the retirement PR, and until
   it completes **F-A10's terminal check cannot close**.
3. **Legacy DATA rows die at the Wave-G factory reset**, not before. Retiring a reader estate
   and deleting the rows it wrote are two different acts with two different blast radii, and
   only the second needs the reset.
4. **The Slice-0 spike's parked run and its schemas are DROPPED at that same reset, after a
   COLD ARCHIVE is taken first.** Hard constraint 15's spike clause therefore retires **at
   the reset, not now** — it stands unchanged in `AGENTS.md` until the reset ceremony amends
   it, and the archive is a precondition of the DROP, not a courtesy. Constraint 15's other
   half — the frozen prior build — is untouched by this ruling and does not expire here.

#### ② High-stakes on the agentic lane — RE-CONFIRMED: any amount, no thresholds

The owner was asked directly whether the agent should route high-stakes amounts to a human
checker, with the question re-opened deliberately now that a real corpus and real client
books stand behind it. **RULED: no.** Unattended posting is at **any amount**, with **no
hardcoded threshold and no per-firm amount dial** on the agentic lane. This re-confirms
ADR-0071/G1.2-G1.3 rather than extending it; the walls validate format and numbers, they do
not route by size.

*The build's contrary recommendation is on file as **dissent**, in the same terms it was
first filed: a fail-closed amount ceiling above which the agent drafts instead of posting,
on the grounds that a wrong classification at scale compounds silently. Heard, costed and
declined.*

**The HUMAN lane's high-stakes gate is untouched** — ADR-0003's distinct-approver gate and
ADR-0044's RM100,000 BELCORT threshold stand exactly as they are. Digest law 4's scoping by
ADR-0071 is re-confirmed, not widened.

#### ③ OQ-4 and OQ-6 — the last two authority questions in the F-A2 design

**OQ-4 — RULED: the three-exits shape.** A8 stands: the verb posts only entries the agent
drafted **and nobody has touched**. The **forbidden middle** is pass-through of a human's
numbers under agent identity with nobody's approval on record. The two lawful exits are
**(1)** the human posts it under human identity on the ordinary approve path, and **(2)** the
agent **re-derives** and posts her own conclusion under agent identity, treating the human's
edit as lawful context input (digest law 73) rather than as an instruction, with a rationale
citing the suggestion she weighed.

**OQ-6 — RULED: option A, the category gate is NOT inherited ON THE AGENT LANE.**
`is_year_end` and `tax_affecting` entries post unattended, on the ground that both carry
**mandatory downstream human checkpoints** — year-end meets close keys ②③, tax-affecting
meets the human-reviews-and-e-files-always rule — unlike the amount case, which has none.
Gating the gated-later while freeing the never-gated would be backwards. The residue is
accepted knowingly: a wrong entry in either category is caught downstream, which makes the
correction a reversal rather than a click.

**SUPPLEMENTARY RULING — the HUMAN lane's distinct-checker gate on those same categories
STANDS, unchanged.** The two lanes are treated differently on purpose, on three asymmetries:
a second party is automatic on the agent lane and manufactured on the human one; the human
gate's threat model is segregation of duties, which does not reach an agent whose every post
carries a DB-observed verdict, a rung vector and a model stamp; and the gate's cost is one
click inside an already-attended flow versus a broken unattended one. **Registered, not
built:** this is ultimately a per-firm governance dial on the close-keys authorization-list
precedent, and it may become configurable later. F-A2 builds no such switch.

**The mechanism of record is the F-A2 design — §3.3.3 for OQ-4's exits and their
double-coding-wall constraint, §4 and Annex G's F33 for OQ-6 and this supplementary.** This
entry does not restate them. OQ-2, OQ-3 and OQ-5 remain OPEN with the design's
recommendations standing.

#### ④ R1 — RULED by conditional delegation; the conditions were verified

R1 is the question `0016`'s authors assumed an answer to: **does the close's P&L→retained-
earnings roll count as a "closing transfer" for the SST turnover exclusion?** The owner
delegated the ruling **conditionally**, and the conditions were verified before it was
taken: **RULED — yes. A closing transfer is not turnover.** The year-end roll is period
machinery, not a business transaction, so it is excluded from the rolling-12 turnover the
SST registration watch reads — which is what `0016`'s exclusion was written to do and what
the `closing_transfer=false` birth defect makes impossible today.

Consequences, exactly: **Fix A proceeds** — mark closing entries **and** the B3 reopen
mirrors at birth, **both writer bodies in ONE migration** (a single-body fix inverts the
defect into compounding inflation). **Fix B is structurally blocked** by the evaluator
freeze and would leave a lie in the data. The fix lands in **Track B's fix queue**, and
**task #17 is unblocked** — its own "builds after the sitting's R1 ruling" gate is
discharged by this entry. R1a (the mirror inherits the marker) and R1b (a
`clara_authenticated`-only DEFINER stamp does not breach the human-lane-marker pin) ride as
sub-confirmations, asserted fail-closed at apply.

#### ⑤ The Wave-G corpus sitting — the first rulings on OD-1..OD-11

**THE RESHAPE: the corpus is TWO TIERS, not one.** The design assumed a single tier of
three-to-four clients each carrying two consecutive complete FYs at ROME PROPERTIES rigor.
The papers do not support that, and the sitting ruled the shape rather than the wish:

- **The ORACLE tier** — clients whose books must tie, to the sen, against the owner's own
  documents. It is the acceptance bar.
- **The REALITY tier** — **open intake**. Real client papers that exercise the product
  without carrying an acceptance figure. A slot may prove a mechanism without being an
  oracle, and saying so out loud is what stops a thin oracle being manufactured out of a
  rich fixture.

**OD-1 — RULED.** The oracle tier is **BEE CREATIVE SOLUTION (two consecutive FYs)** plus
**ROME SECRETARY** and **ROME PROPERTIES**, both as **single terminal periods**. RS and RPR
are terminal-period sets of books — both companies are in strike-off, both bank accounts run
to nil on the face of their own ledgers — so neither can ever supply a second consecutive
FY, and requiring one of them would be requiring a period that will not exist. The reality
tier stays open-intake. All inductions are under BELCORT, as the design's reading took.

**OD-4 — RULED: FULL PERMISSION** for the real client papers, with two carve-outs that are
part of the ruling, not conditions on it: the **IC copy is EXCLUDED from ingestion entirely**
(a pure identity document with no accounting content — excluding it costs nothing and removes
the single highest-sensitivity item), and the **payroll tree is the tightest-custody slot**,
exactly as the design anticipated. Vendor tracing stays OFF for the whole run — the C6
checklist is still open owner/legal work and PRD §6.16 keeps the flag closed until it is
evidenced.

**OD-5 — RULED: NO second principal is provisioned.** The **solo-attestation arm is the
product path** for a one-approver firm, so exercising it on real books is the honest test,
not a workaround. The consequence is accepted and recorded rather than hidden: B3's
**`distinct_checker` primary arm stays rig-proven only** and **ships UNEXERCISED on real
books**, named as such in the acceptance record under the corpus's own vacuous-green rule.

**OD-6 and OD-10 — RULED TOGETHER: a WHOLE CLEAN product database, on the LIVE project.**
The factory reset is not a scoped deletion with a survivor list; it is a **new unboxed
product**. Nothing in the design's OD-6 survivor list is preserved — not ROME SECRETARY's
book, not ROME PROPERTIES' approved entries, not BEE's existing keyed opening seed, **and
not the synthetic sandbox firm or the slice-era fixtures, which are NOT re-created after the
reset**. The one carve-out is constraint 15's: **the spike schemas survive the reset until
their own DROP under ruling ①**, after their cold archive. Running on the live project is
what makes the reset an actual discharge of the stuck-bytes claim rather than a rehearsal of
one; the irreversibility was priced, not assumed away.

**A consequence worth naming, because it dissolves a live trap:** ROME PUBLIC ADVISORY is a
**real entity in the client papers** — it certified one FY of BEE's accounts and is a
supplier in both other clients' books. With the synthetic sandbox not re-created, the name
**returns to the real entity**, and the "spelling is not identity" collision sitting on hard
constraint 13 dissolves rather than needing a rule to police it.

**OD-7 — DISCHARGED by ruling ④.** The `closing_transfer` fix is ruled and queued, so the
question of whether it gates an SST slot no longer has a pending half.

**OD-11 — RULED: the Wave-G UX floor comes FIRST.** Real session auth, signin and firm setup
— the frontend build — **precede the corpus run**. A run ahead of that floor would prove the
DB and the workflow layer while never exercising the thing the owner and staff actually use,
and a defect in the floor itself could not surface. The corpus run is a whole-product run or
it is not the run.

**OD-2, OD-8 and OD-9 — DEFAULTED to the design's own recommendations**, without a separate
sitting: no goods-trading slot in the first pass; an FYE change is kept as free coverage if a
candidate has one and recorded unexercised if none does; **en** for every pack, **zh** on at
least one slot, **ms** attempted exactly once as the deliberate negative control that must
REFUSE. **The owner may re-open any of the three** — a default is a decision taken cheaply,
not a decision foreclosed.

---

#### What this entry supersedes

- **`wave-g-e2e-corpus-design.md`'s single-tier premise and its two-consecutive-FYs-per-slot
  requirement** — superseded by ⑤'s two-tier reshape; the file is amended in place and stops
  being "a design awaiting a sitting" for the ruled points only. Its unruled content stands.
- **OD-6's survivor list** — superseded whole by the clean-database ruling.
- **OD-5's recommendation to provision a second eligible principal** — declined.
- **`roadmap.md` Phase-5 item 6's "a real gate"** — already superseded by ADR-0071/G7 (the
  eval harness is DECLINED); the contradiction is corrected in the file with this entry.
- **The corpus run script's step-4 "standing rules earn autopost after the third approval"** —
  superseded by ADR-0071/G1 and F-A2's agent judgement; corrected in the file with this entry.
- **Hard constraint 15's spike clause** — superseded **prospectively**, at the reset, per ①.4.
  It is NOT lifted by this entry.

#### What stands (named, so silence is not read as supersession)

PRD §6.1 in full · invariants (a)(b)(c) · the human lane's maker/checker, its distinct-checker
gate and ADR-0044's RM100,000 threshold (②, ③'s supplementary) · close keys ②③ and B3's
segregation wall · CLR19's closed-period wall · hard constraint 12 (ROME SECRETARY's customers
stay NAME-ONLY — the corpus run may not enrich one, and its structural wall is untouched) ·
hard constraint 13's four-firms law, whose sandbox row is *emptied* by ⑤, never repurposed ·
hard constraint 15's frozen-prior-build half · ADR-0060's DATA-scoped authority and its beta
expiry · the ADR-061 uniform ladder and the ADR-0069 docs-only lane.

#### Not reached (honest boundary — open for their own sittings)

The oracle tier's **named gaps are not closed by this entry** and the acceptance run cannot
start without them: BEE has no general ledger and no trial balance for either FY and its
FY2025 statements are extracts from a larger document; RPR is missing two months of bank
statements and has no accounts at a period end; neither RS nor RPR names a producer or
certifier, which is the gap evidence law 3 makes load-bearing. **OD-3's acceptance-bar
figures for every slot but BEE** likewise arrive with the handover, never from the build.

**Which schemas the ①.4 DROP reaches is a build-time enumeration the reset ceremony must make
explicit.** The durable runtime's own state is operational, not spike residue, and the two
must not be conflated because they were once named together.

**Still open, unmoved by tonight:** F-A2's OQ-2 / OQ-3 / OQ-5 · the CI economics overhaul ·
FX-lite build timing · the C6 checklist and the OpenAI processor bundle · PITR · PRD §9.

#### Consequences

`docs/plan/active/wave-g-e2e-corpus-design.md` is amended in place with ⑤'s rulings, the
oracle verdicts and their named gaps, the strike-off/terminal-period test class, the USD
fixture set and the corpus exclusions. `docs/plan/active/roadmap.md`'s Phase-5 item 6 is
corrected to match ADR-0071/G7. The F-A2 design set enters `docs/plan/active/` as the
mechanism of record for ①-③. `PROGRESS.md` carries the state. The digest is re-trued against
this entry: **no standing law changes** — ②, ③ and ⑤ re-confirm ADR-0071's scoping rather
than amending it.
