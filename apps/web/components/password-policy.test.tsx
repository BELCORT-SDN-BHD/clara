// PR 541 stage 2 — THE PASSWORD-POLICY CENSUS.
//
// ===========================================================================
// WHAT WENT WRONG, AND WHY A CENSUS RATHER THAN THREE ASSERTIONS
// ===========================================================================
// Three surfaces take a new password. Two of them (signup, invite-accept)
// carried `minLength={8}`; the third (password reset) carried 12 and was the
// only one that stated the rule at all — so an applicant could satisfy the
// browser with eight characters and then meet hosted Auth's refusal, rendered
// as a raw provider message, about a rule nothing had told them one line
// earlier. Nobody moved the two because each site's own comment said the value
// was "a UI convenience ONLY", which is true and is exactly why it drifted.
//
// Three fixed assertions would fix today and rot tomorrow: a FOURTH password
// surface is added by a future train and no cell knows to look at it. So the
// ROSTER IS DERIVED FROM THE TREE — every source file that renders a password
// input — and the render assertions run against a roster this file does not
// hand-type. A new surface reds cell ② until it is added to the render roster,
// which is the point: the census cannot silently stop covering the estate.
//
// ===========================================================================
// TWO INSTRUMENTS, DELIBERATELY, BECAUSE ONE OF THEM IS WEAK ALONE
// ===========================================================================
// ① reads SOURCE TEXT, which matches text and not syntax — it can tell you
//    WHERE password inputs live but must not be trusted about what they DO.
// ② RENDERS each surface and reads the input's LIVE React props and the DOM
//    node its `aria-describedby` names. That is the behavioural half, and it
//    is what a `minLength={8}` reintroduced anywhere would red.
// Neither is sufficient: ① alone would pass on a file that spelled the
// constant and ignored it; ② alone would pass forever on a surface it had
// never been told about.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, clickButton } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import { checkAccessibility } from "../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../lib/session-accessor";
import messages from "../messages/en.json";
import { PASSWORD_MIN_LENGTH } from "../lib/auth/password-policy";
import { SignupAccountForm, type SignupAuthClient } from "./entry/signup-account-form";
import { PasswordResetForm } from "./entry/password-reset-form";
import { InviteAcceptForm, type InviteAuthClient } from "./invite-accept-form";

enableDomInspection();

const WEB_ROOT = join(import.meta.dirname, "..");

type Node = {
  tagName?: string;
  childNodes?: Node[];
  parentNode?: Node;
  getAttribute?: (name: string) => string | null;
};

// ---------------------------------------------------------------------------
// ① THE ROSTER — derived from the tree, never hand-typed
// ---------------------------------------------------------------------------

/** INSTRUMENT: every `.ts`/`.tsx` under these roots, tests excluded.
 *  SCOPE: `apps/web` source only. `e2e/` walks the built app and `messages/`
 *  holds copy; neither renders an input. */
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

const rel = (f: string) => relative(WEB_ROOT, f).split(sep).join("/");

/** Every source file that renders ANY password input, policy-bearing or not. */
function passwordInputFiles(): string[] {
  return sourceFiles()
    .filter((f) => /type="password"/.test(readFileSync(f, "utf8")))
    .map(rel)
    .sort();
}

/**
 * THE POLICY ROSTER, split on `autoComplete` rather than on a filename list —
 * and the split is the FIRST THING THIS CENSUS FOUND.
 *
 * The estate has FOUR password inputs, not three. `components/login-form.tsx`
 * is the fourth, and it must NOT carry the minimum or the hint: it takes an
 * EXISTING password, so a `minLength={12}` there would refuse a legacy
 * credential at the browser before the person could sign in and be told to
 * change it, and a "use at least 12 characters" hint beside a sign-in field is
 * advice about a password they already have.
 *
 * `autoComplete="new-password"` vs `"current-password"` is exactly that
 * distinction, written by the surface itself for the browser's own password
 * manager. Deriving the split from it means a new surface joins the right side
 * of the roster by declaring what it is, not by being remembered here.
 */
const NEW_PASSWORD_MARKER = 'autoComplete="new-password"';
const CURRENT_PASSWORD_MARKER = 'autoComplete="current-password"';

function filesWith(marker: string): string[] {
  return passwordInputFiles().filter((f) =>
    readFileSync(join(WEB_ROOT, f), "utf8").includes(marker));
}

/** The surfaces cell ② drives. Kept BESIDE the derived roster so cell ① can
 *  compare them: this list is what is COVERED, the walk is what EXISTS, and a
 *  difference between the two is the finding. */
const RENDERED_SURFACES = [
  "components/entry/password-reset-form.tsx",
  "components/entry/signup-account-form.tsx",
  "components/invite-accept-form.tsx",
] as const;

