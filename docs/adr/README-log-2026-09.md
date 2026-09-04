# The digest's re-truing log — 2026-09 continuation, dated minutes, append-only

**This file is NOT the law.** The standing laws live in [`README.md`](README.md) and govern; this
file holds the dated **re-truing minutes** that record *when* the digest was re-read against a new
ADR and *what* that reading found. It **continues [`README-log.md`](README-log.md)** at that file's
own 500-line ceiling, opened on **2026-09-04** — the same convention the digest used when it split
its dated minutes out in the first place, and the one the ruling ledgers use when a file fills.

**The rule this file inherits:** a minute is a record of what was true on its date. It is
**append-only** — a later reading is a NEW dated entry, never an edit to an old one. When a minute
names a fact that has since changed, that is not rot: the current status lives in the law entry
itself, in `README.md`. Read `README.md` first; come here only to answer "when did this change, and
what did the re-reading find?"

---

## 2026-09-04 ≈09:22 — 裁-186…190: the repair session's opening minute (ADR-0078, digest row 98)

> The digest was re-read against **[ADR-0078](0078-consent-declaration-attestations-abolished-rbac.md)**,
> which minutes 裁-186 (client AI consent becomes a FIRM-level declaration made once at the DPA stage,
> every client consented automatically) and 裁-187 (every attestation CEREMONY and every maker-checker
> wall abolished, basic RBAC the only human gate, automatic receipts kept at zero ceremony). Both were
> ruled by the owner between ≈09:15 and ≈09:22 MYT; both went AGAINST the lead's recommendation in
> part, and **both dissents are on file in the ADR**, stated once and not relitigated.
>
> **What the reading found.** Seven laws in `README.md` carry an amended-by line as of this minute:
> **law 4** (maker/checker modelled always, the distinct-approver gate, the solo-firm attestation) —
> **ABOLISHED**, the identities stay RECORDED on the automatic receipt and the gate is RBAC · **law
> 25** (the close model's three keys) — **AMENDED**, keys ②③ are one-click admin+ acts and the
> drawer-2 gates are evaluated and recorded rather than refusing for want of an attestation, B3's
> reopener≠closer wall gone · **laws 57 and 58** (firm-facing client authorization; typed,
> purpose-scoped consent) — **RELAXED**, the per-client evidence rung is satisfied by the firm-level
> declaration while the purpose scoping survives · **law 69** (adoption through a recorded
> attestation) — **ABOLISHED**, an orphaned proposal is approved by rank and the receipt records the
> adoption · **law 71** (the surviving human acts) — its **RESERVATION SHRUNK** to the RBAC-floored
> acts · **law 78's rider R-TA-P1-walls** — B6/B14 have **no subject** once the attestation row they
> read no longer gates. The per-ruling row is **item 98** in
> [`README-rulings-2026-09.md`](README-rulings-2026-09.md), and the ledger
> [`mohe-grill-rulings-2026-09-04-pm.md`](../plan/active/mohe-grill-rulings-2026-09-04-pm.md) holds
> the text of record, which governs on any divergence with this minute or with the ADR.
>
> **What is NOT yet true on disk.** This minute records law text, not code. The frontend removes each
> attestation ceremony as the UIUX lanes reach its surface, and the database walls come down in the
> 裁-188 wall-removal lane, which runs this same session after the P0 block. Until those land, the
> live bodies still carry the rungs the laws above have released — read the lane state in
> `PROGRESS.md`, never from this minute.

> **2026-09-04 ≈12:45 MYT — the repair session's midday minute (裁-191 · 192).** Digest re-read against the
> two rulings in [`mohe-grill-rulings-2026-09-04-pm.md`](../plan/active/mohe-grill-rulings-2026-09-04-pm.md).
> **191** is a DATA ruling — two rows of `clara.document_kind_codeability` (PR #551) flip to codeable; it amends
> no law (digest law 16's spirit: facts in tables). **192** AMENDS 裁-86 and law 85's browser-leg clause: the
> Playwright smoke on the built app becomes a REQUIRED per-PR CI job beside the per-train acceptance walk,
> once the two known `checkout-gate-walk.spec.ts` flakes are fixed at their cause (the job is not built
> yet); ADR-0077 and law 85 carry the "amended by" line; digest row 99. No new ADR under 裁-140.
