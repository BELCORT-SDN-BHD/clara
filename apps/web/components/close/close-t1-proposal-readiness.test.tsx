// T1 (port-wave, 2026-08-29) — interaction tests for close readiness
// (CloseReadinessPanel: get_close_readiness), the rewritten close-proposal
// workbench (CloseProposalPanel: settle_close_proposal) and the SST
// future-method attestation write door (FutureAttestationPanel:
// record_future_attestation). Split out of the original
// close-t1-workbench.test.tsx (1043 lines; the local max-file-size hook
// flags >500) at rev-t1's round-2 re-verify — see close-t1-opener.test.tsx's
// own header for the full three-file split. Mounts the REAL surfaces
// (renderComponent, fetch mocked only) — never renderToStaticMarkup for
// anything that self-fetches via useHydratedPart. Every dialog interaction
// rides `clickButton`/`setFieldValue` from test/hookHarness.ts
// (apps/web/AGENTS.md's two dialog-testing laws) — `h.fireEvent` never
// touches anything inside an open dialog's portal here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { CloseReadinessPanel } from "./CloseReadinessPanel";
import { CloseProposalPanel } from "./CloseProposalPanel";
import { FutureAttestationPanel } from "./FutureAttestationPanel";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function withProvider(el: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Close"), el),
  });
}

function bodyOf() {
  return (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
}

function findByAttr(root: unknown, attr: string, value: string): unknown {
  const getAttr = (root as { getAttribute?: (n: string) => string | null }).getAttribute;
  if (getAttr && getAttr.call(root, attr) === value) return root;
  for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
    const found = findByAttr(c, attr, value);
    if (found) return found;
  }
  return null;
}
function findAllButtonsByText(root: unknown, label: string, out: unknown[] = []): unknown[] {
  if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === label) out.push(root);
  for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllButtonsByText(c, label, out);
  return out;
}

// N1 (rev-t1 nit, made cheap and worth pinning): a lookup-table Badge-variant
// map (STATE_VARIANT / VERDICT_VARIANT) can be silently swapped — pass<->fail
// — and nothing in the tests above notices, because they only assert the
// STATE WORD renders, never which colour class it renders WITH. Reads the
// class attribute (enableDomInspection's real getAttribute), never the word,
// matching close-components.test.tsx's own `triggerIsEnabled` precedent.
function findExactTextNode(root: unknown, tag: string, text: string): unknown {
  if ((root as { tagName?: string }).tagName === tag && textOf(root as never) === text) return root;
  for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
    const found = findExactTextNode(c, tag, text);
    if (found) return found;
  }
  return null;
}

/** Fills every one of FutureAttestationPanel's five required fields inside
 *  its OPEN dialog — the shared setup FIX-3 (rev-t1) found missing: the
 *  original test filled only ONE field, asserted `disabled === true`, and
 *  stopped — Confirm was never clicked, so the CLR03 mock branch this test's
 *  own NAME promised was unreachable dead code (R2's `throw` mutant still
 *  passed). */
async function fillFutureAttestationForm(body: unknown): Promise<void> {
  setFieldValue(findByAttr(body, "id", "fa-service-group") as never, "G");
  setFieldValue(findByAttr(body, "aria-label", "Expected amount (RM)") as never, "500.00");
  setFieldValue(findByAttr(body, "id", "fa-horizon") as never, "2026-01-01");
  setFieldValue(findByAttr(body, "id", "fa-expires") as never, "2027-01-01");
  setFieldValue(findByAttr(body, "id", "fa-evidence") as never, "signed engagement mandate on file");
}

