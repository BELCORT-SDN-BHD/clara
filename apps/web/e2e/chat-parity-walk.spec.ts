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
    if (/^\/api\/(runtime\/)?(chat|tasks)\//.test(path) || path === "/api/runtime/chat/sessions") urls.push(path);
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

  await page.getByLabel(COMPOSER).fill("Code this invoice");
  await page.getByRole("button", { name: "Send", exact: true }).click();

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
