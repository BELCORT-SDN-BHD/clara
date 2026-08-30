import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import ts from "typescript";

import { InviteAcceptForm, type InviteAuthClient } from "../invite-accept-form";
import { LoginForm, type LoginAuthClient } from "../login-form";
import messages from "../../messages/en.json";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent } from "../../test/hookHarness";
import type { HoldingState } from "../../lib/registration/holding-state";
import { EmailConfirmationCard } from "./email-confirmation-card";
import { HoldingCard } from "./holding-card";
import { SignupAccountForm, type SignupAuthClient } from "./signup-account-form";
import { SignupFirmForm } from "./signup-firm-form";

enableDomInspection();

type DomNode = {
  childNodes?: DomNode[];
  nodeType?: number;
  nodeValue?: string;
  textContent?: string;
};

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TRANSLATION_KEY = /^[A-Z][A-Za-z]+(\.[A-Za-z-]+)+$/;

const router = {
  replace: () => {},
  refresh: () => {},
  push: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};

function App(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams("") as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: router as never },
        createElement("div", null, node),
      ),
    ),
  });
}

function renderedTextLeaves(node: DomNode): string[] {
  if (node.nodeType === 3) return [String(node.nodeValue ?? "").trim()].filter(Boolean);
  const children = node.childNodes ?? [];
  if (children.length > 0) return children.flatMap(renderedTextLeaves);
  return typeof node.textContent === "string" && node.textContent.trim() !== ""
    ? [node.textContent.trim()]
    : [];
}

const signupClient = (): SignupAuthClient => ({
  auth: {
    signUp: async () => ({ data: { user: { id: "u1" }, session: null }, error: null }),
    signOut: async () => ({ error: null }),
  },
});

const loginClient = (): LoginAuthClient => ({
  auth: { signInWithPassword: async () => ({ error: null }) },
});

const inviteClient = (): InviteAuthClient => ({
  auth: {
    verifyOtp: async () => ({
      data: { user: null, session: null },
      error: { message: "not driven" },
    }),
    getClaims: async () => ({ data: { claims: undefined }, error: { message: "not driven" } }),
    updateUser: async () => ({ error: { message: "not driven" } }),
  },
});

const HOLDING_STATES: HoldingState[] = [
  { kind: "pending", firmName: "ROME PROPERTIES" },
  { kind: "rejected", firmName: "ROME PROPERTIES", reason: "Not admitted" },
  { kind: "approved", firmName: "ROME PROPERTIES" },
  { kind: "invite-expected" },
  { kind: "unidentified" },
  { kind: "read-failed", reason: "read_error" },
];

test("MED-1: none of the five entry faces renders a literal i18n key", async () => {
  const faces: Array<{ name: string; node: ReactElement }> = [
    {
      name: "invite",
      node: createElement(InviteAcceptForm, {
        token: "supabase-token",
        inviteToken: "c".repeat(64),
        createSupabaseClient: inviteClient,
      }),
    },
    {
      name: "login",
      node: createElement(LoginForm, { createSupabaseClient: loginClient }),
    },
    {
      name: "signup account step",
      node: createElement(SignupAccountForm, { createSupabaseClient: signupClient }),
    },
    { name: "signup firm step", node: createElement(SignupFirmForm) },
    {
      name: "email confirmation",
      node: createElement(EmailConfirmationCard, {
        state: { kind: "ready", tokenHash: "token-hash" },
      }),
    },
    ...HOLDING_STATES.map((state) => ({
      name: `pending/${state.kind}`,
      node: createElement(HoldingCard, { state }),
    })),
  ];

  for (const face of faces) {
    const h = await renderComponent(App(face.node));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const leaves = renderedTextLeaves(h.container as unknown as DomNode);
      assert.ok(leaves.length > 0, `${face.name} rendered no text; the key scan is vacuous`);
      assert.deepEqual(
        leaves.filter((text) => TRANSLATION_KEY.test(text)),
        [],
        `${face.name} rendered an untranslated catalogue key`,
      );
    } finally {
      await h.unmount();
    }
  }
});

test("MED-1 vacuity control: the literal-key detector catches the review mutant", () => {
  assert.match("Pending.approved.banner", TRANSLATION_KEY);
  assert.match("Signup.check-email.title", TRANSLATION_KEY);
  assert.doesNotMatch("Confirm your email", TRANSLATION_KEY);
});

const TRANSLATION_SOURCES = {
  ConfirmEmail: ["components/entry/email-confirmation-card.tsx"],
  Signup: [
    "components/entry/signup-account-form.tsx",
    "components/entry/signup-firm-form.tsx",
    "app/(entry)/signup/page.tsx",
  ],
  Pending: [
    "components/entry/holding-card.tsx",
    "app/(entry)/pending/page.tsx",
  ],
} as const;

const HOLDING_KINDS = [
  "pending",
  "rejected",
  "approved",
  "invite-expected",
  "unidentified",
  "read-failed",
] as const;

function literalTranslationReads(relativePath: string): string[] {
  const source = readFileSync(join(WEB_ROOT, relativePath), "utf8");
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isTranslationCall =
        (ts.isIdentifier(expression) && expression.text === "t") ||
        (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === "t" &&
          expression.name.text === "rich");
      const first = node.arguments[0];
      if (isTranslationCall && first && ts.isStringLiteralLike(first)) keys.push(first.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return keys;
}

function valueAt(catalogue: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((value, part) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[part];
  }, catalogue);
}

