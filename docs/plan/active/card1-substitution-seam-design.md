# Card 1 — the substitution seam: DESIGN (stages (a)+(b))

> **v3 — the final design fold before build, 2026-08-26.** v2 folded 8 blockers + 12 material
> findings (BL-1..BL-8, M1..M12). **v3 folds the complete gate report**: CD-14 is APPROVED;
> M8 is restated with both groupings named (seven textual call sites, five kind-groups), no
> single number picked, per the coordinator's own ruling; all 7 remaining nits (N1, N3-N5,
> N7-N9 — N2/N6 already folded at v2) and all 9 battery gaps, relayed with content this round
> and folded in full. Fold-confirmation tables for both rounds are in this branch's commit
> history.
>
> **Implements the 2026-08-23 owner sitting's card-1 ruling**, recorded at
> `sandbox-export-design.md` §3.6b/§7 item 1: *"the model writes placeholders into `p_body`,
> never a typed numeral; the renderer substitutes each placeholder with the DB-read value...
> No model-typed numeral reaches the sealed bytes."* This doc is the mechanism the ruling names
> but does not build — **both stages, this backend session, before frontend integration** (the
> owner's own scoping). Where this file and the estate survey disagree, **the live catalog is
> right and this file is the bug**; every claim below that is not a direct code read is marked
> as this doc's own design choice, not a survey finding.
>
> **Companions.** `docs/plan/research/card1-substitution-seam-survey.md` +
> `-part2.md` — the estate at the bytes, findings **S1-S48**, the closed-world move list, and
> the open design questions **D1-D5** this file resolves. `card1-substitution-seam-annexes.md`
> — **A** the surface · **B** the battery · **C** decisions · **D** predictions · **E** risks ·
> **F** acceptance. **Split at the repo's 500-line convention, THREE files as of v2** (the fold
> grew §3 past the two-file budget): this file carries §1-§2;
> `card1-substitution-seam-design-part2.md` carries §3 (stage (b), now the largest single
> section — the `cell` primitive, M6/M7/M8, and BL-1..BL-4's evaluator-versioning corrections);
> `card1-substitution-seam-design-part3.md` carries §4-§7 (walls, the refusal-token table,
> extension points/non-goals, the migration + runtime + census move list). Section numbers are
> continuous across all three.
>
> **Binds under** everything `sandbox-export-design.md` binds under (its front matter, §1's
> ruled shape, §3.1-§3.7's walls — this seam is built INSIDE that lane, not beside it), plus
> **hard constraint 2** (the DB owns every authoritative number — this is the mechanism that
> makes constraint 2 true for narrative exports) and **hard constraint 9**'s spirit, extended
> here to the evaluator-freeze machinery: §3.2 spells out why the DB-side freeze census, not
> merely the repo-side lint, is what makes "edit the v1 evaluator in place" mechanically
> impossible, not just discouraged. **§2 and §3 are judgement logic end to end** (review law 1)
> — every guard named here takes an independent review pass before merge.
>
> **Grounding — restated precisely (M1).** Read from `main` at this worktree's checkout,
> **except for everything F-A5b PR-1 itself touches, minted, or supersedes** — every such fact
> is read from `origin/f-a5b/pr-1` at tip `ee76f70` (F-A5b PR-1, not yet merged), never from
> `main`, because `main` does not yet carry PR-1's own additions and a `main`-only read would
> silently under-report what already exists on that tip (M1's own headline correction: the
> survey's S13 claim that the estate "carries ZERO entries for F-A5b/sandbox" is **true of
> `main` and FALSE of `origin/f-a5b/pr-1`**, which already carries its own
> `F_A5B_PR1_COHORT`/`SANDBOX_EXPORT_F_A5B_PR1_CLOCK_NAMES` rosters — §7 corrects every
> downstream claim that inherited the `main`-only reading uncritically). `0077.sql`/`0059.sql`/
> `0058.sql`/`0060.sql`/`0079.sql`/`0081.sql`/`layout.mjs`/`leader.mjs`/`reconciler-render.mjs`
> citations are read from `main` directly, since none of them is F-A5b PR-1's own object.

---

## §1 · What, why, and the honest B-mapping

**What.** Card 1 is the substitution seam: the mechanism by which a narrative sandbox export
(F-A5b's `sandbox_views`/`sandbox_exports`, `0132.sql`) can carry a FIGURE — not just prose —
without a model ever typing that figure into `displayed_text`. Two stages, both in this
session's scope:

- **Stage (a).** A placeholder block cites a PRE-COMPUTED, already-minted `metric_cells` row
  by its pinned `id`. The renderer substitutes the cell's own `displayed_text` at render time,
  read through the exact same fail-closed accessor (`need()`, `layout.mjs:81-88`) every other
  DB-sourced string in the renderer already goes through. No new evaluation happens; the value
  already exists and is immutable (S15-S18).
- **Stage (b).** A model PROPOSES a deterministic expression — an AST, not free text — over
  values that are themselves already-minted `metric_cells` rows. A DEFINER core validates and
  evaluates the expression, exactly the shape `_eta_compose_metric_preview_core` already ships
  for metric-AST previews (S19, S35), and the RESULT becomes a new, ordinary, immutable
  `metric_cells` row — citable by a stage-(a) placeholder like any other cell. Stage (b) is not
  a second substitution mechanism; **it is a second WAY TO MINT the thing stage (a) cites.**
  **Stated once here, precisely, and not relitigated below (BL-5): the (a)/(b) asymmetry —**
  **a stage-(a) `placeholder` block MAY cite any `cell_status='ok'` preview cell, definition-**
  **backed or not; a stage-(b) `cell` AST NODE may cite only a definition-backed one.** §3.1
  carries the mechanism and the reason.

**Why.** TA-P10 C′ (4) permits exporting a free-query aggregate as narrative content; PRD §6
invariant 1 forbids a model-retyped numeral from reaching a durable artifact. Before this
ruling those two clauses collided the moment a chart or a sentence needed to show a number
(`sandbox-export-gate-record.md`'s owner card 1). The substitution seam reconciles them by
making the placeholder a POINTER the DB resolves, never a value the model states — the same
discipline `metric_ref` already enforces for the sealed lane (S8), extended to the sandbox
lane.

**The honest B-mapping — stated plainly, because a design that leaves this implicit invites a
builder to reach for the wrong primitive.** The owner's ruling for stage (b) was **"restricted
read-only over raw books"** — the model may propose a formula, but the formula's INPUTS must
be raw books, not another model's say-so. Mechanically, this design honors that choice via the
estate's existing **deterministic raw-data vocabulary**: the eleven AST primitives
`_validate_metric_node_v1` already admits (S31) — `measure`, `constant`, `days_in_period`,
`count`, `lag`, `average`, `sum`, `divide`, `subtract`, `multiply`, `percent_change` — resolve
exclusively against pre-materialized, immutable **snapshot** tables
(`metric_input_snapshot_*`), versioned **account sets**, and versioned **constants** (S33):
every leaf is a raw-books read, never a live table scan, never a caller-assembled column
reference. Stage (b)'s new twelfth primitive, `cell` (§3.1), extends this same closed
vocabulary by ONE more leaf kind — a reference to an already-minted `metric_cells` row, itself
the immutable output of a prior raw-books evaluation. **"Restricted read-only over raw books"
is satisfied because every leaf in the closed AST — including the new one — bottoms out in a
snapshot-bound fact or a previously-evaluated, definition-backed cell, never in caller-supplied
SQL text, never in a live-books scan the model could shape, and never (BL-5) in another
composition's own un-reviewed output.** This is a mapping onto the estate's own vocabulary, not
a literal rebuild of "raw books" as a phrase — the design states it as such rather than leaving
it to be inferred.

**What this design does NOT build, named here so it is not silently assumed to be in scope
later.** Arbitrary SQL text — or any caller-composed expression outside the closed AST
grammar — as formula input has **no path into this design** and **no precedent anywhere in the
estate** (S38's headline finding: no `EXECUTE format(...)`-style DEFINER dynamic-SQL evaluator
guarded by a strict input allowlist exists for a general computation). This is registered here
as a **NAMED EXTENSION POINT** (§6), with its own refusal token
(`expression_forbidden_syntax`, §5) reserved for it, so that a future build reaching for
"just let the model write SQL" finds a wall and a name, not a silent gap it has to rediscover.

---

## §2 · Stage (a) mechanism — placeholder blocks citing pre-computed cells

### 2.1 The block kind

A new top-level `body` block kind, `kind='placeholder'`, admitted beside the existing
`kind='text'` (S24). **Not** placeholder syntax embedded inside `text`'s `displayed_text`
string — the survey's own reasoning (S29) is adopted verbatim: the validator's shape is
already a closed switch on `block.kind`, the estate's house style rejects string-interpolation
grammars in favour of typed AST nodes everywhere else (`layout.mjs:1-11`), and an embedded
grammar would need its own mini-parser twice (mint-time and render-time), doubling the
injection surface X11 already worries about. A typed block reuses the SAME validated-JSON-shape
discipline every other block/basis element already gets.

**N1 — wording precision.** 0132's own block-kind check today (`0132.sql:632-635`) is a
single, plain `if v_kind is distinct from 'text' then raise ...` — an `if`, not an `elsif`,
since there is only ONE kind to check (the survey's own S24 prose says "elsif" beside this same
quoted `if`; a small wording slip left as-is per the survey's verbatim status). §2.2's widened
version is a genuine three-armed `if`/`elsif`/`else` chain.

**Shape**, closed:

```json
{ "kind": "placeholder", "basis_ref": "<label naming a basis element>" }
```

No `displayed_text` field — a placeholder block carries no fallback string of its own (§2.5
explains why a `na_label`-shaped fallback is deliberately NOT mirrored here). **The closed-key
rule below (item 5) is a NEW, `placeholder`-only behaviour (M4) — `text` blocks are NOT
retroactively tightened to a closed key set.** 0132's own `text`-block validation
(`0132.sql:626-655`, re-read for this fold) checks `kind`, `displayed_text` non-blank, and
`basis_ref` presence, and does **not** reject a `text` block carrying an extra, unrecognised
key — that is 0132's own shipped behaviour, unedited by this design, and this design does not
silently narrow it. Only `placeholder` — a brand-new kind with no existing callers to break —
gets a closed-key check.

### 2.2 Validation — the widened `_sandbox_client_set`

`clara._sandbox_client_set` (`0132.sql:549-733`) is `create or replace`d in a **new**
migration on top of 0132 — this is a plain ungranted core, not `evaluate_*`-named and not a
member of any frozen evaluator closure, so it carries no freeze obligation (S23's scope note).
The widening, inside the existing block-validation loop (`0132.sql:626-655`), **restated as
explicit branched pseudocode per M3/M4/M5 (the fold's own instruction — the prose in v1 of
this design left the branching implicit, which the gate correctly read as a risk of silently
tightening the wrong arm):**

```
for v_block in select * from jsonb_array_elements(v_blocks) loop
  v_kind := v_block ->> 'kind';

  if v_kind = 'text' then
    -- UNCHANGED from 0132.sql:636-639 (M3: the non-blank displayed_text check stays HERE,
    -- in the text arm, and nowhere else — it must never run against a placeholder block,
    -- which carries no displayed_text field at all).
    v_has_free_text := true;
    if nullif(btrim(coalesce(v_block ->> 'displayed_text', '')), '') is null then
      raise exception '...' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_body_malformed","class":"displayed_text"}';
    end if;

  elsif v_kind = 'placeholder' then
    -- NEW arm. (M4) Closed key set -- placeholder-only, per item 5 below.
    if exists (select 1 from jsonb_object_keys(v_block) k where k <> all(array['kind','basis_ref'])) then
      raise exception '...' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_body_malformed","class":"placeholder_unknown_key"}';
    end if;
    -- v_has_free_text is DELIBERATELY NOT set here (S30, item 4 below).

  else
    raise exception '...' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','sandbox_view_body_malformed','class','block_kind_unsupported','kind',v_kind)::text;
  end if;

  -- basis_ref presence/label-membership check: UNCHANGED, kind-agnostic (0132.sql:641-655),
  -- runs for BOTH arms identically.
  v_ref := v_block ->> 'basis_ref';
  if nullif(btrim(coalesce(v_ref, '')), '') is null then
    raise exception '...' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_block_basis_absent"}';
  end if;
  v_found := (v_ref = any(v_labels));
  if not v_found then
    raise exception '...' using errcode = 'CLR11',
      detail = jsonb_build_object('reason','sandbox_view_block_basis_unknown','basis_ref',v_ref)::text;
  end if;

  -- (M5) THE NEW ELEMENT LOOKUP, placeholder-only, kind/status checks. Runs AFTER the
  -- basis_ref/label check above, using the SAME per-label lookup shape 0132's own exact-
  -- derivation loop already uses (0132.sql:660-664: walk p_basis, `exit when label = v_ref`)
  -- -- not a new lookup idiom, the estate's own one, reused:
  if v_kind = 'placeholder' then
    v_basis_elem := null;
    for v_basis_elem in select * from jsonb_array_elements(p_basis) loop
      exit when v_basis_elem ->> 'label' = v_ref;
    end loop;
    if (v_basis_elem ->> 'kind') is distinct from 'preview_cell' then
      raise exception '...' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_placeholder_basis_not_cell','basis_ref',v_ref)::text;
    end if;
    -- cell_status check ONLY -- see the correction note just below this listing: a
    -- placeholder's OWN citation is governed by cell_status alone, never by whether the cell
    -- is definition-backed (that stricter predicate belongs to SS3.1's cell-AST-node
    -- validation, not to this function).
    select cell_status into v_cell_status
      from clara.metric_cells where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
    if v_cell_status is distinct from 'ok' then
      raise exception '...' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_placeholder_cell_not_ok','basis_ref',v_ref)::text;
    end if;
  end if;

  if not (v_ref = any(v_used_labels)) then
    v_used_labels := v_used_labels || v_ref;
  end if;
end loop;
```

**Correction, stated so it is not silently re-asserted (BL-5 reconciliation).** An earlier draft
of this pseudocode also raised `metric_cell_reference_not_definition_backed` inside the
`placeholder` arm shown above — **that is wrong and is struck**: a placeholder's OWN citation
check uses `cell_status='ok'` alone (§1's asymmetry sentence: placeholder MAY cite a preview
cell). BL-5's definition-backed requirement is raised **only** by
`_validate_metric_node_v2`/`_metric_eval_node_v2` (§3.1), for a `cell` AST NODE inside a
stage-(b) formula — a wholly different function, running at compose-time, never at a
placeholder's mint-time. The listing above already reflects the corrected, single-check shape;
this note exists because the fold's own instruction set surfaced the ambiguity and a builder
must not reintroduce it.

1. **`v_kind` admits `'placeholder'`** alongside `'text'`, each with its own branch (above).
2. **A `placeholder` block's `basis_ref` must resolve to a basis element whose OWN `kind` is
   `'preview_cell'`** — never `'freeform_read'`. A `freeform_read` basis has no single numeric
   value to substitute (the closed-world list's item 2); citing one from a placeholder raises
   `sandbox_placeholder_basis_not_cell` (§5), at the point shown above.
3. **The referenced cell's `cell_status` must be `'ok'`** (D3) — `sandbox_placeholder_cell_not_ok`
   on failure (CLR10 family; §5), **the ONLY check `_sandbox_client_set` itself performs** on a
   placeholder's cited cell (the definition-backed check is §3.1's, not this function's). This
   is the mint-time half of D3's two-door posture — the render-time half is §2.5.
4. **A `placeholder` block does NOT set `v_has_free_text`** (S30). This is the deliberate,
   non-side-effect code change the migration's own header predicted (`0132.sql:542-548`,
   quoted in the survey at S30): "a future placeholder block once the substitution seam
   lands... reversible the day a non-free-text block kind exists." A body made ENTIRELY of
   `placeholder` blocks (plus zero `text` blocks) derives the **exact** client set — S27's
   existing per-basis-kind derivation already does the right thing for a `preview_cell` label
   with zero new logic, because that derivation keys off the BASIS element's `kind`, never the
   block's `kind`. A MIXED body (any `text` block present) still widens to `firm_closure`,
   because a `text` block is still free text — this is not an oversight to fix later; it is
   the exact boundary S30 draws.
5. **(M4) The closed key set on a `placeholder` block (`{kind, basis_ref}`, no other key) is
   NEW behaviour, scoped to `placeholder` blocks only** — restated because item 1 of §2.1 above
   already said this in prose; here it is the actual guard, shown in code.
6. **`sandbox_view_body_malformed`'s figure-shaped-as-a-number reason** (already named as a
   re-cut target in `sandbox-export-design.md:411-413`, "from a TYPE assertion to a
   PROVENANCE assertion") is realized here: a `placeholder` block IS that provenance
   assertion — there is no code path left by which a numeral typed by the model can be
   admitted as a block's content, because a `placeholder` block carries no numeral-shaped
   field at all (2.1).

### 2.3 Derivation — zero new logic, confirmed

S27's existing per-basis-kind exact derivation (`0132.sql:667-672`) already resolves a
`preview_cell` label to `select client_id into v_preview_client from clara.metric_cells where
id = ... and firm_id = p_firm` — this is unconditional on the CITING block's kind. A
`placeholder` block citing a `preview_cell` basis element folds into the exact client set
through this SAME code path. **Nothing in §2.2 touches this derivation loop** — only the
`v_has_free_text` flag (2.2 item 4) and the block-kind admission (2.2 item 1) change.

**N8 — the stage-(a) cross-client case, stated explicitly (the mirror of §3.1's stage-(b)
single-client statement).** Because this loop runs once PER USED LABEL and appends EACH
resolved `client_id` independently (`v_client_set := v_client_set || v_preview_client`,
`0132.sql:671`), **a placeholder-only view CAN genuinely be cross-client**: two `placeholder`
blocks citing two `preview_cell` basis elements belonging to two DIFFERENT clients derive an
exact set of `{clientA, clientB}`, not a refusal — a chart or narrative comparing two clients'
minted figures is a first-class, buildable shape under stage (a), gated only by §3.3's
recipient-coverage check at export time (`sandbox-export-design.md` §3.3), exactly as any other
cross-client narrative view already is. This is the DELIBERATE mirror-image of stage (b)'s own
posture (§3.1): a SINGLE `cell` AST node inside ONE formula is bound to ONE `p_client`
(structurally unreachable across clients, §3.1's own statement), but MULTIPLE independent
`placeholder` blocks inside ONE view are not so bound — the constraint lives in the EVALUATOR's
signature, not in the MINT's basis-derivation loop, and the two doors are not the same door.

### 2.4 Payload — pre-join by pinned `cell_id`, filtered to CITED labels only (M11)

`clara.sandbox_export_payload` (`0132.sql:946-964`) widens, in the same new migration, to
carry resolved cell values pre-joined by the EXACT `cell_id`s recorded in the minted
`sandbox_views.basis` array, **restricted to the labels a `placeholder` block actually cites**
— mirroring the exact pattern by which 0132 itself widened this same function to carry the
pinned `watermark_policy_version_id`'s resolved text (`0132.sql:940-945`'s own comment, quoted
in S42: *"the worker payload previously handed back only the pinned... UUID — PR-3's renderer
has no other door to the pinned TEXT... `clara_runtime` holds no table grant on
`watermark_policy_versions`... One join, resolved by the row's OWN frozen id"*). The same
reasoning applies unit-for-unit to `metric_cells`: `clara_runtime` holds **no table grant** on
`clara.metric_cells` anywhere in 0058-0061's grants (S42), and `clara.get_context_pack`
explicitly forbids returning cell payload fields (S42's additional finding) — so a widened
`sandbox_export_payload` is the **only lawful path** for the worker to obtain a cell's value.

**M11 — DECISION, ruled: the payload emits an entry ONLY for labels a `placeholder` block
actually references, matching Annex B's B2.3 shape.** v1 of this design's SQL joined over
EVERY `preview_cell`-kind basis element, including one cited only by a `text` block for
provenance (never substituted) — an over-broad join that (a) contradicted the battery cell this
same design already specified (B2.3) and (b) fed BL-8's renderer-side malformed-shape check a
payload entry the renderer would never actually reach through a `placeholder` node, which is
dead-weight surface for no benefit. The corrected widening:

```sql
'cells', (
  select coalesce(jsonb_object_agg(b.label, jsonb_build_object(
           'cell_id', b.id, 'cell_status', mc.cell_status, 'displayed_text', mc.displayed_text
         )), '{}'::jsonb)
    from jsonb_to_recordset(v.basis) as b(label text, kind text, id uuid)
    join clara.metric_cells mc on mc.id = b.id and mc.firm_id = e.firm_id
   where b.kind = 'preview_cell'
     -- M11: restrict to labels a placeholder block ACTUALLY cites (v.body's own blocks),
     -- never every preview_cell basis element the view happens to carry.
     and b.label in (
       select blk ->> 'basis_ref' from jsonb_array_elements(v.body -> 'blocks') blk
        where blk ->> 'kind' = 'placeholder'
     )
)
```

**This is the single load-bearing implementation rule (S46) restated as code**: the join key is
the EXACT `id` recorded in the MINTED `sandbox_views.basis` array — never a "latest cell for
this definition" re-lookup, never a re-run of any part of `_sandbox_client_set`'s derivation.
Because a `metric_cells` row is permanently immutable (S15) and the `basis` array is frozen at
mint (append-only, `0132.sql:277-280`), this join reproduces byte-identically whatever existed
at mint, at any later render time — no lock, no "as-of" column, no new mechanism (S46's own
conclusion, adopted here as the built rule). **This resolves D1**: the placeholder's value is
pinned at mint (the `cell_id` the basis names can never change) and resolved LAZILY at render
(the join runs when the worker calls `sandbox_export_payload`, not when the view was minted) —
both halves of S45's ambiguity are true simultaneously, because the estate's own immutability
guarantees make them equivalent. No new column on `sandbox_views` is needed.

### 2.5 Renderer — `layoutSandbox()`, mirroring `assemble()`

A new export from `packages/reporting-render/lib/layout.mjs` (or a sibling module, per the
package's own convention — the ceremony discipline in §7 covers either), `layoutSandbox(view,
decision)`, with its own closed block-kind switch admitting `text` and `placeholder` (mirrors
`assemble()`'s node-kind switch, `layout.mjs:196-218` for block-level and `layout.mjs:237-278`
for inline resolution).

**N4 — one disambiguating sentence, because this codebase now has THREE unrelated things named
"cell."** `layout.mjs` already has its own `case "cell"` (`:207,273`) — a TABLE cell, part of
`statement_table` rendering (`renderTable`), wired through `inline(content.cells ??
content.content, ...)`. This is unrelated to both **the stage-(b) AST primitive `cell`**
(§3.1, a JSON node kind inside a metric formula) and **`clara.metric_cells`** (the DB table
every cell citation in this design ultimately resolves against). `layoutSandbox`'s own
`placeholder` case, below, never touches `layout.mjs`'s table-cell code path — a
`statement_table` containing a `placeholder`-shaped cell is not something this design builds
(§6 — charts and rich table substitution are both out of scope; a `placeholder` block
substitutes into ordinary text flow, exactly like `metric_ref` does today).

The `placeholder` case, **widened per BL-8**:

```js
case "placeholder": {
  const cell = need(cellsByBasisRef, content.basis_ref, "sandbox_cell");
  // BL-8: typstString(value) is `'"' + String(value ?? "") ...` -- it coerces null/undefined
  // to "" and NEVER THROWS (layout.mjs:73-79, the exact fail-open shape gate B7 already found
  // once, at SS3.6 of the parent design, for the watermark string). A malformed payload entry
  // (cell_status not 'ok', or displayed_text not a string) must be refused HERE, typed, BEFORE
  // typstString ever runs -- never allowed to reach the coercion and silently render an empty
  // or wrong figure.
  if (cell.cell_status !== "ok" || typeof cell.displayed_text !== "string") {
    throw new RenderRefusal("sandbox_cell_malformed",
      `the payload's resolved cell for "${content.basis_ref}" is not a well-formed 'ok' cell`,
      { basis_ref: content.basis_ref, cell_status: cell.cell_status });
  }
  return `s(${typstString(cell.displayed_text)})`;
}
```

`cellsByBasisRef` is built by a new `shapeSandboxPayload()` (mirrors `shapePayload()`,
`packages/reporting-render/scripts/render-worker.mjs:67-112`, per S43) straight off the widened
`sandbox_export_payload` jsonb's `cells` object (2.4), which — after M11's fix — carries an
entry for every `placeholder`-cited label and no others. **This deliberately does NOT mirror
`metric_ref`'s `na_label` fallback branch** (`layout.mjs:249-261`) — a `placeholder` block has
no fallback string to print. §2.2 item 3 already refuses at MINT any placeholder citing a
non-`'ok'` cell, and because `metric_cells` rows are immutable (S15), a cell that was `'ok'` at
mint can never become not-`'ok'` by render time — there is no live-data race for a fallback to
cover. `sandbox_cell_unresolved` (the `need()` throw on a MISSING entry) and
`sandbox_cell_malformed` (BL-8's new throw on a PRESENT-but-malformed entry) are **two
different defense-in-depth axes against two different payload-builder failure modes** — an
absent key (M11's own filter mis-scoping) and a present-but-wrong-shaped value (a join or
column-name defect) — neither is against a live-data race, since none exists. **This is D3's
render-time mirror, built, and BL-8's typed-shape hardening of it.**

The sandbox watermark burn (§3.6 of the sealed design, C-23) is unaffected — `layoutSandbox`
keeps its own unconditional watermark wall exactly as `sandbox-export-design.md` already
specifies; this seam adds a block kind, not a new entrance.

### 2.6 The claim verb + leader-dispatch pair — pulled into this build's scope

S13's registered gap stands: **no CLAIM verb ships in 0132**, and no
`render_dispatch_begin`/`_record`-equivalent exists for the `sandbox_exports` job family (S3,
S41). Without them, nothing built in §2.1-§2.5 is renderable end to end — a mint can succeed
and a payload function can exist, but no worker process ever transitions a
`sandbox_exports` row from `claimable` to `running` to reach it. **BL-6 found `sandbox_exports`
itself is missing the columns a lawful claim/dispatch pair needs — this is a genuine ALTER, not
a pure-function widening (§4/Annex A.1 corrected accordingly).** `clara.render_jobs`
(`0079_wave_e_zeta_render_jobs.sql:100-168`) carries `max_attempts int not null default 5
check (max_attempts > 0)` (frozen, request-half, NOT in the mutable array below),
`first_claimed_at timestamptz`, `claim_delay_ms bigint check (... >= 0)` (paired with
`first_claimed_at` by `ck_rj_claim_delay_paired`), `dispatch_attempts int not null default 0`,
`last_dispatch_at timestamptz`, `last_dispatch_ok boolean`, `last_dispatch_error jsonb` — **none
of which `clara.sandbox_exports` (`0132.sql:288-330`) has today.** The new migration:

```sql
alter table clara.sandbox_exports
  add column max_attempts      int not null default 5 check (max_attempts > 0),
  add column first_claimed_at  timestamptz,
  add column claim_delay_ms    bigint check (claim_delay_ms is null or claim_delay_ms >= 0),
  add column dispatch_attempts int not null default 0 check (dispatch_attempts >= 0),
  add column last_dispatch_at    timestamptz,
  add column last_dispatch_ok    boolean,
  add column last_dispatch_error jsonb,
  add constraint ck_sandboxexports_claim_delay_paired
    check ((first_claimed_at is null) = (claim_delay_ms is null));
```

**`_tf_sandbox_export_lifecycle()` (`0132.sql:345-368`) already exists — this design's own v1
draft missed it entirely, reading only the table's CHECK constraints and not its trigger.** It
is `create or replace`d, not newly minted, to widen its `mutable` array from
`['state', 'attempts', 'claimed_by', 'claimed_at', 'lease_expires_at', 'last_error',
'finished_at', 'artifact_sha256', 'byte_size', 'storage_key']` to also admit
`'first_claimed_at', 'claim_delay_ms', 'dispatch_attempts', 'last_dispatch_at',
'last_dispatch_ok', 'last_dispatch_error'` — mirroring `_tf_render_job_lifecycle`'s own mutable
list (`0079.sql:186-187`) exactly. **`max_attempts` stays OUT of the mutable array**, matching
`render_jobs`' own precedent precisely: it is part of the frozen request half, set once at
request time, never runtime-mutated.

With the ALTER and trigger recut in place, the new verbs mirror `render_jobs`' own bodies
line-for-line, retargeted to `sandbox_exports`:

- **`clara.claim_sandbox_export(p_worker text, p_lease interval default interval '20
  minutes')`** — mirrors `claim_render_job` (`0081_wave_e_zeta_render_jobs_part3.sql:98-138`)
  exactly: blank-worker-id refusal, `FOR UPDATE SKIP LOCKED` oldest-first (`order by
  e.created_at, e.id` — **N7: `sandbox_exports` has `created_at`, not `render_jobs`' own
  `enqueued_at`; the ordering key is retargeted, not merely renamed**), the retry cap enforced
  **in the claim predicate itself** (`e.attempts < e.max_attempts`), and the SAME stamps,
  **N7's exact clamp formula, not a paraphrase** — `lease_expires_at = now() + greatest(
  interval '1 minute', least(coalesce(p_lease, interval '20 minutes'), interval '6 hours'))`
  (`0081_wave_e_zeta_render_jobs_part3.sql:109-111`, retargeted verbatim): `state='running',
  claimed_by, claimed_at=now(), attempts=attempts+1, first_claimed_at=coalesce(
  first_claimed_at, now()), claim_delay_ms=coalesce(claim_delay_ms, (extract(epoch from
  (now()-created_at))*1000)::bigint)`. Granted to `clara_runtime` alone.
- A leader-side `clara.sandbox_dispatch_begin(p_cooldown interval, p_max int)` /
  `clara.sandbox_dispatch_record(p_job_ids uuid[], p_ok boolean, p_detail jsonb)` pair, mirroring
  `render_dispatch_begin`/`render_dispatch_record` (`0081.sql:345-414`, S3) — the LEADER's own
  due-read + outcome-receipt verbs, distinct from the worker's claim/payload/complete/fail
  quartet, stamping `dispatch_attempts`/`last_dispatch_at`/`last_dispatch_ok`/
  `last_dispatch_error` exactly as `render_dispatch_record` stamps `render_jobs`' own columns.
- **`clara.reap_exhausted_sandbox_exports()` — the reap twin BL-6 names.** Mirrors
  `clara.reap_exhausted_render_jobs()` (`0081.sql:302-334`) exactly: `SKIP LOCKED` over
  `state='running' and lease_expires_at < now() and attempts >= max_attempts`, parks the row
  `state='failed', finished_at=now(), claimed_by=null, claimed_at=null, lease_expires_at=null,
  last_error=jsonb_build_object('reason','failed_at_cap_without_report', ...)`, returns
  `{reaped, reaped_export_ids}` (the sandbox-lane analogue of `reaped_run_ids` — a
  `sandbox_exports` row has no `report_run_id`, so the returned array names `sandbox_view_id`s
  instead, the nearest equivalent "what would not exist until you act" identifier).
- `db.mjs`-equivalent sandbox worker wrappers (`claimSandboxJob`, `sandboxJobPayload`,
  `completeSandboxJob`, `failSandboxJob`) in `packages/reporting-render/lib/db.mjs` (the exact
  file `db.mjs:57-90`'s render-lane wrappers already live in, per M10's path correction), each
  wrapping exactly one `clara.*` verb call.

**M2 — the `interactive_client` forward commitment is DELETED, not carried forward.** 0132's
own live text (`0132.sql:1183-1206`, read directly for this fold) states, as a measured fact
rather than a prediction: *"interactive ONLY — NOT interactive_client... though F-A2's D34 limb
IS merged on this chain (verified at authoring)... the estate's own GB-3/D34 closed-world cells
assert `interactive_client` is capped at exactly ONE verb"* (`wake_open_question`). This is
**permanent, not provisional** — `interactive_client`'s one-row invariant is itself
tail-censused by 0132 (`0132.sql:1379-1382`, refusing if the count is ever anything but 1). The
allowlist row for `wake_compose_metric_preview_v2` is therefore `('interactive',
'wake_compose_metric_preview_v2')` **only, permanently** — this design's earlier draft's
"once F-A2's D34 limb merges" framing (repeated in Annex A.2/§7) was stale even against the
survey's own read and is struck everywhere it appears.

These are **new** verbs (a genuine relation surface addition, Annex A), not a widening of any
existing frozen body — `render_jobs`' own claim/dispatch verbs stay untouched (C-11's sibling
job family posture, unmoved).

---

*(Continued in `card1-substitution-seam-design-part2.md`: §3, stage (b)'s mechanism. Section
numbers continue.)*
