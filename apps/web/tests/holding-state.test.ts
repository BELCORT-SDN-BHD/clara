import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  holdingStateFrom,
  type HoldingState,
} from "../lib/registration/holding-state";
import type { RegistrationRequestRow } from "../lib/registration/reads";
import type { OwnRegistrationResult } from "../lib/registration/server-reads";

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

const ok = (rows: RegistrationRequestRow[]): OwnRegistrationResult => ({
  ok: true,
  subject: SUBJECT,
  rows,
});

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

  it("all six kinds are reachable — no branch is dead", () => {
    // Absence is not evidence: without this cell, a mapper that could never
    // produce (say) `approved` would still pass every cell above that does not
    // exercise it. This enumerates the reachable set and pins its size.
    const reached = new Set<HoldingState["kind"]>([
      holdingStateFrom(ok([ROW({ status: "open" })])).kind,
      holdingStateFrom(ok([ROW({ status: "rejected" })])).kind,
      holdingStateFrom(ok([ROW({ status: "approved" })])).kind,
      holdingStateFrom(ok([])).kind,
      holdingStateFrom({ ok: false, reason: "no_session" }).kind,
      holdingStateFrom(ok([ROW({ status: "???" })])).kind,
    ]);
    assert.deepEqual(
      [...reached].sort(),
      ["approved", "invite-expected", "pending", "read-failed", "rejected", "unidentified"],
    );
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
  const collapseUnidentified = (r: OwnRegistrationResult): HoldingState =>
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
  const foldApproved = (r: OwnRegistrationResult): HoldingState => {
    const real = holdingStateFrom(r);
    return real.kind === "approved" ? { kind: "invite-expected" } : real;
  };

  /** MUTANT D: a fabricated reason where the DB recorded none. */
  const inventReason = (r: OwnRegistrationResult): HoldingState => {
    const real = holdingStateFrom(r);
    return real.kind === "rejected" && real.reason === null
      ? { ...real, reason: "Your application did not meet our criteria." }
      : real;
  };

  /** MUTANT E: scan for an open row anywhere instead of taking the newest. */
  const scanForOpen = (r: OwnRegistrationResult): HoldingState => {
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