test("CloseReadinessPanel: cross-references get_close_readiness's bare check_key against the live close_gate_checks catalog — measured gates show state+attested, an absent one shows 'not yet measured'", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_gate_checks")) {
        return jsonResponse([
          { check_key: "ar_control_tie", drawer: 1, title: "AR control account = Σ open receivable items", applies_when: "always" },
          { check_key: "uncoded_documents", drawer: 2, title: "No FY-dated filings without an entry", applies_when: "always" },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const readiness = {
        fiscal_year_id: "fy1", close_run_id: "run1", run_state: "in_progress" as const, fy_end_source: "asserted" as const,
        gates: [{ check_key: "ar_control_tie", drawer: 1 as const, state: "pass" as const, measured: {}, measured_digest: "d1", attested: true }],
      };
      const h = await renderComponent(
        withProvider(createElement(CloseReadinessPanel, { readiness, loading: false, err: null, session: sessionTokenAccessor })),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const text = h.text();
        const arIdx = text.indexOf("AR control account");
        const passIdx = text.indexOf("pass");
        const attestedIdx = text.indexOf("attested");
        const undatedIdx = text.indexOf("No FY-dated filings without an entry");
        const notYetIdx = text.indexOf("not yet measured");
        assert.ok(arIdx >= 0 && passIdx > arIdx, "the MEASURED gate's own state ('pass') must render after its catalog title");
        assert.ok(attestedIdx > passIdx && attestedIdx < undatedIdx, "the measured gate's own 'attested' badge renders in its own row, before the next catalog row starts");
        assert.ok(undatedIdx >= 0 && notYetIdx > undatedIdx, "a check_key ABSENT from get_close_readiness's gates[] must render 'not yet measured' honestly, never be silently omitted");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("N1: CloseReadinessPanel's pass/fail badges carry DISTINCT, correctly-assigned colour classes — a silently-swapped STATE_VARIANT would not be caught by matching the word alone", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_gate_checks")) {
        return jsonResponse([
          { check_key: "ar_control_tie", drawer: 1, title: "AR control account = Σ open receivable items", applies_when: "always" },
          { check_key: "open_bank_recon_items", drawer: 2, title: "No unmatched statement lines", applies_when: "always" },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const readiness = {
        fiscal_year_id: "fy1", close_run_id: "run1", run_state: "in_progress" as const, fy_end_source: "asserted" as const,
        gates: [
          { check_key: "ar_control_tie", drawer: 1 as const, state: "pass" as const, measured: {}, measured_digest: "d1", attested: true },
          { check_key: "open_bank_recon_items", drawer: 2 as const, state: "fail" as const, measured: {}, measured_digest: "d2", attested: false },
        ],
      };
      const h = await renderComponent(
        withProvider(createElement(CloseReadinessPanel, { readiness, loading: false, err: null, session: sessionTokenAccessor })),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const passBadge = findExactTextNode(h.container, "SPAN", "pass");
        const failBadge = findExactTextNode(h.container, "SPAN", "fail");
        assert.ok(passBadge, "the pass badge must render");
        assert.ok(failBadge, "the fail badge must render");
        const passClass = (passBadge as { getAttribute?: (n: string) => string | null }).getAttribute?.("class") ?? "";
        const failClass = (failBadge as { getAttribute?: (n: string) => string | null }).getAttribute?.("class") ?? "";
        assert.match(passClass, /bg-primary/, "pass must carry the DEFAULT (non-alarming) variant class");
        assert.doesNotMatch(passClass, /bg-destructive/, "pass must NOT carry the destructive class");
        assert.match(failClass, /bg-destructive/, "fail must carry the DESTRUCTIVE (alarming) variant class");
        assert.doesNotMatch(failClass, /bg-primary/, "fail must NOT carry the default class");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("CloseReadinessPanel: a read failure renders the banner, never a stale/blank readiness", async () => {
  const h = await renderComponent(
    withProvider(createElement(CloseReadinessPanel, { readiness: null, loading: false, err: "network error", session: sessionTokenAccessor })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /network error/);
  } finally {
    await h.unmount();
  }
});

test("CloseProposalPanel: an open proposal renders its narrative/rationale/model, Adopt succeeds and reloads the plan", async () => {
  let reloaded = false;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_proposals")) {
        return jsonResponse([
          {
            id: "p1", firm_id: "f1", client_id: "c1", fiscal_year_id: "fy1", close_run_id: "run1", state: "open",
            proposed_by: "agent", bound_digests: {}, drafted: [{ check_key: "ar_control_tie", item_key: null }],
            narrative: "the AR control tie was measured clean this period", model_name: "claude-sonnet-5", model_version: "1",
            rationale: "every drafted item carries a live attestation", settled_by: null, settled_at: null, settle_reason: null,
            created_at: "2026-08-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/rpc/settle_close_proposal")) return jsonResponse({ proposal_id: "p1", state: "adopted" });
      throw new Error(`unexpected fetch: ${url} ${String(init?.body)}`);
    },
    async () => {
      const h = await renderComponent(
        withProvider(createElement(CloseProposalPanel, { closeRunId: "run1", session: sessionTokenAccessor, reloadPlan: async () => { reloaded = true; } })),
      );
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /the AR control tie was measured clean this period/);
        assert.match(h.text(), /claude-sonnet-5/);

        const adoptTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Adopt");
        assert.ok(adoptTrigger);
        await clickButton(adoptTrigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        // FIX-4 (rev-t1, law 71 — a consent shows what it approves): the
        // OPEN dialog must show the narrative + the drafted-item count, not
        // just a title + a generic sentence. `basisDrafted`'s own wording
        // ("covers N drafted item(s)") is DISTINCT from the row's own
        // always-visible `proposal.drafted` string ("N drafted item(s)"), so
        // matching it discriminates "the dialog's children rendered" from
        // "the panel's own row text was already on the page anyway".
        const dialogText = textOf(body as never);
        assert.match(dialogText, /the AR control tie was measured clean this period/, "the dialog must show the SAME narrative the human is about to bind the firm to");
        assert.match(dialogText, /covers 1 drafted item/, "the dialog must show the drafted-item count — via basisDrafted, not the row's own separate string");
        assert.match(dialogText, /proposed by claude-sonnet-5 1/, "the dialog must show the proposing model/version");

        // AdoptDialog's Confirm is reachable straight from the trigger click
        // via the SAME predicate — find it in `body` (the portal), not
        // `h.container`.
        function findAllAdopt(root: unknown, out: unknown[] = []): unknown[] {
          if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === "Adopt") out.push(root);
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllAdopt(c, out);
          return out;
        }
        const all = findAllAdopt(body);
        assert.equal(all.length, 2, "trigger + dialog confirm must both render as 'Adopt' buttons");
        await clickButton(all[1] as never);
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(reloaded, true, "a settle must ALWAYS trigger the plan's own reload");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("CloseProposalPanel: Withdraw's CLR41 close_proposal_already_settled refusal renders verbatim in the persistent banner", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/close_proposals")) {
        return jsonResponse([
          {
            id: "p1", firm_id: "f1", client_id: "c1", fiscal_year_id: "fy1", close_run_id: "run1", state: "open",
            proposed_by: "agent", bound_digests: {}, drafted: [],
            narrative: "n", model_name: "claude-sonnet-5", model_version: "1", rationale: "r",
            settled_by: null, settled_at: null, settle_reason: null, created_at: "2026-08-01T00:00:00Z",
          },
        ]);
      }
      if (url.includes("/rpc/settle_close_proposal")) {
        return jsonResponse({ code: "CLR41", message: "close proposal p1 is already adopted; a settled proposal is terminal", details: '{"reason":"close_proposal_already_settled","state":"adopted"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        withProvider(createElement(CloseProposalPanel, { closeRunId: "run1", session: sessionTokenAccessor, reloadPlan: async () => {} })),
      );
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const withdrawTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Withdraw");
        assert.ok(withdrawTrigger);
        await clickButton(withdrawTrigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        function findByTag(root: unknown, tag: string): unknown {
          if ((root as { tagName?: string }).tagName === tag) return root;
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
            const found = findByTag(c, tag);
            if (found) return found;
          }
          return null;
        }
        const textarea = findByTag(body, "TEXTAREA");
        assert.ok(textarea);
        setFieldValue(textarea as never, "the analysis was superseded by a later document");
        for (let i = 0; i < 2; i++) await h.settle();

        function findAllWithdraw(root: unknown, out: unknown[] = []): unknown[] {
          if ((root as { tagName?: string }).tagName === "BUTTON" && textOf(root as never) === "Withdraw") out.push(root);
          for (const c of ((root as { childNodes?: unknown[] }).childNodes ?? [])) findAllWithdraw(c, out);
          return out;
        }
        const confirmButton = findAllWithdraw(body)[1];
        assert.ok(confirmButton);
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR41/);
        assert.match(bodyText, /already adopted; a settled proposal is terminal/);
        // CB-AE2E-004 (2026-09-04): a REFUSED confirm keeps the dialog open, so BOTH
        // the trigger and the dialog's own Confirm are still in document.body — and
        // the reason the human typed is still in the textarea. The old assertion here
        // (length 1, "Confirm must be gone") pinned the defect.
        assert.equal(findAllWithdraw(body).length, 2, "the dialog must STAY OPEN after a refused confirm");
        assert.equal(
          (findByTag(body, "TEXTAREA") as unknown as { value: string }).value,
          "the analysis was superseded by a later document",
          "the typed reason survives the refusal",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("FutureAttestationPanel: Confirm stays disabled until every field is filled, a REAL CLR03 refusal renders verbatim after Confirm actually runs, and the success path shows the recorded id", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/record_future_attestation")) {
        return jsonResponse({ code: "CLR03", message: "agent identity cannot attest the future method" }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FutureAttestationPanel, { clientId: "c1", session: sessionTokenAccessor })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Record future-method attestation"));
        assert.ok(trigger && (trigger as unknown as { disabled: boolean }).disabled === false, "the trigger itself must be reachable — every field it gates lives inside the dialog it opens");
        await clickButton(trigger as never);
        for (let i = 0; i < 3; i++) await h.settle();

        const confirmButton = findAllButtonsByText(body, "Record")[0];
        assert.ok(confirmButton, "the dialog's own Confirm must render");
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm must stay disabled with every field empty");

        setFieldValue(findByAttr(body, "aria-label", "Expected amount (RM)") as never, "500.00");
        for (let i = 0; i < 2; i++) await h.settle();
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm must STILL be disabled — the other four required fields remain empty");

        // Fill the remaining four fields — Confirm must become enabled.
        setFieldValue(findByAttr(body, "id", "fa-service-group") as never, "G");
        setFieldValue(findByAttr(body, "id", "fa-horizon") as never, "2026-01-01");
        setFieldValue(findByAttr(body, "id", "fa-expires") as never, "2027-01-01");
        setFieldValue(findByAttr(body, "id", "fa-evidence") as never, "signed engagement mandate on file");
        for (let i = 0; i < 2; i++) await h.settle();
        assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "Confirm must be ENABLED once every field is filled — the actual gate this test now drives THROUGH, not just up to");

        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /CLR03/, "the refusal code must render verbatim in the persistent banner");
        assert.match(bodyText, /agent identity cannot attest the future method/, "the refusal message must render verbatim, never re-worded");
        // The trigger's OWN label is "Record future-method attestation" — it never
        // matches the exact string "Record" (the Confirm button's label), so this
        // predicate can only ever match the dialog's own Confirm. CB-AE2E-004
        // (2026-09-04) flips what it must find: a REFUSED attempt keeps the dialog
        // open, so Confirm is still there. The old assertion (count 0, "must be
        // GONE") pinned the class defect — every field this panel asks for lives
        // inside the dialog the refusal was throwing away.
        assert.equal(
          findAllButtonsByText(body, "Record").length,
          1,
          "DISCRIMINATING POST-CONDITION: the dialog's own Confirm ('Record') must STILL be in document.body after a refusal",
        );
        assert.ok(
          h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Record future-method attestation")),
          "the trigger itself must still be reachable — it is a DIFFERENT label from the settled Confirm",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 4; i++) await h.settle();
      }
    },
  );
});

test("FutureAttestationPanel: the SUCCESS path renders the recorded id banner, never the refusal banner", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/record_future_attestation")) return jsonResponse({ id: "9f1c2a3b-0000-4000-8000-000000000001", expires_at: "2027-01-01" });
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(withProvider(createElement(FutureAttestationPanel, { clientId: "c1", session: sessionTokenAccessor })));
      const body = bodyOf();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Record future-method attestation"));
        await clickButton(trigger as never);
        for (let i = 0; i < 3; i++) await h.settle();
        await fillFutureAttestationForm(body);
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findAllButtonsByText(body, "Record")[0];
        assert.ok(confirmButton && (confirmButton as unknown as { disabled: boolean }).disabled === false, "Confirm must be enabled once every field is filled");
        await clickButton(confirmButton as never);
        for (let i = 0; i < 6; i++) await h.settle();

        const bodyText = textOf(body as never);
        assert.match(bodyText, /9f1c2a3b-0000-4000-8000-000000000001/, "the recorded id must render verbatim — the DB's own answer, never invented");
        assert.doesNotMatch(bodyText, /CLR/, "a SUCCESSFUL call must never leave a stale refusal banner painted");
      } finally {
        await h.unmount();
        for (let i = 0; i < 4; i++) await h.settle();
      }
    },
  );
});
