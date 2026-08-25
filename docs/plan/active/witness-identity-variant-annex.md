# The candidate-parameterized `evaluate_witness_identity` variant — ANNEX

> Companion to `witness-identity-variant-design.md` (v1, 2026-08-25). **A** the test battery (cells a
> build lane must prove, not merely believe) · **B** the confusables seed set in full · **C** the
> decision register.

---

## A · Test battery

Cell numbering is fresh to this item (no prior battery to extend). Each cell states the fixture
shape and the required outcome; a cell with no build behind it is a claim, not a proof — the build
lane runs every cell against its own rig replay before merge, per review law 1.

| # | Fixture | Required outcome |
|---|---|---|
| **V1** | `evaluate_witness_identity_v2` called with `p_candidates = array[c1]` where `c1` has a live, well-laid-out witness-corroborated vendor registration and NO live `document_filings` row exists for the document at all. | `candidates -> c1 ->> 'vendor_registration_verdict' = 'corroborated'` — proves path (i): the fresh-filing case v1 could never serve. |
| **V2** | Same fixture, `p_candidates = array[c1, c2]` where `c2` is an unrelated client with no relationship to the document. | `candidates -> c1` corroborates; `candidates -> c2` is absent or `not_corroborated` — never contaminated by `c1`'s geometry (proves per-candidate self-referential independence; geometry itself stays shared, which is correct and intentional, not a leak). |
| **V3** | `p_candidates` includes a candidate `c3` belonging to a DIFFERENT firm than `p_document`'s firm, plus a genuine same-firm candidate `c1`. | `candidates` carries `c1` only; `c3` is silently absent — never an entry, never a raise. **Security-critical — the firm guard from design §2.3/§3.** |
| **V4** | `p_candidates = '{}'::uuid[]` (empty) and `p_candidates` containing only unresolvable uuids. | `"candidates": {}` in both cases — a well-defined non-error answer, never a raise. |
| **V5** | A registration on the document normalizes to `c1`'s own `client_identifiers` TIN. | `candidates -> c1 ->> 'vendor_registration_verdict' = 'withdrawn_self_referential'`, and this does NOT affect any other candidate's verdict for the same side. |
| **V6** | Same document evaluated with `p_contest = true`. | Every cited side across every candidate reads `'withdrawn_contest'`; `identity_contest = true`. |
| **V7** | The two PRE-EXISTING frozen closures (`evaluate_witness_fact_state`, F-A2's nil-tax predicate) — `closure_sha256` captured before and after the migration. | Byte-identical. Positive proof `v1` and both closures are untouched. |
| **B1** | `name_family_candidates(p_firm, 'R0ME PROPERTIES')` (digit zero) against a firm carrying ROME PROPERTIES and ROME SECRETARY as live clients. | Returns both ROME clients — the motivating fact, closed. Pre-fix (v1 predicate): zero rows — the negative control this cell must also run and show. |
| **B2** | `name_family_candidates(p_firm, 'РROPERTIES')` — Cyrillic `Р` (U+0420) standing in for Latin `P` at the head of an otherwise-Latin string, against a firm carrying a Latin-only "PROPERTIES..." family. | Confusable fold catches it via `name_family_token_confusable`; the strict `name_family_token` arm does NOT (proves the OR is doing real work, not redundant with the strict arm). |
| **B3** | `name_family_candidates(p_firm, 'Ωmega Trading')` (Greek Ω, not in the seeded confusable set — deliberately, since Ω has no seeded fold target) against a firm with no matching family. | Zero rows — the negative control proving the fold is a **named, bounded** set, not silently doing more than documented. |
| **B4** | A differential replay: the FULL set of `(p_firm, p_name)` pairs from a captured pre-CoR fixture corpus, run against the OLD `name_family_candidates` body (captured result set) and the NEW body. | Every row the old body returned is present in the new body's result (strict superset) — the positive proof of "widening never narrowing," never a self-referential "looks additive" read. |
| **B5** | `select lower(U&'\0415')` on the live/rig database. | Read and recorded either way (`=U&'\0435'` or not) — settles design §7 prestate item 5 rather than assuming it; if the fold is NOT automatic, B2 must still pass (proving the explicit uppercase Cyrillic rows are load-bearing, not redundant). |
| **W1** | End-to-end: `wake_file_document` on a document naming `R0ME PROPERTIES` (no other identifying evidence, no hard-id match, well-laid-out witness geometry) BEFORE this item ships. | Refused — B3 alone (`attribution_no_basis`), by blunt force (survey §2.3's "today" case). |
| **W2** | Same document, same call, AFTER the variant ships WITHOUT the homoglyph widening (an intentionally mis-sequenced build, run only to prove the sequencing requirement is real). | **Admits** — the regression design §5 names and forbids shipping. This cell exists to prove the danger, not to pass in the shipped build. |
| **W3** | Same document, same call, AFTER both the variant and the homoglyph widening ship together. | Refused — B2 fires (`attribution_name_family_collision`, arm (a) now sees the ROME family via the confusable fold) even though B3 would otherwise admit. **This is "B2 outcome-bearing," end to end.** |
| **W4** | A document naming `ROME PROPERTIES` cleanly (no homoglyph), witness-corroborated, no hard-id, filed to the correct ROME PROPERTIES client, with ROME SECRETARY also live in the same firm. | **Admits** — B2's family collision fires (both ROME entities share the token) but `v_confirms_client`-style disambiguation / the cell-12 hard case still applies exactly as 0126 already proves it does; this cell confirms the widening does not turn every legitimate ROME filing into a permanent collision refusal. |

---

## B · The confusables seed set, in full

`clara.name_family_confusables(from_char, to_char, class)` — every row the migration seeds. A later
addition is a single-row `insert`, never a function edit; this table is the census a later cell reads
`count(*)` against rather than trusting the design doc's own prose.

**`digit_letter`** (9 rows): `0→o` · `1→l` · `3→e` · `4→a` · `5→s` · `6→g` · `7→t` · `8→b` · `$→s`.

**`cyrillic_latin`** (29 rows — 15 uppercase, 14 lowercase; deliberately not claimed exhaustive over
all of Unicode's Cyrillic confusable block, only the set that visually confuses a Latin-script company
name):

| Cyrillic | Latin | Cyrillic | Latin |
|---|---|---|---|
| А (U+0410) | a | а (U+0430) | a |
| В (U+0412) | b | в (U+0432) | b |
| Е (U+0415) | e | е (U+0435) | e |
| Ѕ (U+0405) | s | ѕ (U+0455) | s |
| Ј (U+0408) | j | ј (U+0458) | j |
| К (U+041A) | k | к (U+043A) | k |
| М (U+041C) | m | м (U+043C) | m |
| Н (U+041D) | h | н (U+043D) | h |
| О (U+041E) | o | о (U+043E) | o |
| Р (U+0420) | p | р (U+0440) | p |
| С (U+0421) | c | с (U+0441) | c |
| Т (U+0422) | t | т (U+0442) | t |
| У (U+0423) | y | у (U+0443) | y |
| Х (U+0425) | x | х (U+0445) | x |
| І (U+0406) | i | і (U+0456) | i |

**`greek_latin`** (14 rows, uppercase only — lowercase Greek is visually distinct enough from Latin in
most fonts that it was not seeded, named here as a deliberate scope line rather than an oversight):
`Α→a, Β→b, Ε→e, Ζ→z, Η→h, Ι→i, Κ→k, Μ→m, Ν→n, Ο→o, Ρ→p, Τ→t, Υ→y, Χ→x`.

**Total seeded rows: 52.** A build lane's tail census asserts this count positively; the design's own
prose is not the source of truth once the migration lands — the table is.

---

## C · Decision register

| # | Decision | Ground |
|---|---|---|
| **D-1** | `p_candidates` is a `uuid[]` referencing `clara.clients.id` only — never `clara.counterparties.id` directly. | Self-referential withdrawal reads `client_identifiers`, which is client-scoped; a counterparty has no identifiers row of its own to test against (design §2.3, §4). |
| **D-2** | The firm guard lives INSIDE `evaluate_witness_identity_v2`'s own body, not only at the call site. | `SECURITY DEFINER` + caller-supplied parameter is the cross-tenant-oracle shape `0002:453-458` names; the function must not depend on every future caller getting the boundary right (survey §5, design §2.3/§3). |
| **D-3** | `name_family_token` (the strict fold) is left untouched; the confusable fold is a new, separate, `STABLE` function. | Avoids any volatility change to a live `IMMUTABLE` function with unknown-but-probably-zero index dependents; keeps the CoR's diff minimal and auditable (design §6.1, §7 prestate item 6). |
| **D-4** | One canonical fold target per confusable source character (not a fuzzy multi-target fold). | `translate()` is 1:1; both sides of every comparison pass through the identical fold, so correctness needs only "collapses to one shared token," not "corrects to the intended letter" (design §6.2). |
| **D-5** | The variant and the homoglyph widening ship as one build unit, never the variant alone first. | Design §5's sequencing requirement — shipping path (i) alone converts a blunt-but-safe universal B3 refusal into a real, homoglyph-blind admission path (survey §2.4, battery cell W2). |
| **D-6** | `evaluate_witness_identity_v2`'s output is a per-candidate map (`candidates -> <uuid> -> {...}`), not a repeated set of top-level scalar keys. | Generalizes v1's shape cleanly for N candidates without inventing N parallel key names; a caller that only ever asks for one candidate (§2.5) pays no real cost over v1's original scalar shape. |
| **D-7** | No new `firm_open_questions.kind`, no new event type, no `wake_fn_allowlist` change. | Nothing about *why* B2 fires changes in a way the existing typed vocabulary fails to represent; this item adds no new wake-reachable verb (design §8). |