test("① the census walker reads a real tree (positive control)", () => {
  // A broken walk would report an empty estate and make every claim below
  // vacuous. Absence is evidence only from an instrument that can find things.
  const files = sourceFiles();
  assert.ok(files.length > 200, `the walker found only ${files.length} source files`);
  assert.ok(
    sourceFiles().filter((f) => /type="email"/.test(readFileSync(f, "utf8"))).length >= 2,
    "a control needle that MUST appear in more than one file — if this misses, the matcher is broken",
  );
});

test("① the roster PARTITIONS every password input in the tree — nothing is unclassified", () => {
  // The partition must be TOTAL. A password surface that declared neither
  // autoComplete would fall out of both halves and be policed by nothing,
  // which is the silent gap this whole file exists to close.
  const all = passwordInputFiles();
  const newPassword = filesWith(NEW_PASSWORD_MARKER);
  const currentPassword = filesWith(CURRENT_PASSWORD_MARKER);
  assert.deepEqual(
    [...new Set([...newPassword, ...currentPassword])].sort(),
    all,
    "a password surface declares neither new-password nor current-password — classify it",
  );
  assert.deepEqual(
    newPassword.filter((f) => currentPassword.includes(f)),
    [],
    "a file renders both kinds; the per-file split above cannot classify it",
  );
});

test("① EVERY new-password surface in the tree is one this file actually renders", () => {
  assert.deepEqual(
    filesWith(NEW_PASSWORD_MARKER),
    [...RENDERED_SURFACES],
    "a new-password surface exists that cell ② does not drive — add it to RENDERED_SURFACES "
    + "and to the render roster below, or the policy census has stopped covering the estate",
  );
});

test("① the SIGN-IN field is deliberately outside the policy, and carries no minimum", () => {
  // The census's own first finding, pinned so it cannot be "fixed" by a later
  // lane spreading the constant to all four. A minimum on a current-password
  // field refuses a legacy credential at the browser, before the person can
  // sign in and change it.
  const signIn = filesWith(CURRENT_PASSWORD_MARKER);
  assert.deepEqual(signIn, ["components/login-form.tsx"], "the sign-in roster moved");
  for (const file of signIn) {
    const source = readFileSync(join(WEB_ROOT, file), "utf8");
    assert.doesNotMatch(source, /minLength/, `${file} constrains an EXISTING password`);
    assert.doesNotMatch(source, /PASSWORD_MIN_LENGTH/, `${file} states a new-password policy`);
  }
});

test("① no new-password surface re-types the number instead of reading the constant", () => {
  // The specific rot this replaced: a literal `minLength={8}` beside a comment
  // saying the value is only a courtesy. Any numeric literal on a minLength in
  // one of these files is the defect returning, whatever the number is.
  const roster = filesWith(NEW_PASSWORD_MARKER);
  assert.ok(roster.length >= 3, `only ${roster.length} new-password files — the marker is broken`);
  for (const file of roster) {
    const source = readFileSync(join(WEB_ROOT, file), "utf8");
    assert.doesNotMatch(source, /minLength=\{\s*\d+\s*\}/, `${file} carries a hardcoded minLength`);
    assert.match(source, /PASSWORD_MIN_LENGTH/, `${file} does not read the shared constant`);
  }
});

// ---------------------------------------------------------------------------
// ② THE BEHAVIOUR — live props on a real render, per surface
// ---------------------------------------------------------------------------

function App(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
        } as never,
      },
      createElement("div", null, node),
    ),
  });
}

function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

const isPasswordInput = (n: Node) =>
  n.tagName === "INPUT" && n.getAttribute?.("type") === "password";

/** The live React props of a rendered node — the same idiom
 *  `signup-keyboard.test.tsx` uses, because an attribute read would miss a
 *  prop React did not reflect into the DOM. */
function liveProps(node: Node): Record<string, unknown> {
  const record = node as unknown as Record<string, unknown>;
  const key = Object.keys(record).find((k) => k.startsWith("__reactProps"));
  assert.ok(key, "the input's live React props were not observable");
  return record[key] as Record<string, unknown>;
}

function withEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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

const signupAuth = (): SignupAuthClient => ({
  auth: {
    signUp: async () => ({ data: { user: { id: "u1" }, session: null }, error: null }),
    signOut: async () => ({ error: null }),
  },
});

const SUB = "11111111-1111-1111-1111-111111111111";
const inviteAuth = (): InviteAuthClient => ({
  auth: {
    verifyOtp: async () => ({
      data: { user: { id: SUB }, session: { access_token: "jwt", user: { id: SUB } } }, error: null,
    }),
    getClaims: async () => ({ data: { claims: { sub: SUB } }, error: null }),
    updateUser: async () => ({ error: null }),
  },
});

/** THE RENDER ROSTER — each entry mounts one real surface at the state where
 *  its password field is on screen, and hands back the harness. */
