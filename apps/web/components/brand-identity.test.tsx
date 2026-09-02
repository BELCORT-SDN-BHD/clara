// P6-6 · THE IDENTITY FINISH — the Ledger Fold mark (R1), the Clara mascot
// (裁-14) and the ClaraBook product-name copy pass, proved four ways: the
// bytes on disk, the two components that render them, a construction-path
// CENSUS of where the assets may appear, and the live thread integration that
// is the "never a loader" wall's real seam.
//
// The census cells state their INSTRUMENT and SCOPE explicitly (裁-107b: an
// absence claim names both) and each carries a positive control, because a
// walker that silently matched nothing would report a clean estate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import NextImage from "next/image";
import * as nextImageModule from "next/image";

import { renderComponent } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import messages from "../messages/en.json";
import { BrandLockup, LEDGER_FOLD_MARK_SRC } from "./entry/brand-lockup";
import { ClaraWelcome, CLARA_MASCOT_SRC } from "./clara/ClaraWelcome";
import { ClaraThreadView } from "./clara/ClaraThreadView";
import { claraThreadStore } from "../lib/clara/threadStore";
import type { SessionTokenAccessor } from "../lib/session";

enableDomInspection();

const WEB_ROOT = join(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// ① THE BYTES — a byte-identical port, pinned so a re-export or a "tidy-up"
//    re-encode cannot pass as the approved asset (review law 3: spelling is
//    not identity — a file at the right PATH is not the right FILE).
// ---------------------------------------------------------------------------

/** sha256 of the design authority's own shipped app assets, `clarabook-frontend@a770988`
 *  `g5-design-system/clarabook-design-system/public/brand/`, measured at port time. */
const PINNED = {
  [LEDGER_FOLD_MARK_SRC]: {
    sha256: "b8c7bfa6655ef8a6f262a056e26f3f6d4107887ec275f04765be567c5681d163",
    bytes: 43766,
    dimensions: [1024, 1024],
  },
  [CLARA_MASCOT_SRC]: {
    sha256: "0921e67f1365a32621469c01d703759fc3f8990c8ab3d7c839cdf617ef7f1483",
    bytes: 6930,
    dimensions: [1001, 1357],
  },
} as const;

test("both brand assets are the design authority's own bytes, unmodified", () => {
  for (const [publicPath, pin] of Object.entries(PINNED)) {
    const onDisk = readFileSync(join(WEB_ROOT, "public", publicPath.replace(/^\//, "")));
    assert.equal(onDisk.length, pin.bytes, `${publicPath} byte length`);
    assert.equal(createHash("sha256").update(onDisk).digest("hex"), pin.sha256, `${publicPath} sha256`);
    // The PNG IHDR, read straight out of the header — the intrinsic size the
    // `width`/`height` props below have to agree with, taken from the file
    // rather than from a comment about the file.
    assert.deepEqual(
      [onDisk.readUInt32BE(16), onDisk.readUInt32BE(20)],
      [...pin.dimensions],
      `${publicPath} intrinsic dimensions`,
    );
  }
});

// ---------------------------------------------------------------------------
// ② THE COMPONENTS
// ---------------------------------------------------------------------------

function App(node: React.ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: node });
}

/** Every `<img>` the harness committed, with the attributes react-dom wrote. */
function imagesIn(h: { container: unknown }): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: Record<string, unknown> | null | undefined): void => {
    if (!node || typeof node !== "object") return;
    if (node.tagName === "IMG") found.push(node);
    for (const child of (node.childNodes as Record<string, unknown>[] | undefined) ?? []) walk(child);
  };
  walk(h.container as Record<string, unknown>);
  return found;
}

function attr(img: Record<string, unknown>, name: string): string | null {
  return (img.getAttribute as (n: string) => string | null)(name);
}

