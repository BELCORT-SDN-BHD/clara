### ADR-003 — Maker/checker: modelled always, hard-gate high-stakes only, agent never signs (Gate-1 C4)
**Decision:** Every entry records maker + checker as distinct identities. Distinct-approver is a HARD DB gate only on the high-stakes lane (tax-affecting, closed-period, large-amount, year-end, opening balances) where the firm has ≥2 eligible staff; routine entries keep the one-person flow; solo firms record a self-approval attestation. The agent can never satisfy a human sign-off.
**Why:** Audit-defensible segregation of duties without breaking small-firm reality.