for (const namespace of ["ConfirmEmail", "Signup", "Pending"] as const) {
  test(`MED-1: every ${namespace} key read by the entry components exists and is nonblank`, () => {
    const literal = TRANSLATION_SOURCES[namespace].flatMap(literalTranslationReads);
    const dynamic = namespace === "Pending"
      ? HOLDING_KINDS.flatMap((kind) => [`${kind}.title`, `${kind}.description`])
      : [];
    const keys = [...new Set([...literal, ...dynamic])];
    const minimum = namespace === "Signup" ? 20 : namespace === "Pending" ? 18 : 7;
    assert.ok(keys.length >= minimum, `${namespace}: too few reads were found`);
    const catalogue = messages[namespace];
    for (const key of keys) {
      const value = valueAt(catalogue, key);
      assert.equal(typeof value, "string", `${namespace}.${key} is absent or not text`);
      assert.notEqual((value as string).trim(), "", `${namespace}.${key} is blank`);
    }
  });
}

function sourceModulesUnder(relativeDirectory: string): string[] {
  const root = join(WEB_ROOT, relativeDirectory);
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes(".test."))
    .map((entry) => join(relativeDirectory, entry.parentPath.slice(root.length + 1), entry.name).replaceAll("\\", "/"));
}

test("LOW-2: every backticked source path cited by an entry module resolves", () => {
  const modules = [
    ...sourceModulesUnder("app/(entry)"),
    ...sourceModulesUnder("components/entry"),
    ...sourceModulesUnder("lib/registration"),
    "components/invite-accept-form.tsx",
    "components/login-form.tsx",
    "components/logout-button.tsx",
    "lib/identity/doors.ts",
  ];
  const citation = /`((?:app|lib|components|tests|test|scripts|messages)\/[A-Za-z0-9_./()[\]-]+\.(?:ts|tsx|mjs|json|txt))`/g;
  const found: Array<{ module: string; path: string }> = [];
  for (const module of new Set(modules)) {
    const source = readFileSync(join(WEB_ROOT, module), "utf8");
    for (const match of source.matchAll(citation)) {
      const path = match[1] as string;
      found.push({ module, path });
      assert.ok(
        existsSync(join(WEB_ROOT, path)),
        `${module} points at ${path}, which does not exist`,
      );
    }
  }
  assert.ok(found.length >= 15, `only ${found.length} entry citations were found; the walk is vacuous`);
  const fake = "components/entry/holding-copy.test.ts";
  assert.equal(existsSync(join(WEB_ROOT, fake)), false, "the review's dangling-path mutant now exists");
});

test("MED-3/LOW-3: the deploy obligations cover signup redirect and both password surfaces", () => {
  const readme = readFileSync(join(WEB_ROOT, "README.md"), "utf8");
  const signupSource = readFileSync(
    join(WEB_ROOT, "components/entry/signup-account-form.tsx"),
    "utf8",
  );
  assert.match(readme, /### 4\.[\s\S]*<origin>\/auth\/confirm[\s\S]*no wildcard/i);
  assert.match(readme, /### 4\.[\s\S]*\*\*Configure:\*\*[\s\S]*\*\*Verify \(receipt\):\*\*[\s\S]*\*\*Residual/i);
  assert.match(readme, /### 4\.[\s\S]*Confirm\s+Email[\s\S]*PRD (?:§\s*|Section\s+)8/i);
  assert.match(signupSource, /emailRedirectTo:[\s\S]*\/auth\/confirm/);
  assert.match(readme, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&type=email/);
  assert.doesNotMatch(
    readme,
    /\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=email/,
  );
  assert.match(readme, /disable_signup[\s\S]*false[\s\S]*mailer_autoconfirm[\s\S]*false/i);
  assert.match(readme, /components\/invite-accept-form\.tsx[\s\S]*components\/entry\/signup-account-form\.tsx/);
});

test("NEW-4: signup confirmation records its access-log residual and deploy receipt", () => {
  const readme = readFileSync(join(WEB_ROOT, "README.md"), "utf8");
  assert.match(
    readme,
    /### 4\.[\s\S]*signup confirmation[\s\S]*blocking log-control receipt[\s\S]*access logs[\s\S]*positive read/i,
  );
});

test("N6: live entry prose names only the moved route-group paths", () => {
  const files = [
    "README.md",
    "components/invite-accept-form.tsx",
    "lib/identity/doors.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(WEB_ROOT, file), "utf8");
    assert.doesNotMatch(source, /`?app\/login\b/);
    assert.doesNotMatch(source, /`?app\/invite\/\[token\]/);
  }

  const a11ySources = [
    "components/invite-accept-a11y.test.tsx",
    "components/login-a11y.test.tsx",
  ].map((file) => readFileSync(join(WEB_ROOT, file), "utf8"));
  for (const source of a11ySources) {
    assert.doesNotMatch(source, /wraps? a synthetic <h1>/i);
    assert.doesNotMatch(source, /LoginForm (?:has|renders) no heading/i);
    assert.doesNotMatch(source, /LoginForm renders no heading of its own/i);
  }
});

test("LOW-4: the DPA checkbox is described as a client gate, never as the security wall", () => {
  const source = readFileSync(join(WEB_ROOT, "components/entry/signup-account-form.tsx"), "utf8");
  assert.match(source, /client(?:-side)? gate/i);
  assert.doesNotMatch(source, /this is the wall/i);
});
