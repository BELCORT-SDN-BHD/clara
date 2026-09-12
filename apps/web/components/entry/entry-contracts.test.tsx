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

import { readCode } from "../../test/sourceOracle";

import { InviteAcceptForm, type InviteAuthClient } from "../invite-accept-form";
import { LoginForm, type LoginAuthClient } from "../login-form";
import messages from "../../messages/en.json";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent } from "../../test/hookHarness";
import type { HoldingState } from "../../lib/registration/holding-state";
import { EmailConfirmationCard, type ConfirmCodeState } from "./email-confirmation-card";
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

// N3 CLOSED (裁-109): "expired" no longer exists as a distinct
// ConfirmCodeState — it flattened into "wrong-code" (verify/handler.ts's
// header explains why). Five code states remain, and #621 adds the RESEND
// POST's own five beside them — every one of the ten is scanned here, so a
// face that ships with an unresolved catalogue key goes red on this cell
// rather than in somebody's inbox.
const CONFIRM_CODE_STATES: ConfirmCodeState[] = [
  { kind: "form" },
  { kind: "wrong-code", remaining: 3 },
  { kind: "locked", waitSeconds: 300 },
  { kind: "unavailable" },
  { kind: "invalid" },
  { kind: "resent" },
  { kind: "resend-locked", waitSeconds: 300 },
  { kind: "resend-rate-limited", waitSeconds: 47 },
  { kind: "resend-invalid-email" },
  { kind: "resend-unavailable" },
];

const HOLDING_STATES: HoldingState[] = [
  { kind: "pending", firmName: "ROME PROPERTIES" },
  // FS-4 C-6, §2.1's two new arms (holding-state.ts's header).
  { kind: "checkout_open", firmName: "ROME PROPERTIES" },
  { kind: "paid", firmName: "ROME PROPERTIES" },
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
    ...CONFIRM_CODE_STATES.map((state) => ({
      name: `confirm/${state.kind}`,
      node: createElement(EmailConfirmationCard, { state }),
    })),
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
    "components/entry/signup-legal-stage.tsx",
    "app/(entry)/signup/page.tsx",
  ],
  Pending: [
    "components/entry/holding-card.tsx",
    "app/(entry)/pending/page.tsx",
  ],
} as const;

// FS-4 C-6, §2.1's two new arms (holding-state.ts's header).
const HOLDING_KINDS = [
  "pending",
  "checkout_open",
  "paid",
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

test("LOW-4: the legal gate lives on its own step, and BOTH door calls are real", () => {
  // v1 carried a checkbox on THIS form; checkout-gate-design.md §1.1 moved
  // the real acceptance to /signup step 2 (signup-legal-stage.tsx), once an
  // open registration exists to accept against. This form must no longer
  // claim any legal gate of its own.
  const accountSource = readFileSync(
    join(WEB_ROOT, "components/entry/signup-account-form.tsx"),
    "utf8",
  );
  assert.doesNotMatch(
    accountSource,
    /dpaAccepted|id="signup-dpa"|dpaLabel|dpaNotBuilt|legalAccepted=/,
    "a legal checkbox reappeared on the account step",
  );

  // THE DOOR IS CALLED FOR REAL. What this cell asserts is the property that
  // outlives every rewording of the step: the door's own answer decides what
  // renders, and the stage never fabricates an acceptance.
  const legalDoorSource = readCode(join(WEB_ROOT, "lib/registration/legal-doors.ts")).code;
  assert.match(
    legalDoorSource,
    /callDoor(?:<[\s\S]*?>)?\(\s*ACCEPT_LEGAL_DOCUMENT_DOOR/,
    "accept_legal_document is not actually called — the seam is back",
  );
  // The four arguments the door requires, by name. A dropped `p_op_key` is the
  // exact defect PR #488's fix round found in this journey's earlier seam, and
  // `p_kind` is the one #621 adds — a call without it would accept the wrong
  // agreement, or the same one twice.
  for (const param of ["p_kind", "p_version", "p_body_sha256", "p_op_key"]) {
    assert.ok(legalDoorSource.includes(param), `accept_legal_document is called without ${param}`);
  }
  // AND THE HASH IS NOT RECOMPUTED. 裁-90's byte-identity law lives or dies on
  // `p_body_sha256` being the hash of the bytes the person was SHOWN; a fresh
  // read here would make the door agree with itself unconditionally.
  // The pattern hunts a hash COMPUTATION, not the word. A first cut used a
  // bare /sha256/i and reddened on `bodySha256` and `p_body_sha256` — the
  // parameter names that carry the hash are the very thing this cell wants
  // present, so matching them is the "spelling is not identity" trap pointed
  // at the instrument. Word boundaries exclude both spellings; a real call
  // site (`crypto.subtle.digest`, `createHash(`, a bare `sha256(`) does not.
  const computesHash = /\bsubtle\s*\.\s*digest\b|\bcreateHash\s*\(|\bsha256\s*\(/i;
  assert.match("await crypto.subtle.digest('SHA-256', x)", computesHash);
  assert.doesNotMatch("params.bodySha256", computesHash);
  assert.equal(
    computesHash.test(legalDoorSource),
    false,
    "legal-doors.ts computes a hash; it must forward the caller's verbatim",
  );

  // THE RETIRED DOOR IS GONE FROM THIS APP, not merely unused: `sign_dpa` and
  // `get_current_dpa_document` survive on the database as deprecated wrappers,
  // and a web surface still calling one would be reading a single agreement on
  // a journey that now has two.
  for (const module of [
    "components/entry/signup-legal-stage.tsx",
    "components/entry/signup-step.tsx",
    "components/entry/signup-route.tsx",
    "lib/registration/legal-doors.ts",
    "lib/registration/legal-reads.ts",
    "lib/registration/legal-server-reads.ts",
    "app/(entry)/checkout/handler.ts",
  ]) {
    const source = readFileSync(join(WEB_ROOT, module), "utf8");
    assert.doesNotMatch(
      source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""),
      /sign_dpa|get_current_dpa_document/,
      `${module} still calls a retired DPA door`,
    );
  }
});
