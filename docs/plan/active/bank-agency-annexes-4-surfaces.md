# F-A3 — bank agency: ANNEXES 4 · the outer surfaces

> Companion to `bank-agency-design.md` **v2**. **E** the `bank_matching` egress purpose (§3.7) ·
> **F** the drawer-2 gate repair (§3.11) · **G** the read surface (§3.8).
>
> **v2, 2026-08-22 — gate 1 folded (record: `bank-agency-gate-record.md`).** These three annexes
> were carried in `bank-agency-annexes-1-mechanics.md` at v1 and moved here when the fold took that
> file to its 500-line ceiling. Nothing about their authority changed. Same standing caveat: every
> SQL sketch is a **shape**, not a file; the build authors against the LIVE prosrc read at the rig.

---

## Annex E · The `bank_matching` egress purpose (design §3.7) — PR-1c

**Seven DB extension points + one runtime registry**, every one extend-only. **All seven DB points
were MISSING from v1's D1 list** (gate blocker B3): five of them are live BODY edits and four are
ACCESS EXCLUSIVE CHECK swaps, one of them on `egress_dispatch_authorizations`, a table the witness
lane writes on **every** dispatch. At v2 they are **PR-1c**, their own windowed PR, blocked on C6.

| # | extension point | at | class |
|---|---|---|---|
| 1-3 | the three purpose CHECKs — `client_egress_purpose_consents`, `_activations`, `egress_dispatch_authorizations` (born `0020:153`, `:198`, `:250`; widened `0038:5504`, then `0090:691-704`) → `check (purpose in ('wiki_synthesis','statement_extraction','witness_extraction','bank_matching'))` | `0090:691-704` | **ACCESS EXCLUSIVE** ×3 |
| 4 | `ck_egress_dispatch_authorizations_doc_sha` — a **fourth conjunct requiring `document_sha256` IS NULL** for `bank_matching` (the `wiki_synthesis` arm's shape), because a matching read is not document-tied; `0090`'s own comment anticipates it: *"three separate conjuncts so a fourth purpose inherits nothing by accident"* | `0090:730-735` | **ACCESS EXCLUSIVE** |
| 5-8 | the four purpose verbs' `not in (…)` lists — `grant_client_egress_purpose`, `activate_…`, `deactivate_…`, `revoke_…` | `0090:758`, `:818`, `:890`, `:952` | **live body CoR** ×4 |
| 9 | `prepare_egress_dispatch` — the body the runtime calls on every witness/statement dispatch | `0090:1007-1058` | **live body CoR** |
| 10 | `GOVERNED_EGRESS_PURPOSES` — a new frozen entry naming `gatedAt` honestly: **"the due predicate (enqueue) + the dispatch pair, ONCE PER RUN"**, `documentSha256: "forbidden"`, `heldStatePath: "none — the run settles refused"` | `packages/runtime/lib/egress.mjs:232-300` | runtime (PR-2) |

**Why this is its own PR (Annex O.3).** The DDL takes an ACCESS EXCLUSIVE lock on a live witness-lane
table and `prepare_egress_dispatch` is re-cut while that lane runs — neither was quiesced for in v1's
plan, because neither was on v1's list. It is **independently provable and independently
rollback-able**, and it **blocks on C6** (DPA · client disclosure · PDPA cross-border basis) whose
clock is legal, not engineering. Coupling it to the accounting limb would gate the build on a
signature. *(If C6 lands late, PR-1c takes its own ceremony window rather than holding the train.)*

**The refusal path.** A client without a live consent+activation pair: the due predicate returns
`purpose_unconsented`, so **no event, no run, no dispatch**; if a run reaches the verb anyway (a
consent revoked mid-run), Tier A refuses `purpose_unconsented` and the task settles refused with a
`llm_usage_events` row recording the refusal (the witness lane's own precedent). **The real-data
egress flag stays OFF until the C6 pack is signed** (owner directive, 2026-08-22) — which does not
block the build or beta readiness on test data (ADR-060).

---

## Annex F · The drawer-2 bank gate repair (design §3.11) — PR-1d

**Target:** `clara._close_gate_bank_items(p_client, p_fy)` (`0056:1335-1380`) — a stable read whose
result rows are append-only and re-measured on the next close run, so the repair is **PR-1d, not a
D1 body**.

| # | today | repaired | why |
|---|---|---|---|
| 1 | gap universe = `select distinct s.bank_account_id from clara.bank_statements` (`0056:1355-1358`) | gap universe = **the account REGISTRY**, active OR carrying non-void history — the `bank_recon_close_state` enumeration verbatim (`0056:970-975`) | an account with no statements is a question the gate must ASK; today it is invisible |
| 2 | unmatched lines NOT enumerated, on the stated ground that *"the match linkage is not line-keyed"* (`0056:1370-1372`) | **enumerated**, using `list_unmatched_lines`' own predicate (`0040:4111-4123`) — one shared computation, not a second one | the ground is false at the bytes (`bank_match_line_members.line_id`, `0038:4083-4090`) |
| 3 | `'unmatched_lines_basis','exceptions_and_gaps_v1'` | `'registry_lines_and_gaps_v2'` | a stored gate result must name the measurement it was taken under (law 27(2)) |
| **4** | **(no arm) — a client with ZERO registered accounts contributes nothing and the gate returns `pass`** | **`fail` with reason `no_registered_account`** when the client's chart carries a **bank-class COA account with movement** and no `clara.bank_accounts` row binds it | **without it the repair cannot flip the one client this item exists to un-green** (material M1) |

**Why arm 4 exists — the repair that could not reach its own headline cell.** Repairs 1 and 2 both
iterate a universe that is EMPTY on a zero-registry client: repair 1 loops
`from clara.bank_accounts ba where ba.client_id = p_client and (ba.active or exists(… non-void
statements …))` (`0056:989-993`, the sibling's shape adopted verbatim) — zero rows, zero iterations;
repair 2's reader INNER JOINs `bank_accounts` (`0040:4113`), so such a client can hold no enumerable
lines at all. Both counts stay `'[]'` and `:1373-1375` returns `'pass'`. The sibling
`bank_recon_close_state` answers `'tie'` on the same input (`0056:962`), so "the way its sibling does
it" does not rescue it either. **H.7's headline cell ("the repaired gate turns a
zero-registered-account client RED") and H.0's acceptance shape were both unreachable as v1 specified
the repair.**

**R-F 1 holds by OWNERSHIP, not by absence.** Drawer-1's `bank_recon_close_state` and its **P-3
registry-vs-ledger zero census stay F-T4's** — F-A3 does not touch drawer-1 and does not publish a
second census. Arm 4 is **drawer-2's own fail arm**, and the registry-vs-ledger predicate underneath
it is **one predicate with one owner and two call sites** (TA-P11's one-architecture test): whichever
item lands it writes it, the other CALLS it (Annex O.4 obligation 6). *The boundary reading is
escalated as owner item 3 (Annex P.2) — on the alternative "absence" reading the drawer-2 gate cannot
be un-greened at all and TA-P14 clause 1 is unmet for this item.*

**Not changed:** the exception census (`0056:1343-1352`) including its *"unresolved evidence does not
age out"* scoping, the pass-or-fail shape, and the drawer assignment.

**The measured consequence is part of the deliverable** (PREDICTION **P-4′**, re-worded at v2 to name
its population): *on the live books the gate returns `pass` for every client today; after the repair,
**every client with bank-class COA movement and no registered account flips to `fail` via arm 4**,
and at least one client with a registered-but-gapped account flips via arm 1 or 2.* PR-4 publishes
the verdict before and after, per client. **Clients that show green today will flip red.**

---

## Annex G · The read surface (design §3.8) — PR-1d

**`clara.wake_get_bank_pack(p_client, p_bank_account, p_op_key) returns jsonb`** — SECURITY DEFINER,
granted to `clara_wake_bank` only, allowlisted for `bank_agent`.

```
{ "schema": "clara.bank-pack/v1",
  "bank_account": { … registry row, coa_account_code … },
  "statement":    { … period, opening/closing, corroboration verdict, chain state … },
  "lines":        [ … unmatched lines: id, entry_date, value_date, description, amount_cents,
                       class_hint (0040:3177 — advisory, labelled) … ],
  "candidates":   [ … approved entries with debit/credit_remaining_cents (0038:8010-8054) … ],
  "open_items":   [ … by counterparty, with outstanding as-of … ],
  "recon_terms":  { … _bank_recon_terms preview (0040:1039) … },
  "learned_payers": [ { "descriptor": "PAYMENT ACME", "counterparty_id": "…", "seen": 9,
                        "status": "context_only" } ],           -- TA-P8: NEVER a key
  "open_proposals": [ … OPEN bank_agent_proposals whose subject is still eligible … ],
  "budget": { "lines": 400, "candidates": 400, "truncated": false },
  "digest": "<sha256 of the canonical pack>" }
```

**Five properties, each load-bearing:**

1. **Read and receipt in ONE transaction** (TA-P4): the body writes a `bank_agent_receipts`-shaped
   read receipt before returning; **no receipt, no read**. A rollback loses both.
2. **No table grant.** Every underlying relation stays zero-grant to every machine role — survey F1
   / census C5 stays true **verbatim**, *and* the role list EXTENDS with `clara_wake_bank`
   (census C17/C18; the extend-never-weaken direction, material M4).
3. **Truncation is declared, never silent** (`budget.truncated`), and a truncated pack **cannot
   admit a match** — the ladder reads `truncated` as an M-rung input and reports `not_evaluable`.
4. **`high_stakes` is not carried forward.** `list_bank_match_candidates` hardcodes
   `'high_stakes', false` (**`0038:8025`** — v1 cited `:8021`, which is the `entry_id`/`posting_date`
   line; nit **N1**), survey F9; the pack **omits the field** rather than republishing a value that
   always lies, and PR-3 fixes or removes it on the human read.
5. **`open_proposals` is filtered by ELIGIBILITY, not by status** (v2, blocker B4's tail): an OPEN
   `line_exception` proposal whose line has since been matched or excepted by another path is **not
   offered**, because the proposal table has no `stale` status and no writer for one. The filter is
   the read's job; the CHECK stays `('open','accepted')`.

**Why not the freeform read (F-A6).** TA-P9 rules that unattended lanes use **typed** reads until a
separate ruling; the freeform surface is `interactive` only. This pack is that typed read.
