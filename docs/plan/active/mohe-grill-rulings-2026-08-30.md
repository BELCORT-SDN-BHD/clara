# 磨合 grill rulings — 2026-08-30 (the third ledger; continues `mohe-grill-rulings-2026-08-29.md`)

*Same shape as the first two ledgers: one question per turn, 大白话 each, the owner's words where
he gave them, the ruling, the consequences. The 08-28 ledger carries 裁-1 … 裁-28, the 08-29 ledger
裁-29 … 裁-44; this one carries **裁-45 … 裁-56** — the 2026-08-30 noon sitting (12:25–12:50 MYT),
the morning batch that the overnight sprint accumulated: the 裁-41 duplicates route, the 裁-18b
PR-1 review's three questions, G1's two metering questions, and the billing design set's cards.*

*Standing context at the sitting: main `cf912b0f`, repo frontier `0155`, live 148/`0153`;
`0154`/`0155` on main unapplied; G1 wake bodies merged (#437) with both sources OFF.*

## 裁-45 · 0155's live duplicates — "走 Wave G 重置后再上线"

**What was asked.** `0155` (裁-41, the `client_identifiers` UNIQUE) will correctly REFUSE its first
live apply: live ROME SECRETARY holds two duplicate identity groups (`client-identifiers-0049-seed.sql:29-30`),
and the table is append-only with no retire door.

**Ruling — route (a).** ROME SECRETARY is a resettable fixture (constraint 13). `0155` stays on
main and applies AFTER the Wave-G factory reset; no surgical delete, no trigger disable, no
ceremony. *Consequence:* `0155` is NOT in any pre-Wave-G D1 window; the migration ledger notes it.

## 裁-46 · Re-opening a REVOKED vendor binding — "单独一扇管理员门，带理由、受理"

**What was asked.** PR-1 (`0154`) refuses `reset_binding_decline` on a revoked pair
(`binding_revoked_reset_requires_ruling`). May a human re-open a revocation, and by which verb?

**Ruling.** A SEPARATE admin door, `reset_binding_revocation(uuid, text reason)`: admin/owner only,
reason mandatory, receipted. `reset_binding_decline` keeps refusing on revoked — a revocation is a
weightier act than a decline and its undo must carry its own name. *Rides 裁-18b PR-3.*

## 裁-47 · The solo-firm self-sign — "确认：只限 Clara 指示路径"

**What was asked (大白话, after the owner asked "单人公司就不能用了?").** A binding is a
long-lived auto-posting authorisation, so the rule is four eyes: one proposes, another signs. 裁-32
lets a solo firm's only admin sign with an attestation. The question was only WHO supplies the
proposal half: (1) the DIRECTED path — the human tells Clara to bind, Clara runs every wall over the
invoice evidence and proposes, the same human signs with the attestation; or (2) the MANUAL path —
the human hand-writes the proposal and then signs it too.

**Ruling.** Only (1). A solo firm CAN bind vendors — Clara is the second pair of eyes. A human's
own manual propose-then-self-sign is refused regardless of firm size. The 90-day roster window
stands as built (a firm that had a second admin for an afternoon is non-solo for 90 days).

## 裁-48 · The dead 0028 postverify — "退休（删除），单独一个 PR"

`packages/db/deploy/vendor-identity-binding-0028-postverify.sql` was `0028`'s deploy-time probe set;
its probe 10 pinned a body `0118` dropped and went stale there. *(Corrected 2026-08-30 after the
retirement PR's independent review: the sitting was told "it reds for whoever runs it" — that was
the file's own stale header, not a run; `0154` (#433) had made the probe succession-aware that same
morning, and a rig run at the `0155` frontier passed all 12 probes. The grounds that stand: no ceremony, CI step or recipe runs it, its
header flagged it for owner-batched cleanup, and `0028`'s claims are proven by replay + the estate
suite. The owner may overrule on the corrected premise — INFORM batched.)* **Ruling:** retire it (delete) in its own PR with one line in
`packages/db/README.md`'s deploy contract. The agent does not delete owner-era files without this
ruling; it now has it.

## 裁-49 · G1's two metering questions — "两个都改，搭 G1 PR-2 的 DB 那车"

**Ruling.** `ck_llm_usage_events_call_kind` gains `bank_agent` and `close_prep` (extend-only), and
the two lanes stop borrowing `unattended_posting`; `wake_engine_sources.login_pool` for `close_prep`
is trued to the write pool. Both ride G1 PR-2's DB migration (the producers + the eight deferred
hardening items) — zero extra windows.