test("the harness renders a REAL next/image component, not the CJS wrapper object", () => {
  // The regression this pins: Node's ESM-to-CJS interop does not implement the
  // `__esModule` convention Next's image entry relies on, so `import Image from
  // "next/image"` used to land on `{__esModule, default, getImageProps}` and
  // React refused it with "Element type is invalid … but got: object". The
  // redirect in `test/nextImageResolve.mjs` is what fixes it; if that hook is
  // ever dropped, THIS cell says why every image test below broke.
  //
  // TWO assertions, because they fail for different reasons. The marker proves
  // the REDIRECT is in effect — `next/image` itself never exports
  // `RESOLVED_VIA_TEST_SHIM`, so seeing it means the resolve hook ran. The
  // shape check proves the shim still UNWRAPS correctly. Without the first, a
  // future Next that fixed its own packaging would keep this cell green while
  // the hook silently did nothing; without the second, a shim that resolved
  // but handed back the wrapper would too.
  assert.equal(
    (nextImageModule as { RESOLVED_VIA_TEST_SHIM?: boolean }).RESOLVED_VIA_TEST_SHIM,
    true,
    "next/image did not resolve through test/shims/nextImage.mjs — test/nextImageResolve.mjs is not registered",
  );
  const kind = typeof NextImage;
  assert.ok(
    kind === "function" || (kind === "object" && NextImage !== null && "$$typeof" in NextImage),
    `next/image resolved to a bare ${kind} — the test-runtime interop shim is not in effect`,
  );
});

test("the entry lockup renders the Ledger Fold mark: right file, decorative, intrinsically sized", async () => {
  const h = await renderComponent(App(createElement(BrandLockup)));
  try {
    const imgs = imagesIn(h);
    assert.equal(imgs.length, 1, "the lockup renders exactly one image");
    const [mark] = imgs;
    assert.match(attr(mark!, "src") ?? "", /clarabook-ledger-fold-brand-ink-v1\.0\.png/);
    assert.equal(attr(mark!, "alt"), "", "decorative: the wordmark beside it is the same word as real text");
    assert.equal(attr(mark!, "aria-hidden"), "true");
    assert.equal(attr(mark!, "width"), "32", "an intrinsic box, so the card below never shifts");
    assert.equal(attr(mark!, "height"), "32");
    assert.equal(attr(mark!, "loading"), "eager", "the mark is fetched eagerly, never deferred below the fold");
    assert.match(h.text(), /ClaraBook/, "the wordmark is real text, routed through next-intl's Brand.productName");
  } finally {
    await h.unmount();
  }
});

test("裁-137: the wordmark is SET lowercase while its text stays ClaraBook", async () => {
  // The ruling has two halves and they pull in opposite directions: §8 wants
  // lowercase GLYPHS, R1 wants the NAME to be "ClaraBook". `lowercase` is what
  // satisfies both from ONE string — `text-transform` repaints the glyphs and
  // leaves the DOM text alone — so this cell asserts BOTH sides of that, not
  // just the class. Drop the class and the first assertion reds; swap the
  // shared string for a hardcoded lowercase literal and the second does.
  const h = await renderComponent(App(createElement(BrandLockup)));
  try {
    const wordmark = h.find(
      (n) => (n as { tagName?: string }).tagName === "SPAN"
        && typeof (n as { className?: unknown }).className === "string"
        && ((n as { className: string }).className).includes("text-brand"),
    ) as { className?: string } | null;
    assert.ok(wordmark, "the wordmark span must render");
    assert.match(
      wordmark!.className ?? "",
      /(^|\s)lowercase(\s|$)/,
      "裁-137's glyph half: the wordmark span carries `lowercase`",
    );
    // R1's half, and the reason the shared string survives the ruling: the
    // TEXT is still the product's name, so the accessible name, the firm
    // shell's prose and the browser leg's exact-text matcher are all unmoved.
    assert.match(h.text(), /^\s*ClaraBook\s*$/, "the rendered TEXT is untouched — only the glyphs are transformed");
  } finally {
    await h.unmount();
  }
});

test("the Clara welcome renders the mascot with an honest empty alt beside a literal Clara label", async () => {
  const h = await renderComponent(App(createElement(ClaraWelcome)));
  try {
    const imgs = imagesIn(h);
    assert.equal(imgs.length, 1);
    const [mascot] = imgs;
    assert.match(attr(mascot!, "src") ?? "", /clara-quiet-clerk-neutral-v1\.0\.png/);
    assert.equal(attr(mascot!, "alt"), "", "decorative — the heading below says the name");
    assert.equal(attr(mascot!, "aria-hidden"), "true");
    // 1001x1357 is the source's own aspect; 80x108 preserves it to within a
    // pixel, so the transcript does not reflow when the image lands.
    assert.equal(attr(mascot!, "width"), "80");
    assert.equal(attr(mascot!, "height"), "108");
    assert.match(
      h.text(),
      /Clara/,
      "the state/accessibility contract's rule: a Clara expression asset always appears with a LITERAL Clara label",
    );
  } finally {
    await h.unmount();
  }
});

