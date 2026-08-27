// Presentational rendering tests — see components/close/close-components.test.tsx's
// header for the shared rationale (renderToStaticMarkup + a real
// NextIntlClientProvider over the app's own messages/en.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { ArtifactRow, isValidByteSize } from "./ArtifactRow";
import { SandboxExportsPanel } from "./SandboxExportsPanel";
import { FreeformReadsPanel } from "./FreeformReadsPanel";
import { StatutoryReportsPanel } from "./StatutoryReportsPanel";
import { ExportRecipientsPanel } from "./ExportRecipientsPanel";
import { Button } from "@/components/ui/button";
import type { ReportArtifactRow } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

function render(el: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", messages, children: el }));
}

function noSession(): SessionTokenAccessor {
  return { getAccessToken: async () => null };
}

function artifact(overrides: Partial<ReportArtifactRow>): ReportArtifactRow {
  return {
    id: "a1", client_id: "c1", report_run_id: "run1", kind: "pre_sign",
    storage_key: "firms/f1/reports/deadbeef.pdf", key_extension: "pdf", sha256: "deadbeef",
    byte_size: 1024, claim_removed: false, uncertified: false, sealed_by: "u1",
    sealed_at: "2026-01-01", directed_by: null, prepared_by_agent: false,
    ...overrides,
  };
}

test("ArtifactRow: a pre_sign row offers Issue + Archive, and states honestly that no byte-download door exists", () => {
  const html = render(createElement(ArtifactRow, { artifact: artifact({}), session: noSession(), busy: false, act: async (fn) => { await fn(); } }));
  assert.match(html, /Issue for approval/);
  assert.match(html, /Archive signed original/);
  assert.match(html, /No byte-download door exists yet/);
  assert.doesNotMatch(html, />Retrieve</);
});

// THE UNREACHABLE-DOOR REGRESSION, reports half — see components/close/
// close-components.test.tsx's own note for the full shape. DoorDialog used to
// hand its `disabled` prop to the DialogTrigger while the fields that prop
// tested lived INSIDE the dialog, so Issue-for-approval, Archive-signed-
// original and Register-recipient were disabled from first paint forever.
//
// Reads the ATTRIBUTE, never the word: a naive `.includes("disabled")` passes
// on every button here, because the shadcn Button's own class string carries
// `disabled:pointer-events-none`. The positive control proves it can say NO.
function triggerIsEnabled(html: string, label: string): boolean {
  const idx = html.indexOf(`>${label}<`);
  if (idx < 0) return false;
  const openTag = html.lastIndexOf("<button", idx);
  if (openTag < 0) return false;
  return !/\sdisabled=/.test(html.slice(openTag, idx));
}

test("the trigger-enabled probe can still say NO (positive control)", () => {
  assert.ok(triggerIsEnabled(render(createElement(Button, { children: "Probe" })), "Probe"));
  assert.equal(triggerIsEnabled(render(createElement(Button, { disabled: true, children: "Probe" })), "Probe"), false);
});

test("BLOCKER: Issue and Archive triggers are ENABLED before their in-dialog fields are filled", () => {
  const html = render(createElement(ArtifactRow, { artifact: artifact({}), session: noSession(), busy: false, act: async (fn) => { await fn(); } }));
  assert.ok(triggerIsEnabled(html, "Issue for approval"), "the reason field is inside the dialog this trigger opens");
  assert.ok(triggerIsEnabled(html, "Archive signed original"), "sha/byte-size/signer are inside the dialog this trigger opens");
});

test("BLOCKER: the Register-recipient trigger is ENABLED before its in-dialog fields are filled", () => {
  const html = render(createElement(ExportRecipientsPanel, { session: noSession() }));
  assert.ok(triggerIsEnabled(html, "Register recipient"), "user id / display name / basis are inside the dialog this trigger opens");
});

test("ArtifactRow: a signed_original row offers Retrieve, never Issue/Archive", () => {
  const html = render(
    createElement(ArtifactRow, { artifact: artifact({ kind: "signed_original" }), session: noSession(), busy: false, act: async (fn) => { await fn(); } }),
  );
  assert.match(html, />Retrieve</);
  assert.doesNotMatch(html, /Issue for approval/);
  assert.doesNotMatch(html, /Archive signed original/);
});

test("ArtifactRow shows the agent_prepared / claim_removed / uncertified bands only when true", () => {
  const plain = render(createElement(ArtifactRow, { artifact: artifact({}), session: noSession(), busy: false, act: async (fn) => { await fn(); } }));
  assert.doesNotMatch(plain, /agent-prepared/);

  const flagged = render(
    createElement(ArtifactRow, {
      artifact: artifact({ prepared_by_agent: true, claim_removed: true, uncertified: true }),
      session: noSession(), busy: false, act: async (fn) => { await fn(); },
    }),
  );
  assert.match(flagged, /agent-prepared/);
  assert.match(flagged, /claim removed/);
  assert.match(flagged, /uncertified/);
});

// LOW (independent review): kind renders VERBATIM, never a `_` → ` ` relabel.
test("ArtifactRow renders artifact.kind verbatim, never relabelled", () => {
  const html = render(createElement(ArtifactRow, { artifact: artifact({ kind: "pre_sign" }), session: noSession(), busy: false, act: async (fn) => { await fn(); } }));
  assert.match(html, />pre_sign</);
  assert.doesNotMatch(html, />pre sign</);
});

// LOW (independent review, L3): a malformed byte size must never reach
// Number() → NaN → a confusing generic CLR10; validated locally instead.
test("L3: isValidByteSize accepts digits-only, rejects blank/whitespace/non-digit input", () => {
  assert.equal(isValidByteSize("4096"), true);
  assert.equal(isValidByteSize(" 4096 "), true, "surrounding whitespace is trimmed before validating");
  assert.equal(isValidByteSize(""), false);
  assert.equal(isValidByteSize("   "), false);
  assert.equal(isValidByteSize("4096KB"), false);
  assert.equal(isValidByteSize("-4096"), false);
  assert.equal(isValidByteSize("4096.5"), false);
});

test("SandboxExportsPanel honestly states there is no human request door — ask Clara instead", () => {
  const html = render(createElement(SandboxExportsPanel, { clientId: "c1", session: noSession() }));
  assert.match(html, /Analysis sandbox/);
  assert.match(html, /the mint\/request verbs are granted to Clara/);
  assert.match(html, /Ask Clara, in the rail/);
});

test("FreeformReadsPanel honestly states there is no human 'run a freeform read' door", () => {
  const html = render(createElement(FreeformReadsPanel, { clientId: "c1", session: noSession() }));
  assert.match(html, /Freeform reads/);
  assert.match(html, /wake_freeform_read is Clara/);
});

test("StatutoryReportsPanel renders its heading and an honest loading state with no session", () => {
  const html = render(createElement(StatutoryReportsPanel, { clientId: "c1", session: noSession() }));
  assert.match(html, /Statutory close reports/);
  assert.match(html, /Loading report artifacts…|Could not load report artifacts/);
});
