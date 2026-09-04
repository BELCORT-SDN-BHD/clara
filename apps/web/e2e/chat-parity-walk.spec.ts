// 裁-86's browser leg for the chat-parity train: the two journeys the train exists
// for, walked in real Chromium against the BUILT app.
//
//   (a) Clara parks mid-run, the question appears in the thread, the human answers it
//       there, and the card shows the DB's own answered state.
//   (b) A document is attached from the composer and the sent turn carries its
//       document reference.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. Real: the browser, the built bundle, the
// live-chunk fold, the hydrate-then-act cycle, the upload queue, and the SAME-ORIGIN
// runtime proxy route (firm-scope guard and header allow-list included). Mocked:
// PostgREST, the runtime's three intake legs, and the chat/stream legs — see
// `chat-parity-mock.mjs`. So this walk is evidence about the JOURNEY and the client's
// own wire shapes. It is NOT evidence that Postgres or the runtime accept them:
// `clara._tf_validate_chat_attachments`, `clara.open_interruption` and
// `clara.answer_interruption` are never executed here. Their own suites own that.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CLIENT_ID = "55555555-5555-4555-8555-555555555555";
const THREAD_ID = "66666666-6666-4666-8666-666666666666";
/** C6 — this lane's SETTLED thread; its ids mirror `CHAT_PARITY` in chat-parity-mock.mjs. */
const PARTS_THREAD_ID = "66666666-6666-4666-8666-666666666667";
const MATCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOCUMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_ID = "77777777-7777-4777-8777-777777777777";
const QUESTION = "Which client owns this invoice?";

/** The repo's own axe scope (interview-walk.spec.ts:39): WCAG 2.0/2.1 A and AA, not
 *  axe's `best-practice` pack. Measured 2026-09-02, the `(full)` thread route carries
 *  one best-practice `region` finding ("some page content is not contained by
 *  landmarks") that predates this train — that route has no sidebar or main landmark by
 *  design (ClaraFullScreenThread's own header) — and closing it is a route-shell
 *  decision, not a chat-parity one. Named here rather than silently excluded. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, what: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  // A positive control on the instrument itself: an empty `violations` array proves
  // nothing unless the scan actually looked at this page (entry-faces-walk.spec.ts's
  // own precedent for its collectors).
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** The composer's accessible name. #507 and #508 both added `Clara.thread.composerLabel`
 *  with DIFFERENT text ("Ask Clara" vs "Message Clara") and `en.json` auto-merged without
 *  a conflict, silently taking one — which broke the other PR's walk. Main's value wins:
 *  it is the merged, canonical one, and `parity-holes.spec.ts` already reads it. */
const COMPOSER = "Ask Clara";

/** The created-thread marker the e2e harness serves for a session it minted. Reading it
 *  off the screen keeps this walk independent of how many threads other specs created
 *  first — the ordinal is the server's, not this file's. */
function markerIn(text: string | null): string {
  const found = text?.match(/CREATED THREAD \d+/)?.[0];
  expect(found, "the rail must be showing a created thread's own transcript").toBeTruthy();
  return found!;
}

async function openThread(page: Page): Promise<void> {
  await signIn(page);
  await page.goto(`/clients/${CLIENT_ID}/clara/${THREAD_ID}`);
  await expect(page.getByLabel(COMPOSER)).toBeVisible();
}

/**
 * Every chat/stream request the BROWSER made, plus the content-type the stream attach
 * came back with. This is the FS-10 launch-blocker's own instrument: the fix is
 * "the chat lane addresses this app's own origin at `/api/runtime/*`", and the only place
 * that is observable is the wire the browser actually put bytes on.
 */
function watchChatWire(page: Page): { urls: string[]; streamContentType: () => string | null } {
  const urls: string[] = [];
  let streamContentType: string | null = null;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    // The optional `runtime/` group is deliberate: this collector must see the PRE-fix
    // shape too, or a regression would collect nothing and the assertions below would
    // fail on an empty list instead of on the wrong path.
    if (/^\/api\/(runtime\/)?(chat|tasks)\//.test(path)) urls.push(path);
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith("/stream")) {
      streamContentType = response.headers()["content-type"] ?? null;
    }
  });
  return { urls, streamContentType: () => streamContentType };
}