test("the welcome block, not the image, carries the §7 rare-welcome motion", async () => {
  const h = await renderComponent(App(createElement(ClaraWelcome)));
  try {
    const block = h.find((n) => typeof (n as { className?: unknown }).className === "string"
      && ((n as { className: string }).className).includes("enter-welcome"));
    assert.ok(block, "the welcome renders inside an enter-welcome block");
    assert.notEqual((block as { tagName?: string }).tagName, "IMG", "the mascot itself must not animate — §7 bars mascot motion beyond the one welcome entrance");
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// ③ THE CENSUS — where the two assets may appear, measured over the tree
// ---------------------------------------------------------------------------

/** INSTRUMENT: every `.ts`/`.tsx` file under these three roots, tests excluded.
 *  SCOPE: `apps/web` source only — `public/`, `e2e/` and `messages/` are out by
 *  construction (they hold assets, browser walks and copy, not render sites). */
const CENSUS_ROOTS = ["app", "components", "lib"] as const;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
  };
  for (const root of CENSUS_ROOTS) walk(join(WEB_ROOT, root));
  return out;
}

function filesMentioning(needle: string): string[] {
  return sourceFiles()
    .filter((f) => readFileSync(f, "utf8").includes(needle))
    .map((f) => relative(WEB_ROOT, f).split(sep).join("/"))
    .sort();
}

test("the census instrument itself reads a real tree (positive control)", () => {
  const files = sourceFiles();
  assert.ok(files.length > 200, `the walker found only ${files.length} source files — a broken glob would make every absence claim below vacuous`);
  assert.ok(
    filesMentioning("ClaraThreadView").length >= 2,
    "a control needle that MUST be found in more than one file — if this misses, the matcher is broken, not the estate clean",
  );
});

test("裁-14: the mascot appears in exactly ONE render site, and it is the welcome state", () => {
  assert.deepEqual(
    filesMentioning(CLARA_MASCOT_SRC),
    ["components/clara/ClaraWelcome.tsx"],
    "the mascot's asset path may be written in exactly one component — 'empty states and rare welcome moments only'",
  );
});

test("裁-14: the mascot is in NO loading state anywhere — measured, not assumed", () => {
  // The construction-path reading of "never a loader": every file that renders
  // a loading affordance, checked for the mascot. `LoadingState` is this app's
  // ONE loading idiom (components/common/state.tsx's own header: prose over
  // skeletons, no second spelling), so the set of files that import it is the
  // complete set of loading sites.
  const loaders = filesMentioning("LoadingState");
  assert.ok(loaders.length > 5, `only ${loaders.length} files import LoadingState — the loader roster looks broken, so its emptiness proves nothing`);
  for (const file of loaders) {
    const body = readFileSync(join(WEB_ROOT, file), "utf8");
    assert.ok(!body.includes(CLARA_MASCOT_SRC), `${file} renders a loading state AND names the mascot asset`);
  }
  // The thread view is the one file that renders BOTH a loading state and the
  // welcome — so it is the interesting member of the roster above, and the
  // integration cells below are what actually keep the two apart at runtime.
  assert.ok(loaders.includes("components/clara/ClaraThreadView.tsx"), "the thread view must be inside the roster this cell walks");
});

test("R1: the Ledger Fold mark appears only on the entry lockup", () => {
  assert.deepEqual(filesMentioning(LEDGER_FOLD_MARK_SRC), ["components/entry/brand-lockup.tsx"]);
});

test("§7's welcome tier exists in globals.css WITH its own reduced-motion arm", () => {
  const css = readFileSync(join(WEB_ROOT, "app", "globals.css"), "utf8");
  assert.match(css, /--motion-duration-welcome:\s*220ms;/, "§7's 'Rare first welcome only' duration, at its ratified value");
  const utility = /@utility enter-welcome \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(utility, "the enter-welcome utility must exist");
  const body = utility![1]!;
  assert.match(body, /@media \(prefers-reduced-motion: reduce\)/, "the arm the token contract requires, beside its two siblings");
  assert.match(body, /translate: 0 0\.25rem;/, "the 4px rise §7 names for a rare first welcome");
  // The arm's whole job: the rise is dropped and the FADE is kept.
  const arm = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {2}\}/.exec(body);
  assert.ok(arm, "the reduced-motion arm's body must be readable");
  assert.match(arm![1]!, /transition: opacity/, "opacity survives reduced motion — the contract's own words");
  assert.ok(!/translate .*var\(--motion-duration-welcome\)/.test(arm![1]!), "movement must NOT survive reduced motion");
});

