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
import type { DownloadableArtifact, ReportArtifactRow } from "@/lib/reports/types";
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

test("ArtifactRow: a pre_sign row offers Issue + Archive, and no longer claims that no download door exists", () => {
  const html = render(createElement(ArtifactRow, { artifact: artifact({}), offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; } }));
  assert.match(html, /Issue for approval/);
  assert.match(html, /Archive signed original/);
  // THE RETIRED CLAIM, asserted ABSENT rather than quietly dropped: this sentence was true through
  // 0127 and is false after FS-7 echelon 2, and a note that outlives its fact is the honest-note
  // failure the sweep exists to catch.
  assert.doesNotMatch(html, /No byte-download door exists yet/);
  assert.match(html, /never holds a storage credential and never mints a link/);
  assert.doesNotMatch(html, />Retrieve</);
});

// =============================================================================================
// THE DOWNLOAD CONTROL — three states, and the one that matters is the middle one.
// =============================================================================================
function offerRow(overrides: Partial<DownloadableArtifact> = {}): DownloadableArtifact {
  return {
    artifact_id: "a1", family: "report_artifact", label: "pre_sign", produced_at: "2026-01-01",
    downloadable: true, refusal_reason: null,
    sha256: "d".repeat(64), byte_size: 1024, content_type: "application/pdf",
    filename: "clara-report-pre_sign-dddddddddddd.pdf",
    ...overrides,
  };
}

test("DOWNLOAD: no control at all until the offer door has answered (a pending read is not a NO)", () => {
  const html = render(createElement(ArtifactRow, { artifact: artifact({}), offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; } }));
  assert.doesNotMatch(html, />Download</, "a null offer renders neither a control nor a refusal");
  assert.doesNotMatch(html, /Not downloadable/);
});

test("DOWNLOAD: the control appears ONLY when the door says downloadable", () => {
  const yes = render(createElement(ArtifactRow, {
    artifact: artifact({}), offer: offerRow(), session: noSession(), busy: false, act: async (fn) => { await fn(); return true; },
  }));
  assert.match(yes, />Download</);
  assert.doesNotMatch(yes, /Not downloadable/);
});

test("DOWNLOAD: a refused artifact renders the DATABASE's typed reason and NO control (never a dead link)", () => {
  for (const reason of ["artifact_superseded", "artifact_watermark_unproven", "sandbox_export_not_complete"]) {
    const html = render(createElement(ArtifactRow, {
      artifact: artifact({}), offer: offerRow({ downloadable: false, refusal_reason: reason, sha256: null, byte_size: null, content_type: null, filename: null }),
      session: noSession(), busy: false, act: async (fn) => { await fn(); return true; },
    }));
    assert.doesNotMatch(html, />Download</, `a refused artifact (${reason}) must not offer a control`);
    assert.match(html, new RegExp(`Not downloadable . ${reason}`), `the door's own reason must render verbatim (${reason})`);
  }
});

test("DOWNLOAD: the control's accessible name names the FILE, so two rows are tellable apart by a screen reader", () => {
  const html = render(createElement(ArtifactRow, {
    artifact: artifact({}), offer: offerRow(), session: noSession(), busy: false, act: async (fn) => { await fn(); return true; },
  }));
  assert.match(html, /aria-label="Download clara-report-pre_sign-dddddddddddd\.pdf"/);
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
  const html = render(createElement(ArtifactRow, { artifact: artifact({}), offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; } }));
  assert.ok(triggerIsEnabled(html, "Issue for approval"), "the reason field is inside the dialog this trigger opens");
  assert.ok(triggerIsEnabled(html, "Archive signed original"), "sha/byte-size/signer are inside the dialog this trigger opens");
});

test("BLOCKER: the Register-recipient trigger is ENABLED before its in-dialog fields are filled", () => {
  const html = render(createElement(ExportRecipientsPanel, { session: noSession() }));
  assert.ok(triggerIsEnabled(html, "Register recipient"), "user id / display name / basis are inside the dialog this trigger opens");
});

