// X7 — THE EXECUTED-PROBE REGRESSION CORPUS, PART 2: rounds 5-6 and the Codex supplements.
//
// Part 1 (`x7-review-scenarios.test.mjs`) carries rounds 1-4 and states why the corpus lives at
// this altitude at all. The split is mechanical — one file outgrew the repo's 500-line limit —
// and the round banners are the seam, so a cell stays with the round that produced it.
//
// THE CONTROL CELL IS AT THE END OF THIS FILE. If it goes red, the fix bought its safety by
// breaking the thing F7 exists to do.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { ATTN, ATTN_BOX, BILL_TO, KONG_CHENG, L, VENDOR, WITHDRAWN, box, run } from "./x7-scenario-kit.mjs";

// ══════════════════════════════════════════════════════════════════════════════════════
// ROUND 5 — the supplement: both seams, the complete colon class, and the contest invariant
// ══════════════════════════════════════════════════════════════════════════════════════

const ATTN_LABEL = L("Attention:", box(0.72, 2.25, 1.60, 2.39));

test("S1: a company-shaped contact is refused at BOTH seams, not just the split one", () => {
  // The round-4 C3-2 fix landed only in `scanBelow`, so the SAME-LINE door kept the strict
  // predicate and kept persisting companies as people. A rule at one of two seams is not a rule.
  for (const company of ["SDN BHD", "ACME SDN BHD (123456-X)", "ACME SDN BHD, Kuala Lumpur", "ACME P.L.T."]) {
    const sameLine = run([VENDOR, BILL_TO, L(`Attention: ${company}`, box(0.72, 2.40, 3.60, 2.54))], "Lim Xiao Shan");
    assert.equal(sameLine.contact, undefined, `${company} — same-line seam`);
    const split = run([VENDOR, BILL_TO, ATTN_LABEL, L(company, box(0.72, 2.40, 3.20, 2.54))],
      "Lim Xiao Shan", box(0.72, 2.40, 3.20, 2.54));
    assert.equal(split.contact, undefined, `${company} — split seam`);
  }
  // A real person still reads on BOTH seams.
  const p1 = run([VENDOR, BILL_TO, KONG_CHENG, L("Attn : Lim Xiao Shan", ATTN_BOX)], "Lim Xiao Shan");
  assert.equal(p1.contact, "Lim Xiao Shan");
  const p2 = run([VENDOR, BILL_TO, ATTN_LABEL, L("Lim Xiao Shan", box(0.72, 2.40, 2.20, 2.54)),
    L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.55, 3.30, 2.69))], "Lim Xiao Shan", box(0.72, 2.40, 2.20, 2.54));
  assert.equal(p2.contact, "Lim Xiao Shan");
});

test("S2 end-to-end: no colon glyph manufactures a party", () => {
  for (const v of ["Reference﹕ ACME SDN BHD", "Reference∶ ACME SDN BHD",
    "Reference꞉ ACME SDN BHD", "Reference： ACME SDN BHD",
    "Customer‘s Ref﹕ ACME SDN BHD"]) {
    const r = run([VENDOR, L(v, box(0.72, 2.30, 4.60, 2.45)), ATTN], "Lim Xiao Shan");
    assert.equal(r.customer, WITHDRAWN, `${JSON.stringify(v)} must not override`);
    assert.notEqual(r.outcome, "attn_overridden");
  }
});