// ---------------------------------------------------------------------------
// ④ THE INTEGRATION — the welcome's real seam inside the thread
// ---------------------------------------------------------------------------

const THREAD = "11111111-1111-4111-8111-111111111111";
const auth: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function threadApp() {
  return App(createElement(ClaraThreadView, { auth, threadId: THREAD, variant: "rail" }));
}

async function withFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalRuntime = process.env.NEXT_PUBLIC_RUNTIME_URL;
  globalThis.fetch = impl;
  claraThreadStore.reset(THREAD);
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    if (originalRuntime === undefined) delete process.env.NEXT_PUBLIC_RUNTIME_URL;
    else process.env.NEXT_PUBLIC_RUNTIME_URL = originalRuntime;
    claraThreadStore.reset(THREAD);
  }
}

test("a loaded, empty transcript paints the welcome INSIDE the real thread view", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/messages")) {
      return new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;

  await withFetch(impl, async () => {
    const h = await renderComponent(threadApp());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.equal(imagesIn(h).length, 1, "the mascot is mounted by the thread view itself — deleting the mount line reds THIS, not ClaraWelcome's own cells");
      assert.match(h.text(), /I'm Clara\./);
    } finally {
      await h.unmount();
    }
  });
});

test("NEVER A LOADER, at the seam: a transcript still loading shows the loading sentence and NO mascot", async () => {
  // The read never settles, so `messagesLoaded` stays false — exactly the
  // window 裁-14 forbids the mascot from occupying.
  const impl = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;

  await withFetch(impl, async () => {
    const h = await renderComponent(threadApp());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Loading the conversation…/, "the loading sentence is what must be on screen here");
      assert.equal(imagesIn(h).length, 0, "no image at all may render while the transcript is still being read");
    } finally {
      await h.unmount();
    }
  });
});

test("NEVER A LOADER, at the seam: a FAILED read paints no mascot", async () => {
  const impl = (async () => new Response("nope", { status: 503 })) as typeof fetch;

  await withFetch(impl, async () => {
    const h = await renderComponent(threadApp());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.equal(imagesIn(h).length, 0, "a failed read is not an empty conversation");
      // THE FIX CAME HERE, AND SAYS SO — as this cell's previous body asked it to.
      //
      // What this recorded before P6-5: a failed FIRST load rendered the LOADING sentence
      // indefinitely. `claraThreadStore.hydrateFailed` sets `loadError` and leaves
      // `messagesLoaded` false, while ClaraThreadView's error banner was gated on
      // `state.loadError && state.messagesLoaded` — the two could never coincide on a first
      // read, so the only branch that could report the failure required the flag only a
      // SUCCESS sets. P6-6 pinned that truth rather than asserting it was right, and named it
      // a pre-existing defect for a later train.
      //
      // P6-5 is that train. The loading arm is now "no error and nothing loaded yet", the
      // error arm no longer requires `messagesLoaded`, and the failure carries a retry that
      // re-arms the once-per-thread guard. This cell's own subject — no mascot under a failed
      // read — is unchanged and still holds; what changed is what the person sees INSTEAD, and
      // it is now the honest thing. The RED-before evidence lives in
      // `components/clara/thread-rehydrate.test.tsx`, whose mutant M1 puts `messagesLoaded`
      // back on the error arm and reds it.
      assert.match(h.text(), /Could not load the conversation/, "the failure is REPORTED, not hidden behind a spinner");
      assert.doesNotMatch(h.text(), /Loading the conversation…/, "and the loading sentence is gone with it");
    } finally {
      await h.unmount();
    }
  });
});

