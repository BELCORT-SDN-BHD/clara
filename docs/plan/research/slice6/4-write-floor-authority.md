# Lane 4 — Authority model for a write-capable floor (ground-truth brief)

Scope: what the DB + runtime already enforce for an agent-identity write, and the exact
option space for Slice-6's chat-initiated coding write (one supplier bill → one balanced
DRAFT → `je_review` card → human approve with revision token). FACTS only; no design.

**One-line verdict.** The sanctioned agent-write path already exists end-to-end IN THE DB
(`wake_draft_entry` → shared `_draft_entry_core`, granted to `clara_wake_interactive`,
allowlisted, freshness- + provenance-gated, produces a DRAFT only). The genuine S6 gap is
purely RUNTIME plumbing: **there is no login/pool wired to `clara_wake_interactive`** — the
two-login pool (`pools.mjs`) only reaches `clara_runtime` and `clara_agent_ro`. The write
floor = wiring a wake-WRITE connection (fresh per-attempt credential, txn-local secret,
`SET ROLE clara_wake_interactive`, NOT read-only) to the writer that is already built.

---

## (a) Per-wake allowlist mechanics as-built

- **Where it lives.** `clara.wake_fn_allowlist(wake_kind text, function_name text, pk(wake_kind, function_name))` — `0002_foundation.sql:247-251`. A belt *on top of* the per-role EXECUTE grants (comment `0002:245-246`).
- **Who writes it.** It is a **schema structural constant**, seeded in-migration (`0002:553-559`), NOT runtime-mutable — no app role holds INSERT/UPDATE/DELETE on it, and it gets **no app RLS policy at all** (invisible to app roles; `0002:522-524`). Slice 5 edited it in-migration: `0007:1098-1100` deletes the `wake_ingest_document` row when that writer was retired.
- **Current rows (after 0007):** interactive → `wake_draft_entry`, `wake_record_client_resolution`, `wake_record_notification`; proactive → `wake_record_notification`. (`wake_ingest_document` removed.)
- **How authority is checked in-DB.** `clara.assert_wake_allowed(p_wake_kind, p_fn)` — `0004_governed_fns.sql:114-121` (SECURITY DEFINER): `perform 1 from wake_fn_allowlist where wake_kind=… and function_name=…`; not-found → RAISE **CLR03**. Called at the top of every wake entry after `wake_context()` resolves the credential (e.g. `wake_draft_entry` `0004:625`, and the 0005-recreated version `0005:1100`).
- **The real wall is the GRANT, not the allowlist.** Wake writers are `grant execute … to clara_wake_interactive` (`0004:783-788`); `wake_record_notification` also to `clara_wake_proactive` (`0004:789`). The allowlist + `wake_context()` credential check are two additional belts. (ADR-015: agent-never-signs is the **absence** of an entry point, not a runtime check — there is no `wake_approve_entry`.)
- **Wake-only or extensible to chat?** The mechanism is bound to the **wake-credential identity model**: `wake_kind ∈ {interactive, proactive}` (CHECK `0002:232`), resolved from the `clara.wake_secret` GUC by `wake_context()` (`0002:362-383`). There is **no separate "chat-write" identity or allowlist** — the wake lane IS the sanctioned agent-write path (ADR-015, PROJECTLOG:70-72). A chat-initiated write today would have to present AS an interactive wake credential to reach `wake_draft_entry`. Extensible in principle (add a row), but a new row only authorizes an existing wake-credential lane; it does not create a new identity.

## (b) Two-login pool contract + wake_secret GUC txn-local law (ADR-017 / MEDIUM-14)

