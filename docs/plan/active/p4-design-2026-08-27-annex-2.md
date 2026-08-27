# P4 design — annex 2: frontend execution

*Companion to `p4-design-2026-08-27.md` and its first annex, `p4-design-2026-08-27-annex.md`
(which carries the byte evidence, the negative searches, the contrast measurements and the
proposed door shapes). This half is what a frontend build lane executes: routes, primitives,
the gate rows, the battery, and the R2/R3 detail. Where this and the design disagree, the
design governs.*

---

## E · Route and component inventory

Proposed paths, in a fenced block because none of them exist yet:

```
apps/web/app/(entry)/                    NEW route group — owns the R2 cream ground
  layout.tsx                             the cream layout + the Ledger Fold mark (R1)
  login/page.tsx                         MOVED from app/login (URL unchanged)
  signup/page.tsx                        NEW
  invite/[token]/page.tsx                MOVED from app/invite/[token] (URL unchanged)
  pending/page.tsx                       NEW — the holding state (main doc §4 E)

apps/web/app/(firm)/admin/
  page.tsx                               EXISTS as an honest empty state; becomes the hub
  members/page.tsx                       NEW — roster, roles, invites
  registrations/page.tsx                 NEW — operator only
  tiers/page.tsx                         NEW — flag-hidden, read-only (design §4 F)

apps/web/app/api/invite/route.ts         NEW — the server-only mail courier (§4 C)

apps/web/lib/require-firm-scope.ts       NEW — the ONE scope check, three entrances (§4 E)

apps/web/components/entry/               signup form, pending states, brand lockup
apps/web/components/admin/               roster table, role control, invite dialog,
                                         registrations queue, tier panel, price placeholder
```

**The scope check is one file called from three places** — `(firm)/layout.tsx`,
`(full)/layout.tsx`, and the API route handler. `(full)` and `apps/web/app/api/runtime` are
**siblings** of `(firm)`, not children: a route group adds no URL segment and wraps nothing
outside itself, so a check placed only in the firm layout leaves both reachable by a
no-membership session. The layouts redirect; the API route returns 403.

Route-group moves keep every URL byte-identical (a group adds no segment), so the public-path
list needs only `/signup` appended — `"/login"` and `"/invite"` keep matching. It lives at
**`apps/web/lib/supabase/proxy.ts:42`**, not in the root `apps/web/proxy.ts`, which is a thin
wrapper around `updateSession()`. `apps/web/tests/proxy-matcher.test.ts`'s asserted set extends
with it.

**Primitives to vendor (R4, build-on-demand).** Present today in `apps/web/components/ui/`:
badge, button, card, command, dialog, input-group, input, label, select, separator, table,
textarea. P4 needs, and must vendor via the shadcn CLI with `dark:` classes stripped and both
gates passing in the same PR: **DropdownMenu** (the row-level role/remove menu) and **Form**
(the four new forms). **Tabs** is probably unnecessary —
`apps/web/components/common/section-tabs.tsx` already exists and covers the admin hub's
sections. **Switch** only if the tier flag surfaces in-app rather than as an env/config value.
**RadioGroup is NOT vendored** unless owner question 5 is overruled: with tier assignment
operator-only, the firm-side surface is a read-only display (design §4 F) and a radio group
would be a control that cannot act. Avatar is not needed — the roster shows names, and
`users_visible` carries no avatar.

**⌘K.** `apps/web/lib/command/routes.ts` gains the new admin routes. Note the file's existing
drift: most entries are marked `status: "planned"` while their pages exist on disk (admin
included). The file's own header says to re-derive the manifest from the live `apps/web/app/`
tree once P3's pages landed rather than hand-patch it — P4 should do that re-derivation rather
than add three more hand-maintained rows to a stale table.

**i18n.** Four new namespaces (Signup, Pending, Members, Registrations) plus additions to
Admin. Note that the hardcoded-string lint gate **does not exist yet** —
`apps/web/i18n/request.ts`'s comment describes an intended future gate, and the root
`eslint.config.mjs` has no i18n or literal-string rule. Every P4 string still routes through
next-intl by house law; the gate that would enforce it is a separate, unbuilt item.

