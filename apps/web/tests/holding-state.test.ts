import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasOpenRegistrationFor,
  holdingStateFrom,
  type HoldingDecision,
  type HoldingState,
} from "../lib/registration/holding-state";
import { NO_CHECKOUT_PROGRESS, type CheckoutProgress } from "../lib/registration/checkout-progress-reads";
import type { RegistrationRequestRow } from "../lib/registration/reads";
import type { OwnRegistrationResult } from "../lib/registration/server-reads";
import type { CallerContextOutcome } from "../lib/identity/doors";

/**
 * THE HOLDING STATE's DECISION (design §4 E) — every branch driven directly.
 *
 * This is the judgement logic of /pending: it decides what is TRUE of a person
 * who is signed in and belongs to no firm. It lives in a pure function
 * precisely so these cells can exist — inside the Server Component's body, the
 * two fail-closed branches would be reachable only through a live request scope,
 * and a fail-closed branch nobody has watched close is a branch nobody has seen
 * work.
 *
 * EVERY CELL BELOW ASSERTS A DISCRIMINATING POST-CONDITION, and the mutants at
 * the bottom are the RED-before proof: each one is the smallest plausible wrong
 * implementation, and each is asserted to produce a DIFFERENT answer from the
 * shipped one. A cell that passed against both would be proving nothing.
 */

const ROW = (over: Partial<RegistrationRequestRow> = {}): RegistrationRequestRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  applicant: "22222222-2222-2222-2222-222222222222",
  firm_name: "ROME PROPERTIES",
  note: null,
  status: "open",
  decided_by: null,
  decided_at: null,
  reason: null,
  firm_id: null,
  created_at: "2026-08-30T00:00:00Z",
  ...over,
});

const SUBJECT = "22222222-2222-2222-2222-222222222222";

const NO_MEMBERSHIP: CallerContextOutcome = { ok: false, reason: "no_membership" };

const ok = (
  rows: RegistrationRequestRow[],
  context: CallerContextOutcome = NO_MEMBERSHIP,
  checkoutProgress: CheckoutProgress = NO_CHECKOUT_PROGRESS,
): OwnRegistrationResult =>
  ({
    ok: true,
    subject: SUBJECT,
    rows,
    context,
    checkoutProgress,
  }) as unknown as OwnRegistrationResult;

const MEMBER_CONTEXT: CallerContextOutcome = {
  ok: true,
  context: {
    user_id: SUBJECT,
    firm_id: "33333333-3333-3333-3333-333333333333",
    firm_name: "BELCORT",
    role: "owner",
    role_rank: 40,
    is_operator: true,
  },
};

