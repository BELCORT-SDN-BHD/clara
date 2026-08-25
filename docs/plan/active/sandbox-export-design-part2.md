# F-A5b sandbox export — design v2 (gate-folded 2026-08-23), part 2

> **Part 2 of `sandbox-export-design.md`** — one design in two files, split for the repo's
> 500-line per-file ceiling on 2026-08-23 (the same shape `sst-engine-design.md`/`-part2.md`
> already use in this directory). **Part 1 carries §1-§3.6** (the ruled shape, the estate
> findings, `p_view`, the client set, the recipient model, the verbs, the second render entrance
> and the watermark — now carrying the 2026-08-23 owner-sitting rulings); **this file carries
> §3.7-§7**, opening with the narrative-authority wall. **Section NUMBERS did not change** — every
> existing `§3.x`/`§4`/`§5`/`§6`/`§7` citation still resolves, only the file it resolves in did.
> Read part 1 first; nothing here restates its premises.

### 3.7 The narrative-authority wall at the export boundary

F-A5 PR-1 builds the wall (X10). This lane's contribution is that **exporting does not launder
authority** — and the fold cut v1's claim back to what is actually walled (gate M8):

- `sandbox_views.authority` is frozen `'narrative'`; the row carries **no `definition_version_id`
  and no `cell_id`** — there is no column for one, so the refusal is structural, not a check.
- **The refusal has ONE owner, and it is the RECEIPT SCHEMA.** F-A5 scopes it precisely — *"the
  **receipt schema** refuses a sandbox citation in any field typed as an authoritative basis
  (`sandbox_authority_refused`). The wall lands **with the receipt table** in PR-1"*
  (`reporting-agency-design.md:321-324`; survey X10 unchanged). v1 broadened this to three writers.
  Two of them no PR owns (§7 puts the posting and claim paths out of scope) and the third **cannot
  raise the token**: `record_client_fact` validates a non-blank `p_basis`, a `basis_kind` in four
  literals, and a document for the document kind — nothing else (`0055:394-397`, `:499-501`,
  `:532-545`). `p_basis` is free text, so a `sandbox_view_id` typed there under `owner_instruction`
  **succeeds**. The claim is cut back to the writer that can actually refuse.
- **What walls the rest is the ABSENCE OF A TYPED SLOT, and G-3 is the census that proves it.** No
  FK and no uuid column anywhere in the posting, reporting or knowledge layers is typed to hold a
  `sandbox_views.id` or a `sandbox_exports.id`. G-3 is a closed-world catalog census over those
  relations, **by name list in both directions** (F5-D30) — §4, enumerated in Annex C, cell B4.5.
  A catalog census is a wall; a substring match on a free-text column is not.
- **The free-text path is a REGISTERED RESIDUAL with a DETECTIVE control, never a claimed wall.**
  `client_facts.basis` is free text (`0055:394`) behind a humans-only door (`0055:667-668`) — the
  inherited F-A6 R-8 residual, unchanged. PR-4 publishes the count of rows whose `basis` contains a
  sandbox id, **expected zero**; B4.3 proves the detector fires by planting one.

### 3.8 The minimal human doors (TA-P14 (2))

Crude is fine; absent is not. `/reports` gains a **sandbox exports** panel — the list, the recipient
register form (admin+) and every refusal rendered as text a bookkeeper can act on, never a token;
**Annex J** enumerates it, the fold's new refusals included.

### 3.9 Law 28's cross-model adversarial pass — STILL OWED, and its brief

**Mandatory before PR-1 merges** (`gate-record:250-253`), **not discharged by the PR-0 gate or by
this fold, and not discharged by the 2026-08-23 owner rulings below either** — those settled the
two accounting/architecture owner cards, not the security-adversarial pass. The gate was a
five-lens design review; law 28's is a cross-model adversarial pass on the export surface, and it
runs against **v2** — §3.1, §3.2, §3.6 and §3.7 all moved here, so a pass against v1 would have
attacked a body nobody will build (`freeform-read-gate-record.md:14-17`). The brief now has
**eight** arms and moved to **Annex G**, because the fold gave two of them a mechanism to attack
rather than an absence to observe. Findings fold into v3; the pass runs on a lane independent of
the author's.

---

## 4 · Walls, censuses and gates that move

**Enumerated in Annex H** — C10 (closed, re-proven positively by G-2) · C6's name list · the wake
grant roster · the relation/table census (+3) · the RLS forced-relation census (+3) · **G-1** (the
TA-P11 watch made mechanical) · **G-3**, new at the fold: no FK and no uuid column in the posting,
reporting or knowledge layers is typed to reference `sandbox_views` or `sandbox_exports` (§3.7, cell
B4.5). Every count is read from the migration's printed line.

---

## 5 · Judgement logic (review law 1)

**§3.1** (whether a body block is attributable), **§3.2** (what the client set IS), **§3.3** (whether
a recipient covers it) and **§3.7** (whether a citation is authoritative) each decide *whether
something is allowed* — judgement logic end to end, each taking an independent review pass. §3.6's
presence check is judgement logic too, at **both** its doors: it decides whether a render may happen
at all, and whether a render already begun may emit. **Law 28's pass (Annex G) is separate,
additional and STILL OWED.**

