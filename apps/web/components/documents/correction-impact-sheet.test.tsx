// #646 — THE WRONG-CLIENT IMPACT SHEET, and the two things appendix D row 51 demands of a Sheet:
// a Title, and content that is SUPPORTING context rather than the decision itself.
//
// MEASURED LIMITATION, stated rather than worked around: mounting `components/ui/sheet.tsx` OPEN
// inside this node harness and then running the structural a11y scan over `document.body` does not
// terminate here — the run reached "Array buffer allocation failed" after 90s. The primitive's
// focus trap and this environment's DOM stub do not compose, which is a property of the harness and
// not of the surface. So the OPEN-overlay a11y scan for this Sheet is carried by the BROWSER, where
// a real focus trap exists: `e2e/document-correction-walk.spec.ts`'s "the impact radius opens in a
// Sheet" cell opens it and runs axe SCOPED TO THE SHEET ELEMENT itself
// (`.include('[data-testid="correction-impact-sheet"]')`), so that scan cannot pass while the
// Sheet is closed. What this file pins is the part a unit test can honestly answer — the pure projection that
// decides whether the transferred-away sentence is owed at all.

import { test } from "node:test";
import assert from "node:assert/strict";

import { transferredAway } from "./source-correction-band";
import type { SourceLineageEntry } from "../../lib/documents/types";

const correction = (over: Partial<SourceLineageEntry> = {}): SourceLineageEntry => ({
  entry_kind: "wrong_client_correction",
  at: "2026-04-02T03:00:00Z",
  correction_id: "corr-1",
  from_client: "rome",
  to_client: "bee",
  status: "completed",
  retired_filings: [{
    filing_id: "f1", client_id: "rome", retired_at: "2026-04-02T03:00:00Z",
    retirement_reason: "wrong client",
  }],
  ...over,
});

test("the transferred-away sentence is owed to the client whose FILING the correction retired", () => {
  const moved = transferredAway([correction()], "rome");
  assert.ok(moved, "the origin client is owed the sentence — the document must not just vanish");
  assert.equal(moved!.correctionId, "corr-1");
  assert.equal(moved!.toClient, "bee");
  assert.equal(moved!.at, "2026-04-02T03:00:00Z", "dated from the filing's own retirement");
});

test("it is NOT owed to the destination client, nor on a correction that retired nothing", () => {
  assert.equal(transferredAway([correction()], "bee"), null,
    "the destination reads the document normally — it is not 'transferred away' from there");
  // A PROPOSED-BUT-NEVER-APPROVED correction retires no filing. Inferring the sentence from "a
  // correction exists and this is not the destination" would announce a transfer that never
  // happened, which is why the projection reads `retired_filings` instead.
  assert.equal(transferredAway([correction({ status: "proposed", retired_filings: [] })], "rome"), null);
  assert.equal(transferredAway([], "rome"), null);
  assert.equal(transferredAway([{ entry_kind: "fact", at: null }], "rome"), null,
    "a fact revision is not a transfer");
});
