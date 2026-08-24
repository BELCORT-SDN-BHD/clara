# ADR-0075 — TEST-DATA AUTHORITY WIDENED: no real client exists before go-live; data is free, gates are walked by the delegate, mechanisms never move

**Date:** 2026-08-23 · **Status:** standing
**Ruled by:** the owner (Tao, BELCORT), in-session 2026-08-23 during the alignment grill.
**Amends:** ADR-060's data authority (widened, not replaced) and the 2026-08-22 identity
grant recorded at ADR-0074's R-C. **Retires** `AGENTS.md` hard constraint 12 as a NAMED
constraint and **rewrites** constraint 13; constraint 14 is amended to cite this entry.
**Mechanism of record:** `AGENTS.md` constraints 12-14 + digest law 82 (this PR).

## Context — why the old scoping stopped fitting

ADR-060 gave the agent a DATA-scoped authority over test data and `AGENTS.md` constraint 14
pinned it: *"test data may be deleted, reseeded and re-run freely; the product's security
mechanisms are the thing under test and are never weakened or bypassed for testing
convenience."* That framing assumed a live estate holding a mix of real and test material,
so three frictions accumulated:

1. **The estate was being treated as part-real.** Constraint 13 called BELCORT "the real,
   high-stakes firm", which made every reset, reseed and re-run on its three clients a
   question to the owner rather than an ordinary act — even though nothing in the estate is
   a paying client's live book and all of it is scheduled for the Wave-G factory reset.
2. **The gates had no walker.** Law 71 reserves seven acts for a human; the estate needs
   those acts exercised (consent signatures, capability grants, close keys) to test the
   product at all. The 2026-08-22 grant let the agent perform them as the owner's delegate
   through the real audited doors, ledgered — but it was scoped narrowly and did not name
   the password-bearing acts, so work stalled on paperwork rather than on risk.
3. **A client-specific constraint had grown into the harness.** Constraint 12 named ROME
   SECRETARY by firm and pinned a rule about its customers. That is a rule about a *test
   fixture* living in the harness's constitutional layer, and it will not survive the reset
   that deletes and re-seeds the fixture it names.

The owner's grill closed all three in one ruling, and the NARROW reading was confirmed
explicitly: the data is free, the gates are walked, **the mechanisms do not move.**

## The ruling (owner, 2026-08-23)

### 1 · No real client exists before go-live

Every client in the estate is TEST DATA, authorised by its owner for testing and review:
BELCORT's partner firms **ROME PROPERTIES**, **ROME SECRETARY** and **BEE CREATIVE
SOLUTION**; the synthetic **ROME PUBLIC ADVISORY**; and the slice-era RLS fixtures
**Alara** and **Borneo**. All of it is factory-reset and re-run at the Wave-G end-to-end
after the rebuild. There is no live client book in the estate and there will not be one
until go-live.

### 2 · DATA is free

The agent may **delete, reseed, reverse and re-run** any client's accounting data,
documents, consents and close state — **the live DB included** — without asking. The
raw-document corpus is the owner's three folders (**BEE CREATIVE - Accounts** · **Rome
Properties YA2025 Files** · **RS - YA2025**). **No oracle exists beyond them and none is
required**: where a figure cannot be corroborated against those folders, the honest record
is that it was not corroborated, not a manufactured authority.

### 3 · GATES are walked by the agent as the owner's DELEGATE

Through the **REAL audited doors**, receipted. This widens the 2026-08-22 identity grant to
cover, on test data: law-71 human acts, **consent signatures**, **capability grants**, and
**password-bearing acts** — with secrets generated env-to-env and **never printed**.
**E-filing is excluded by its nature**: it leaves the estate and binds the firm to a
regulator, so no delegation reaches it.

This is an **identity** grant, never a mechanism change. The agent walks through the door
the human walks through; it does not get a second door, a bypass, or a relaxed wall.

### 4 · MECHANISMS never move

RLS, the attribution walls, receipts, roles and grants, and the generic name-only wall are
**the product under test**. Weakening one for testing convenience is **forbidden**. This is
the narrow reading, confirmed by the owner in session: an authority over DATA is not an
authority over the machinery that guards it. A test that can only pass by moving a wall has
found a defect in the test, not in the wall.

