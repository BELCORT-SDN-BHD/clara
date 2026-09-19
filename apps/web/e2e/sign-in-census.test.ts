// #851 — ONE SIGN-IN, HELD BY A CELL INSTEAD OF BY A SENTENCE.
//
// #804 folded twenty-four local `signIn`/`signInTo` definitions (plus one inline copy) into ONE
// shared helper, because every copy waited on the same post-login landmark and most fell through
// to Playwright's 5 s `expect` default instead of naming a bound — the measured cause of the
// cold-start flake. Its fourth acceptance criterion was "no spec reimplements the login form", and
// that criterion was PROSE. By 2026-09-17 thirteen spec files written during the wave had each
// grown their own copy again, several with a hand-picked 30 s or 60 s wait, and nothing went red:
// accrual, client-create, counterparty-identity, depreciation, document-correction,
// documents-intake, firm-setup, fixed-asset-acquisition, knowledge-firm, members-invite,
// prepayments, staff-expense-claim and trade-invoice.
//
// A rule nothing measures is a rule that has already drifted. This file measures it.
//
// WHY THE FORM AND NOT THE FUNCTION NAME. A local helper named `establishSession` re-typing the
// same three fills is the same defect as one named `signIn`; a thin wrapper that DELEGATES to the
// shared helper is not a defect at all (`chat-parity-walk.spec.ts`'s idempotency guard is the
// precedent #804 itself left). So the census reads the LOGIN FORM — the Password field and the
// "Sign in" submit — rather than an identifier, and the second cell holds the wrappers to the one
// thing that makes them legitimate: they import the shared helper.
//
// The two exception lists below are short, named and argued, and the third cell keeps them honest:
// an exception that no longer offends FAILS, so the lists can shrink but cannot rot.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/** Every browser spec in this directory, read from disk rather than listed by hand — a hand-kept
 *  list is the drift this file exists to catch, one level up. */
function specFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .sort();
}

/**
 * THE LOGIN FORM'S OWN TWO HALVES. A file that fills the Password field AND names the "Sign in"
 * submit is driving `/login`'s form itself, whatever it calls the function around it.
 *
 * THE BUTTON HALF IS A REFERENCE, NOT A `.click()`, deliberately. A parser that demanded
 * `.click()` on the same expression would miss the shape a real offender takes just as easily —
 * `const button = page.getByRole("button", { name: "Sign in" }); await button.click();`. The
 * password half reads the same way (a locator bound to a variable and filled through it), because
 * a census that understood indirection on one half and not the other would stay green against a
 * local sign-in reshaped in three keystrokes.
 *
 * WHAT PAYS FOR THAT LOOSENESS IS PROXIMITY, NOT AN EXCEPTION LIST. Two halves ANDed across a
 * WHOLE FILE are not evidence of one sign-in: `entry-faces-walk.spec.ts` fills a Password on
 * `/signup` and, in a different cell 38 lines away, NAMES the login page's "Sign in" button to
 * assert its focus ring without ever clicking it — two forms, read as one, and a FORM_EXCEPTIONS
 * entry whose recorded reason was something that file does not do. So the two halves must land
 * within `SAME_SIGN_IN_LINES` of each other. MEASURED at `dd3f8f1d`: every one of the fourteen
 * local sign-ins #851 folded put its Password fill exactly ONE line from its "Sign in" submit,
 * and the only file that matched across two different forms put them 38 apart.
 *
 * THE REGEX SPELLING COUNTS TOO, and finding out why is what this file is for.
 * `intake-batch-walk.spec.ts` drove the same three acts as `getByLabel(/password/i)` and
 * `getByRole("button", { name: /sign in/i })` — and with the WRONG fixture password ("password",
 * not `Clara-e2e-password-1!`), which the mock auth server happens not to mind. A gate keyed on
 * the exact string would have declared that file clean. A spelling is not an identity.
 *
 * The SIGN-UP form is not this form and is not matched: `checkout-gate-walk.spec.ts` and
 * `signup-confirm-pending.spec.ts` fill Email and Password and then click "Create account", which
 * no shared helper owns and which is the thing under test in both files.
 */
const PASSWORD_LOCATOR = String.raw`getByLabel\(\s*(?:"Password"|'Password'|\/[^/\n]*password[^/\n]*\/[a-z]*)\s*\)`;

/** The field filled straight off its own locator. */
const PASSWORD_FILL = new RegExp(String.raw`${PASSWORD_LOCATOR}\s*\.fill\(`, "gi");
/** …and the field BOUND FIRST — `const password = page.getByLabel("Password"); await
 *  password.fill(…)` — whose `.fill(` arrives later, through the variable. */