describe("holdingStateFrom — the six renderings, one per observable fact", () => {
  it("an OPEN row is `pending`, carrying the DB's own firm name", () => {
    const state = holdingStateFrom(ok([ROW({ status: "open", firm_name: "BEE CREATIVE SOLUTION" })]));
    assert.deepEqual(state, { kind: "pending", firmName: "BEE CREATIVE SOLUTION" });
  });

  it("a REJECTED row is `rejected`, carrying the DB's own reason VERBATIM", () => {
    // Discriminating on the reason text specifically: a mapper that produced
    // the right KIND but dropped or re-worded the reason would pass a
    // kind-only assertion, and the reason is the entire point of this state.
    const state = holdingStateFrom(
      ok([ROW({ status: "rejected", reason: "the firm name matches an existing member firm" })]),
    );
    assert.deepEqual(state, {
      kind: "rejected",
      firmName: "ROME PROPERTIES",
      reason: "the firm name matches an existing member firm",
    });
  });

  it("a REJECTED row with NO reason keeps `reason: null` — never a fabricated sentence", () => {
    // `reason` is nullable on the base table (0145:333). "No reason was
    // recorded" and "the reason is empty" are different facts; this layer must
    // hand the renderer the null rather than substituting prose here, or the
    // renderer loses the ability to tell them apart.
    const state = holdingStateFrom(ok([ROW({ status: "rejected", reason: null })]));
    assert.deepEqual(state, { kind: "rejected", firmName: "ROME PROPERTIES", reason: null });
  });

  it("an APPROVED row is `approved` — NOT folded into invite-expected", () => {
    // The scope note in holding-state.ts's header. An applicant whose request
    // was granted but whose session still carries no membership is a real
    // state, and calling it "invite-expected" would tell them their firm does
    // not exist while the DB says it does.
    const state = holdingStateFrom(
      ok([ROW({ status: "approved", firm_id: "33333333-3333-3333-3333-333333333333" })]),
    );
    assert.deepEqual(state, { kind: "approved", firmName: "ROME PROPERTIES" });
  });

  it("a successful read with ZERO rows is `invite-expected`", () => {
    assert.deepEqual(holdingStateFrom(ok([])), { kind: "invite-expected" });
  });

  it("an UNVERIFIED caller is `unidentified` — emphatically not emptiness", () => {
    // `loadOwnRegistrationRequests` returns this branch WITHOUT issuing a read
    // at all. Rendering it as invite-expected would confidently tell a
    // signed-in applicant their pending application does not exist, on nothing
    // more than a claims-verification blip.
    const state = holdingStateFrom({ ok: false, reason: "no_session" });
    assert.deepEqual(state, { kind: "unidentified" });
    assert.notDeepEqual(state, { kind: "invite-expected" });
  });

  it("an UNKNOWN status falls to `read-failed`, never to a guessed neighbour", () => {
    // `RegistrationRequestStatus` is widened to `string` so an added value
    // reaches this code instead of crashing a consumer. The fail-closed answer
    // is to admit the row is unreadable — never to pick whichever of the three
    // known states it most resembles.
    assert.deepEqual(holdingStateFrom(ok([ROW({ status: "withdrawn" })])), { kind: "read-failed" });
    assert.deepEqual(holdingStateFrom(ok([ROW({ status: "" })])), { kind: "read-failed" });
  });

  it("all eight kinds are reachable — no branch is dead", () => {
    // Absence is not evidence: without this cell, a mapper that could never
    // produce (say) `approved` would still pass every cell above that does not
    // exercise it. This enumerates the reachable set and pins its size.
    // FS-4 C-6 widened six to eight: `checkout_open` and `paid` are new
    // SIBLING kinds of an open registration (holding-state.ts's header), each
    // reached only via a POSITIVE `checkoutProgress` read.
    const reached = new Set([
      holdingStateFrom(ok([ROW({ status: "open" })])).kind,
      holdingStateFrom(ok([ROW({ status: "open" })], NO_MEMBERSHIP, { checkoutOpen: true, paidUnconsumed: false })).kind,
      holdingStateFrom(ok([ROW({ status: "open" })], NO_MEMBERSHIP, { checkoutOpen: false, paidUnconsumed: true })).kind,
      holdingStateFrom(ok([ROW({ status: "rejected" })])).kind,
      holdingStateFrom(ok([ROW({ status: "approved" })])).kind,
      holdingStateFrom(ok([])).kind,
      holdingStateFrom({ ok: false, reason: "no_session" }).kind,
      holdingStateFrom(ok([ROW({ status: "???" })])).kind,
    ]);
    assert.deepEqual(
      [...reached].sort(),
      [
        "approved",
        "checkout_open",
        "invite-expected",
        "paid",
        "pending",
        "read-failed",
        "rejected",
        "unidentified",
      ],
    );
  });
});