test("S3 / R6-1: a contact-CLAIMED line can never override, withdraw, or collapse", () => {
  // THE SIDE-EFFECT CHAIN, traced: the contact gate refuses `Lim P.L.T.` (single-letter-run
  // joining reads `plt`), so `attn_key` is never set, so the F7 OVERRIDE shape is scored as an
  // UNEXPLAINED disagreement — and the reconciler WITHDREW a correct `KONG CHENG…SDN BHD`.
  // Absence of an explanation the reader COULD NOT READ is not evidence of a contest.
  const withPlt = run([VENDOR, BILL_TO, ATTN_LABEL, L("Lim P.L.T.", box(0.72, 2.40, 2.60, 2.54)),
    L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.55, 3.30, 2.69))], "Lim P.L.T.", box(0.72, 2.40, 2.60, 2.54));
  assert.equal(withPlt.customer, "Lim P.L.T.", "typed stands — pre-X7 behaviour, zero loss");
  // `absent` since C6-3 — the party scan stops at the intervening `Attention:` label, so no
  // party is read and the inconclusive-hold branch is never reached. The OBSERVABLE is
  // unchanged (typed stands); an earlier wall now does the work. The hold branch is still live
  // and still pinned — by the disagree/agree pair below, where no label intervenes.
  assert.equal(withPlt.outcome, "absent");
  // THE INVARIANT, now TRUE as originally stated because reservation happens on the CLAIM: a
  // contact-CLAIMED line supplies nothing to the party read — it cannot override, cannot drive a
  // withdraw, and cannot collapse. Typed simply stands, agreeing or not. (The round-5 wording
  // had to be narrowed because reservation then happened only on ACCEPTANCE; R6-1 removed the
  // hole rather than the claim.)
  const disagree = run([VENDOR, BILL_TO, ATTN_LABEL, L("ACME SDN BHD", box(0.72, 2.40, 2.60, 2.54))],
    "Lim Xiao Shan", box(0.72, 2.40, 2.60, 2.54));
  assert.equal(disagree.customer, "Lim Xiao Shan", "it does not override…");
  assert.notEqual(disagree.outcome, "attn_overridden", "…and it does not withdraw either");
  assert.equal(disagree.customer !== undefined, true, "the typed row survives");
  const agree = run([VENDOR, BILL_TO, ATTN_LABEL, L("ACME SDN BHD", box(0.72, 2.40, 2.60, 2.54))],
    "ACME SDN BHD", box(0.72, 2.40, 2.60, 2.54));
  assert.equal(agree.customer, "ACME SDN BHD", "…and an agreeing typed row is left untouched");
  assert.equal(agree.outcome, "absent", "no party was read from the claimed line at all");
  // THE ROUND-5 COUNTEREXAMPLE, NOW CLOSED BY R6-1. This layout was the reason the invariant had
  // to be narrowed at 7bcbd39: `AMATERUS GROUP SDN BHD` was refused as a contact, re-entered as a
  // party, met a second labelled party, and drove a CONTESTED withdraw of a CORRECT typed name.
  // With reservation on the CLAIM, the AMATERUS line is out of the party read entirely, only
  // KONG CHENG remains, and the correct typed name simply survives. The strong wording holds
  // again — and this is the fail-open-free direction: one fewer withdraw, no new assertion.
  const wasContest = run([VENDOR, BILL_TO, ATTN_LABEL,
    L("AMATERUS GROUP SDN BHD", box(0.72, 2.40, 2.90, 2.54)),
    L("Customer : KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.70, 4.60, 2.84)),
  ], "KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.70, 3.60, 2.84));
  assert.equal(wasContest.customer, "KONG CHENG RESTAURANTS SDN BHD", "the correct typed name is no longer withdrawn");
  assert.equal(wasContest.outcome, "matched", "the claimed line never entered the contest");
  // A GENUINE two-party contest — both on UNCLAIMED lines — still withdraws (residual 3).
  const realContest = run([VENDOR,
    L("Bill To: WRONG HOLDING SDN BHD", box(0.72, 2.15, 3.60, 2.29)),
    L("Customer : ACTUAL SUBSIDIARY SDN BHD", box(0.72, 2.32, 3.90, 2.46)),
  ], "WRONG HOLDING SDN BHD", box(0.72, 2.15, 3.60, 2.29));
  assert.equal(realContest.outcome, "contested");
  assert.equal(realContest.customer, undefined);
  // The S/B rescue survives — shown on the ORDINARY ordering (`Bill To:` / party / `Attn :`),
  // which is what the measured KONG CHENG documents actually print. The previous fixture put the
  // party AFTER an `Attention:` block, and since C6-3 a label terminates the scan, so that
  // layout now abstains regardless of the S/B question — it could no longer exercise it.
  const sb = run([VENDOR, BILL_TO, KONG_CHENG, L("Attn : Lim S.B.", ATTN_BOX)], "Lim S.B.");
  assert.equal(sb.customer, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(sb.contact, "Lim S.B.");
  assert.equal(sb.outcome, "attn_overridden");
});

test("S4 end-to-end: slash and hyphen renderings CONTEST rather than merge", () => {
  const r = run([VENDOR,
    L("Bill To: A/B TRADING SDN BHD", box(0.72, 2.15, 3.60, 2.29)),
    L("Customer : A-B TRADING SDN BHD", box(0.72, 2.32, 3.60, 2.46)),
  ], "A-B TRADING SDN BHD", box(0.72, 2.32, 3.60, 2.46));
  assert.equal(r.outcome, "contested", "two punctuation classes are two names, so this HOLDS");
  assert.equal(r.customer, undefined);
});

test("THE CONTROL: F7's own measured defect still fixes, and the honest narrowing is real", () => {
  // (c) the reason this reader exists — KONG CHENG RESTAURANTS SDN BHD carries the entity signal.
  const fixed = run([VENDOR, BILL_TO, KONG_CHENG, ATTN], "Lim Xiao Shan");
  assert.equal(fixed.customer, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(fixed.contact, "Lim Xiao Shan");
  assert.equal(fixed.outcome, "attn_overridden");
  // (d) the narrowing, pinned so it is a recorded decision: an UNSUFFIXED buyer never overrides.
  // `SIFU LAB` is a real customer on this client's books (acceptance-h1 row 13).
  const narrowed = run([VENDOR, L("Bill To: SIFU LAB", box(0.72, 2.30, 2.60, 2.45)), ATTN], "Lim Xiao Shan");
  // WHAT THE NARROWING NOW COSTS, restated honestly by Ruling 2. It used to be "zero loss against
  // today — Azure's typed value stands". It no longer stands: the typed value here IS the Attn
  // person, so the row is withdrawn and the lane HOLDS on `customer_name_missing`. That is a
  // strictly better trade, not a worse one — `Lim Xiao Shan` was never the buyer of `SIFU LAB`'s
  // invoice, and a hold sends it to the human who can name the real one. The narrowing itself is
  // unchanged: an unsuffixed buyer still never overrides.
  assert.equal(narrowed.customer, WITHDRAWN, "the unsuffixed buyer abstains AND the person is withdrawn");
  assert.equal(narrowed.contact, "Lim Xiao Shan", "the person is still emitted, honestly, as the contact");
  assert.notEqual(narrowed.outcome, "attn_overridden");
});