---

## F · The gate rows to add

`PAIR_SPECS` in `apps/web/scripts/check-token-contrast.mjs` is a closed-world array whose
spec signature already passes a `composite(fgToken, alpha, overHex)` helper — the existing
`destructive-on-destructive-10` row uses it. **No schema change is needed.** The idiom to
follow, verbatim from the shipped file:

```js
{ id: "destructive-on-destructive-10", fg: (h) => h("destructive"),
  bg: (h, composite) => composite("destructive", 0.10, h("background")), threshold: 4.5,
  source: "..." },
```

So a composited focus-ring row takes this shape (shown for cream; repeat for shell,
background, surface-subtle, secondary, accent):

```js
{ id: "focus-ring-composited-on-identity-canvas",
  fg: (h, composite) => composite("ring", 0.70, h("identity-canvas")),
  bg: (h) => h("identity-canvas"), threshold: 3,
  source: "the shadcn focus idiom's translucent halo, rendered by all nine components that carry it — components/ui/button.tsx, input.tsx, textarea.tsx, select.tsx, badge.tsx (badge spells it ring-[3px], the others ring-3), components/common/native-select.tsx, components/common/section-tabs.tsx, components/journals/drafts-queue-panel.tsx, components/clara/ClaraThreadView.tsx — over the (entry) route group's cream ground" },
```

That `source` string is written out in full deliberately. A single-pattern grep for
`focus-visible:ring-3` finds only eight of the nine, because `badge.tsx` spells it
`ring-[3px]`; a source string derived from that grep would under-describe the population the
row asserts about, which is the "spelling is not identity" failure in miniature.

**The alpha in those rows is the decision, not a detail — and the rows come AFTER the
ruling.** At `0.50` all six fail; at `0.65` five pass and **accent fails at 2.970**; at `0.70`
all six clear with ≥0.270 margin (annex 1 §C.1). Landing the rows before the owner rules
question 3 would put CI red on a question that is his to answer; landing them at an alpha the
components do not yet render would assert a composition that does not ship. Rule, then change
the components, then add the rows — in that order, in that PR.

Rows to add regardless of question 3: the ten cream text pairs from annex 1 §C.2 at threshold
4.5, and — if question 4 is taken — `input-on-background`, `input-on-card`, `input-on-shell`
and `input-on-identity-canvas` at threshold 3, which go in **with** the `--input` token
change, never before it.

**A note for whoever writes these rows.** Every existing spec's `source` string names the real
files that render the pair, and the gate is only as honest as those strings — a row whose
source is aspirational makes the gate assert a composition nothing renders. Write the source
after the component exists, not from the design.

**And a defect this pass found, independent of P4.** The two existing focus rows,
`focus-ring-on-background` and `focus-ring-on-shell`, both use `fg: (h) => h("focus")` — the
**solid** token — and their `source` strings cite only the base `:focus-visible { outline: …
solid var(--focus) }` rule. Nine components render the translucent idiom instead and no pair
measures it. The gate is green on focus because it is measuring the treatment that is not
there. That blind spot predates P4 and should be recorded as a known issue whether or not P4
proceeds.

---

## G · The battery, per file

The gates are the hand-written rule engine (`apps/web/test/a11yRules.ts`) and the keyboard
walk (`apps/web/test/keyboardWalk.ts`), not axe-core — the P3 finale recorded a confirmed axe
false positive on a correctly-labelled button. A surface is registered into a scan only by
having its own test file mount it with fixture props and assert `deepEqual(violations, [])`.
**There is no known-violation pinning mechanism**, by design: a real violation is a component
fix, never an allowlist entry.

| new test file | proves |
|---|---|
| signup-a11y · signup-keyboard | the signup form scans clean and walks by keyboard |
| pending-a11y | the holding state's three variants (pending, rejected, invite-expected) |
| members-a11y · members-keyboard | the roster, the role control's menu, and the disabled-with-reason affordances |
| invite-dialog-a11y · invite-dialog-keyboard | the dialog's focus trap and escape path — the two that actually matter |
| registrations-a11y | the operator console |
| tiers-a11y | the tier display, with the flag on |
| **login-a11y · login-keyboard** | the P2 login form — **never registered in either scan today** |
| **invite-accept-a11y · invite-accept-keyboard** | the P2 accept form — likewise unregistered, and in P4's blast radius |

