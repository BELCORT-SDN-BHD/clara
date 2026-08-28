# 裁-18b — the Clara vendor-binding PROPOSAL door: ESTATE SURVEY (as-found)

> **The as-found record for the owner-ruled 裁-18b item** (`docs/plan/active/mohe-grill-rulings-2026-08-28.md`
> §裁-18(b)): *"build the Clara proposal door (a wake door proposing a binding from her own
> observation: stable fingerprint, repeatedly approved; rationale + model on the receipt) so
> agent-proposes → human-signs is the normal two-party shape, before beta, its own design gate +
> backend + frontend train."*
>
> **v1, 2026-08-29.** Companions: `binding-proposal-design.md` (the design of record) ·
> `binding-proposal-annexes.md` (verbs · battery · D1 · risks · shared surfaces) ·
> `binding-proposal-gate-record.md` (**OPEN** — the owner questions).
>
> **Method.** Every claim below is either a `file:line` into the repo at `main` `36c2fd50`
> (frontier `0142`) or a **RIG REPLAY** — a `pg_get_functiondef` / `pg_get_constraintdef` /
> catalog read taken from a throwaway `postgres:17` migrated to the same frontier, never from
> migration text (bodies here are spliced across `0028`→`0029`→`0030`→`0031`→`0046`→`0049`, and
> the text in any one file is not the live body). The rig: 137 migrations applied, latest
> `0142_fa7b_pr_a_client_onboarding_open`. **Unsettleable claims are carried as PREDICTIONS**
> (§7), never asserted.

---

## 1 · The one-paragraph as-found