test("a transcript with messages shows the messages and NO welcome", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/messages")) {
      return new Response(
        JSON.stringify({ messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "The May close is open." }] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;

  await withFetch(impl, async () => {
    const h = await renderComponent(threadApp());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /The May close is open\./);
      assert.equal(imagesIn(h).length, 0, "a conversation that has started is not a welcome moment");
    } finally {
      await h.unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// ⑤ THE COPY PASS — the platform slot says ClaraBook, the agent slot says Clara
// ---------------------------------------------------------------------------

type Messages = Record<string, unknown>;

function messageAt(path: string): string {
  let node: unknown = messages as Messages;
  for (const segment of path.split(".")) {
    node = (node as Messages)[segment];
  }
  assert.equal(typeof node, "string", `messages/en.json has no string at ${path}`);
  return node as string;
}

/** Every string in the catalog, with its dotted path. */
function allStrings(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (node: unknown, path: string[]): void => {
    if (typeof node === "string") { out.push([path.join("."), node]); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    }
  };
  walk(messages, []);
  return out;
}

/** R1's platform slot: every place the copy names the PRODUCT rather than the
 *  agent persona. Enumerated, so a new platform-slot string that says "Clara"
 *  is caught by review rather than by this list quietly not covering it — the
 *  sweep cell below is what covers the unenumerated remainder. */
const PLATFORM_SLOT = [
  "Metadata.title",
  "Metadata.description",
  "Brand.productName",
  "NotFound.body",
  "Admin.sections.registrations.purpose",
  "Members.inviteDialog.description",
  "Members.courier.recipient_has_account",
  "Login.description",
  "PasswordReset.description",
  "PasswordReset.continue",
  "Signup.description",
  "Pending.checkoutNotBuilt",
  "Registrations.pageDescription",
] as const;

test("R1: every platform-slot string names ClaraBook, never the agent", () => {
  for (const path of PLATFORM_SLOT) {
    const value = messageAt(path);
    assert.match(value, /ClaraBook/, `${path} must name the platform`);
    assert.ok(
      !/Clara(?!Book)/.test(value),
      `${path} still calls the PLATFORM "Clara" somewhere: ${JSON.stringify(value)}`,
    );
  }
});

test("the agent keeps its own name — the pass is a product-name fix, not a rename", () => {
  // The counter-cell to the one above: a global find-and-replace of "Clara" ->
  // "ClaraBook" would satisfy every platform-slot assertion and destroy the
  // persona everywhere else. These are the agent's own surfaces.
  for (const path of ["Clara.rail.title", "Clara.thread.composerLabel", "Clara.thread.role.assistant", "Interview.role.clara"]) {
    const value = messageAt(path);
    assert.ok(/Clara(?!Book)/.test(value), `${path} names the AGENT and must still say Clara: ${JSON.stringify(value)}`);
  }
  const agentStrings = allStrings().filter(([, v]) => /Clara(?!Book)/.test(v));
  assert.ok(agentStrings.length > 40, `only ${agentStrings.length} strings still name the agent — the copy pass over-reached into the persona`);
});

test("no user-facing surface says the platform is called Clara", () => {
  // The sweep the enumeration above cannot do: the shapes that only ever
  // precede a PRODUCT name.
  //
  // SCOPE, stated exactly: the message catalog. That is where nearly every
  // rendered string lives, but NOT all of them — two user-facing strings are
  // composed in server code on purpose and are outside this walk:
  // `lib/members/invite-mail.ts` (the invite email, English-only for a
  // recipient with no session and no locale, per that file's own recorded
  // boundary) and `lib/members/courier.ts` (the one fixed refusal sentence
  // Clara owns rather than the auth provider's). Both carry the product name
  // and both are pinned by `tests/invite-courier.test.ts`, so the estate is
  // covered — by two instruments, not by this one.
  //
  // "to Clara" is DELIBERATELY not one of them, and the reason is a real
  // string: "The connection to Clara ended unexpectedly" is the AGENT, and a
  // bare `to` would have condemned it. The two `to` shapes that are genuinely
  // platform-slot are spelled out instead.
  const platformShapes =
    /\b(?:on|inside|into) Clara(?!Book)\b|\ba Clara(?!Book) account\b|\byour Clara(?!Book)\b|\b(?:Continue|invited) to Clara(?!Book)\b/;
  const offenders = allStrings().filter(([, v]) => platformShapes.test(v));
  assert.deepEqual(offenders, [], "these strings put the agent's name in the platform's slot");
  // Positive controls: each shape matched against the pre-pass wording it was
  // written for. Without these the empty result above proves only that the
  // regex never fires.
  for (const pre of [
    "Start your own firm on Clara.",
    "If you followed a link inside Clara, the link is wrong.",
    "This address already has a Clara account.",
    "Sign in to your Clara account.",
    "Continue to Clara",
    "You have been invited to Clara",
  ]) {
    assert.ok(platformShapes.test(pre), `the matcher misses the pre-pass wording ${JSON.stringify(pre)}`);
  }
  // …and the counter-control: the agent sentence the matcher must NOT flag.
  assert.ok(!platformShapes.test("The connection to Clara ended unexpectedly."), "the matcher must leave the agent's own sentences alone");
});