describe("FS-4 C-6, §2.1: checkout_open and paid — POSITIVELY read, never guessed", () => {
  const OPEN_ROW = ROW({ status: "open", firm_name: "BEE CREATIVE SOLUTION" });

  it("no checkout progress observed → the DEFAULT pending arm (backward compatible)", () => {
    assert.deepEqual(holdingStateFrom(ok([OPEN_ROW])), {
      kind: "pending",
      firmName: "BEE CREATIVE SOLUTION",
    });
    // The explicit NO_CHECKOUT_PROGRESS value must answer identically to
    // omitting the argument entirely — the two must never drift apart.
    assert.deepEqual(
      holdingStateFrom(ok([OPEN_ROW], NO_MEMBERSHIP, NO_CHECKOUT_PROGRESS)),
      { kind: "pending", firmName: "BEE CREATIVE SOLUTION" },
    );
  });

  it("checkoutOpen observed → checkout_open, carrying the DB's own firm name", () => {
    const state = holdingStateFrom(
      ok([OPEN_ROW], NO_MEMBERSHIP, { checkoutOpen: true, paidUnconsumed: false }),
    );
    assert.deepEqual(state, { kind: "checkout_open", firmName: "BEE CREATIVE SOLUTION" });
  });

  it("paidUnconsumed observed → paid", () => {
    const state = holdingStateFrom(
      ok([OPEN_ROW], NO_MEMBERSHIP, { checkoutOpen: false, paidUnconsumed: true }),
    );
    assert.deepEqual(state, { kind: "paid", firmName: "BEE CREATIVE SOLUTION" });
  });

  it("PAID OUTRANKS checkout_open when (implausibly) both were observed", () => {
    const state = holdingStateFrom(
      ok([OPEN_ROW], NO_MEMBERSHIP, { checkoutOpen: true, paidUnconsumed: true }),
    );
    assert.equal(state.kind, "paid", "the more-advanced fact must win, never the earlier one");
  });

  it("checkout progress is IGNORED for every non-open status — a decided registration owes no checkout read", () => {
    const rejected = holdingStateFrom(
      ok([ROW({ status: "rejected", reason: "no" })], NO_MEMBERSHIP, { checkoutOpen: true, paidUnconsumed: true }),
    );
    assert.equal(rejected.kind, "rejected", "checkout progress leaked into a decided registration's rendering");

    const approved = holdingStateFrom(
      ok([ROW({ status: "approved" })], NO_MEMBERSHIP, { checkoutOpen: true, paidUnconsumed: true }),
    );
    assert.equal(approved.kind, "approved");
  });

  it("MUTANT: inferring checkout_open from EMPTY checkoutProgress (absence as evidence) is RED against the shipped answer", () => {
    // The mutant a careless "positive read" refactor could introduce: treating
    // an EMPTY/omitted read as if it POSITIVELY observed progress, rather than
    // as "nothing observed". Absence is not evidence (review law 2).
    const guessOpenFromAbsence = (r: OwnRegistrationResult): HoldingDecision => {
      const real = holdingStateFrom(r);
      return real.kind === "pending" ? { kind: "checkout_open", firmName: real.firmName } : real;
    };
    const shipped = holdingStateFrom(ok([OPEN_ROW]));
    assert.notDeepEqual(guessOpenFromAbsence(ok([OPEN_ROW])), shipped);
    assert.equal(shipped.kind, "pending");
  });
});

