# F-A8 — the internet lane: design v2

> **v2, 2026-08-22 — gate 1 folded (record: `internet-lane-gate-record.md`).**
> Design doc of record for Wave-F Track-A item **F-A8** (`docs/plan/active/wave-f-contract.md`,
> the `### F-A8 · The internet lane` section — at **~line 311** after the ADR-0074 sitting
> commit inserted the bank-lane clauses above it; v1's "lines 118-126" was stale and pointed at
> F-A3's prose). Companions: **`internet-lane-survey.md`** (the estate as-found, F1-F15, v2) and
> **`internet-lane-annexes.md`** (Annex C the battery · Annex D the decision register · Annex E
> the table DDL posture · Annex F the census/roster surgery list · Annex G the rig-replay
> obligations · Annex H the change log — **re-cut at this gate against THIS document; on any
> divergence the design doc wins**, §10). Binds under **ADR-0071 G9 + P-FX** (digest law 75, **all three** of its
> disciplines — citation, inert content, **and the preference for official Malaysian sources on
> rules questions**), digest laws **16** (effective-dated tax facts), **58** (typed egress),
> **68** (ARM-0), **71-73**, **76**, review laws **26-29, 31, 34**. Cites the 2026-08-22 Track-A
> sitting rulings by id (source of record: `docs/adr/0074-the-track-a-sitting.md`): **TA-P2**
> (numbers without documents, A+), **TA-P3** (egress governance, A), **TA-P4** (receipts, A),
> **TA-P5** (calendar wake, A/principle form), **TA-P8** (identity learning loop, B general
> form). **TA-P1** (the open register) is a **constitutional amendment pending the owner's
> digest sign-off** — every new verb below is a **wake SIBLING verb, never a rewrite of a live
> human body** (TA-P1's rider, binding regardless of the amendment's own sign-off status), and
> the build should not merge before that sign-off lands (or the owner explicitly waives the
> wait). **TA-P7** (attribution) does not bind this item — F-A8 attributes nothing to a client.

## 1 · The ruled shape (fixed, not designable)

- **Two tiers, contract §F-A8.** Tier 1: number-bearing facts land ONLY through effective-dated
  policy tables fed from named official sources. Tier 2: an open web read/search tool, no domain
  whitelist, fetched content inert, every basis cited, **and prompts prefer official Malaysian
  sources for rules questions** — the third discipline of law 75, mechanised in §3.2 as a
  `source_official` signal that orders prompt context and NEVER gates acceptance (v1 dropped it
  silently; the gate put it back, GM-5).
- **TA-P2/A+, the three origins.** Any number entering the books or a formal artifact has
  exactly three lawful origins: a witnessed document figure, a versioned deterministic evaluator
  over DB-owned inputs, or a Tier-1 policy-table row. Tier-1 rows: **Clara fetches and DRAFTS;
  the row lands through an AUDITED OWNER ONE-CLICK DOOR (not a PR), gated by two mechanical
  checks** — this is the governed verb that relaxes migration `0016`'s own "migration-only"
  assertion (survey F1). Rows are **immutable + supersede** (revision/`superseded_by`/actor);
  **a missing row for the requested day REFUSES — never carried forward**; a backdated
  correction triggers a downstream impact scan (§5); **the table carries a fetch-attempt/health
  relation so "nothing was fetched today" is itself a readable record** (contract, and F-A8-M2's
  own second obligation — v1 claimed it and did not build it; §5 builds it now).
- **The value that LANDS is DERIVED, never supplied.** TA-P2's two checks are a floor, not the
  whole wall: v1 took the numeral as a caller argument beside the sources, so two genuine
  agreeing quotes of 4.7100 could land 4.8100 with both checks green (GB-1). The wrapper carries
  **no value parameter at all**; a versioned deterministic DB extractor reads the value out of
  the cited quotes and the core writes THAT (§3.1). This is the same "absence is the wall" idiom
  §3.2 uses for client identity, and it is what makes constraint 2 / PRD §6 structurally true
  here rather than procedurally hoped for.
- **The Wave-F Tier-1 list closes at three tables**: `fx_rates`, the SST rate schedule, the SST
  threshold schedule (income-tax bands, capital allowances, EPF/SOCSO/EIS, stamp duty and MTD
  are explicitly OUT until their own consumers, F-T2/F-T3, land). **The SST rate table's SCHEMA
  is F-T1's**; F-A8 attaches fetching once it exists — a named contract dependency (survey F3).
  The model **price** table is F-A9's, by the contract's own F-A9 section and
  `metering-design.md` §3.5 — named here only so its absence reads as scope, not oversight.
- **TA-P4/A, receipts.** The fetch tool self-mints citation rows (URL + accessed date + quote);
  **a receipt carrying tool calls with zero citations is refused.** Law 71's receipt discipline
  (model+version+rationale; who/why/from-where mechanically bound to the triggering act) extends
  to every judgement act this item performs.
- **TA-P3/A, egress.** Identity-free regulatory lookups are not disclosures — no consent purpose
  is needed for Tier-1/Tier-2 in v1. **"Identity-free" is a property the design must MAKE true,
  not assert** (GB-5): §3.2 carries a closed purpose world and a refusal predicate over the
  model-authored text, because an absent `client_id` parameter does not close a free-text
  channel. The non-public-address deny list (localhost / RFC1918 / link-local / fly 6PN) is a
  **safety control**, not a content whitelist — no conflict with G9's "no domain whitelist".
- **TA-P8/B, general form — stated correctly this time (GB-4).** The ruling
  (`docs/adr/0074-the-track-a-sitting.md` §TA-P8; member **F-A8-M4** ruled **B**) is: identifiers
  Clara learns by JUDGEMENT — bank accounts, SSM numbers, **web-found registrations** — are
  recorded in the knowledge layer **as CONTEXT for her next judgement**, never written as
  exact-match KEYS; keys come only from a human confirmation or a printed identifier read
  identically by both witness channels, and **the promotion door is GRANTED**. v1 stated the
  inverse ("never enter the knowledge base… not even as unconfirmed context") and cited the
  ruling as its authority — that sentence is **withdrawn**. **F-A8 v1 still writes nothing into
  the knowledge layer**, but as a *scope* choice with a named owner (F-A7 owns the identity
  learning loop and the audited promotion door), **not** as a prohibition TA-P8 imposes. Whether
  the context landing is owed by F-A8 or by F-A7 is **owner item OI-1** in the gate record; the
  fail-closed default the build proceeds on is the narrow one — no KB write path here, no
  `wiki_page_citations.source_kind` extension, and `web_fetch_citations` is the durable carrier
  a future landing would cite.

## 2 · What TA-P1 changes here, and why the build waits

TA-P1's rider — **new authority ships as a wake SIBLING verb, never a rewrite of a live human
body; capabilities default ON, no per-firm dial** — is why every verb in §3 is brand new. The
**amendment itself** (law 71's "exactly" list becoming an open register, judged by the
two-question rule: does the act make something disappear or go irreversibly external?) is
**pending the owner's digest re-sign**. Applying that test to F-A8's own new human act — the
owner one-click approve/override — the answer is genuinely **"stays human regardless of TA-P1's
outcome"**: approving a statutory rate is exactly the "goes external" case (it becomes every
client's books' truth the moment it lands), so it was never a candidate for Clara-held authority
under either reading. **The fetch-and-draft half is Clara's either way.** So F-A8's shape does
not depend on how TA-P1 resolves; only the *next* item that discovers an unnamed act must re-read
its final text. *(Gate 1 attacked this section and found nothing — recorded as HELD.)*

