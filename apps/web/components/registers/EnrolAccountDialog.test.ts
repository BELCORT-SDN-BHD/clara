// S1 (independent review, 2026-08-28): `staffAdvanceEnrolCandidates` is a
// semantic byte-mirror of the LIVE `clara._adv_enrolment_admission` typing
// arm (`is_active AND account_type = 'asset' AND account_class IS NULL`,
// lib/registers/staff-advances-doors.ts's grounding header) — this pins that
// mirror behaviourally, one axis at a time, so an inverted filter or a
// dropped conjunct is caught by NAME rather than trusted to stay in sync
// with the DB body it mirrors.

import { test } from "node:test";
import assert from "node:assert/strict";
import { staffAdvanceEnrolCandidates } from "./EnrolAccountDialog";
import type { AccountRow } from "@/lib/registers/accounts";

function account(overrides: Partial<AccountRow>): AccountRow {
  return {
    account_code: "0000",
    name: "Test account",
    account_type: "asset",
    account_class: null,
    special_acc_type: null,
    is_active: true,
    ...overrides,
  };
}

test("staffAdvanceEnrolCandidates: admits an active, asset-typed, non-control account", () => {
  const clean = account({ account_code: "2100", name: "Staff advances — clean" });
  assert.deepEqual(staffAdvanceEnrolCandidates([clean]), [clean]);
});

test("staffAdvanceEnrolCandidates: refuses an INACTIVE account (kills a dropped is_active conjunct)", () => {
  const inactive = account({ account_code: "2101", is_active: false });
  assert.deepEqual(staffAdvanceEnrolCandidates([inactive]), []);
});

test("staffAdvanceEnrolCandidates: refuses a non-asset account_type (kills a dropped/inverted type conjunct — M9/M10)", () => {
  const liability = account({ account_code: "2102", account_type: "liability" });
  const expense = account({ account_code: "2103", account_type: "expense" });
  assert.deepEqual(staffAdvanceEnrolCandidates([liability, expense]), []);
});

test("staffAdvanceEnrolCandidates: refuses a CONTROL account (account_class non-null) — kills a dropped account_class conjunct", () => {
  const control = account({ account_code: "2104", account_class: "ar_control" });
  assert.deepEqual(staffAdvanceEnrolCandidates([control]), []);
});

test("staffAdvanceEnrolCandidates: mixed roster admits ONLY the clean row, never inverting the whole set (kills M9/M10)", () => {
  const clean = account({ account_code: "2100" });
  const inactive = account({ account_code: "2101", is_active: false });
  const liability = account({ account_code: "2102", account_type: "liability" });
  const control = account({ account_code: "2104", account_class: "ar_control" });
  const out = staffAdvanceEnrolCandidates([inactive, liability, control, clean]);
  assert.deepEqual(out, [clean], "an inverted filter would admit the three DISqualified rows and drop the clean one — this proves the opposite");
});

test("staffAdvanceEnrolCandidates: an empty roster admits nothing (never a silent 'anything goes' default)", () => {
  assert.deepEqual(staffAdvanceEnrolCandidates([]), []);
});