- **Two logins, two roles, SET ROLE immediately (N10):** `clara_runtime_login → SET ROLE clara_runtime`; `clara_agent_read_login → SET ROLE clara_agent_ro` + `default_transaction_read_only=on` (`pools.mjs:1-34`, `setupSql` 109-115, `checkout` 152-181). Each login is a member of **exactly one** group, `WITH SET TRUE, INHERIT FALSE` (`0006:71-79`) — privilege never leaks to the bare login; the login can only SET ROLE to its one group.
- **wake_secret is TXN-LOCAL, full stop.** `withReadWakeScoped(secret, fn)` (`pools.mjs:233-247`): `begin` → `select set_config('clara.wake_secret', $1, true)` (parameterised SET LOCAL — the secret never enters SQL text / no log surface) → run fn → `rollback` (ends the read-only txn, drops the GUC). Session GUCs are re-issued per checkout and wiped by `RESET ALL` on release; any connection-level error `release(true)` DESTROYS the physical connection (P4, no SQLSTATE branching, `pools.mjs:152-181`).
- **The recorded law (PROJECTLOG:116, MEDIUM-14):** "the wake-secret txn-local property is a **runtime pool contract (Slice 4), not DB-enforceable** — the DB trusts the `clara.wake_secret` GUC within a request." Plaintext secret **must never cross a WDK step boundary** (`pools.mjs:48-50`); mint per execution attempt (`mintWakeCredential` → `clara.mint_wake_credential`, 5-min TTL, `pools.mjs:205-222`; DB mint `0004:687-704`).
- **Discipline a WRITE-capable coding flow must copy exactly:** (1) mint a fresh short-TTL wake credential per attempt on `clara_runtime`; (2) bind the secret **txn-local** (`set_config(..., is_local=true)`), never session-level, never inline in SQL; (3) do the write in that same txn; (4) **COMMIT** (a write, unlike the read path's rollback) then RESET; (5) never persist/return the secret, never carry it across a step. The write connection **must NOT set `default_transaction_read_only`** and **must `SET ROLE clara_wake_interactive`** (not `clara_agent_ro`, not `clara_runtime`).

## (c) Structural read-only agent law — who holds EXECUTE on a writer TODAY, and the ONLY lawful shapes

**EXECUTE-on-a-writer matrix (from the grant blocks in-migration):**

| Role | Writers it can EXECUTE | Cite |
|---|---|---|
| `clara_authenticated` (humans, via PostgREST) | All human books writers: `draft_entry`, `approve_entry`, `reverse_entry`, `create_firm/create_client/upsert_account`, `add/set/remove_member`, `record_client_resolution`, `record_notification`; runtime governance `cancel_agent_task`, `answer_interruption`, `share_chat_session`; S5 governance: `file_document`, `retire_document_filing`, correction propose/approve, candidate confirm/dismiss, identifier/alias, legal hold | `0004:767-780`; `0006:1184-1186`; `0007:2761-2777` |
| `clara_wake_interactive` (**the only agent-identity write lane**) | `wake_draft_entry`, `wake_record_client_resolution`, `wake_record_notification` (`wake_ingest_document` REVOKED) | `0004:783-788`; revoke `0007:2754-2755` |
| `clara_wake_proactive` | `wake_record_notification` only | `0004:789` |
| `clara_runtime` (pool group) | Runtime-control + doc-transport ONLY — `mint/revoke_wake_credential`, `begin/settle_chat_turn`, `open_interruption`, `checkpoint_turn`, `prune_trace_spans`, `resolve_chat_principal`, `relay_health`, + S5 intake/processing/reservation/attribution writers. **NOT a books writer.** | `0004:792`; `0006:1175-1181`; `0007:2780-2799` |
| `clara_runtime_login` (bare LOGIN, INHERIT FALSE) | `record_rule_resolution` **directly** — a deliberately narrow capability the pooled SET-ROLE session cannot reach | `0007:2803-2804` |
| `clara_agent_ro` | **ZERO writers.** Reads only (`get_journal_entry`, `list_journal_entries`, `trial_balance`, + firm-scoped SELECT on documents/filings/etc.); `default_transaction_read_only`. `select approve_entry(...)` fails at the role level. This is structural invariant 4. | `0004:796-797`; `0003:515,522-525` |

**The `record_rule_resolution` precedent (load-bearing for the option space).** The matcher reaches a writer the pooled group must NOT hold by dropping to the login shell: `reset role` (→ `clara_runtime_login`, which holds the direct EXECUTE) → call → `set role clara_runtime` to restore the group (`matcher.mjs:183-198`, header 13-20). A pooled `SET ROLE clara_runtime` session gets 42501 because the *group* has no grant. This is the existing pattern for a narrow write capability that lives on the LOGIN, not the group.

**Therefore the lawful shapes for the coding flow's draft write:**

- **Shape 1 — route through the existing wake write lane (`wake_draft_entry`).** The DB side is COMPLETE today: the writer exists (`0005:1090-1107` recreated with trailing `p_books_version`; body = `_draft_entry_core` `0007:1180-1276`), is granted to `clara_wake_interactive`, is allowlisted, threads freshness (`assert_books_current`, CLR12 on stale) + filing-bound provenance (`_active_document_filing`, CLR02), and returns a **DRAFT** (`status='draft'`, never approved). **The gap is one missing login/pool:** `0006` created `clara_runtime_login→clara_runtime` and `clara_agent_read_login→clara_agent_ro` but **NO login bound to `clara_wake_interactive`**. S6 must add a third login (e.g. member of `clara_wake_interactive`, `WITH SET TRUE, INHERIT FALSE`, per `0006:71-79`) + a **write pool** (not read-only; `SET ROLE clara_wake_interactive`; txn-local `clara.wake_secret`; COMMIT). No new books-writer, grant, or allowlist row is required.
- **Shape 2 — login-shell-direct narrow capability (the `record_rule_resolution` pattern).** If the design wants the agent-write capability OFF the shared runtime group, grant the write EXECUTE to a dedicated login shell reached via `reset role` (`matcher.mjs:189-198`). Orthogonal to trust: `wake_draft_entry` still trusts the wake credential (`wake_context`), so it still needs the wake_secret GUC. Shape 2 governs WHERE the grant sits (login vs group), not the credential model.
- **NOT lawful (would break a structural invariant):** granting `clara_agent_ro` or `clara_runtime` EXECUTE on any books writer (violates invariant 4 / the read↔write split, ARCHITECTURE §0.4/§3.2); any wake variant of `approve_entry`/`reverse_entry` (agent-never-signs is the absence of an entry point — ADR-015; `approve_entry` is `clara_authenticated`-only, `0004:777`/`0007:2761`, no wake overload exists).

**TODAY vs GAP.** Built today: the wake draft writer, its grant, allowlist, freshness gate, filing-bound provenance, credential mint, the txn-local-secret pool helper (read variant), and the login-shell-direct precedent. Genuine S6 gaps: (1) a login + WRITE pool for `clara_wake_interactive`; (2) a write-variant of `withReadWakeScoped` (not read-only, COMMIT); (3) the workflow step that mints → binds → drafts → surfaces `je_review`.

## (d) What REBUILD-PLAN / ARCHITECTURE textually promise "the write-capable floor" means (quote)

- **REBUILD-PLAN.md:23 (Slice 6):** "one simple agent workflow (**code one document into a balanced draft with provenance bound, `je_review` card, human approve with revision token**) → full audit trail (events, receipts, tool history, maker/checker)."
- **ARCHITECTURE §0.4 / ADR-017(1):** the agent's write path is structurally read-only; "**Slice-4 chat = READ-ONLY advisor … writes debut Slice 6**" (PROJECTLOG:79).
- **LAW clarification (PROJECTLOG:115):** "an agent-proposed draft becomes authoritative **ONLY after exact-revision human approval (maker/checker + revision token)**. Deterministic derivation of legs from persisted OCR-extracted source facts is the Slice-5 document pipeline."
- **MEDIUM-18 (`0004:611-616`):** "an agent draft becomes authoritative ONLY after exact-revision human approval … the agent never SIGNS, and never posts a figure unreviewed."

Reading: **"the write floor" = the narrowest possible agent write** — produce a balanced DRAFT journal entry (filing-bound provenance, freshness-gated), surface it as a `je_review` card, and STOP. A human approves via `approve_entry(p_entry, p_expected_revision, …)`. "Floor" = minimum viable write surface, exactly `wake_draft_entry`'s existing contract; NOT a broad write capability.

## (e) freeform-read login + query-logging deferral (HIGH-10) — do not widen

- **freeform_read_log** table exists (`0002:308-315`); `clara_runtime` holds INSERT + a runtime RLS policy (`0002:525-526,542`); the runtime writes the receipt before a freeform read (ARCHITECTURE §3.2:70).
- **HIGH-10 / deployment-ACL deferral (PROJECTLOG:105):** the agent/wake roles' confinement to schema `clara` + "STABLE-reads-only" is **defense-in-depth, not structural** — side-effecting PUBLIC grants (schema `public` USAGE, `pg_notify`, advisory locks) are additive/reachable (also `0002:137-172`). The **DB-wide `REVOKE … FROM PUBLIC` baseline + the dedicated freeform-read LOGIN with query logging is DEFERRED** (a runtime/deployment slice) — **not built**.
- **The firm-scoped unassigned-document read tool must ride the EXISTING read lane, not widen anything:**
  1. `clara_agent_ro` **already** has firm-scoped SELECT on `documents` (policy `p_documents_agent using firm_id = clara.wake_firm()`, `0003:515`; grant `0003:522-525`) and on `document_filings`/`extractions`/`regions` (`0007:782-790`, `2740-2741`). "Unassigned" = zero active filings — computable from these existing reads. **No new grant is needed;** do NOT grant the read tool EXECUTE on any writer or widen `clara_agent_ro`.
  2. Firm scope is enforced by the wake credential: a bare `withRead` (no secret) sees **zero rows** under FORCE RLS (`pools.mjs:197-203`); the tool must run under `withReadWakeScoped` so `wake_firm()` scopes it. The no-cross-firm-existence-oracle law (CLR11 pattern) must stay closed.
  3. Keep it a **curated, parameterised typed read**, not a raw-SQL freeform surface (ARCHITECTURE §3.2 — curated reads are the law; freeform is the exception that requires the deferred logging LOGIN, which doesn't exist yet). Don't build a real freeform-SQL door under cover of "the read tool."
  4. Adding the Shape-1 write login must preserve the **single-membership-login law** (`0006:71-79`: each login a member of exactly one group, `WITH SET, INHERIT FALSE`); do not give it read privileges beyond need or fold it into `clara_runtime`.

## Edge-case flags for the contract (PM edge-case lens)

- **Freshness token is MANDATORY on the wake lane.** `wake_draft_entry` RAISES CLR10 if `p_books_version` is null (`0005:1103-1105`) and CLR12 if stale (`assert_books_current`, commit-time recheck after seq allocation, `0007:1204,1272`). The write floor must fetch `get_context_pack`'s token server-side and thread it; the human lane passes null (skips the gate) but the agent lane cannot.
- **Attribution is to the GLOBAL AGENT user, never on_behalf_of** (`0004:626`): `maker_actor = agent_user_id`, `last_human_editor = null`. Consequence at approve: the maker=checker self-approval guard needs `last_human_editor = c.actor` (`0007:1305`), so a human approving an agent-drafted high-stakes entry is **not** blocked as self-approval — correct, but the `je_review`/approve UX should reflect that the human IS the checker.
- **on_behalf_of revalidation (HIGH-5).** If the floor mints a credential `on_behalf_of` a member, that credential goes inert the moment the member drops below bookkeeper+ (`wake_context` `0002:377-381`; revocation `0004:450-451,474-475`). A firm-level credential (`on_behalf_of = null`) skips that revalidation — choose deliberately.
- **Idempotency / one-doc→one-draft.** `_draft_entry_core` reserves on `op_key` and replays byte-identically (`0004/0007` `_reserve_op`); `p_books_version` is EXCLUDED from the request hash (`0005:958-973`) so a freshness retry isn't a hash mismatch. The coding flow needs a stable per-(document, attempt) op_key.
- **Provenance is filing-bound now.** A document-cited draft derives `filing_id` server-side and requires an ACTIVE filing + `bytes_verified_at` (`_active_document_filing`, ADR-018(5)); `approve_entry` re-affirms the active filing (`0007:1292-1294`, CLR02). The one-supplier-bill flow must have the doc FILED to the client (active filing) before it can be cited.
