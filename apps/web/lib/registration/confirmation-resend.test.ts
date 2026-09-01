// M3, fix round 2026-09-01 — the resend control's Lane-B seam
// (confirmation-resend.ts's own header carries the ORCHESTRATOR RULING).
// This file proves the ONE property that matters: the production default
// never sends anything, regardless of what it is called with.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { requestConfirmationResend } from "./confirmation-resend";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("the production default always refuses, for any address", async () => {
  for (const email of ["aisyah@example.com", "", "attacker@evil.example"]) {
    const outcome = await requestConfirmationResend(email);
    assert.deepEqual(outcome, { kind: "unavailable" });
  }
});

test("the card that calls this seam holds no reachable path to supabase.auth.resend", () => {
  // M3's finding named the exact hole: a direct browser call to
  // `supabase.auth.resend`, unauthenticated and unwalled. This is the
  // mechanical proof the hole is closed at the SOURCE, not merely that this
  // seam's own default is honest — a card that still imported the browser
  // Supabase client for some other reason and called `.auth.resend` on it
  // would defeat the seam entirely while this file's other cell stayed green.
  const cardSource = readFileSync(
    join(WEB_ROOT, "components/entry/email-confirmation-card.tsx"),
    "utf8",
  );
  assert.doesNotMatch(cardSource, /supabase\.auth\.resend/, "the card calls resend directly");
  assert.doesNotMatch(cardSource, /@\/lib\/supabase\/client/, "the card still imports the browser Supabase client");
  assert.match(cardSource, /requestConfirmationResend/, "the card no longer calls the seam at all");
});