### 5 · No client-specific mechanism or documentation for test clients

Nothing client-specific is built or kept for a test client, because the reset deletes the
client it was built for. Consequences for the harness:

- **Hard constraint 12 (ROME SECRETARY name-only) is RETIRED as a named constraint.** The
  **GENERIC** wall stays as a **product mechanism**: *a client may be flagged name-only, and
  a name-only client's counterparties are never enriched by inference.* `0062` and `0063`
  are **untouched** — the DB wall, its uuid pin and the OWNER-only audited door all stand
  exactly as built. What retires is the harness clause that named one fixture, not the
  mechanism that enforces the rule.
- **Hard constraint 13 is REWRITTEN** to: *BELCORT is the operator firm; every other firm
  and client in the estate is a resettable test fixture; never repurpose the synthetic
  sandbox as a real firm.*
- **Hard constraint 14's "expires at beta" STANDS**, now citing this entry for its widened
  scope.

### 6 · Every wave's validation still runs in full

Nothing is deferred to the end-to-end except what is end-to-end **by nature**. A wave does
not close by pointing at Wave-G. Where something genuinely cannot be validated in its own
wave, the **only** lawful homes for the deferral are a **Known issues** row or a **Backlog**
row in `PROGRESS.md`, naming what is unproven and why — never silence, and never a green
gate standing in for an unrun one.

## Consequences

**Immediate, in this entry's PR:** `AGENTS.md` constraints 12, 13 and 14 are rewritten per
§5; digest **law 82** folds this ruling into the standing set; `PROGRESS.md` records the
posture; the live plan documents that assert "constraint 12 is NOT widened" or "constraint
12 rides along unchanged" are annotated `[ADR-0075 2026-08-23]` in place, since the
mechanism they rely on is intact and only the constraint's name has gone.

**What this unblocks.** Reset-and-re-run stops being a question. The Wave-G corpus run, the
F-A7b onboarding interview, the consent activations every egress-touching item needs, and
the capability grants F-A5's issue wall needs can all be exercised on the estate without a
paperwork round-trip. The delegation is ledgered, so the record still says who acted and
under whose authority.

**What this does NOT do, stated so nobody infers it:**

- It does not touch a single **mechanism**. No wall is relaxed, no grant widened, no RLS
  policy loosened, no receipt made optional. §4 is the operative clause on any collision,
  and a request to weaken a mechanism "because it is only test data" is refused.
- It does not reach **real client data**, which does not exist in the estate today and, at
  go-live, returns to the owner's sole authority — constraint 14's beta expiry is the hinge.
- It does not reach **e-filing**, by nature.
- It does not delete or weaken `0062`/`0063`. A reader who takes "constraint 12 retired" to
  mean "the name-only wall is gone" has read it backwards.
- It does not authorise **printing a secret**. Password-bearing acts are delegated;
  disclosure is not. Secrets are generated env-to-env and never printed.

**Cost the owner accepted.** Retiring a named constraint removes a tripwire that a reader
could see in `AGENTS.md` without following a link. The generic wall is a DB mechanism, so a
future reader must reach the mechanism (or law 82) to learn the rule rather than meeting it
in the constraint list. The owner judged this correct: a rule about a fixture that the reset
deletes does not belong in the constitutional layer, and the wall enforces itself regardless
of whether a human remembers it.

**Standing risk, registered rather than solved.** §2 and §3 together mean the agent can
destroy and rebuild the estate unattended. The protection is not a permission prompt; it is
§4 (the mechanisms stay armed and will refuse an unlawful act whoever asks) plus the
receipts (§3), plus the fact that everything destroyed is reproducible from the owner's
three folders (§2). If any of those three ever stops being true, this ruling needs re-taking.

## Status

**standing.** Amends ADR-060's data authority and widens the 2026-08-22 identity grant.
Expires at beta with constraint 14, at which point real client data exists and the owner's
sole authority resumes. Digest law 82 carries the standing form.