const SURFACES: ReadonlyArray<{
  file: (typeof RENDERED_SURFACES)[number];
  mount: () => Promise<Awaited<ReturnType<typeof renderComponent>>>;
}> = [
  {
    file: "components/entry/signup-account-form.tsx",
    mount: async () => {
      const h = await renderComponent(
        App(createElement(SignupAccountForm, { createSupabaseClient: signupAuth })),
      );
      for (let i = 0; i < 3; i++) await h.settle();
      return h;
    },
  },
  {
    file: "components/entry/password-reset-form.tsx",
    mount: async () => {
      const h = await renderComponent(
        App(createElement(PasswordResetForm, {
          createSupabaseClient: () => ({ auth: { updateUser: async () => ({ error: null }) } }),
        })),
      );
      for (let i = 0; i < 3; i++) await h.settle();
      return h;
    },
  },
  {
    file: "components/invite-accept-form.tsx",
    mount: async () => {
      // The password field is behind the explicit click gate (that surface's
      // own design), so the roster has to WALK to it rather than mount it.
      const h = await renderComponent(
        App(createElement(InviteAcceptForm, {
          token: "supabase-token-hash",
          inviteToken: "c".repeat(64),
          createSupabaseClient: inviteAuth,
        })),
      );
      for (let i = 0; i < 3; i++) await h.settle();
      const gate = findAll(h.container as never, (n) =>
        n.tagName === "BUTTON" && /Accept invitation/.test(textOf(n as never)))[0];
      assert.ok(gate, "the invite click gate did not render");
      await h.act(async () => { await clickButton(gate as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      return h;
    },
  },
];

test("② EVERY rendered password input carries the shared minimum and a hint that states it", async () => {
  await withEnv(
    (async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    async () => {
      let inputsSeen = 0;
      for (const surface of SURFACES) {
        const h = await surface.mount();
        try {
          const inputs = findAll(h.container as never, isPasswordInput);
          assert.equal(inputs.length, 1, `${surface.file} rendered ${inputs.length} password inputs`);
          const input = inputs[0] as Node;
          inputsSeen += 1;

          // THE NUMBER, from the live prop — not from the source, and not
          // re-typed here. `PASSWORD_MIN_LENGTH` is imported, so a change to
          // the constant moves the assertion with it and a change to ONE
          // surface reds.
          const props = liveProps(input);
          assert.equal(
            props.minLength,
            PASSWORD_MIN_LENGTH,
            `${surface.file}: minLength is ${String(props.minLength)}, not the shared ${PASSWORD_MIN_LENGTH}`,
          );

          // THE HINT, bound to the field. `aria-describedby` must name a node
          // that EXISTS and that states the rule — a dangling id would read as
          // nothing at all to a screen reader while looking correct in the JSX.
          const describedBy = input.getAttribute?.("aria-describedby");
          assert.ok(describedBy, `${surface.file}: the password input describes no hint`);
          const hint = findAll(h.container as never, (n) => n.getAttribute?.("id") === describedBy)[0];
          assert.ok(hint, `${surface.file}: aria-describedby="${describedBy}" names no node in the tree`);
          assert.match(
            textOf(hint as never),
            new RegExp(String(PASSWORD_MIN_LENGTH)),
            `${surface.file}: the hint does not state the minimum`,
          );

          // The hint is real prose in the accessibility tree, not a decoration.
          assert.deepEqual(checkAccessibility(h.container as never), [], `${surface.file} a11y`);
        } finally {
          await h.unmount();
        }
      }
      // VACUITY CONTROL: three surfaces, three inputs. A mount that silently
      // rendered the wrong state would leave the loop asserting nothing.
      assert.equal(inputsSeen, SURFACES.length);
    },
  );
});

test("② the policy sentence claims ONLY what the hosted project was measured to enforce", async () => {
  // The clause this fix removed: `PasswordReset.description` asserted
  // "ClaraBook also refuses known breached passwords" while the project's own
  // `password_hibp_enabled` reads FALSE (Management-API read, 2026-09-03; the
  // handover carries it as H-40, an open owner decision). That is the app
  // claiming a wall it cannot see — the same class as a fabricated figure,
  // applied to a security control.
  //
  // Pinned on the MESSAGE CATALOGUE rather than one render, because the claim
  // can come back in any of the three surfaces' own copy.
  const catalogue = JSON.stringify(messages);
  assert.doesNotMatch(
    catalogue,
    /breached|pwned|have i been/i,
    "a breached-password claim is back in the copy — re-add it only in the change that turns HIBP on",
  );
  // MUST-NOT-RED CONTROL: the sentence that IS true still ships, and it takes
  // the number from the constant rather than spelling it.
  assert.match(
    (messages as { Auth: { passwordPolicy: string } }).Auth.passwordPolicy,
    /\{min\}/,
    "the shared policy sentence hardcodes the number instead of taking it as a parameter",
  );
});
