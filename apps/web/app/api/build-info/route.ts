import { NextResponse } from "next/server";

import { firmScopeGuard } from "@/lib/require-firm-scope";

// CB-AE2E-035 — the WEB half of "what is actually serving".
//
// The reading an operator actually wants is a PAIR: what the web Worker is serving, and what
// the runtime is serving, against which schema. The launch night could not get either — a
// `fly releases --json` investigation was needed to establish that four release numbers all
// carried ONE image, because nothing in the product could say so.
//
// THE SHA IS A BUILD-TIME CONSTANT, READ SERVER-SIDE. `next.config.ts`'s `env` block freezes it
// into the emitted bundles at `next build`, sourced from the CI commit variables (or an
// explicit `CLARA_BUILD_SHA`). Three deliberate choices:
//
//   * NOT `NEXT_PUBLIC_`. A `NEXT_PUBLIC_` name is inlined into the BROWSER bundle; this value
//     is read only here, in a Route Handler, and is served to a scoped session — the same
//     posture `CLARA_RUNTIME_URL` has and for the same stated reason.
//   * NOT a `wrangler.jsonc` var. That block is REPLACED on every `wrangler deploy`, and a
//     hand-edited sha there is a value someone has to remember to change — exactly the drift
//     this endpoint exists to DETECT. `wrangler.jsonc` says so itself, about its own contents.
//   * NULL WHEN UNRESOLVED. A local `next build` with no CI variables reports `git_sha: null`,
//     never a placeholder and never a stale literal. A fabricated sha would be believed.
//
// SCOPE. This is a firm-scoped surface (`SCOPE_ENTRANCES`, 403 on denial — never a redirect: a
// redirect is not an answer to a data request). It reads no firm data at all, but a commit sha
// and a deployment identity are not anonymous-readable facts about a running system, and the
// spine's own census requires every route leaf to be classified rather than assumed.

/** Frozen at `next build` by next.config.ts's `env` block; null when nothing resolved. */
const WEB_BUILD_SHA = process.env.CLARA_WEB_BUILD_SHA;

export async function GET(): Promise<Response> {
  const guard = await firmScopeGuard();
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    service: "clara-web",
    // Empty string is treated as unset: the config block emits "" when nothing resolved, and an
    // empty sha in a response reads as a value rather than as an absence.
    git_sha: WEB_BUILD_SHA ? WEB_BUILD_SHA : null,
    // The runtime origin this deployment forwards to — a public deployment fact (it already
    // lives in `wrangler.jsonc`), and the one thing that says WHICH runtime the sha above is
    // paired with. Null when unset, which is itself the diagnosis for a dead chat lane.
    runtime_url: process.env.CLARA_RUNTIME_URL ?? null,
    ts: new Date().toISOString(),
  });
}
