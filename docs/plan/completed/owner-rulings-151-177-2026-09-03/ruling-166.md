# 裁-166 — OD-16: beta launches on the DPA signature ONLY; the beta terms of service are a dated Backlog row (the `kind` discriminator + per-kind unique index + `sign_dpa`'s carrier gaining `kind`, riding the next DB PR touching the store; 裁-90's byte-identity law extended to the terms), completed with the lawyer pass before 上市; 裁-145's phrasing re-cut to "five items, four live — the terms are the not-yet-live fifth"

**Ruled 2026-09-03 ≈21:2x MYT (owner, AskUserQuestion): 「照建議，不過通常正式user term and conditions 簽一次就好right？ 究竟是要多少文件？ 給我了解下」** — the ruling stands; the owner's question (how many documents, signed how often) is answered in chat and the answer is recorded here.

**The document count (answered from the repo):**
- **Per FIRM, at signup, signed by the firm's principal, ONCE per text version:** the DPA (live now —
  `clara.dpa_documents`, `sign_dpa`, the byte-identity law 裁-90) and, from 上市, the Terms of Service
  (`docs/ops/legal/clara-beta-terms.md`, a separate document kind, 裁-125/129 — NOT SEEDED, NOT IN
  FORCE at beta). A new version of either text prompts a re-acceptance once; nothing is re-signed
  otherwise.
- **Per CLIENT the firm onboards:** the client authorization letter (en/ms/zh templates in
  `docs/ops/legal/`), signed between the firm and its client, outside the app — the firm's own
  file, not a Clara signature.
- **Per INVITED member (RBAC):** nothing separate in beta — the firm's signatures bind the firm;
  whether each user account must accept the Terms individually at 上市 is a lawyer question,
  filed on the same Backlog row.
- The beta signup consent text (裁-90, `clara-beta-dpa.md`) is the DPA's beta wording, not a
  third document.

**The exact re-cut owed to `docs/product/PRD.md:290` (measured after the ruling):** the 裁-145 note
currently says *"Four of the five are therefore live (DPA e-sign · Beta terms · rate wall · Stripe
checkout success)"* — **the Beta terms are NOT live** (`clara.dpa_documents` has no `kind` column;
`signup-dpa-form.tsx:53-63` presents one document and says so; `clara-beta-terms.md:840` NOT SEEDED,
NOT IN FORCE). Re-cut to: five items named; the email-bound token RETIRED (裁-89, never built);
**THREE live** (DPA e-sign · rate wall · Stripe checkout success); **the Beta terms are the
not-yet-live fourth — a Backlog row under 裁-166, in force from 上市 after the lawyer pass.** Any
other text that copied "four live" (the digest row for 裁-145, the -09-03 ledger) is re-cut with it.

**Record.** Ledger `-09-03` + digest row; PROGRESS Backlog row (owner · next step · ruling) at the
final truing; 裁-145's PRD §9 item 3 note re-cut in the same docs PR.