const PASSWORD_BINDING = new RegExp(
  String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*[^;\n]*${PASSWORD_LOCATOR}`,
  "gi",
);
const SIGN_IN_SUBMIT = /getByRole\(\s*(["'])button\1\s*,\s*\{\s*name:\s*(?:(["'])Sign in\2|\/[^/\n]*sign[\s_-]*in[^/\n]*\/[a-z]*)/gi;

/** How far apart the two halves may sit and still be ONE sign-in. Ten lines is room for the
 *  paragraph every retired copy carried about its wait, and still a quarter of the distance the
 *  one false positive needed. */
const SAME_SIGN_IN_LINES = 10;

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

/** Every line on which the PASSWORD FIELD is filled, by either shape. */
function passwordFillLines(source: string): number[] {
  const lines: number[] = [];
  for (const m of source.matchAll(PASSWORD_FILL)) lines.push(lineAt(source, m.index + m[0].length - 1));
  for (const binding of source.matchAll(PASSWORD_BINDING)) {
    const through = new RegExp(String.raw`\b${binding[1]!}\s*\.fill\(`, "g");
    for (const use of source.matchAll(through)) lines.push(lineAt(source, use.index));
  }
  return lines;
}

export function reimplementsLoginForm(source: string): boolean {
  const fills = passwordFillLines(source);
  if (fills.length === 0) return false;
  return [...source.matchAll(SIGN_IN_SUBMIT)].some((submit) =>
    fills.some((fill) => Math.abs(lineAt(source, submit.index) - fill) <= SAME_SIGN_IN_LINES),
  );
}

/**
 * A sign-in-shaped FUNCTION declaration, by either of the two shapes this suite writes. The name is
 * reported so a failure says WHICH function to fold, not merely that one exists.
 *
 * THE `const` ARM MUST SEE A FUNCTION, not merely a matching name: `entry-faces-walk.spec.ts`'s
 * `const signInButton = page.getByRole(...)` is a LOCATOR, and a census that called it a local
 * sign-in would be demanding an exception for a variable.
 */
export function declaredSignIns(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(signIn[A-Za-z0-9_]*)\s*\(/g)) {
    names.push(m[1]!);
  }
  for (const m of source.matchAll(
    /(?:^|\n)\s*(?:export\s+)?const\s+(signIn[A-Za-z0-9_]*)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:function\b|\()/g,
  )) {
    names.push(m[1]!);
  }
  return names;
}

/** Whether a file takes its sign-in from `./helpers` — the import that makes a wrapper a wrapper.
 *  The alias form (`signIn as sharedSignIn`, chat-parity's own shape) counts: what matters is the
 *  binding that was imported, not the local name it was given. */
export function importsSharedSignIn(source: string): boolean {
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\/helpers["']/g)) {
    const imported = m[1]!.split(",").map((part) => part.trim().split(/\s+as\s+/)[0]!.trim());
    if (imported.includes("signIn") || imported.includes("signInTo")) return true;
  }
  return false;
}

/**
 * THE ONE FILE ALLOWED TO DRIVE THE LOGIN FORM, with the reason recorded beside it rather than in
 * a commit message.
 *
 * It was two until the detector learned proximity. `entry-faces-walk.spec.ts` never drove the
 * login form at all — it fills a Password on `/signup` and focuses (never clicks) the login
 * submit in another cell — so its entry was an exception granted for something the file does not
 * do, and a real local sign-in added to that file would have gone unseen. The third cell below is
 * what forced the entry out once the false positive stopped matching.
 */
const FORM_EXCEPTIONS: Record<string, string> = {
  // #804's own named out-of-scope file. This walk does not run in this harness at all: it is
  // driven by `e2e/live-stack/run-reports-download-walk.mjs` against real Postgres, real report
  // doors and a real object store, where its `establishSession` signs a REAL user in. Folding it
  // onto a helper whose measurements were all taken against the mock auth server would be
  // borrowing evidence from a different harness.
  "reports-download-walk.spec.ts": "live-stack lane (#804 out of scope): its own real-stack establishSession",
};

/**
 * THE WRAPPERS, likewise named and argued. Each may DECLARE a sign-in function; the cell below
 * holds every one of them to importing the shared helper, and the cell above already forbids all
 * three from respelling the form.
 */
const WRAPPERS: Record<string, string> = {
  // #804's own precedent: this walk signs in twice per test (`beforeEach` + `openThread`), always
  // as the same persona, so it guards on the session cookie. Folding that guard into the shared
  // helper would silently skip a DIFFERENT persona's sign-in for callers that intentionally
  // re-authenticate (agentic-finish-walk's bookkeeper → owner switch).
  "chat-parity-walk.spec.ts": "idempotency guard — signs in twice per cell as one persona",
  // The same guard, for the same reason: `openDocuments` calls it on every cell and several cells
  // call it again directly.
  "documents-intake-walk.spec.ts": "idempotency guard — the already-signed-in short circuit",
  // Not a sign-in at all after the fold: it signs in through the shared helper as this lane's own
  // persona and then LANDS on the members register, which is the setup every cell repeats.
  "members-invite-walk.spec.ts": "sign-in-and-land helper for this lane's persona",
};

test("#851 · no spec file reimplements the login form — the ONE sign-in is `helpers.ts`'s", () => {
  const files = specFiles();
  // A census that scanned nothing would pass every assertion below. This is the floor, measured:
  // the suite carried 42 spec files when this cell was written.
  assert.ok(files.length >= 40, `the census must actually see the suite (found ${files.length} spec files)`);

  const offenders: string[] = [];
  for (const name of files) {
    if (name in FORM_EXCEPTIONS) continue;
    if (reimplementsLoginForm(readFileSync(join(E2E_DIR, name), "utf8"))) offenders.push(name);
  }

  assert.deepEqual(
    offenders,
    [],
    `these spec files drive the login form themselves instead of calling signIn/signInTo from ./helpers:\n` +
      `${offenders.map((f) => `  - ${f}`).join("\n")}\n` +
      `Import the shared helper, or add the file to FORM_EXCEPTIONS with the reason it cannot.`,
  );
});

test("#851 · a spec that declares a sign-in function is a WRAPPER — named, and delegating to the shared helper", () => {
  const declaring: Record<string, string[]> = {};
  for (const name of specFiles()) {
    const declared = declaredSignIns(readFileSync(join(E2E_DIR, name), "utf8"));
    if (declared.length > 0) declaring[name] = declared;
  }

  // (a) EVERY declaration is a declared wrapper. A new local `signIn` appears here loudly even if
  //     it happens to delegate, because the point of the list is that the set is small and known.
  assert.deepEqual(
    Object.keys(declaring).sort(),
    Object.keys(WRAPPERS).sort(),
    `spec files declaring a sign-in function: ${JSON.stringify(declaring)}`,
  );

  // (b) And every wrapper takes its sign-in from the shared helper — which is the ONLY thing that
  //     makes a wrapper legitimate rather than a twenty-sixth copy.
  for (const [name, declared] of Object.entries(declaring)) {
    assert.ok(
      importsSharedSignIn(readFileSync(join(E2E_DIR, name), "utf8")),
      `${name} declares ${declared.join(", ")} but imports no signIn/signInTo from ./helpers — a wrapper must delegate`,
    );
  }
});

test("#851 · both exception lists are LIVE — an entry that no longer offends must be removed", () => {
  for (const [name, why] of Object.entries(FORM_EXCEPTIONS)) {
    const source = readFileSync(join(E2E_DIR, name), "utf8");
    assert.ok(
      reimplementsLoginForm(source),
      `${name} no longer drives the login form (${why}) — delete its FORM_EXCEPTIONS entry`,
    );
  }
  for (const [name, why] of Object.entries(WRAPPERS)) {
    const source = readFileSync(join(E2E_DIR, name), "utf8");
    assert.ok(
      declaredSignIns(source).length > 0,
      `${name} no longer declares a sign-in wrapper (${why}) — delete its WRAPPERS entry`,
    );
  }
});

test("#851 · THE VACUITY CONTROL: the detector actually detects, and does not over-detect", () => {
  // A cell that walks 42 files and finds nothing is only evidence if the instrument would have
  // found something. Four synthetic sources, driven through the same functions the census uses.
  const offender = [
    'await page.goto("/login");',
    'await page.getByLabel("Email").fill("owner@example.test");',
    'await page.getByLabel("Password").fill("Clara-e2e-password-1!");',
    'await page.getByRole("button", { name: "Sign in" }).click();',
  ].join("\n");
  assert.equal(reimplementsLoginForm(offender), true, "a re-typed login form must be caught");

  // The variable-then-click shape, which a `.click()`-anchored parser would miss.
  const indirectOffender = [
    'await page.getByLabel("Password").fill("Clara-e2e-password-1!");',
    'const submit = page.getByRole("button", { name: "Sign in" });',
    "await submit.click();",
  ].join("\n");
  assert.equal(reimplementsLoginForm(indirectOffender), true, "the indirect click shape must be caught too");

  // THE SAME INDIRECTION ON THE OTHER HALF. The button half was written loose on purpose; the
  // password half was not, and a local sign-in that binds its Password locator first is the same
  // defect in the same style, in the same shape this file's own header argues a real offender
  // takes.
  const indirectPassword = [
    'const password = page.getByLabel("Password");',
    'await password.fill("Clara-e2e-password-1!");',
    'const submit = page.getByRole("button", { name: "Sign in" });',
    "await submit.click();",
  ].join("\n");
  assert.equal(reimplementsLoginForm(indirectPassword), true, "an indirected Password locator is the same form");

  // TWO HALVES OF TWO DIFFERENT FORMS ARE NOT ONE SIGN-IN. `entry-faces-walk.spec.ts`'s real
  // shape: a Password filled on `/signup` and submitted with "Create account", and — in another
  // cell, 38 lines away — the login page's "Sign in" button NAMED to assert its focus ring,
  // never clicked. A file-scoped AND read those two as a local sign-in and demanded an exception
  // whose recorded reason ("the login face is the subject under test") was something the file
  // does not do. The halves must belong to the same sign-in.
  const twoDifferentForms = [
    'await page.goto("/signup");',
    'await page.getByLabel("Password").fill("Clara-e2e-password-1!");',
    'await page.getByRole("button", { name: "Create account" }).click();',
    ...Array.from({ length: 30 }, (_, i) => `// an unrelated cell, line ${i}`),
    'const signInButton = page.getByRole("button", { name: "Sign in" });',
    "await expect(signInButton).toBeFocused();",
  ].join("\n");
  assert.equal(
    reimplementsLoginForm(twoDifferentForms),
    false,
    "a signup fill and a focus-only login button 30 lines apart are two forms, not one sign-in",
  );

  // …and the window is not so tight that a comment between the two acts hides a real one. This is
  // the fold's own retired shape: every walk it retired carried a paragraph about its wait.
  const commentedOffender = [
    'await page.getByLabel("Password").fill("Clara-e2e-password-1!");',
    "// A GENEROUS TIMEOUT, not the 5 s default: this host runs several rigs at once and the",
    "// post-sign-in navigation is a full server render. A short wait here reports \"the app did",
    "// not sign in\" for a page that had simply not finished, which is a false finding.",
    'await page.getByRole("button", { name: "Sign in" }).click();',
  ].join("\n");
  assert.equal(reimplementsLoginForm(commentedOffender), true, "a comment between the two acts does not break the form");

  // A compliant file, and the SIGN-UP form — neither is this form.
  assert.equal(
    reimplementsLoginForm('import { signInTo } from "./helpers";\nawait signInTo(page, "/clients");'),
    false,
    "delegating to the shared helper must not be flagged",
  );
  assert.equal(
    reimplementsLoginForm(
      'await page.getByLabel("Password").fill("x");\nawait page.getByRole("button", { name: "Create account" }).click();',
    ),
    false,
    "the signup form is a different form and is not this gate's business",
  );

  // The regex spelling of the same form — `intake-batch-walk.spec.ts`'s shape before #851.
  assert.equal(
    reimplementsLoginForm(
      'await page.getByLabel(/password/i).fill("password");\nawait page.getByRole("button", { name: /sign in/i }).click();',
    ),
    true,
    "a regex locator spells the same form and is the same defect",
  );

  // The declaration half, both shapes and the alias import.
  assert.deepEqual(declaredSignIns("async function signInToMembers(page: Page) {}"), ["signInToMembers"]);
  assert.deepEqual(declaredSignIns("const signIn = async (page: Page) => {};"), ["signIn"]);
  assert.deepEqual(declaredSignIns("await signIn(page);\nfunction openThread() {}"), [], "a CALL is not a declaration");
  assert.deepEqual(
    declaredSignIns('const signInButton = page.getByRole("button", { name: "Sign in" });'),
    [],
    "a LOCATOR named like a sign-in is not a local sign-in",
  );
  assert.equal(importsSharedSignIn('import { settleForScan, signIn as sharedSignIn } from "./helpers";'), true);
  assert.equal(importsSharedSignIn('import { ensureRealFocus } from "./helpers";'), false);
  assert.equal(importsSharedSignIn('import { signIn } from "./somewhere-else";'), false);
});