describe("M5, fix round 2026-09-01: hasOpenRegistrationFor — signup-route.tsx's third-fork gate", () => {
  // Had ZERO direct coverage before this round (grepped: only source refs) —
  // this is the PR's central new routing decision, and it needed its own
  // test file entry rather than living only as inference from
  // `renderSignupRoute` integration tests.
  const OPEN_ROW = ROW({ status: "open" });

  it("a validated OPEN row bound to the verified subject → true", () => {
    assert.equal(hasOpenRegistrationFor(ok([OPEN_ROW]), SUBJECT), true);
  });

  it("a REJECTED row → false — only 'open' reroutes to the DPA step", () => {
    assert.equal(hasOpenRegistrationFor(ok([ROW({ status: "rejected" })]), SUBJECT), false);
  });

  it("an APPROVED row → false", () => {
    assert.equal(hasOpenRegistrationFor(ok([ROW({ status: "approved" })]), SUBJECT), false);
  });

  it("zero rows → false — the ordinary case for a caller with no registration yet", () => {
    assert.equal(hasOpenRegistrationFor(ok([]), SUBJECT), false);
  });

  it("an OPEN row for a DIFFERENT subject → false, never trusted cross-subject", () => {
    assert.equal(
      hasOpenRegistrationFor(ok([OPEN_ROW]), "99999999-9999-9999-9999-999999999999"),
      false,
    );
  });

  it("an unverified read (!ok) → false, never inferred", () => {
    assert.equal(hasOpenRegistrationFor({ ok: false, reason: "no_session" }), false);
  });

  it("a malformed row → false, the same validator holdingStateFrom itself trusts", () => {
    const malformed = { ok: true, subject: SUBJECT, rows: [{ status: "open" }] } as unknown as OwnRegistrationResult;
    assert.equal(hasOpenRegistrationFor(malformed, SUBJECT), false);
  });

  it("only the NEWEST row decides, matching holdingStateFrom's own ordering", () => {
    const newestOpen = ROW({ id: "aaaaaaaa-0000-0000-0000-000000000003", status: "open", created_at: "2026-08-30T10:00:00Z" });
    const olderRejected = ROW({ id: "aaaaaaaa-0000-0000-0000-000000000004", status: "rejected", created_at: "2026-08-01T10:00:00Z" });
    assert.equal(hasOpenRegistrationFor(ok([newestOpen, olderRejected]), SUBJECT), true);
    assert.equal(hasOpenRegistrationFor(ok([olderRejected, newestOpen]), SUBJECT), false);
  });

  it("MUTANT: scanning for ANY open row (instead of only the newest) is RED against the shipped answer", () => {
    const newestRejected = ROW({ id: "aaaaaaaa-0000-0000-0000-000000000005", status: "rejected", created_at: "2026-08-30T10:00:00Z" });
    const olderOpen = ROW({ id: "aaaaaaaa-0000-0000-0000-000000000006", status: "open", created_at: "2026-08-01T10:00:00Z" });
    const result = ok([newestRejected, olderOpen]);
    const scanAnyOpen = (r: OwnRegistrationResult): boolean =>
      r.ok && (r.rows as RegistrationRequestRow[]).some((row) => row.status === "open");
    assert.notEqual(scanAnyOpen(result), hasOpenRegistrationFor(result, SUBJECT));
    assert.equal(hasOpenRegistrationFor(result, SUBJECT), false);
  });
});

describe("the NEWEST row decides — decided rows accumulate", () => {
  // `uq_firm_registration_requests_open_applicant` (0145:340-341) caps only the
  // OPEN rows, so a rejected applicant who requests again genuinely has two.
  // The read orders `created_at.desc`, so rows[0] is today's answer.
  const NEWEST_OPEN = ROW({ id: "aaaaaaaa-0000-0000-0000-000000000001", status: "open", created_at: "2026-08-30T10:00:00Z" });
  const OLDER_REJECTED = ROW({ id: "aaaaaaaa-0000-0000-0000-000000000002", status: "rejected", reason: "not this time", created_at: "2026-08-01T10:00:00Z" });

  it("reports the newest row, not the first-listed status it recognises", () => {
    assert.deepEqual(holdingStateFrom(ok([NEWEST_OPEN, OLDER_REJECTED])), {
      kind: "pending",
      firmName: "ROME PROPERTIES",
    });
  });

  it("…and the same two rows the other way round give the OTHER answer", () => {
    // THE DISCRIMINATING HALF. The cell above alone is satisfied by an
    // implementation that scans for the first `open` row anywhere in the list.
    // Reversing the order must reverse the verdict — that is only true of an
    // implementation that genuinely takes rows[0].
    assert.deepEqual(holdingStateFrom(ok([OLDER_REJECTED, NEWEST_OPEN])), {
      kind: "rejected",
      firmName: "ROME PROPERTIES",
      reason: "not this time",
    });
  });

  it("does not re-sort: the DB's ordering is the only ordering", () => {
    // A client-side re-sort would be a second implementation of the same
    // ordering, free to disagree with the first. Here the created_at values
    // deliberately CONTRADICT the array order; the shipped function must
    // still answer from rows[0], proving it never looked at the timestamps.
    const state = holdingStateFrom(ok([OLDER_REJECTED, NEWEST_OPEN]));
    assert.equal(state.kind, "rejected", "the function re-sorted by created_at instead of trusting the read");
  });
});

