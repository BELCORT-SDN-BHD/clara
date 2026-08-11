### ADR-042 — Migration 0021: the human counterparty lane, found by a live gate (2026-07-26)

**Decision:** add one governed verb,
`clara.create_counterparty(p_client, p_kind, p_name, p_registration_no, p_tin, p_op_key)`, at the
**bookkeeper** floor — the same floor as `upsert_account`, for the same reason: both create
reference data that later postings hang off, and neither moves money. It mints a counterparty and
**nothing else**. Identity resolution is untouched: `_resolve_counterparty` keeps its monopoly on
deciding whether an incoming document names an **existing** party, and `approve_entry`'s birth
path is unchanged. PR #94. Ceremony: `docs/ops/wave-b-0021-ceremony-runbook.md`.

**The gap, and why it survived to a live gate.** An opening carry-down seeds payables and
receivables as `ap_open_item` / `ar_open_item`, and both **require** a `counterparty_id`
(0017:3202-3204). But a counterparty could only come into existence inside `clara.approve_entry`
(0011:3039), on the `proposed_counterparty->'new'` birth path — i.e. **by approving a coded journal
entry**. At takeover, before any entry exists, the two commonest opening balances a real trading
client has were therefore unseedable. It went unnoticed because the only prior Gate-K run (Rome
Secretary, 2026-07-24) was a company with **no payables**: its seed used `equity_net` + `gl_balance`
only, so the `ap_open_item` path had **never executed in production**. Bee Creative — a sole
proprietorship with RM105,000.00 owed to LOST INVENTION SDN BHD across two December 2024 invoices —
hit it on the first attempt. The contract was not blind to counterparty creation — it scoped **"mass
counterparty birthing"** to **B5** (bulk seeding off a prior GL). The miss is a **scoping** one: B4's
carry-down needs *one* party, before any GL to seed from, and B5's bulk lane is not that door.
**The rejected workaround:** coding those purchase invoices through
the daily loop to mint the counterparty as a side effect. That posts YA2024 purchase entries into
the very period the opening balance is being seeded for — the double-counting shape ruled against
in WB-R29. The opening lane needs its own door.

**Three defects the rig caught in the verb itself, all in the create-or-get recovery.** (1) The
recovery assumed ONE unique index on `(client, name)`; there are **two partial** ones, split
registration-vs-name, and **both carry `kind`** (0015:187-192). A name-only lookup returns the wrong
party when one client's vendor and customer share a name, and finds **nothing** when the collision
was on registration and the names differ — reporting a retired-party collision that never happened.
(2) T18: the function was left **owned by the migration role**. A definer executes as its owner, so
the owner *is* the authority it lends; on a managed Supabase project that is a far wider set than
the governed surface should hand out. (3) The migration's own tail checked `prosecdef`,
`search_path` and PUBLIC but **not the owner** — the identical blind spot as the code it guarded.
Also T17: the grant matrix is a pinned **closed set**, so the verb had to be *declared*, not merely
granted. A fourth defect surfaced while writing the behaviour battery: the verb passed `p_client`
as `_audit`'s `p_obo` argument, which means **on behalf of a USER** (mirroring
`wake_credentials.on_behalf_of`, a `users(id)` reference). It typechecks only because `audit_log`
carries no FK there, so a client id would have sat silently in a column every reader interprets as
a human. A fifth, found on self-review before merge: the idempotency **request hash** covered only
`(client, kind, name)`, so a caller who re-used an op_key while **correcting a mistyped
registration number** got a silent replay of the stale receipt instead of `_reserve_op`'s honest
CLR10. The hash now covers every argument that reaches a stored column, taken over the
**normalised** values so that `''` and NULL remain one request, exactly as they are one stored
value.

**What ships with it.** A 13-cell behaviour battery driving the verb through the database as a
real firm member; a 6-probe read-only post-verify (`packages/db/deploy/wave-b-0021-postverify.sql`)
whose probe 4 pins the two index predicates the recovery *silently* depends on and whose probe 6
states inertness exactly, via `xmin`, refusing to report green once frozen; and the dashboard side
— `CounterpartyPicker` replaces a bare "counterparty id" text box that expected a pasted uuid and
that nobody could fill at takeover. The battery runs the shipped post-verify **verbatim**, opting
out of its head assertion through a documented GUC rather than letting the file weaken its own
predicate.

**Related fix in the same PR.** The 19→20 upgrade fixture asserted `count(schema_migrations) = 20`,
conflating "0020 landed" (its subject) with "the repo has exactly 20 migrations" (not its subject),
so 0021's existence broke three of its four cells. The shipped 0020 post-verify asserts something
**stronger and correct** — `max(version) = '0020_typed_consent'`, i.e. 0020 is the HEAD, which on a
live ceremony catches an apply that ran past the intended migration. Weakening that probe was
rejected; the **fixture** was bounded instead (`exportThrough(n)` / `UPGRADE_DIR` = 0001..0020),
which is what its name always claimed it did and makes it immune to every later migration.

**Deployment status: NOT deployed.** Live remains **20 migrations · runtime v27**. Gate K's Bee
Creative carry-down is blocked on this ceremony. Ref: PR #94 · WB-R29 · ADR-041.