The binding machinery is complete and healthy on the HUMAN axis and **structurally absent on the
agent axis**. `clara.propose_vendor_identity_binding` / `sign_vendor_identity_binding` /
`revoke_vendor_identity_binding` are `clara_authenticated`-only, `_human_ctx`-floored
(bookkeeper / admin / bookkeeper), and every content field of a binding is **already 100%
DB-derived** — the proposal verb accepts a strict two-key jsonb `{client_id, counterparty_id}`
and nothing else (S1). There is **no wake wrapper, no agent grant, and no allowlist row** for
any binding verb on any of the seven live wake kinds (S2). `created_by` carries **no foreign
key** and the estate already seeds a real agent user row (`clara.agent_user_id()` =
`00000000-0000-4000-8000-000000c1a7a0`, `display_name = 'Clara (agent)'`, `is_agent = true`), so
an agent-stamped proposal is admissible today with **zero schema relaxation** (S3) — which is
exactly what makes 裁-18a's signer≠proposer wall and 裁-18c's strict solo-firm wall satisfiable
by this door rather than blocked by it. Three findings shape the whole design: the derivation's
**content hash covers its evidence array**, so any change to the derivation invalidates every
open proposal (S4); the **post-time binding re-check no longer exists** — `execute_rule_post` was
retired at `0118` and nothing writes `vendor_binding_resolutions.phase='post'` any more (S5,
a live gap, not this item's to fix); and **nothing stops N open `proposed` rows** for one
(client, counterparty) pair, because the only uniqueness is `where status='live'` (S6).

---

## 2 · Findings

### S1 — every content field of a binding is ALREADY DB-derived; the proposal verb takes no model text

`clara.propose_vendor_identity_binding(p_proposal jsonb, p_op_key text)`
(`packages/db/migrations/0028_vendor_identity_binding.sql:706-796`) validates that `p_proposal`
is an object carrying **exactly** `client_id` and `counterparty_id` and refuses any other key
(`:721-729`, `binding_proposal_malformed` / `CLR36`). Everything durable then comes from
`clara._derive_vendor_binding_proposal(p_firm, p_client, p_counterparty)` (`:479-700`):
`f1_vendor_name_norm`, `f2_invoice_prefix`, `registration_at_signing`, `content_hash`, and the
three-row evidence array.

**Consequence for 裁-22.** The binding door is *not* in the class 裁-22 was written for. The
other two proposal doors (`propose_client_identifier_promotion`, `wake_propose_client_onboarding`)
persist a **model-supplied** `basis {sightings, citations}` after a shape-only check; this door
persists **no model-supplied field at all**. 裁-22's contract still binds — but it binds the
*new* agent surface (rationale, model, and whatever regions Clara says she read), never the
binding row. §3 of the design turns that into a stronger floor, not a weaker one.

**RIG REPLAY (prosrc sha256, live at `0142`):**

| body | prosrc sha256 | bytes |
|---|---|---|
| `clara.propose_vendor_identity_binding(jsonb,text)` | `610ef1dfc18f963122ed2012e49a96b06526b93baca2f269fa054a76302f7fc7` | 3374 |
| `clara.sign_vendor_identity_binding(uuid,text)` | `bff40d61c1df2db40062f592b1c5c65b468934f5796cb0c8a3d4be4a7594312e` | 3244 |
| `clara.revoke_vendor_identity_binding(uuid,text,text)` | `b0b566b36d84b17469425a86fdfd4c68fcaebea6dd793b3edb2f1bce609433ce` | 2100 |
| `clara._derive_vendor_binding_proposal(uuid,uuid,uuid)` | `de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c` | 8059 |
| `clara._resolve_vendor_binding(uuid,uuid,uuid)` | `ed60c1aa3dbd8b3b02964ba843bdd906429e0ff5f4e36f52c15064e6c8ce23c2` | 4627 |
| `clara._binding_common_prefix(text,text,text)` | `595355199b172b648883d30cbbf8b382ab9c63730e7b585aa86ab0b347b0e9e7` | 415 |
| `clara._binding_f3_holds(uuid,text,text)` | `8c4e3c2576ac6bb2b290b8e691cc0b37e2be73df2d68789e4d151df1d3b370cd` | 2790 |
| `clara._coding_lane_core(uuid,uuid)` | `721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda` | 13584 |
| `clara.get_vendor_binding(uuid)` | `ce1e8bc460a4caac4b23c524987f0654a38015ac429759c6c77d91c03cf954a7` | 1558 |
| `clara.list_vendor_bindings(uuid)` | `53a0d3fcd9f37fe9a23aebf9862e9adb2af316dfaf2aef3d97b2aaf7ffa0c7fe` | 1216 |
| `clara.agent_user_id()` | `0b958c48cabc128809ec5735bc8139bf6382c6eaec29768cd6ffcc2165cbbeb1` | 53 |
| `clara.wake_context()` | `fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d` | 705 |
| `clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)` | `c494bad00c6c2326ab037ed0185caa8d611240bff68d4feb08fb4f6fe7f91839` | 1599 |
| `clara.eligible_checker_count(uuid)` | `1afd4710c1dbf1fdf605623899db750393cc1ce7ff5e1e8e0f840be61d9170e4` | 233 |

### S1a — the derivation's ladder, in the order it refuses (RIG-READ, `0028:479-700`)

`binding_client_unavailable` → `binding_counterparty_inactive` (canonical, `kind='vendor'`,
un-merged, un-retired) → `binding_unattributable` (blank `registration_normalized`) → the window
(3 most recent APPROVED, un-reversed, `checked_via_rule_id is null`, document-bearing entries
whose lines canonicalise to this counterparty) → `insufficient_evidence` (`< 3`) →
`window_too_recent` (`distinct posting_date <> 3` or span `< 14` days) → per-item
`binding_unattributable` / `binding_no_corroboration_source` / `evidence_restated`
(an extraction restated after approval) → `features_unstable` (F1 not identical across all 3) →
**F1 = the windowed longest common prefix, floored** and **F2 = the invoice-id common prefix**,
with `length(F2) >= 6`, `>= 3` alphabetic characters, and a 14-member generic-leading-token
denylist (`inv`, `invoice`, `bill`, `tax`, `doc`, `no`, `rcpt`, `receipt`, `cn`, `dn`, `so`,
`po`, `binv`) → `prefix_too_weak` → per-document `_binding_f3_holds` (a top-25%-of-page-one OCR
region containing either the registration or the name) → `binding_uncorroborated` →
`binding_conflict` (a live, unexpired binding already exists).

**This ladder is the evidence floor.** It is deterministic, DB-owned, and already refuses on
every absence. The agent door does not re-implement one line of it (design §3.2).

### S2 — zero agent reach: no wake wrapper, no grant, no allowlist row

**RIG REPLAY, ACL census on the five binding doors** — every one is exactly
`clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner`:
`propose_vendor_identity_binding`, `sign_vendor_identity_binding`,
`revoke_vendor_identity_binding`, `list_vendor_bindings`, `get_vendor_binding`. No
`clara_wake_*`, no `clara_agent_ro`, no `clara_runtime` grantee anywhere.

**RIG REPLAY, `clara.wake_fn_allowlist`: 88 rows over 7 kinds** — `autodraft` (6),
`bank_agent` (14), `close_prep` (13), `filing` (6), `interactive` (32), `interactive_client` (15),
`proactive` (1, `wake_record_notification` only, PRD §6 invariant 11 in the data). **Not one row
names a binding verb.**

**RIG REPLAY, the live wake-kind world** (`clara.wake_credentials`, two CHECK pairs):

- `ck_wake_credentials_kind_0011` — `wake_kind in ('interactive','proactive','autodraft','interactive_client','close_prep','bank_agent','filing')`.
- `ck_wake_credentials_client_0011` — the client-congruence pair: `autodraft`,
  `interactive_client`, `close_prep`, `bank_agent` require `client_id IS NOT NULL`;
  **`interactive`, `proactive` and `filing` require `client_id IS NULL`.**

**RIG REPLAY, roles (14 `clara*` roles):** `clara_wake_interactive` (login
`clara_wake_write_login`), `clara_wake_proactive`, `clara_wake_filing`, `clara_wake_bank`
(login `clara_wake_bank_login`), plus `clara_agent_ro`, `clara_freeform_ro`, `clara_runtime`,
`clara_authenticated`, `clara_fn_owner`.

**S2a — there is no `clara_wake_autodraft` role, and `autodraft` is not a GRANT boundary.**
Measured: `coding_lane(uuid,uuid)` is EXECUTE-able by `clara_agent_ro` and `clara_authenticated`
only; `wake_draft_entry` / `wake_post_entry` / `wake_open_question` are `clara_wake_interactive`
only. So for the `autodraft` kind the **allowlist is the entire wall** (PRD §6 invariant 2(c)),
with the GRANT split (2(d)) supplied by `clara_wake_interactive`. This is a load-bearing fact for
design question (1): choosing `autodraft` buys no grant separation, whereas `filing` already owns
a dedicated role.

**S2b — a wake wrapper may legitimately be granted to two roles.** Measured:
`clara.wake_file_document(uuid,uuid,jsonb,text,jsonb,uuid,text)` is EXECUTE-able by **both**
`clara_wake_filing` and `clara_wake_interactive`, with the per-kind allowlist doing the
discrimination. The estate therefore already carries the precedent the design's two-trigger
shape needs.

### S3 — `created_by` is FK-free and the agent user row exists · 裁-18a is satisfiable

**RIG REPLAY, `clara.vendor_identity_bindings` constraints** — 10 total, and the only foreign key
is `fk_vib_counterparty (counterparty_id, firm_id, client_id) → clara.counterparties`. There is
**no FK on `created_by`, `signed_by` or `revoked_by`**.

**RIG REPLAY, `clara.users`** — columns `id, display_name, email, is_agent, created_at`; exactly
one row with `is_agent = true`: `00000000-0000-4000-8000-000000c1a7a0` / `'Clara (agent)'` /
`email IS NULL`. `clara.agent_user_id()` is `LANGUAGE sql IMMUTABLE` returning that literal.

**Consequences.**
1. `created_by = clara.agent_user_id()` needs **no schema change** and stamps a real, honest,
   `is_agent`-true user row — not an orphan uuid.
2. 裁-18a's wall (`signed_by <> created_by`) is then satisfied *by construction* for every
   agent-proposed row, so **any** human admin may sign — which is precisely the escape 裁-18c's
   strict solo-firm wall requires.
3. Because `agent_user_id()` is IMMUTABLE and relation-free, it is legal inside a table CHECK —
   see design §3.4's honesty wall.

**S3a — the solo-firm predicate already exists, at the wrong floor.**
`clara.eligible_checker_count(p_firm)` counts active memberships joined to `clara.users` with
`role_rank(m.role) >= role_rank('bookkeeper')` **and `u.is_agent = false`**. It is the estate's
"how many real humans could check this" predicate and it already excludes Clara. Its floor is
**bookkeeper**, while the binding signer floor is **admin** — so 裁-18a/裁-18c's message-naming
logic needs an admin-floor sibling or an explicit rank argument. Recorded for that lane, not
built here (annexes E, risk R5).

### S4 — the content hash covers the evidence array: the derivation is effectively frozen

`content_hash = sha256(jsonb_build_object('f1_vendor_name_norm', 'f2_invoice_prefix',
'registration_at_signing', 'evidence')::text)` (`0028:683-688`), where `evidence` is the
per-entry array stripped of `approved_at`, the two `*_restated` flags and the two per-item norms
(`0028:675-681`). `sign_vendor_identity_binding` **re-derives and compares all five fields plus
the stored evidence** and raises `proposal_drifted` on any difference (`0028:841-864`).

**Therefore: adding a single key to the derivation's evidence items — a `document_regions` id,
say — changes `content_hash` for every future derivation and makes every already-`proposed` row
un-signable.** The design does not touch `_derive_vendor_binding_proposal`; it adds a
**non-hashed sibling** (design §3.2, D1 §J).

### S5 — the POST-time binding re-check NO LONGER EXISTS (live gap; NOT this item's to fix)

The brief for this lane cites "the post-time re-check in `execute_rule_post`'s successor". At the
bytes there is no successor holding it.

**RIG REPLAY:** `to_regprocedure` finds **no** `clara.execute_rule_post` and no
`clara._execute_rule_post_core` (the rules tier retired whole at
`0118_f_a2_cutover_retirement.sql`). The only bodies that INSERT into
`clara.vendor_binding_resolutions` are `clara._draft_entry_core(...19 args)` and
`clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)`, and the only `phase` literals
either of them writes are `'draft'` and `'revision'`. **Nothing writes `phase='post'`.**
`clara._approve_entry_core(jsonb,uuid,uuid,text,text)` does not mention `vendor_binding` at all.
The `check (compared_to_resolution_id is null or phase='post')` arm of
`ck_vbr_compared_phase` (`0028:146-147`) is consequently unreachable.

**What this means in practice:** the binding is re-checked when Clara DRAFTS and when a human
REVISES, but a binding revoked between draft and approval is not re-checked at approval. The
`_coding_lane_core` Slot-A resolution (`vendor_bound` → lane `ready`) is likewise a draft-time
fact. **Recorded as finding, raised as gate question G6** — it is a 裁-18-family gap, but fixing
it replaces `_approve_entry_core`, a heavily-shared audited writer, and that is not this item's
blast radius.

### S6 — nothing bounds the number of OPEN proposals

**RIG REPLAY:** the only unique index on the table besides the pkey and
`uq_vendor_bindings_id_firm_client` is `uq_vib_one_live on (client_id, counterparty_id) where
status='live'` (`0028:84-86`). A second, third and Nth `status='proposed'` row for the same
(client, counterparty) pair is admitted. Today that is a UI annoyance; the moment Clara proposes
on an event it becomes a **loop** (she re-proposes on every subsequent invoice from the same
vendor). The design closes it (§3.4 W4) in a way that needs **no body change**, because
`propose_vendor_identity_binding` already wraps its INSERT in
`exception when unique_violation then raise 'binding_conflict'` (`0028:770-772`).

### S7 — the receipt-surface registry: 8 members, two closed-world regexes, and neither existing table fits

**RIG REPLAY, `clara.agent_receipt_surfaces` (8 rows):**

| item | receipt_kind | shim_relname | expected_source |
|---|---|---|---|
| `f_a2` | `entry_post` | `_agent_receipt_src_f_a2` | `entry_post_receipts` |
| `f_a3` | `bank_agent` | `_agent_receipt_src_f_a3` | `bank_agent_receipts` |
| `f_a4` | `agent_act` | `_agent_receipt_src_f_a4` | `agent_act_receipts` |
| `f_a5` | `report_agent` | `_agent_receipt_src_f_a5` | `report_agent_receipts` |
| `f_a6` | `freeform_read` | `_agent_receipt_src_f_a6` | `freeform_read_log` |
| `f_a7` | `agent_filing` | `_agent_receipt_src_f_a7` | `agent_filing_receipts` |
| `f_a7b` | `onboarding_agent` | `_agent_receipt_src_f_a7b` | `onboarding_agent_receipts` |
| `f_a8` | `web_fetch` | `_agent_receipt_src_f_a8` | `web_fetch_receipts` |

The two closed-world CHECKs, byte-exact from the live catalog:
`agent_receipt_surfaces_item_check` = `CHECK ((item ~ '^f_a[0-9]+[a-z]?$'::text))` and
`agent_receipt_surfaces_shim_relname_check` =
`CHECK ((shim_relname ~ '^_agent_receipt_src_f_a[0-9]+[a-z]?$'::text))` — both widened by
`0142` from their digits-only predecessors. `clara.agent_receipt_contract` pins the 19-column
shape; `clara._agent_receipts_all` is the 8-arm union; `clara.agent_receipts_visible` reads
`r.*` from it and is the ONLY `clara_authenticated` receipt read.

**Neither existing table can host a binding proposal.** Measured:

- **`agent_filing_receipts` (f_a7)** carries `document_id NOT NULL` and
  `ck_agent_filing_receipts_filed_iff_clean CHECK ((filing_id IS NOT NULL) = (failing_rungs =
  '{}'))`. A binding proposal has **three** documents and **no** filing, so a clean
  (zero-failing-rung) binding receipt is *structurally impossible* here without relaxing the very
  CHECK the W2/W3 close named as the vacuous-relaxation exemplar (lesson ③). Refused.
- **`agent_act_receipts` (f_a4)** carries `subject_id uuid NOT NULL`, `client_id NOT NULL`,
  `wake_task_id uuid NOT NULL REFERENCES clara.agent_tasks(id)`, plus two closed-world CHECKs
  (`act_kind` — 9 close/prepayment values; `ck_aar_subject_kind` — 7 values) and the trigger
  `clara._tf_assert_close_agent_receipt()`. Reuse would widen two close-domain closed worlds AND
  mandate an `agent_tasks` row, which the human-asked (chat-turn) trigger does not have. Refused.

→ **A ninth registered member is the honest answer** (design §3.5; the registry-key question is
gate question **G4**).

### S8 — the frontend as-found: the admin vendor-bindings panel exists, PR-e does not, and the copy now says the opposite of 裁-18a

Measured in `apps/web` (T10, merged as PR #395):

- `apps/web/app/(firm)/admin/vendor-bindings/page.tsx:13-22` mounts
  `VendorBindingsPanel` (`apps/web/components/firm-admin/vendor-bindings-panel.tsx:23`), which
  holds a client picker, calls `listVendorBindings` → `list_vendor_bindings` (`:56`) and renders
  `VendorBindingRowActions` per row plus an always-mounted `ProposeBindingDialog` (`:67`).
- `apps/web/components/firm-admin/vendor-binding-ceremony.tsx` — `VendorBindingDetailView`
  (`:68-106`) calls `getVendorBinding` → `get_vendor_binding` and renders
  `detailProposedBy` (`shortId(created_by)`), `detailProposedAt`, `detailEvidenceCount`,
  `detailResolutionsCount`, `detailFingerprintHash` (`content_hash.slice(0,16)`). It is mounted
  inside **both** the Sign dialog (`:146`) and the Revoke dialog (`:179`). Sign is offered only
  at `status === "proposed"` (`:137`); Revoke only at `status === "live"` (`:149`).
- **The copy T10 trued is now the exact opposite of 裁-18a's ruling.** `apps/web/messages/en.json:1915-1917`:
  `"signDescription": "Signing makes this binding LIVE — future invoices from this vendor
  auto-bind to the counterparty it names. Requires admin; the same admin who proposed it may
  also sign it."` and `en.json:1898`: `"Propose, sign and revoke a vendor's identity binding.
  Signing requires an admin — propose and sign are rank-gated, not required to be different
  people."` Both were correct against the live signer at T10's merge and become **false the day
  裁-18a lands**. Recorded as a cross-lane obligation (annexes G).
- **PR-e is not built.** `docs/plan/active/fa7b-onboarding-annexes.md:19` scopes PR-e as *"the
  surfaces — the design's §3 screens: `/needs-you` proposal card…"*, and `PROGRESS.md` has only
  PR-a building. No `ProposalCard`, no `p_basis` consumer and no "basis unresolved" copy exists
  anywhere under `apps/`. The nearest live surface is `apps/web/components/firm/firm-question-row.tsx`
  over `firm_open_questions_visible`.
- **`vendor_binding` is not a review-queue `row_kind`.** `apps/web/lib/firm/needs-you.ts:57-66`
  pins `REVIEW_QUEUE_ROW_KINDS` at eight: `draft, uncoded_filing, open_question, coding_task,
  compliance_watch, lint_finding, fixed_asset_incomplete, staff_advance_incomplete`. 裁-17 is
  minting the **ninth** (`seeding_proposal`). Any binding-proposal inbox row is the **tenth** and
  collides with that lane on `clara.list_review_queue` — sequencing is gate question **G5**.
- The typed-parts registry is `apps/web/lib/parts/types.ts:102-120` (the 18-member `ClaraPart`
  union) + `apps/web/lib/parts/catalog.ts:27-130` (`PART_CATALOG`, with the compile-time
  `AllCovered`/`NoExtra` exhaustiveness guard at `:142-147`). The needs-you affordance table is
  `apps/web/components/firm/needs-you-affordances.tsx:69-95` (`NEEDS_YOU_AFFORDANCES`, lookup
  `getNeedsYouAffordance` `:109-112`).

### S9 — the wake-wrapper idiom is settled, and only ONE proposal door takes an egress authorization

**RIG REPLAY across all six live `wake_propose*` verbs** — `prosrc LIKE
'%firm_egress_dispatch_authorizations%'`:

| verb | takes an egress authorization |
|---|---|
| `wake_propose_bank_identifier_promotion(uuid,uuid,text,text,integer,text,jsonb,text,text)` | **no** |
| `wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)` | **no** |
| `wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)` | **yes** |
| `wake_propose_close(uuid,jsonb,text,text,jsonb,text)` | **no** |
| `wake_propose_filing_correction(uuid,uuid,uuid,text,text,jsonb,text)` | **no** |
| `wake_propose_identifier_promotion(uuid,text,text,integer,jsonb,text,jsonb,text)` (superseded by the 9-arg `(uuid,uuid,text,text,integer,jsonb,text,jsonb,text)` -- 裁-22 added `p_document`, `UNNUMBERED_proposal_basis_resolved.sql`; the egress-authorization finding below is unaffected, the DROP+CREATE did not touch it) | **no** |

The one that does is the **intake-time** door: it proposes from a not-yet-attributed document, so
`firm_narrow_intake` / `moment='attribution'` is the authority that let the bytes leave. The
other five reason over already-attributed DB facts. **The binding door is in the second class**,
so it needs no authorization — which matters, because the live purpose CHECK is
`ck_firm_egress_dispatch_authorizations_purpose_f_a7 CHECK (purpose = 'firm_narrow_intake')`
and the moment CHECK is `moment in ('attribution','onboarding_interview')`: taking one would
force a **shared-surface widening** of the egress purpose CHECK for no security gain.

**The wrapper idiom itself** (`0142:360-503`, and `wake_propose_identifier_promotion` read live):
`select * into w from clara.wake_context()` → refuse `w.credential_id is null` (`CLR03`) →
`perform clara.assert_wake_allowed(w.wake_kind, '<fn>')` → typed `CLR10` refusals for a blank
`p_op_key`, a blank `p_rationale` and a `p_model` missing any of `provider`/`model`/`version` →
**reserve first** (`clara._reserve_op`, deliberately ahead of every state-dependent check, so a
genuine replay short-circuits before it can re-read its own side effects — 0142's own rig
lesson, `:415-432`) → the walls → the delegation, stamping `clara.agent_user_id()` as the actor
and `w.on_behalf_of` → `clara._finish_op`.

### S10 — `_coding_lane_core` is where the binding meets the lane, and it is a 13.5 KB shared body

**RIG REPLAY** of the live Slot-A section: when a vendor name resolves but
`_resolve_counterparty` returns no non-birth decision, the lane calls
`clara._resolve_vendor_binding(p_client, f.document_id, v_page_candidate)`; on
`outcome='bound'` it sets the counterparty and appends `vendor_bound`; the ambiguous/unresolved
arms append `binding_ambiguous` (hard) or fall back to the pre-binding default. The lane verdict
(`0031:520`) is `elsif coalesce(array_length(array_remove(array_remove(v_reasons,'rule_backed'),'vendor_bound'),1),0)=0 then lane:='ready'` — i.e. **`vendor_bound` is the reason that lets a
document reach `ready` with no human eye**, which is precisely why 裁-18 calls the binding "the
human-signed authority that lets Clara auto-post".

`_coding_lane_core(uuid,uuid)` is read by `clara.list_review_queue`
(`left join lateral (select * from clara._coding_lane_core(e.client_id, e.filing_id)) ln`) and is
a shared surface many lanes CoR. **The design touches it in exactly one optional place** and
recommends against even that (design §3.6 / gate question **G3**).

---

## 3 · Closed-world censuses run (each re-runnable)

| # | census | result at `0142` |
|---|---|---|
| C1 | `clara.wake_fn_allowlist` full enumeration | 88 rows / 7 kinds; **0** binding rows |
| C2 | EXECUTE grantees on the 5 binding doors | `clara_fn_owner` + `clara_authenticated` only, all five |
| C3 | `clara.vendor_identity_bindings` constraints | 10; **no FK on `created_by`** |
| C4 | `clara.users` where `is_agent` | exactly 1 row, the `…c1a7a0` sentinel |
| C5 | `clara.agent_receipt_surfaces` | 8 rows; both regexes `^f_a[0-9]+[a-z]?$` / `^_agent_receipt_src_f_a[0-9]+[a-z]?$` |
| C6 | `clara.agent_receipt_contract` | 19 columns, ordinal 1-19 (`receipt_kind`…`scope`) |
| C7 | bodies INSERTing `vendor_binding_resolutions` | 2 (`_draft_entry_core`, `revise_entry`); phases written: `draft`, `revision` only |
| C8 | `to_regprocedure('clara.execute_rule_post…')` | **absent** |
| C9 | six `wake_propose*` verbs × egress-authorization use | 1 of 6 (`wake_propose_client_onboarding`) |
| C10 | `clara*` roles | 14; no `clara_wake_autodraft` |
| C11 | `clara.wake_credentials` CHECK pair | 7 kinds; `filing`/`interactive`/`proactive` ⇒ `client_id IS NULL` |
| C12 | `clara.wake_engine_sources` (G1) | 2 rows (`bank_agent`, `close_prep`), **both `enabled = false`**; carriers `wake_outbox` / `direct_queue` |
| C13 | `REVIEW_QUEUE_ROW_KINDS` (frontend) | 8 (`apps/web/lib/firm/needs-you.ts:57-66`) |
| C14 | bodies mentioning `is_agent` | 33, incl. `clara.eligible_checker_count(uuid)` |

---

## 4 · The G1 wake engine, as-found

`clara.wake_engine_sources` (`packages/db/migrations/0133_g1_wake_engine.sql`) is the registry a
new *unattended source* would join: `source_key, carrier, event_type, task_kind, wake_kind,
workflow_export, login_pool, max_attempts, enabled, disabled_reason, enabled_by/at,
disabled_by/at, created_at`. It holds two rows today — `bank_agent` (carrier `wake_outbox`,
event `bank.agent_due`, export `bankAgent`, pool `bank`) and `close_prep` (carrier
`direct_queue`, export `closePrep`, pool `runtime`) — and **both are `enabled = false`**.

**Consequence for design question (1)'s trigger half:** a *sweep* trigger for binding proposals
would be a third `wake_engine_sources` row plus a workflow export plus a login pool — the F-A3
cost, paid for a behaviour that an existing lane can carry as an event. The design does not take
it (§3.1), and records the sweep as the named future extension (annexes E, non-goal N3).

---

## 5 · What the survey did NOT find (absences, with the search that would have found them)

| # | absence | the search |
|---|---|---|
| A1 | any wake wrapper over a binding verb | `pg_proc` where `proname ~ 'vendor_binding|wake.*vendor'` → 4 rows, all human/internal (`_derive_…`, `_resolve_…`, `get_vendor_binding`, `list_vendor_bindings`) |
| A2 | any DB wall reading `created_by` in the sign path | live `sign_vendor_identity_binding` body: `created_by` does not appear |
| A3 | a `declined` transition | `status` CHECK admits `'declined'`; **no verb ever writes it** (`prosrc ~ 'declined'` over the binding family → none) |
| A4 | an expiry sweep | `status='expired'` is written only opportunistically inside `propose_` (`:750-754`) and `sign_` (`:834-839`), never on a clock |
| A5 | a binding read on the agent side | no `clara_agent_ro` grant on `list_vendor_bindings` / `get_vendor_binding` |
| A6 | any `vendor_binding` part type or row_kind in the UI | `apps/web/lib/parts/types.ts` union (18) and `REVIEW_QUEUE_ROW_KINDS` (8) — neither names it |

**A3 and A4 are live product gaps** (a human cannot *decline* a proposal — only let it rot; an
expired proposal is only noticed by the next proposer). They are in this item's neighbourhood and
gate question **G7** asks whether they ride.

---

## 6 · The four rulings this survey binds to

- **裁-18(a)** — the signer≠proposer wall, a writer-body change on the pre-beta hardening batch.
  *Not this item.* Interlock: annexes G.
- **裁-18(b)** — **this item.**
- **裁-18(c)** — the strict solo-firm wall: a manual self-propose + self-sign is REFUSED with a
  verbatim message naming the two ways out (let Clara propose · add a second admin). *Not this
  item's migration*, but **this door is the first of the two ways out**, so 裁-18b must land
  before or with 裁-18a/c or the wall strands single-admin firms. Sequencing: annexes G.
- **裁-22** — proposal bases become DB-resolved citations, **both doors in ONE migration pair,
  before beta**, using the shared resolver the `db-proposal-basis` lane is building. This door is
  designed *against that contract* (design §3.3) and adds a third consumer to it.

---

## 7 · Predictions carried for rig replay (unsettleable at survey time)

| # | prediction | how the build settles it |
|---|---|---|
| P-1 | Adding `create unique index … where status='proposed'` produces `binding_conflict` (not a raw 23505) from the human `propose_` verb, because its handler catches `unique_violation` generically. | A rig cell: two `propose_` calls on one pair; assert `CLR36` + `binding_conflict`. |
| P-2 | `check (proposed_by_agent = (created_by = clara.agent_user_id()))` is accepted by PostgreSQL 17 (the function is `sql IMMUTABLE`, relation-free) and validates the existing rows. | Apply on a seeded rig with pre-existing human proposals; assert the ALTER succeeds and a lying INSERT is refused by name. |
| P-3 | `get_vendor_binding`'s `to_jsonb(b)` picks up new columns with **no** body change, so only the receipt join needs a CoR. | Rig: add the columns, call `get_vendor_binding` before the CoR, assert the new keys are present under `binding`. |
| P-4 | A `filing`-kind credential can call the new wrapper and an `interactive`-kind credential can too, while `proactive`, `bank_agent`, `close_prep`, `autodraft` and `interactive_client` are refused by `assert_wake_allowed` — **proved with a real credential through the executor role**, not by reading the allowlist. | Battery cells B1-B7 (annexes C). |
| P-5 | The derivation's `binding_conflict` rung already prevents a proposal when a live binding exists, so the agent door needs no second liveness check. | A rig cell that signs one binding then re-proposes and asserts `binding_conflict` from the derivation, not from the index. |
| P-6 | `_derive_vendor_binding_proposal` is byte-unchanged by this item's whole train (prosrc `de0f5807…`). | A tail self-proof pin in every migration of the train + a battery cell. |