## 3 · The verb set

### 3.1 Tier 1 — fetch, draft, decide

**`clara.wake_submit_policy_draft(p_table_key text, p_sources jsonb, p_effective_date date,
p_model jsonb, p_rationale text, p_op_key text) returns jsonb`** — the 0077/0078 idiom, same
shape as F-A2's `wake_post_entry`. **There is no `p_payload`** (GB-1): the caller supplies
evidence, never a number.

```
wrapper  clara.wake_submit_policy_draft   granted to clara_wake_proactive ONLY;
                                          allowlist row ('proactive','wake_submit_policy_draft').
core     clara._policy_draft_submit_core  ungranted; consume-first, the ladder, the derivation,
                                          the draft insert + its citation rows, one transaction.
```

**Tier A (RAISE, CLR\*), in this order.**

1. **Consume-first, for a fresh `'proactive'` op** — copied verbatim from `0004:668-678`, the
   estate's ONLY writer of `wake_credentials.consumed_at`: the atomic conditional
   `update … where consumed_at is null`, `raise CLR03` when `not found`, with the replay
   carve-out (a replay must not consume). v1's ladder omitted this, so the credential was
   replayable for its whole 15-minute TTL and v1's cell C.11 proved a *different* function's
   branch (GM-3; the cell is re-cut onto this verb as Annex C's C.1c/C.1d). **Single-use is a
   PER-VERB obligation with no central enforcement** —
   `assert_wake_allowed` (`0004:114-121`) checks the allowlist and nothing else, and
   `wake_context` (`0011:1133`) filters `consumed_at is null` but never sets it. Recorded as a
   wave-level finding in Annex D (IL-D12): the next proactive verb hits this too.
2. Valid wake credential + allowed fn (`assert_wake_allowed`, CLR03).
3. `p_table_key` is a member of the CLOSED set — **`{'fx_rates'}` at PR-1, widened to admit
   `'sst_threshold_schedule'` by PR-3** (§7); never `sst_rate_schedule`, which does not exist
   (CLR10, `unknown_policy_table`).
4. `p_sources` is a jsonb array of well-formed `{url, accessed_at, quote}` objects, **at least
   one** (CLR10, `no_citation` — TA-P4-M1's floor applied at the door, because the draft and its
   citations insert together). Each `url` passes the lexical check of §3.2.
5. Non-blank `p_rationale`, a complete `p_model` snapshot, a non-blank `p_op_key` (0078's "the
   agent never picks an authoritative input").

**The derivation — a versioned deterministic evaluator, and the only path a numeral takes.**

| function | contract |
|---|---|
| `clara._policy_extract_quoted_value(p_table_key text, p_quote text) returns numeric` | **TOTAL and versioned.** Per-table-key parse rule (`fx_rates`: a decimal quotation; `sst_threshold_schedule`: an RM amount → cents), applied to the citation's own quote text. **Every cast is guarded** (a regex pre-check / a null-returning safe cast); an unreadable quote returns **NULL**, never a raise (GM-7). Its version integer is stamped on the draft. |
| `clara._policy_sources_agree(p_table_key text, p_sources jsonb) returns table(verdict text, derived_value numeric, extracted jsonb)` | Extracts from EVERY source. `pass` + `derived_value` only when **at least two** sources yield a non-NULL extraction AND they are equal in the table's stored unit; `fail`/`sources_disagree` when two or more disagree; **`not_evaluable` when fewer than two are extractable — never `pass`** (ARM-0, law 68). `extracted` records the per-source parse so a reader can see WHY. |
| `clara._policy_value_plausible(p_table_key text, p_derived numeric) returns text` | Runs on the **derived** value, never on caller text: the value sits within a per-table-key band of the CURRENT live row. **`not_evaluable` on an absent baseline** (the first row ever drafted for a key — ARM-0 again), never a silent `pass`. Also total: no input it cannot read may raise. |

**Both predicates are TOTAL by contract** — they run inside the core in the same transaction as
the draft INSERT, so a raise would roll back the very `needs_review` row this section promises is
never dropped (GM-7). Any input they cannot read yields `not_evaluable`; the draft still lands.

The core writes `payload` **from `derived_value`** (`jsonb_build_object('value', derived_value,
'unit', <the table's stored unit>)`), stamps `derived_value` and `extractor_version` as their own
columns, and lands `status='pending_approval'` only when both verdicts are `pass`. A
`needs_review` draft is still inserted — a fetch attempt that disagrees with itself is itself
information — and cannot reach the one-click door.

**`clara.policy_drafts`** — the staging table (new, no `firm_id`: Tier-1 facts are
firm-independent, survey F15). Columns: `id`, `table_key`, `payload jsonb` (core-written),
`derived_value numeric`, `extractor_version int`, `effective_date`, `sources jsonb`,
`sources_agree_verdict text` (`pass`/`fail`/`not_evaluable`), `value_plausible_verdict text`
(`pass`/`fail`/`not_evaluable`), `status text check (status in ('pending_approval',
'needs_review','approved','overridden','rejected'))`, `model_snapshot jsonb`, `rationale text`,
`minted_by_firm uuid` (which firm's credential minted it — ODQ-1's mechanical answer),
`submitted_at`, `decided_by`, `decided_at`, `decision_note`. Terminal states are immutable; a
fresh fetch cycle always produces a NEW draft row, never reopens an old one.

**`clara.decide_policy_draft(p_draft_id uuid, p_decision text, p_note text) returns jsonb`** —
the audited owner one-click door. Human-called (`clara_authenticated`), gated inside by
`clara.role_rank(role) >= clara.role_rank('owner')` (CLR05, `not_owner` — a human-authority
check, not CLR03). **Refuses `draft_not_decidable` (CLR10) unless `status='pending_approval'`.**
On `'approve'` it **re-derives from the STORED sources** and re-runs both checks (defence in
depth — a verdict computed at submission time is not trusted across a time gap); a re-derivation
that differs from the stored `derived_value` refuses **`(CLR10, draft_value_drifted)`** rather
than landing either number. Clean → the shared delegate.

**`clara.override_policy_draft(p_draft_id uuid, p_reason text) returns jsonb`** — same door, more
friction: only callable when `status='needs_review'`, `p_reason` non-blank (mirrors
`amount_override`'s discipline in F-A2). Refuses `draft_not_overridable` (CLR10) otherwise. It
overrides the **verdicts**, never the derivation: the value it lands is still the extractor's,
and a draft whose `derived_value` is NULL (nothing extractable) is **not overridable at all** —
there is no number to approve.

**`clara._policy_draft_commit_core(p_draft_id, p_decided_by, p_arm text)`** — the SHARED delegate
both human verbs call (F-A2's "one core, two callers"). In one transaction it (1) marks the draft
`approved`/`overridden`, (2) writes the new row into the destination Tier-1 table, (3) stamps the
predecessor, (4) writes the decision receipt (§4), (5) runs the backdated-correction impact scan
(§5). **The supersede mechanics differ per table, and the difference is structural, not
stylistic (GB-3):**

- **`clara.fx_rates` (new, greenfield)** copies `client_facts` (`0055:386-420`) whole: `id uuid
  primary key default gen_random_uuid()`, the key columns, `superseded_by uuid references
  clara.fx_rates(id) deferrable initially deferred`, `superseded_at`, the paired CHECK
  (`(superseded_by is null) = (superseded_at is null)`), the WHO/BASIS/WHEN trio
  (`recorded_by`/`basis`/`basis_kind`/`recorded_at`), and a partial unique index for the live row
  per key.
- **`clara.sst_threshold_schedule` (LIVE, `0016:237-244`)** has a **composite PK
  `(service_group, effective_from)` and NO `id`** — v1's `superseded_by uuid references
  clara.sst_threshold_schedule(id)` is a DDL that cannot apply. The ALTER therefore adds, in this
  order: `id uuid not null default gen_random_uuid()` **plus `unique (id)`** (the composite PK
  and every existing reader untouched), then `superseded_by uuid references
  clara.sst_threshold_schedule(id) deferrable initially deferred`, `superseded_at`, the paired
  CHECK, `recorded_by uuid references clara.users(id)`, `basis text`, `basis_kind text`, and a
  governed-origin conjunct `check (recorded_by is null or (btrim(coalesce(basis,'')) <> '' and
  basis_kind is not null))` — every new column nullable so the two migration seed rows
  (`0016:247-248`) stay valid with no backfill. The core must also satisfy the table's existing
  `source_note not null check (btrim(source_note)<>'')`: it writes the agreeing sources' URLs +
  accessed dates as the note, so the live row cites its own origin with no join.
- **Both tables**: `superseded_by`/`superseded_at` is PROVENANCE (who/why this row stopped being
  current) and `effective_to` is the DATE-RANGE business meaning a point-in-time query reads
  (`0016:568,618,883,1075`). The commit core closes **both** — closing one leaves a query that
  reads the other silently wrong. `effective_to` closes to the successor's own `effective_date`:
  the convention is the **half-open interval `[effective_from, effective_to)`** (§5 states the
  matching read predicate, and why it is `>` and not `>=`).

### 3.2 Tier 2 — the open web read/search tool

**`clara.wake_web_fetch(p_url text, p_purpose text, p_rationale text, p_model jsonb, p_op_key
text) returns jsonb`** and **`clara.wake_web_search(p_query text, p_purpose text, p_rationale
text, p_model jsonb, p_op_key text) returns jsonb`** — two typed verbs (one audited mutation
class each, `ARCHITECTURE.md:143`), sharing one core:

```
wrapper  clara.wake_web_fetch / wake_web_search   granted to clara_wake_interactive;
                                                   allowlist rows ('interactive','wake_web_fetch'),
                                                   ('interactive','wake_web_search'). NOT granted
                                                   to autodraft in v1 (ODQ-4).
core     clara._web_read_core                     ungranted; the identity wall + the receipt +
                                                   the citations, one transaction, after the
                                                   RUNTIME's guard and call.
```

**The non-public-address guard runs in the RUNTIME, before any outbound call** (survey F7 — DNS
and IP resolution are not Postgres's job). It resolves the target host and refuses if the
**resolved** address is loopback (127.0.0.0/8, ::1), RFC1918 (10/8, 172.16/12, 192.168/16),
link-local (169.254.0.0/16 — which also covers every major cloud's metadata service), or Fly's
6PN (`fdaa::/8`). **This is a refusal branch — judgement logic, law 1's independent-review floor
applies.** It is genuinely new work, but **not on bare ground**: the estate already calls
`fetch()` with a real timeout/abort convention in `packages/runtime/lib/storage.mjs:88,122,217,
235,307,337` and `lib/reconciler-render.mjs:126-128,158` (`AbortSignal.timeout(...)`) — PR-2
reuses those client conventions rather than inventing a second HTTP idiom (survey F6 v2: what is
absent is a **web-read tool**, not `fetch()` itself). As defence in depth the DB core also runs a
cheap lexical check on every citation `url` (scheme `http`/`https`; a literal-IP hostname in one
of the same ranges is refused) — a second, cheaper layer, never a substitute.

**Client-identity insulation: what is structural, and what is a WALL (GB-5).** v1 claimed "there
is no wire for client content to travel on". That is false at the signature:
`p_query`/`p_purpose`/`p_rationale` are model-authored free text, and v1's cell C.12 checked only
that no parameter is *named* `client_id` — review law 3's exact failure mode. Corrected (the cell
becomes Annex C's C.7e, a forced refusal; C.7f keeps the spelling check as a tripwire only):

- **Structural (an absence).** Neither verb takes a `client_id`, a client-name column, or any
  typed client handle. A future "web research with client identity" purpose is a NEW verb under a
  NEW TA-P3 purpose, never a widened parameter on these two.
- **A closed world (not free text).** `p_purpose` is a member of the CLOSED set
  `('regulatory_lookup','general_research')` at v1, refused `(CLR10, unknown_web_purpose)`
  otherwise, extended by later items the way `close_prep_holds`' purposes are. The free-text
  purpose channel is deleted outright.
- **A refusal predicate (a wall that can say no).** `clara._web_text_is_client_free(p_firm uuid,
  p_text text) returns boolean` runs inside `_web_read_core` over `p_query` **and** `p_rationale`
  before the runtime is authorised to call out. It refuses `(CLR10, client_identity_in_query)`
  when the normalised text contains a live client's registered name for the credential's own firm
  (`clara.clients`) or matches an identifier present in `client_identifiers` (SSM/TIN/bank-account
  shapes). The firm comes from the wake context, never from an argument (the split-trust
  corollary, `PRD.md:173`).
- **Stated honestly:** the predicate is **one-directional** — a match refuses; a non-match is not
  a certificate that no client content is present. It is a wall that CAN refuse, which is more
  than v1 had, and the design says so rather than claiming a closure it does not have. TA-P3's
  "identity-free lookups are not disclosures" holds *because* of this wall, not beside it.

**Law 75's third discipline, mechanised (GM-5).** `web_fetch_citations` carries a generated
`source_official boolean` (an official-domain list: `*.gov.my` incl. `bnm.gov.my`,
`hasil.gov.my`, `customs.gov.my`; plus `ssm.com.my`). It is **decorative for acceptance and
load-bearing only for prompt ordering** — official sources sort first into the model's context on
a rules question — and a battery cell proves it never changes whether a citation or a fetch is
accepted.

**`clara.web_fetch_receipts`** — new table, column shape modelled on **F-A2's PROPOSED
`entry_post_receipts`** (`f-a2-agentic-posting-design.md:216` — **not yet built; it exists in no
migration**, and v1's "(0037/F-A2)" cite attached an unbuilt proposal to an applied migration
number, GM-4): `acting_actor`, `on_behalf_of` (nullable), `via_wake_kind`, `model_snapshot`,
`rationale`, `purpose`, `op_key`, `created_at`. Append-only. **Named cross-item dependency:** if
F-A2's column shape moves under its own review, this one moves with it (§6.5).

**`clara.web_fetch_citations`** — new table, shape modelled on `wiki_page_citations`
(`0017:891-901`) **but sharing neither its enum nor its FK targets**: `id`, `receipt_id` (FK to
`web_fetch_receipts`), `url`, `accessed_at`, `quote`, `domain` (generated), `source_official`
(generated), `created_at`. Written by the SAME core, in the SAME transaction as the receipt.

**`t_web_fetch_receipt_needs_citation`** — a DEFERRED constraint trigger on `web_fetch_receipts`,
checked at COMMIT: at least one citation must reference the new receipt. **A Tier-D-shaped wall
by construction**, not a raisable precondition (the citations are written by the same core in the
same transaction, so there is no point before the row exists at which "zero citations" could be
checked). A violation aborts the transaction at commit and the calling task settles **failed**.
This is the mechanical form of TA-P4-M1's "a receipt with tool calls but zero citations is
refused."

**KB write path: there is none in v1 (§1's TA-P8 paragraph, and OI-1).** Tier-2 results answer in
chat (narrative, per TA-P10's framing for non-authoritative aggregates) and land in
`web_fetch_citations` for audit; they do not touch `wiki_page_citations`, whose `source_kind`
enum keeps its five members.

## 4 · Receipts and acting identity

Every act in §3 writes a receipt in the same transaction as its effect — TA-P4/A's "read/write
and receipt in one transaction; no receipt, no act."

- **Tier-1 submit**: the receipt lives on the `policy_drafts` row itself
  (`model_snapshot`/`rationale`/`submitted_at`/`minted_by_firm`) — a fetch-and-draft act has no
  separate effect to receipt against; the draft **is** the receipt until decided.
- **Tier-1 decide/override**: `_policy_draft_commit_core` stamps
  `decided_by`/`decided_at`/`decision_note` on the draft and writes the landed row's own
  `recorded_by`/`basis`/`basis_kind` trio — `basis_kind='owner_instruction'` for both arms;
  `basis` carries the two verdicts, the derived value and the source URLs as text, so a reader of
  the LIVE `fx_rates`/threshold row, **with no join**, sees it was owner-approved and why.
- **Tier-2 fetch/search**: `web_fetch_receipts` + `web_fetch_citations`, per §3.2.
- **Tier-1 fetch attempts (every cycle, any outcome)**: `tier1_fetch_attempts`, per §5.
- **`via_wake_kind`/`on_behalf_of` per lane (law 68, ARM-0).** A clock-triggered Tier-1 fetch is
  director-less by construction: `on_behalf_of` is **NULL because nobody instructed it**, never
  inferred as `false`. A chat-triggered Tier-2 call carries the chat turn's own `on_behalf_of`,
  mechanically bound to the triggering turn.
- **Read surface.** TA-P4's rider (a bookkeeper+ read surface over the receipt table) applies here
  as it does to F-A6: `policy_drafts`, `tier1_fetch_attempts`, `web_fetch_receipts` and
  `web_fetch_citations` each get a **SECURITY DEFINER typed reader with a `bookkeeper+` floor in
  the body and EXECUTE granted to `clara_authenticated`** — the `get_close_plan` idiom
  (`0064:154,280-285,312`), **never a raw `SELECT` grant on the base table** (Annex E's DDL
  posture: RLS + FORCE, one `clara_fn_owner` policy, zero direct app-role grants). Its own PR
  (§7, PR-5) — no new authority shape.

## 5 · Fetch health, missing rows, and backdated corrections

**`clara.tier1_fetch_attempts` — the health relation the contract requires (GM-9).** The contract
and F-A8-M2 impose **two** obligations, and v1 built only the first: a named point-of-use refusal
**and** "the table carries a fetch-attempt/health relation so 'nothing was fetched today' is
itself a readable record." v1 answered the second with "`policy_drafts` is itself a queryable
fetch-health record" — structurally false for exactly the case the ruling names: a zero-citation
attempt is refused `no_citation` at the door, so **no draft row ever exists** for a total fetch
failure. New append-only table, written by the runtime fetch job **outside** the draft door, one
row per cycle regardless of outcome: `id`, `table_key`, `attempted_at`, `outcome text check
(outcome in ('drafted','source_unreachable','unparseable','refused_by_guard','no_change'))`,
`detail jsonb`, `source_urls jsonb`, `model_snapshot`, `created_at`. It is a **record, not an
alert**: F-A8 v1 still builds no firm-scoped escalation (§8), but the silent-rot scenario — a
source whose page format changed, unnoticed for a month because nobody queried that key — is now
visible to a reader and to a future notifier.

**A missing row for the requested day REFUSES.** Any evaluator that needs a Tier-1 fact for a date
with no covering row gets a **named refusal at the point of use** — `rate_unavailable_for_date`
(a new CLR10 detail) — never a "use the nearest earlier row" fallback. The live-row predicate is
`effective_from <= d and (effective_to is null or effective_to > d)`. **The `>` is deliberate,
was attacked at the gate, and is upheld:** §3.1 closes a predecessor's `effective_to` to the
successor's own `effective_date`, a half-open interval `[from, to)`, whose only non-overlapping
read complement is `>`. The four live `sst_threshold_schedule` readers use `>=`
(`0016:568,618,883,1075`) and get away with it because three carry an
`order by effective_from desc limit 1` tie-break — **the fourth, `0016:882-886`'s `schedule_note`
`string_agg`, has no tie-break at all** and becomes a live double-count exposure the moment this
table has its first closing writer. It is named in the impact-scan consumer list below and PR-3's
battery carries a cell for it.

**A backdated correction** — a new draft whose `p_effective_date` is on or before an ALREADY-USED
date — triggers a downstream impact scan at approve/override time: the commit core enumerates
every consumer read that resolved the corrected key for a date the old row covered (a bounded,
read-only scan) and names the affected rows in the decision's `decision_note`/receipt for a human
to judge. **It does not auto-reverse or auto-repost anything** — TA-P2's own honest cost #4. The
consumer list is closed and named at build time (v1 left it fully open): the SST watch's
point-in-time reads `0016:568,618,883,1075`, **the no-tie-break aggregate at `0016:882-886`
explicitly**, and any future FX-lite posting consumer. Extending that list is
extend-never-weaken; a consumer that appears later and is not on it is a build defect, not a
silent pass.

## 6 · Cross-item sequencing obligations (stated, never assumed)

1. **The clocked-wake EXECUTION path does not exist today, and it is shared with F-A4.**
   `kind='wake'` `agent_tasks` are **born `held`** (`0011:1230`) and the ONLY legal transition is
   **`held → cancelled`** (`0011:1271`) — no `'wake'` task can ever run. **F-A8 does not ride
   F-A4's clock:** F-A4 mints its own credential kind `close_prep` through a sibling minter,
   leaves `mint_wake_credential` byte-unchanged, grants **zero** EXECUTE to
   `clara_wake_proactive`, and extends `ck_agent_tasks_kind_0011` with its own **task** kind
   (`close-key-1-annexes-1-mechanics.md:259,268,273`); F-A5 mints `bank_agent`; F-A2 mints
   `interactive_client`. **No sibling will populate `'proactive'`.** F-A8 does not need one to:
   `mint_wake_credential` (live tip `0011:1156-1195`, granted to `clara_runtime`) accepts
   `'proactive'` today with a firm and a NULL client, so **F-A8 owns its own trigger** and PR-2's
   scheduled job mints its own credential with no F-A4 dependency. **The obligation:** if that job
   must run as a durable `agent_task`, either the `'wake'` transition set or the task-kind CHECK
   plus the kind arms of `_tf_agent_task_insert` (`0011:1222-1243`) and `_tf_agent_task_update`
   (`0011:1248-1285`) — both of which end in `raise 'unknown task kind'` — must be extended. That
   is a CoR of two live judgement bodies, shared with F-A4, D1-relevant, and **owner item OI-2**;
   never a unilateral edit. *Fail-closed default the build proceeds on:* F-A8's fetch runs as a
   plain runtime job with **no `agent_tasks` row**; the credential, the receipt and the
   `tier1_fetch_attempts` row are the durable record.
2. **`chatTurn`'s `_vN`.** F-A2's PR-2 lands `chatTurn_v13`
   (`f-a2-agentic-posting-design.md:438-439`); the live tip is
   `registry.ts:46 chatTurn: chatTurn_v12`. F-A8's Tier-2 wire-up **hardcodes no predecessor
   version** — it re-cuts whatever the registry tip is at build time (Appendix A; never an
   in-place edit of a live `chatTurn.v<N>.tools.ts`). **Obligation:** the Tier-2 PR opens after
   F-A2's PR-2 merges, or rebases onto it; whichever lands second re-cuts.
3. **`wake_credentials`' CHECK pair.** F-A2's D34 extends BOTH `ck_wake_credentials_kind_0011` and
   `ck_wake_credentials_client_0011` **additively** — the three existing disjuncts stay
   byte-identical (`f-a2-annexes-2-mechanics.md:442`). So survey F9's "`'proactive'` forbids a
   client binding" (`0011:625-628`) stays true after D34, and this design cites it as **live at
   `0011:625-628`, additively extended by D34** — never as a standing closed world F-A8 may rely
   on unchanged.
4. **`llm_usage_events` leaves F-A8 entirely** (§7's width ruling). TA-P13 assigns the one
   metering ledger to **F-A9**, whose design already builds it (`metering-design.md`). F-A8
   records an **honest metering gap** until F-A9's door opens, then consumes it — never a
   fabricated `document_id`/`task_id`, and never a `firm_id` invented for a firm-independent fetch
   (`0094:55` is `not null` and TA-P13's specified widening does not touch it — **owner item
   OI-3**, F-A9's to rule).
5. **`entry_post_receipts`' column shape** is F-A2's unbuilt proposal (§3.2). If it moves under
   F-A2's own review, `web_fetch_receipts` moves with it.
6. **The SST rate table** is F-T1's schema; F-A8 attaches fetching once it exists (§1).

## 7 · Build sequence (revised at the gate — the width ruling)

**Why v1's PR-1 was too wide.** It bundled four new tables, six verbs across three roles, an ALTER
on a live shared reference table a standing estate test pins, the truing of a migration-era
assertion, AND a cross-item ALTER belonging to another item — two unrelated blast radii and two
unrelated review lenses (wrong-number and injection-surface) in one window. **No pure-extraction
limb exists** — F-A8 is greenfield, so that principle is discharged vacuously and the severance is
by blast radius and review lens instead.

1. **PR-0 · the gate. Leg 1 DONE 2026-08-22** — the independent judgement-logic review (law 1),
   two lenses, every finding adversarially verified; record `internet-lane-gate-record.md`; this
   document is the fold. **Leg 2 — the cross-model adversarial pass (law 28) — has NOT run**, and
   it is owed **before PR-2** (the first PR that makes an outbound call: Tier-1's own extraction
   reads attacker-influenced page text too), then extended before PR-4 for the chat surface.
2. **PR-1 · Tier-1 DB, greenfield only. No live shared table is touched.** `fx_rates`,
   `policy_drafts`, `tier1_fetch_attempts`; `_policy_extract_quoted_value`,
   `_policy_sources_agree`, `_policy_value_plausible`; `wake_submit_policy_draft` +
   `_policy_draft_submit_core`; `decide_policy_draft` / `override_policy_draft` +
   `_policy_draft_commit_core`; the ONE allowlist row `('proactive','wake_submit_policy_draft')`;
   Annex E's RLS/FORCE/owner-policy/zero-grant DDL on all three tables; Annex F's roster surgery
   (rig-meta `ALLOWED`, T17). `p_table_key`'s closed set is `{'fx_rates'}`. `UNNUMBERED_*`,
   numbered at merge (law 41). **D1: none predicted** — every artifact is new.
3. **PR-2 · Tier-1 runtime.** The outbound HTTP client (reusing `packages/runtime/lib/storage.mjs`
   / `packages/runtime/lib/reconciler-render.mjs` conventions), the resolved-address deny list,
   the scheduled fetch
   job minting its own `'proactive'` credential, and a manual one-shot trigger for acceptance.
   **Tier 1 goes live end-to-end on `fx_rates`, a table nobody reads yet** — the whole
   draft → checks → owner door → supersede path is proven where a mistake costs nothing.
4. **PR-3 · the `sst_threshold_schedule` limb, alone.** The surrogate-`id` + supersede + actor +
   basis ALTER (§3.1), the `source_note` write rule, `p_table_key` widened to admit the table, the
   **0016 tail-assertion truing** in its reachable-closure form (Annex F: the assertion must scan
   granted wrappers **plus the ungranted cores they call**, or the new writer is invisible to it —
   as v1's proposed truing would have been), the **`a21-watch.test.mjs:98-132` P1 re-cut** (a
   STANDING estate-suite census, not the one-time DO block v1 believed, and it pins the seed rows'
   `effective_to IS NULL`), and the `0016:882-886` no-tie-break cell. Rides a mechanism proven live
   in PR-2. **D1: none predicted** — ADD COLUMN + a unique index on a two-row table with a
   rig-replay-confirmed zero-writer population.
5. **PR-4 · Tier 2, DB + runtime + chat.** Only after leg 2 of PR-0. `web_fetch_receipts`,
   `web_fetch_citations`, the deferred trigger, the closed purpose world,
   `_web_text_is_client_free`, `wake_web_fetch`/`wake_web_search`/`_web_read_core`, the two
   allowlist rows, the `chatTurn` `_vN` wire-up (§6.2).
6. **PR-5 · the bookkeeper+ read surface** for both tiers (§4) — independently rollbackable.
7. **PR-6 · acceptance.** A real fetch cycle on `fx_rates` (and the threshold table if PR-3
   landed), a real owner approve AND a real override on real drafts, a Tier-2 fetch and search
   from chat with citations readable, the denominator stated (D37), `PROGRESS.md` updated.

## 8 · Risks and named non-goals

**Risks:** the endpoint-research gap (R1/ODQ-2) · the firm-independent-approver gap (R2/ODQ-1, now
mechanically narrowed by `minted_by_firm`) · **R3 re-cut: `'proactive'` is not merely
zero-populated — every sibling item mints its OWN kind, so no one else will ever populate it**
(§6.1) · R4 re-cut: the metering gap is now an accepted, recorded gap rather than a joint ALTER
(§6.4) · **R5 (new): `_web_text_is_client_free` is one-directional** — it refuses on a match and
certifies nothing on a miss (§3.2) · **R6 (new): the Tier-2 search VENDOR is unnamed** (ODQ-7).

**Non-goals, named so silence is not read as an oversight:**
- No SST *rate* table schema — F-T1's (survey F3). No model **price** table — F-A9's (§1).
- No client-identity-bearing web research purpose — a future item's, under its own TA-P3 purpose.
- No extension of `wiki_page_citations.source_kind` to admit `'web'`, and no KB write path of any
  kind in v1 — a **scope** choice with F-A7 named as the owner of the identity learning loop and
  of TA-P8's granted promotion door (§1, OI-1). Not a prohibition TA-P8 imposes.
- No `client_identifiers`/counterparty enrichment — TA-P8's general form.
- No income-tax bands, capital allowances, EPF/SOCSO/EIS, stamp duty or MTD tables.
- No firm-scoped active notification/escalation for a failed cycle — §5's health relation is a
  readable record, and `wake_record_notification` (already allowlisted for `'proactive'`,
  `0002:558`) is available, unused, for a future item that wants escalation.
- No per-firm capability dial — TA-P1's rider, and no mechanism exists to build one (survey F14).
  No amount routing, ramp, sampling or dark launch, ever — the standing G1.2 posture. No
  `llm_usage_events` ALTER and no metering write — F-A9's, entirely (§6.4).

## 9 · Annex map

`internet-lane-annexes.md` (v2, re-cut against this document): **Annex C** the battery (▣ =
contract-blind) · **Annex D** the decision register (IL-D1..IL-D16 + ODQ-1..ODQ-7) · **Annex E**
the table DDL posture · **Annex F** the census and roster surgery list · **Annex G** the
rig-replay obligations · **Annex H** the change log (the v1 → v2 fold table).
`internet-lane-survey.md` (v2) is the estate as-found, F1-F15. Law 29's acceptance obligations
ride PR-6 (§7).

## 10 · Change log

**v1, 2026-08-22.** First design pass, against the sitting rulings and the survey. Not gated.

**v2, 2026-08-22 — gate 1 folded (record: `internet-lane-gate-record.md`).** The gate ran one leg
— the independent judgement-logic review (law 1), two fresh-context lenses (bytes and rulings),
every finding adversarially re-verified by an independent verifier whose re-graded severity
governs. **Verdict: five blockers, nine materials; the width is severed; the document set is
reconciled.** What HELD, recorded so it is not re-argued: **§2's TA-P1 reasoning**, the
**owner-one-click-door-not-a-PR shape** and its by-name relaxation of `0016`, the **three-table
Tier-1 closure**, the **deferral of the SST rate schema to F-T1**, **citation as a tool-boundary
mechanism**, and **TA-P7's non-application**. The folds:

**The fold table — F1..F15 plus the nits and the refuted register — is `internet-lane-annexes.md`
Annex H**, one row per finding, naming the defect and the section that now carries it (the F-A2
precedent: a design at its harness ceiling keeps its change log in its record annex). The gate
record `internet-lane-gate-record.md` is that annex's own source, in English with file:line.