test("a parked clarify is answered inline, in the thread, and the card shows the answered state", async ({ page }) => {
  const wire = watchChatWire(page);
  await openThread(page);

  // H-24 — THE FIRST TURN IS SENT WITH THE KEYBOARD, not the mouse, and the negative
  // comes first so the positive cannot be read as "something happened eventually".
  // The composer is a raw <textarea>, which (unlike a single-line input) does NOT submit
  // its form on Enter, so before this train the key did nothing at all and the human's
  // only way to send was the button.
  await page.getByLabel(COMPOSER).fill("Code this invoice");
  await page.getByLabel(COMPOSER).press("Shift+Enter");
  expect(wire.urls.filter((p) => p.includes("/turns")), "Shift+Enter must not post a turn").toEqual([]);
  // And it typed a newline into the box rather than being swallowed.
  await expect(page.getByLabel(COMPOSER)).toHaveValue(/Code this invoice\n/);

  await page.getByLabel(COMPOSER).press("Enter");

  // The parked question arrives on the live stream and is answerable there — and the
  // mock withholds the `agent_interruptions` row until after the chunk AND after a first
  // read comes back empty, which is the PRODUCTION ordering (the row is INSERTed three
  // durable WDK step boundaries after the chunk is written). Before the fold this walk
  // was green only because the mock answered that read from a `pending` seed.
  await expect(page.getByText(QUESTION)).toBeVisible();

  // THE FS-10 LAUNCH-BLOCKER PROOF, and the reason it sits HERE. The question above is on
  // screen only because an SSE `chunk` event arrived and `liveClarify` folded it — so by
  // this line a stream has demonstrably attached and delivered at least one event END TO
  // END. What that alone does not say is WHERE, and "where" is the whole defect: with the
  // pre-fix code these requests went to `/api/chat/*` and `/api/tasks/*` on this app's own
  // origin (404 on the deployed Worker) or cross-origin to the runtime (CORS-blocked).
  // They must now be same-origin proxy paths, and the harness answers them only through
  // `next start` → the firm-scope guard → app/api/runtime/[...path]/route.ts.
  expect(wire.urls, "the browser must have made chat/stream calls at all").not.toEqual([]);
  expect(wire.urls).toContain(`/api/runtime/tasks/${TASK_ID}/stream`);
  expect(wire.urls).toContain(`/api/runtime/chat/${THREAD_ID}/turns`);
  for (const path of wire.urls) {
    expect(path, `${path} is not a same-origin runtime-proxy path`).toMatch(/^\/api\/runtime\//);
    expect(path, `${path} double-prefixes /api`).not.toContain("/api/api/");
  }
  // And the streamed body survived the proxy AS a stream: the proxy allow-lists
  // `content-type` on the way back (route.ts:113-114), so a dropped header here would
  // mean the SSE reader was parsing something the browser no longer knew was a stream.
  expect(wire.streamContentType(), "the SSE attach must come back as text/event-stream through the proxy")
    .toContain("text/event-stream");

  // The honest interim state, never a claim the question settled.
  await expect(page.getByText("No open question has been recorded")).toHaveCount(0);
  const answerField = page.getByLabel("Your answer");
  await expect(answerField).toBeVisible({ timeout: 15_000 });

  // A DISCRIMINATING post-condition: "Answered by your firm" plus the answer text can
  // only exist after the door call AND the re-read that follows it.
  await answerField.fill("ROME PROPERTIES");
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(page.getByText("Answered by your firm")).toBeVisible();
  await expect(page.getByText("ROME PROPERTIES")).toBeVisible();
  await expect(page.getByRole("button", { name: "Answer", exact: true })).toHaveCount(0);

  await scan(page, "answered clarify face");
});

test("a document attached from the composer rides the sent turn as its document reference", async ({ page }) => {
  await openThread(page);

  const attach = page.getByRole("button", { name: "Attach document" });
  await expect(attach).toBeVisible();
  await page.setInputFiles('input[type="file"]', {
    name: "invoice.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e"),
  });

  // "Filed" is the queue's own terminal state, reached only after begin -> PUT bytes ->
  // finalize -> a DB-confirmed adoption read -> the governed filing act.
  await expect(page.getByText("Filed", { exact: false })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel(COMPOSER).fill("Read this invoice");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The reference in the SENT turn, rendered by the transcript's own attachment card —
  // read off the screen, not off the request the test itself made.
  await expect(page.getByText("Attached document")).toBeVisible();
  await expect(page.getByText(DOCUMENT_ID)).toBeVisible();

  await scan(page, "composer attachment face");
});

test("the firm altitude says why there is no attach affordance instead of just not having one", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clara/${THREAD_ID}`);
  await expect(page.getByLabel(COMPOSER)).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach document" })).toHaveCount(0);
  await expect(page.getByText("Open a client's workspace to attach a document")).toBeVisible();
});

test("C6: a settled transcript renders the bank act's ledger fields, the pack's DB counts, and a tool chip that says how it went", async ({ page }) => {
  // The SETTLED thread, not the parked one: a parked task has no assistant row at all
  // (`clara.settle_chat_turn` writes it), so this is the only place a persisted part can
  // be read off a real screen. Its parts are the emitter's own shapes — see
  // `SETTLED_PARTS` in chat-parity-mock.mjs for the citation on each.
  await signIn(page);
  await page.goto(`/clients/${CLIENT_ID}/clara/${PARTS_THREAD_ID}`);
  await expect(page.getByLabel(COMPOSER)).toBeVisible();

  // (a) THE BANK ACT'S RESULT. `verb` and `subject_id` rendered before this train;
  // `part.result` was on the wire and dropped, so the human saw a governed act with no
  // trace of what the ledger answered.
  // `exact`: the bank_pack card's own note sentence contains the words "bank act", and
  // a substring match resolves two nodes.
  await expect(page.getByText("Bank act", { exact: true })).toBeVisible();
  // `exact` again: the op_key row is `bank-match_bank_line:task-e2e:0:{}`, so a substring
  // match on the verb resolves the verb row AND the op-key row.
  await expect(page.getByText("match_bank_line", { exact: true })).toBeVisible();
  await expect(page.getByText("The ledger's own answer")).toBeVisible();
  await expect(page.getByText("match_id", { exact: true })).toBeVisible();
  await expect(page.getByText(MATCH_ID)).toBeVisible();

  // (b) THE PACK'S DB-COMPUTED COUNTS, printed as Postgres handed them over
  // (`jsonb_array_length` in 0121). The digest still renders — the block is additive.
  await expect(page.getByText("What this pack held")).toBeVisible();
  await expect(page.getByText("12 unmatched lines")).toBeVisible();
  await expect(page.getByText("4 match candidates")).toBeVisible();
  await expect(page.getByText("sha256:e2e0bankpack")).toBeVisible();

  // (c) THE TOOL CHIPS, RESOLVED. Two calls in one message: one answered, one errored.
  // Before this train both were the same bare grey name chip, so the assertion that
  // they DIFFER is the discriminating one.
  await expect(page.getByText("get_bank_pack · done")).toBeVisible();
  await expect(page.getByText("trial_balance · failed")).toBeVisible();

  await scan(page, "settled transcript face");
});

test("裁-117: the rail creates a thread only when asked, and its menu switches between them", async ({ page }) => {
  // THE RAIL, not the full-screen route — the menu lives in the rail's header, and
  // `(full)` sits outside the layout that mounts it.
  await signIn(page);
  await page.goto(`/clients/${CLIENT_ID}`);

  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // NOTHING WAS CREATED BY ARRIVING. This altitude has no thread in the shared session
  // list, and before this train merely landing here minted a `clara.chat_sessions` row
  // that could never be archived or deleted. The offer is the proof it did not, and the
  // resolving loader must be gone — it used to be the arm this state fell into.
  await expect(rail.getByText("No conversation here yet")).toBeVisible();
  await expect(page.getByText("Finding your conversation with Clara")).toHaveCount(0);

  await rail.getByRole("button", { name: "New conversation" }).click();
  // The marker is minted per create by the harness (serve-built.mjs), so the walk reads
  // it off the screen rather than hard-coding an ordinal that another spec's creates
  // would shift.
  await expect(rail.getByText(/CREATED THREAD \d+/)).toBeVisible();
  const firstMarker = markerIn(await rail.textContent());

  // A SECOND thread from the menu. The marker CHANGES, which only a create plus a
  // select can do — a create that failed to select would still show the first one.
  await rail.getByRole("button", { name: "Conversations" }).click();
  await rail.getByRole("button", { name: "New conversation" }).click();
  // The first marker leaves the screen the moment the thread id changes, which is BEFORE
  // the new transcript arrives — so waiting on its absence alone reads an empty rail.
  await expect(rail.getByText(firstMarker)).toHaveCount(0);
  await expect(rail.getByText(/CREATED THREAD \d+/)).toBeVisible();
  const secondMarker = markerIn(await rail.textContent());
  expect(secondMarker).not.toEqual(firstMarker);

  // SWITCH BACK. The rows are newest-first, so the first thread is the second row, and
  // its transcript coming back is the post-condition a re-render alone cannot produce.
  await rail.getByRole("button", { name: "Conversations" }).click();
  const rows = rail.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByRole("button").click();
  await expect(rail.getByText(firstMarker)).toBeVisible();
  await expect(rail.getByText(secondMarker)).toHaveCount(0);

  // ARCHIVE is named as a backend gap; CLEAR and DELETE do not exist at all, because
  // `_tf_chat_session_update` refuses a DELETE and the transcript is the audit record.
  const menuToggle = rail.getByRole("button", { name: "Conversations" });
  await menuToggle.click();
  await expect(rail.getByText("Archiving a conversation")).toBeVisible();
  await expect(rail.getByRole("button", { name: /^(Clear|Delete)/ })).toHaveCount(0);

  // R1 — ESCAPE FROM THE TOGGLE, in a real browser, which is the only instrument that
  // settles it. The handler sits on the rail root because the toggle lives in the
  // header and the panel is that header's SIBLING; a listener on the panel (the first
  // cut) was never reached by a keydown on the toggle at all. Focus has not moved since
  // the click, so this is the ordinary "open the menu, change your mind" path.
  await expect(menuToggle).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(rail.getByText("Archiving a conversation")).toHaveCount(0);
  await expect(menuToggle).toHaveAttribute("aria-expanded", "false");
  // And focus is still somewhere a keyboard user can act from.
  await expect(menuToggle).toBeFocused();

  await scan(page, "rail thread menu face");
});
