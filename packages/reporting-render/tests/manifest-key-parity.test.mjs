// Lane ζ unit battery — THE MIRROR MUST MATCH THE AUTHORITY.
//
// decisions.mjs carries a copy of clara._report_manifest_required_keys' list so the worker can
// refuse a manifest BEFORE spending a render. A copy that silently drifts from the database's own
// list is worse than no copy: the worker would green-light a manifest the seal then rejects, or —
// far worse — would stop demanding a key the seal still requires, and the only symptom would be a
// refusal much later, with the render already paid for.
//
// So this test reads the ACTUAL array out of lane epsilon's migration and diffs it. It searches
// every migration file rather than naming one, because migration NUMBERS are claimed at merge
// (`.claude/rules/db-migrations.md`) — a test pinned to `UNNUMBERED_…` or to `0058_…` breaks on
// the day the number is claimed, which is the day nobody wants a mystery failure.
//
// IT FAILS CLOSED. If the function cannot be found at all, that is a FAILURE, not a skip: lane
// epsilon is a build dependency of lane zeta (design §12's lane table), so its absence means the
// tree is not in a state this worker's assumptions hold for. "I could not check" is not "it is
// fine" — that is the absence-as-evidence defect this repo has paid for repeatedly.

import { ok, strictEqual } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { REQUIRED_MANIFEST_KEYS_BASE, requiredManifestKeys } from "../lib/decisions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "db", "migrations");

/** The `base text[] := array[...]` literal inside clara._report_manifest_required_keys. */
function readAuthorityKeys() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS, f), "utf8");
    const at = src.indexOf("create function clara._report_manifest_required_keys");
    if (at === -1) continue;
    const body = src.slice(at);
    const m = /base\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/.exec(body);
    if (!m) continue;
    const base = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const extra = {};
    for (const kind of ["pre_sign", "signed_original"]) {
      const re = new RegExp(`p_kind = '${kind}'[\\s\\S]*?base \\|\\| array\\[([^\\]]*)\\]`);
      const em = re.exec(body);
      extra[kind] = em ? [...em[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
    }
    return { file: f, base, extra };
  }
  return null;
}

test("the worker's required-key mirror matches lane epsilon's own array, key for key and in order", () => {
  const authority = readAuthorityKeys();
  ok(authority,
    "clara._report_manifest_required_keys was not found in packages/db/migrations — lane epsilon is a BUILD dependency of lane zeta, so its absence is a failure, not a skip");
  strictEqual(
    REQUIRED_MANIFEST_KEYS_BASE.join(","),
    authority.base.join(","),
    `the worker's mirror has drifted from ${authority.file}`,
  );
});

test("the per-kind extras match too, and the counts are epsilon's own 32 / 33 / 35", () => {
  const authority = readAuthorityKeys();
  ok(authority, "clara._report_manifest_required_keys not found");
  strictEqual(authority.base.length, 32, "epsilon's own tail census asserts 32 base keys");
  strictEqual(requiredManifestKeys("draft_watermarked").length, 32);
  strictEqual(
    requiredManifestKeys("pre_sign").join(","),
    [...authority.base, ...authority.extra.pre_sign].join(","),
  );
  strictEqual(requiredManifestKeys("pre_sign").length, 33, "epsilon's own tail census asserts 33 pre_sign keys");
  // The worker deliberately has NO signed_original arm — a signed original is retained and
  // retrieved, never rendered — but epsilon's list still has 35 for it, and this asserts the
  // absence is a decision rather than an omission.
  strictEqual(authority.base.length + authority.extra.signed_original.length, 35);
});

test("the two keys THIS design added are in the authority list, not only in the worker", () => {
  const authority = readAuthorityKeys();
  ok(authority, "clara._report_manifest_required_keys not found");
  for (const key of ["extracted_text_sha256", "extraction_tool"]) {
    ok(authority.base.includes(key),
      `${key} is a REQUIRED manifest key (§9's two additions) and must be in the database's own list`);
    ok(REQUIRED_MANIFEST_KEYS_BASE.includes(key));
  }
});