describe("N3: membership evidence outranks registration history", () => {
  it("a proved firm member with ZERO requests leaves /pending", () => {
    assert.deepEqual(holdingStateFrom(ok([], MEMBER_CONTEXT)), { kind: "member" });
  });

  it("a proved firm member with a historical request still leaves /pending", () => {
    assert.deepEqual(
      holdingStateFrom(ok([ROW({ status: "rejected", reason: "historical" })], MEMBER_CONTEXT)),
      { kind: "member" },
    );
  });

  it("an ambiguous membership fails closed instead of reporting a request", () => {
    assert.deepEqual(
      holdingStateFrom(ok([ROW()], { ok: false, reason: "ambiguous" })),
      { kind: "read-failed", reason: "ambiguous" },
    );
  });

  it("a malformed membership fails closed instead of deriving no membership", () => {
    assert.deepEqual(
      holdingStateFrom(ok([], { ok: false, reason: "malformed" })),
      { kind: "read-failed", reason: "malformed" },
    );
  });
});

describe("MED-4: hydrated rows are validated and bound to the verified subject", () => {
  it("a partial row such as {status: 'open'} fails closed as malformed", () => {
    const result = { ok: true, rows: [{ status: "open" }] } as unknown as OwnRegistrationResult;
    assert.deepEqual(holdingStateFrom(result, SUBJECT), {
      kind: "read-failed",
      reason: "malformed",
    });
  });

  it("a non-string reason fails closed even when this status would not display it", () => {
    const result = ok([ROW({ status: "open", reason: 42 as unknown as string })]);
    assert.deepEqual(holdingStateFrom(result, SUBJECT), {
      kind: "read-failed",
      reason: "malformed",
    });
  });

  it("a well-formed row for somebody else fails closed as wrong_subject", () => {
    const result = ok([ROW({ applicant: "99999999-9999-9999-9999-999999999999" })]);
    assert.deepEqual(holdingStateFrom(result, SUBJECT), {
      kind: "read-failed",
      reason: "wrong_subject",
    });
  });

  it("every one of the ten declared columns is shape-checked", () => {
    const invalid: Array<[keyof RegistrationRequestRow, unknown]> = [
      ["id", 1],
      ["applicant", null],
      ["firm_name", false],
      ["note", 1],
      ["status", null],
      ["decided_by", 1],
      ["decided_at", false],
      ["reason", 1],
      ["firm_id", false],
      ["created_at", 1],
    ];
    for (const [column, value] of invalid) {
      const row = { ...ROW(), [column]: value };
      const result = { ok: true, rows: [row] } as unknown as OwnRegistrationResult;
      assert.deepEqual(
        holdingStateFrom(result, SUBJECT),
        { kind: "read-failed", reason: "malformed" },
        `${column} was not validated`,
      );
    }
  });
});