## 裁-50 · Billing OQ-1 + OQ-8 — "用 RM，不过先不定价"

**Ruling.** The AI allowance is denominated in **ringgit** through Clara's OWN rate table — never
the USD `llm_price_table` (vendor cost), never an FX derivation. The pricing model and plans are the
ones the owner already gave (裁-28 / 裁-42). **The AMOUNTS stay unset** (`amounts_ruled=false`;
nothing charges) until the owner writes numbers. OQ-8 is therefore deferred by this ruling, not open.

## 裁-51 · Billing OQ-2 — "不铸新角色；付款页给 admin/owner"

No `payments_only` role: the role CHECK stays closed at viewer | bookkeeper | admin | owner. The
billing/payment surface is admin/owner; Stripe's hosted invoice and payment links reach any billing
email without a Clara login.

## 裁-52 · Billing OQ-3 — "不改 schema，界面显示 Draft / 草稿"

The schema status stays `onboarding`; "Draft / 草稿" is an i18n label. No rename migration, no
window.

## 裁-53 · Billing OQ-4 — "豁免，用计划旗帜"

BELCORT is EXEMPT via a plan flag (an operator-exempt plan row): metered in full so the owner sees
real cost, never invoiced, never charged.

## 裁-54 · Billing OQ-5 — "用 Stripe Tax"

SST on Clara's invoices is computed by **Stripe Tax**, configured for Malaysian service tax on the
Stripe side and switched on when BELCORT's own SST registration status (digital-services threshold)
says so; no tax line before registration. F-T1's engine serves the clients' books, not Clara's
invoicing.

## 裁-55 · Billing OQ-6 — "N 天后只读，永不删数据"

Past the grace period (default 14 days, an owner-tunable plan parameter) the firm goes READ-ONLY:
read, export, pay — no book writes. Paying restores. **Accounting data is never deleted for
non-payment.**

## 裁-56 · Billing OQ-7 (archive) — "归档 = 导出包后删除"

**What was asked (大白话, after "archive 不是取消掉这个客户吗？还要收费？").** Archive in the
design was "stop bookkeeping, keep the books read-only for the 7-year statutory retention"; the
question was whether that retention is priced. The owner chose a different meaning.

**Ruling.** **Archive = a complete export package, then DELETE.** No retention fee, no read-only
tail; the 7-year record-keeping duty (Companies Act 2016 / ITA 1967 s.82) returns to the firm with
the package.

**Orchestrator's dissent, recorded then executed.** Deletion is irreversible and crosses the
append-only ledger walls; the door is therefore a REAL audited ceremony, never a status flip.
**Fail-closed defaults under the ruling (INFORM, overrule if wanted):** (1) the export is a sealed
package with a byte-hash receipt (the F-A5 seal + byte-reproduction pattern), and the delete refuses
until an owner-role human confirms the package hash it actually downloaded; (2) a 30-day cooling
window between "archive requested" and the delete, cancellable by any admin; (3) the delete walks
every append-only trigger legitimately through a new audited door, receipted at the firm level with
the package hash — never a trigger disable; (4) BELCORT's operator clients and any client with an
open statutory obligation Clara knows about (an unsettled filing) refuse. **Build: beta-era (P6+),
not pre-beta.** The billing design's "archived = read-only" wording is superseded by this ruling.

---

*Also at the sitting, INFORM only:* the VHDX compaction (admin) is the owner's — it runs when the
runners are idle, the board marks the moment; the hrd-b closed-wave drill's second fix (#438) was
CI-green and awaiting its independent lane's two-polarity verdict.