test("ArtifactRow: a signed_original row offers Retrieve, never Issue/Archive", () => {
  const html = render(
    createElement(ArtifactRow, { artifact: artifact({ kind: "signed_original" }), offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; } }),
  );
  assert.match(html, />Retrieve</);
  assert.doesNotMatch(html, /Issue for approval/);
  assert.doesNotMatch(html, /Archive signed original/);
});

test("ArtifactRow shows the agent_prepared / claim_removed / uncertified bands only when true", () => {
  const plain = render(createElement(ArtifactRow, { artifact: artifact({}), offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; } }));
  assert.doesNotMatch(plain, /agent-prepared/);

  const flagged = render(
    createElement(ArtifactRow, {
      artifact: artifact({ prepared_by_agent: true, claim_removed: true, uncertified: true }),
      offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; },
    }),
  );
  assert.match(flagged, /agent-prepared/);
  assert.match(flagged, /claim removed/);
  assert.match(flagged, /uncertified/);
});

// LOW (independent review): kind renders VERBATIM, never a `_` → ` ` relabel.
test("ArtifactRow renders artifact.kind verbatim, never relabelled", () => {
  const html = render(createElement(ArtifactRow, { artifact: artifact({ kind: "pre_sign" }), offer: null, session: noSession(), busy: false, act: async (fn) => { await fn(); return true; } }));
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

// H-16 — RE-CUT. The note's second half used to say "Ask Clara, in the rail, to
// build a sandbox view or request an export", and this cell PINNED that sentence.
// It is a claim about the chat agent's tools and it was false: the registry pins
// chatTurn_v17 (packages/runtime/workflows/registry.ts:86) and buildToolsV17 is
// buildToolsV15 plus exactly open_report_run / assess_report_claim /
// seal_report_dataset (chatTurn.v17.tools.ts:36-38, :156-157). MEASURED absence:
// `grep -rn "mint_sandbox|request_sandbox|request_export" packages/runtime/workflows/`
// returns zero hits.
test("SandboxExportsPanel states only what is reachable: minted by the unattended lane, and NOT by the chat rail", () => {
  const html = render(createElement(SandboxExportsPanel, { clientId: "c1", session: noSession() }));
  assert.match(html, /Analysis sandbox/);
  assert.match(html, /minted by Clara&#x27;s unattended lane|minted by Clara's unattended lane/);
  assert.match(html, /the chat rail has no tool for it either/);
  // The overclaim itself, pinned as an ABSENCE: no copy on this panel may send a
  // human to the rail for a sandbox view or an export.
  assert.doesNotMatch(html, /Ask Clara/, "the panel must not route a human to an affordance that does not exist");
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

// CB-AE2E-027 — the export-recipient register dialog's first field was a free-text
// box whose placeholder read, literally, "Firm member user id (UUID)": an admin had
// to go and find a colleague's uuid by hand and paste it. The roster this picker now
// offers is clara.firm_members_visible (0141:512) — the SAME read the members panel
// uses, already granted to clara_authenticated.
//
// A static render only reaches the COLLAPSED shell (base-ui's Popup does not mount
// while closed), so what is pinned here is the copy contract: the uuid placeholder
// is gone from the shipped catalog, and the picker's own keys are present. The live
// picker itself walks in the browser leg.
test("CB-AE2E-027: the recipient register dialog no longer asks a human for a raw uuid", () => {
  const reg = (messages as unknown as {
    ClientReports: { sandbox: { recipients: { register: Record<string, string | undefined> } } };
  }).ClientReports.sandbox.recipients.register;
  const say = (k: string): string => {
    const v = reg[k];
    assert.ok(typeof v === "string", `ClientReports.sandbox.recipients.register.${k} must exist in the shipped catalog`);
    return v;
  };
  assert.equal(reg.userIdPlaceholder, undefined, "the free-text uuid field's placeholder is retired with the field");
  assert.equal(say("memberLabel"), "Firm member");
  assert.match(say("memberChoose"), /Choose a firm member/);
  // The below-the-floor case is stated honestly: an empty picker is ambiguous
  // between "you cannot read the roster" and "there is nobody", and the copy claims
  // neither (lib/members/use-member-names.ts's own contract).
  assert.match(say("memberRosterUnreadable"), /bookkeepers and above/);
  assert.match(say("memberRosterUnreadable"), /either because you cannot read it or because there is nobody/);
});