describe("RED-BEFORE — each mutant is measured to give a DIFFERENT answer", () => {
  /** MUTANT A: the fail-closed collapse — `!result.ok` treated as emptiness. */
  const collapseUnidentified = (r: OwnRegistrationResult): HoldingDecision =>
    !r.ok ? { kind: "invite-expected" } : holdingStateFrom(r);

  /** MUTANT B: an unknown status guessed as pending instead of refused. */
  const guessUnknownAsPending = (r: OwnRegistrationResult): HoldingState => {
    if (!r.ok) return { kind: "unidentified" };
    const n = r.rows[0] as RegistrationRequestRow | undefined;
    if (n === undefined) return { kind: "invite-expected" };
    if (n.status === "rejected") return { kind: "rejected", firmName: n.firm_name, reason: n.reason };
    if (n.status === "approved") return { kind: "approved", firmName: n.firm_name };
    return { kind: "pending", firmName: n.firm_name };
  };

  /** MUTANT C: `approved` folded into `invite-expected`. */
  const foldApproved = (r: OwnRegistrationResult): HoldingDecision => {
    const real = holdingStateFrom(r);
    return real.kind === "approved" ? { kind: "invite-expected" } : real;
  };

  /** MUTANT D: a fabricated reason where the DB recorded none. */
  const inventReason = (r: OwnRegistrationResult): HoldingDecision => {
    const real = holdingStateFrom(r);
    return real.kind === "rejected" && real.reason === null
      ? { ...real, reason: "Your application did not meet our criteria." }
      : real;
  };

  /** MUTANT E: scan for an open row anywhere instead of taking the newest. */
  const scanForOpen = (r: OwnRegistrationResult): HoldingDecision => {
    if (!r.ok) return { kind: "unidentified" };
    const open = (r.rows as readonly RegistrationRequestRow[]).find(
      (x) => x.status === "open",
    );
    return open === undefined ? holdingStateFrom(r) : { kind: "pending", firmName: open.firm_name };
  };

  const UNVERIFIED: OwnRegistrationResult = { ok: false, reason: "no_session" };
  const UNKNOWN_STATUS = ok([ROW({ status: "withdrawn" })]);
  const APPROVED = ok([ROW({ status: "approved" })]);
  const REJECTED_NO_REASON = ok([ROW({ status: "rejected", reason: null })]);
  const REJECTED_THEN_OPEN = ok([
    ROW({ status: "rejected", reason: "not this time", created_at: "2026-08-01T00:00:00Z" }),
    ROW({ status: "open", created_at: "2026-08-30T00:00:00Z" }),
  ]);

  it("MUTANT A (unverified → empty) is RED against the shipped answer", () => {
    assert.notDeepEqual(collapseUnidentified(UNVERIFIED), holdingStateFrom(UNVERIFIED));
    assert.deepEqual(holdingStateFrom(UNVERIFIED), { kind: "unidentified" });
  });

  it("MUTANT B (unknown status → pending) is RED against the shipped answer", () => {
    assert.notDeepEqual(guessUnknownAsPending(UNKNOWN_STATUS), holdingStateFrom(UNKNOWN_STATUS));
    assert.deepEqual(holdingStateFrom(UNKNOWN_STATUS), { kind: "read-failed" });
  });

  it("MUTANT C (approved → invite-expected) is RED against the shipped answer", () => {
    assert.notDeepEqual(foldApproved(APPROVED), holdingStateFrom(APPROVED));
    assert.equal(holdingStateFrom(APPROVED).kind, "approved");
  });

  it("MUTANT D (fabricated reason) is RED against the shipped answer", () => {
    assert.notDeepEqual(inventReason(REJECTED_NO_REASON), holdingStateFrom(REJECTED_NO_REASON));
    const shipped = holdingStateFrom(REJECTED_NO_REASON);
    assert.equal(shipped.kind === "rejected" && shipped.reason, null);
  });

  it("MUTANT E (scan for open) is RED against the shipped answer", () => {
    assert.notDeepEqual(scanForOpen(REJECTED_THEN_OPEN), holdingStateFrom(REJECTED_THEN_OPEN));
    assert.equal(holdingStateFrom(REJECTED_THEN_OPEN).kind, "rejected");
  });

  it("VACUITY CONTROL: every mutant AGREES with the shipped function elsewhere", () => {
    // Without this, a mutant that differed everywhere would make the five cells
    // above pass while proving nothing about the specific branch each names.
    // On an ordinary open request all five must be indistinguishable, so what
    // the cells above detect is exactly the branch, not a broken mutant.
    const ORDINARY = ok([ROW({ status: "open" })]);
    const shipped = holdingStateFrom(ORDINARY);
    for (const [name, mutant] of [
      ["A", collapseUnidentified],
      ["B", guessUnknownAsPending],
      ["C", foldApproved],
      ["D", inventReason],
      ["E", scanForOpen],
    ] as const) {
      assert.deepEqual(mutant(ORDINARY), shipped, `mutant ${name} differs on an ordinary open request`);
    }
  });
});
