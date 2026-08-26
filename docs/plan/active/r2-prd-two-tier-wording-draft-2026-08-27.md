# R2 draft — the two-tier reporting sentences for PRD (owner word-by-word review REQUIRED)

*Per `harness-audit-rulings-2026-08-26.md` card R2: the owner authorized the SHAPE of this
change (option A), not a specific sentence — no PRD edit ships until the owner has read and
approved the exact wording below. Drafted 2026-08-27 in the 磨合 session. Source of the law:
digest law 74 (ADR-0071/G4); the shipped fact: `docs/ARCHITECTURE.md` §6 as trued 2026-08-26.*

## Proposed edit 1 — PRD §4, capability item 15 (line ~85)

**Current text:**

> 15. **Reporting & exports** — standard exports (TB, journals, GL, MA/FS, AR/AP aging,
> SST-02) **and** flexible ad-hoc reports, all schema-driven with authoritative DB numbers;
> every export persisted as an auditable artifact with parameters, data version, permissions,
> reproducibility (fixes H-1/H-2/H-4).

**Proposed replacement:**

> 15. **Reporting & exports — TWO TIERS by law (digest law 74).** The **formal tier**:
> standard exports (TB, journals, GL, MA/FS, AR/AP aging, SST-02) **and** flexible reports,
> produced through the open→evaluate→seal→render chain, all schema-driven with authoritative
> DB numbers; every export persisted as an auditable artifact with parameters, data version,
> permissions, reproducibility (fixes H-1/H-2/H-4). The **analysis sandbox tier**: free
> exploration whose outputs are watermarked non-authoritative and structurally unreachable
> by the seal chain.

## Proposed edit 2 — PRD §6, invariant 1 (one appended sentence)

**Appended to the end of invariant 1's existing text, verbatim:**

> Analysis-sandbox outputs carry a watermark burned into their bytes and are structurally
> unreachable by the seal chain — a sandbox figure can never become, or be mistaken for, a
> sealed artifact.

## Status

- [ ] Owner has read both proposed texts word by word and approved / edited them.
- [ ] Docs PR lands the approved wording (single-lane docs review, ADR-0069).

*Until both boxes tick, PRD.md is untouched for this item.*