Auth-boundary additions to `apps/web/tests/`, each asserted in **both** directions so a
permanently-true assertion cannot hide:

- `/signup` resolves public and every other new route does not (extends `proxy-matcher.test.ts`).
- `requireFirmScope()` redirects on an empty context read **and** on a failed one, at all three
  entrances — with a positive control that a real membership passes through.
- `accept_invite` refuses a JWT-email/invite-email mismatch, and accepts the match.
- The mail courier refuses an unauthenticated caller, refuses a cross-origin one, and **sends
  no mail when the door refused** — the last is the one worth writing, because a courier that
  mails on a refusal is the failure mode the design's ordering exists to prevent.

Every file above goes explicitly into `apps/web/package.json`'s `test` script, plus a **count
control** asserting the expected number of test files: Node 20 does not directory-scan for
`.test.ts`, so an unenumerated file silently never runs, and a count is the only cheap way to
make a dropped entry loud.

DB-side, each ask's own train carries rig tests for its floor, its refusal codes and its
receipt — including a negative per floor (a viewer refused where bookkeeper is required, a
bookkeeper where admin is) and, for ask 8, two positive controls that matter: a **non-operator
owner** is refused, and an **operator-firm admin** is refused. Testing only the happy operator
path would leave both halves of that conjunction unproven.

---

## H · R2 and R3 — the execution detail

### H.1 · R2's mechanism, and the comment that must be rewritten rather than deleted

The four entry surfaces move into one route group whose layout owns the cream ground. Route
groups add no URL segment, so `/login` and `/invite/:token` keep their URLs byte-identical and
the grouping — not a remembered class — becomes the mechanism.

`--identity-canvas` is defined at `apps/web/app/globals.css:166` and deliberately **not**
bridged into `@theme inline`, above a comment block that cites the token contract twice (§3.1
"NOT the primary product canvas"; §3.3 "do NOT restore it as the product page canvas without a
new founder-approved impact note") and concludes that grounding /login and /invite on it "is
therefore a founder-approval item under §3.3 and §9".

**R2 is that approval.** The execution adds the `--color-identity-canvas` bridge and rewrites
that comment so the citation survives and only its conclusion inverts — recording R2 verbatim,
dated, with the founder named. Deleting the comment would erase the record of why the question
was open, which is what makes the next reader re-litigate it.

### H.2 · R3's failure population, in four parts

1. **The halo alone always fails** — 2.245 to 2.363 across the six gated grounds at 50% alpha.
2. **The solid `focus-visible:border-ring` swap rescues transparent-fill primitives.** Input,
   Textarea, Select and native-select all ship `bg-transparent` or inherit the page, so the
   swapped border reads 6.18–6.70 against the fill on its inner side. One adjacent side clears
   3:1 and the control is compliant today.
3. **Nothing rescues the default Button.** `--primary` and `--ring` are both `#1d4ed8`, so the
   swapped border against the button's own fill measures **1.000** — literally invisible —
   while its outward neighbour is the halo at 2.674. Both sides of the solid edge sit under the
   bar. This is the only shape in the set that fails outright rather than by margin, and no
   change to the halo's alpha touches it: the fix has to be an offset ring (so the halo sits
   against the page rather than the fill) or a contrasting border token for filled variants.
4. **Executing R3 literally extends the failure rather than leaving it flat.** Today anything
   without the shadcn idiom — a plain `<a>`, a list row, a custom control — inherits the base
   `:focus-visible` outline at 6.20 and is compliant. R3 unifies on the ring, which strips that
   outline. So the population goes from the nine components carrying the idiom now to **every
   focusable element in the app**. This is why "unify on the ring" cannot ship before the alpha
   question is ruled: the unification is what turns a nine-component defect into an app-wide
   one.
