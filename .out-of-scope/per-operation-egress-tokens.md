# Per-operation model-egress purpose tokens and quotas

Clara's authority to send a client's data to the model for accounting work is ONE derived,
firm-level basis — the firm's current accepted Terms and DPA plus an active client — spent as
single-use `accounting_work` dispatch authorisations. There are no per-operation or per-purpose
tokens layered on top of it, and no quotas.

## Why this is out of scope

The owner's product stance (2026-09-15): a person accepts the Terms and Conditions once — one
checkbox when the firm is registered — and that acceptance covers everything Clara does with the
firm's client data under those terms. The UX must stay that simple. A finer authorisation layer
("allow the AI to record journal entries but not X") would put a permissions matrix in front of
accountants who came to have their bookkeeping done, and would move the question "what may Clara
do" from the legal text, where it belongs, into per-firm configuration.

What stays is the mechanism, not the granularity: single-use dispatch authorisations prepared and
consumed immediately before each model call, the live-at-write re-check in the posting core,
withdrawal and restore through their own doors, and the derived activation basis confirmed under
#825. The firm-narrow egress family (migration 0123) keeps its mint-only shape: the derived basis
supersedes it for the Work lane, and if a firm-narrow dispatch ever needs consuming that is a
defect ticket against the family, not a granularity feature.

If a real customer ever requires purpose-scoped consent (for example a regulator asking for
per-purpose records), that reopens this as a new product decision with its own spec.

Recorded in `docs/ARCHITECTURE.md` §6 ("刻意不做的事"); the §7 row that listed finer tokens and
quotas as an accepted target is removed.

## Prior requests

- #800: "Consider per-purpose egress tokens instead of the one coarse accounting_work token"
- #801: "clara.consume_firm_egress_dispatch does not exist (C-20 finding)" (folded into #800)