Three-valued throughout, fail-closed on the missing, the malformed and the unknown: an unresolvable
client set refuses the mint; **a body block that cannot be tied to a basis row refuses the mint; a
basis element that does not resolve in the caller's firm refuses the mint; a client set that
resolves to the empty set refuses the mint and is refused again at the coverage check**; an absent,
superseded or inactive recipient refuses the request; an absent watermark row refuses the request;
**an unresolved or blank watermark string refuses the render.** **No rung's own evaluation may raise
out of the ladder.**

---

## 6 · The train, and what this lane waits on

**PR-0** (this design + **the law-28 pass, still owed**) → **PR-1** (DB: three relations, the verbs,
the coverage check, the derivation, the allowlist rows, the censuses, the `sandbox_watermark` rows
**— owner-ratified 2026-08-23, seeded at build; §3.6 carries the trio verbatim**) → **PR-2** (grants +
census) → **PR-3** (renderer: the second entrance, the byte-burn via the SUBSTITUTION SEAM §3.6
now specifies, the render-time watermark refusal, G-1/G-2 — **a ceremony**) → **PR-4** (human doors
+ acceptance).

**The dependency table moved to Annex K** at the fold. Six rows, unchanged in substance: F-A5 PR-1
(the `watermark_policy_versions` DDL, U1) · F-A5 PR-4 (ceremony contention) · F-A6 PR-1 (the
hardened `scope`/`client_scope`, U2) · **F-A6 v2** (the only source of an exact multi-client set) ·
F-A2 PR-1 (`interactive_client`) · **the owner's ratification — DISCHARGED 2026-08-23** (the trio
is owner-ratified; the lane's DARK condition lifts at build, §3.6).
**Owner card 1 was a seventh gating the figure path — RULED 2026-08-23, discharged below (§7).**

**No D1 write-quiesce window and no train claim.** This lane CoRs no live body: `layout.mjs` gains a
sibling entry rather than a rewrite, and every DB object is new. Whether PR-1 rides another item's
ceremony train is the lead's call, not this design's (the D29 precedent).

---

## 7 · Non-goals, stated so they are not inferred

**Not built here:** the sandbox's **on-screen** half (F-A5 / Wave-G — §3.1 states the seam) · any
change to the seal chain, `report_artifacts`, `render_jobs` or the claim path · SST-02 · a
client-facing portal or any delivery mechanism (this lane produces a file and a record; **who sends
it and how is out of scope**, and owner question 4 asks whether that stays true) · any widening of
`client_egress_purpose_consents` (X9) · e-filing, in any form.

**Not a narrowing of TA-P10 C′ — and, after the fold, not a claim of completeness either.** Built:
free export (§3.1, §3.5), the byte-burn (§3.6), the export record (§3.1), cross-client behind a
mechanical covered-recipient check (§3.1-§3.3), the owner-ratified three-language row whose absence
refuses (§3.6), narrative-only aggregates (§3.7). **The one place narrower than a naive reading is
§3.2's `firm_closure` rule** — the ruling's own coverage test applied to a log that cannot name its
clients, owner question 3. **Both OWNER CARDS are now RULED** (in full, with the recommendation
that was adopted, in `sandbox-export-gate-record.md` §6's 2026-08-23 addendum):

1. **Clause (4)'s EXPORT half — RULED 2026-08-23: the SUBSTITUTION SEAM.** Every figure in
   `p_body` is now a model-written **placeholder**; the render substitutes the DB-read value at
   mint time, from the durable result row the basis pins — recorded in full in §3.6. **No
   model-typed numeral reaches the sealed bytes**, which reconciles TA-P10 C′ (4)'s export
   permission with PRD §6 invariant 1's placeholder-substitution law, exactly the fold's
   recommendation. The `displayed_text` figure path, as v1 built it, is NOT what ships — the seam
   replaces it. **PR-1/PR-3 unblock.**
2. **Q4 — RULED 2026-08-23: a FIRM-level disclosure authorization register**, alongside the
   already-ruled mechanical recipient-covers-every-`client_id` wall (§3.2/§3.3). Under MIA By-Laws
   R114.3(b), the firm's disclosure authorization is the unit that satisfies "authorized by the
   client or any person with the authority to permit disclosure" for an external recipient covering
   the whole firm relationship — a **per-client strict mode stays a future OPTIONAL TIER**; the
   architecture (§3.2's recipient-coverage model) keeps the seam for it without building it now.
   The admin+ register and §7's delivery non-goal carry the boundary meanwhile, unchanged. **The
   external export path unblocks** on the firm-level register landing in PR-1.

   **PR-1 builds the enforcing wall for this dark condition, not the register itself (A9,
   fix-round 2026-08-25).** `_sandbox_export_request_core` resolves the target recipient's `kind`
   before the coverage check and refuses outright when `kind = 'external'`, typed
   `sandbox_export_external_unavailable` (errcode `CLR10`) — a firm_member recipient is
   unaffected and walks the ordinary coverage path. This is Codex law-28 finding #4 against the
   already-ruled disposition above, not new law: it makes the "unblocks on the register landing"
   sentence true by construction instead of by omission. The refusal lifts the moment the
   firm-level disclosure authorization register (TIER B, owner card, not built in this PR) lands
   and the request core is updated to check it instead of hard-refusing the recipient kind.
