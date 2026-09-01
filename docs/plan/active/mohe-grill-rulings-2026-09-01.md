# Mohe grill rulings — 2026-09-01 (the frontend-first sitting)

*Continues `mohe-grill-rulings-2026-08-31.md` (裁-88…93 there; 裁-94 lands with PR #482's own
section). Owner rulings recorded by the orchestrator the day they were given; each entry names its
context and whether it followed or overrode the recommendation.*

## 裁-95 · Q6 mobile corridor — OUT of beta
Morning. The backlog row required the owner to place mobile in a beta train or rule it out.
**Ruled: out** (per recommendation). Mobile gets its own post-beta train; the Wave-G acceptance
walks the desktop corpus as-is.

## 裁-96 · FS-7 wire decisions (the close-card pair)
① Close ACTS render as CARDS — one generic wire part kind `close_act_receipt` covering all
close-act verbs (**overrode** the text-only recommendation; the freeze risk is mitigated by the
one-generic-kind shape — see the design of record `fa4-pr2c-close-chat-design.md` §3 for the
final address-only field set). ② The report-PDF download door is ONE generic door over both
artifact families (`report_artifacts` + `sandbox_exports`), server-side gate only, client-side
signed-URL minting forbidden; opus builds it with a law-28 Codex leg (per recommendation).

## 裁-97 · High-stakes threshold UI at FS-8
**Overrode** the runbook-only recommendation: build the small owner-only settings UI for
`clara.set_firm_high_stakes_threshold` (0022 §B) in firm-admin at FS-8 (+≈0.2 units). Beta-era
delegate ceremony would expire at beta's end; the UI removes the future ceremony dependency.

## 裁-98 · verify_snapshot — runbook backstop, no UI
Per recommendation and the FS-0 census disposition. The runbook line already lives at
`docs/ops/DR.md` §11; the FS-0 residual row closes by pointing there. Forensic instrument;
agent roles hold zero grants on it by design (0057 S10).

## 裁-99 · Close-prep chat tools — build now (the widened slice)
**Overrode** the defer recommendation (given at the +0.3-unit framing). The twelve 0138 close
wrappers are structurally unreachable from chat (task-binding wall); the owner ruled to open them
lawfully rather than defer.

## 裁-100 · The honest cost re-ruling + frontend-first
The opus design pass re-measured 裁-99's true cost at ≈4.5 build units (incl. the NEW rung A8 —
the attended-authority floor closing a capability-laundering path the opening would otherwise
create) + two review legs. **Ruled: build all twelve now at the true cost** — with the standing
order that the FRONTEND sprint to beta-live is not displaced; the close-chat lanes run behind it
in parallel and do NOT gate beta. Sub-rulings: **裁-100①** `wake_open_fiscal_year` keeps the
ADMIN floor on the attended lane (per recommendation); **裁-100②** `wake_propose_close` needs
bookkeeper only, no `close_and_attest` (per recommendation — the settle door is the wall).
Design of record: `docs/plan/active/fa4-pr2c-close-chat-design.md` (lands with the PR-2c PR),
including its two dated STOP amendments (the closePrep_v1-shipped premise correction with the
enabled=false pre-apply check clause, and the cell-4 allowlist-wall refusal-token correction).

## The frontend-first order (morning, standing)
The frontend sprints to beta-live first: FS-4 web train (Lane A UI now / Lane B door-wiring after
C-3+C-5) · FS-8 (P6-T IA shell + honest-note sweep + the 裁-97 threshold UI) · FS-9 conformance
against the ClaraBook design repo · FS-10 cutover · FS-11 walk. Backend queue drains in parallel
behind. The ClaraBook design system/tokens/prototype bind every FE dispatch; shadcn/Emil/Mobbin
MCPs ride the build lanes.

## Session state bridge (for the post-compaction reader; PROGRESS truing rides the next clock-out PR)

**Merged this cycle (7):** #481 date-rollover · #463 (FS-6 closes) · #479 (0156) · #480 (DPA text)
· #453 (operator queue, six instrument-proven fixes) · #483 (FS-5 closes — the live-browser walk
caught and fixed the estate's first browser-only defect; contrast gate 37→38) · plus #482
imminent (0157 claimed; helper concurrency fix + NIT micro-commit; CLEAR, final CI pending).

**Queue order:** #482 → #455 (fold by the same lane) → #478 (C-1, claims 0158) → #484 (C-2,
LADDER COMPLETE after 4 rounds, claims 0159, retargets) → #485 (FS-7 report tools, fix round on
3 MATERIAL incl. the freeze-manifest time bomb).

**Lanes in flight:** fs4-c3-driver (C-3 folded door — THE beta-critical backend: sign_dpa rides
it, billing_plans verify, single-unique rule vs C-2's constraint_name handler) · fa4-pr2c-driver
(close-chat DB, two STOPs ruled, resumed) · fs4-laneA-builder (confirm-page 6-digit rewrite +
DPA UI + pending arms, seam-stubbed) · fs8-builder (Tax IA shell + honest-note sweep) ·
owner-preview (localhost stack for the owner) · pending dispatch: FS-8 PR-2 (threshold UI),
FS-4 Lane B, C-5 (runtime webhook), FS-7 echelon 2 (render worker + download door, opus).

**Standing follow-up ledger (owner-visible, none blocks beta):** freeze-lint drift guard refusing
tests/-path registrations (the #485 M1 class) · p4t2-registration's actor-scoped audit count (the
last schema-wide census, #482 reviewer NIT-3) · a gate binding a11y shadows to their real pages +
a tree→registry ⌘K cell (#453 reviewer's class note) · C-5 order items: the projector's
nested-PII strip wall (裁-91's containment half), the webhook route surfacing rejected events
loudly (never 200-and-drop), C-2's constraint_name re-raise hazard if a second unique is ever
added · the coa_chart_apply checklist row gap (from FS-5 scouting) · wave-g checklist's confirm
template line to the 裁-92 OTP form (located by the C-3 driver).

**Owner items:** all four ops cards done except the Stripe TEST key (deferred to C-3/C-5 wiring
by design). The Wave-G proof screenshots are collected at as-run time.
