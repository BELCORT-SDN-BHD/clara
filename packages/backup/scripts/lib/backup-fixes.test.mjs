// Unit exercise of the Wave A2 backup hardening fixes (FIX-13/14/16). Pure/black-box
// only — NO live DB, Storage, R2, or ping I/O; `global.fetch` is stubbed for the listing
// tests and the redaction test spawns the dry-run path (pg-free by design).
//   Run: `node --test scripts/lib/backup-fixes.test.mjs`  (from packages/backup/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listAll, assertSafeObjectName } from "./storage-mirror.mjs";
import { resolveConfig } from "./env.mjs";

/** Stub global.fetch with a handler({prefix,limit,offset}) => rows[]; returns a restorer. */
function installFetch(handler) {
  const orig = global.fetch;
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    const rows = handler({ prefix: body.prefix, limit: body.limit, offset: body.offset });
    return { ok: true, json: async () => rows };
  };
  return () => {
    global.fetch = orig;
  };
}

/** Set env vars (undefined => delete) for the duration of fn, then restore exactly. */
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// ---- FIX-13: pagination past the 1000/prefix cap + recursion -----------------
test("listAll pages every prefix to exhaustion and recurses into folders", async () => {
  const rootFiles = Array.from({ length: 1500 }, (_, n) => ({
    name: `d${String(n).padStart(4, "0")}`,
    id: `id-${n}`,
    metadata: { size: n, mimetype: "application/pdf" },
  }));
  const rootAll = [...rootFiles, { name: "nested", id: null }]; // 1500 files + 1 folder
  const nestedAll = [
    { name: "f0", id: "n0", metadata: { size: 1 } },
    { name: "f1", id: "n1", metadata: { size: 2 } },
    { name: "f2", id: "n2", metadata: { size: 3 } },
  ];
  const handler = ({ prefix, offset, limit }) => {
    const src = prefix === "" ? rootAll : prefix === "nested" ? nestedAll : [];
    return src.slice(offset, offset + limit);
  };
  const restore = installFetch(handler);
  try {
    const objects = await listAll("https://x.supabase.co", "firm-docs", {});
    // 1500 root files (NOT truncated at 1000) + 3 nested = 1503, folder itself excluded.
    assert.equal(objects.length, 1503);
    assert.ok(objects.some((o) => o.path === "nested/f0"));
    assert.ok(objects.some((o) => o.path === "d1499")); // the object past the first page
    assert.ok(!objects.some((o) => o.path === "nested")); // folder placeholder is not an object
  } finally {
    restore();
  }
});

// ---- FIX-13: de-duplicate a boundary row repeated across offset pages --------
test("listAll de-duplicates rows repeated across a page boundary", async () => {
  const handler = ({ prefix, offset }) => {
    if (prefix !== "") return [];
    if (offset === 0) return Array.from({ length: 1000 }, (_, n) => ({ name: `i${n}`, id: `x${n}`, metadata: { size: 1 } }));
    if (offset === 1000)
      // 1000 rows, but the first (i999) repeats the previous page's last row.
      return [
        { name: "i999", id: "x999", metadata: { size: 1 } },
        ...Array.from({ length: 999 }, (_, k) => ({ name: `i${1000 + k}`, id: `x${1000 + k}`, metadata: { size: 1 } })),
      ];
    return [];
  };
  const restore = installFetch(handler);
  try {
    const objects = await listAll("https://x.supabase.co", "firm-docs", {});
    assert.equal(objects.length, 1999); // i0..i1998 distinct; the duplicate i999 collapses
  } finally {
    restore();
  }
});

// ---- FIX-16: path-traversal / absolute-escape object names are refused -------
test("assertSafeObjectName rejects traversal + accepts legitimate content-addressed names", () => {
  for (const bad of ["../etc/passwd", "/abs/path", "a/../b", "firms/../x", "bad\0name", ""]) {
    assert.throws(() => assertSafeObjectName(bad), `expected reject: ${JSON.stringify(bad)}`);
  }
  for (const good of ["firms/9a/docs/abcd.pdf", "report..final.pdf", "a/b/c.xml"]) {
    assert.doesNotThrow(() => assertSafeObjectName(good), `expected accept: ${JSON.stringify(good)}`);
  }
});

test("listAll aborts the whole run on a traversal object name", async () => {
  const restore = installFetch(({ prefix }) => (prefix === "" ? [{ name: "../evil", id: "e", metadata: { size: 1 } }] : []));
  try {
    await assert.rejects(listAll("https://x.supabase.co", "firm-docs", {}), /".."/);
  } finally {
    restore();
  }
});

// ---- FIX-14: the dead-man's-switch is mandatory for a real run --------------
const BASE_ENV = {
  DATABASE_URL: undefined,
  PGHOST: "db.example.internal",
  PGUSER: "postgres.ref",
  CLARA_BACKUP_STORAGE_URL: "https://ref.supabase.co",
  CLARA_BACKUP_R2_BUCKET: "clara-dr",
  CLARA_BACKUP_AGE_RECIPIENTS_FILE: "/app/deploy/age-recipient.txt",
  CLARA_BACKUP_STAGING_DIR: "/tmp/clara-backup",
  CLARA_BACKUP_PING_URL: undefined,
  CLARA_BACKUP_PING_URL_FILE: undefined,
  CLARA_BACKUP_ALLOW_NO_PING: undefined,
};

test("resolveConfig FAILS a real run when the ping URL is absent (fail-closed)", () => {
  withEnv(BASE_ENV, () => {
    assert.throws(() => resolveConfig({ dryRun: false }), /CLARA_BACKUP_PING_URL/);
  });
});

test("resolveConfig only REPORTS the missing ping URL in a dry run", () => {
  withEnv(BASE_ENV, () => {
    const cfg = resolveConfig({ dryRun: true });
    assert.ok(cfg.missing.some((m) => m.includes("CLARA_BACKUP_PING_URL")));
  });
});

test("resolveConfig allows a real run with the ping URL present", () => {
  withEnv({ ...BASE_ENV, CLARA_BACKUP_PING_URL: "https://hc-ping.com/uuid" }, () => {
    assert.doesNotThrow(() => resolveConfig({ dryRun: false }));
  });
});

test("resolveConfig honors the explicit test/rehearsal escape hatch", () => {
  withEnv({ ...BASE_ENV, CLARA_BACKUP_ALLOW_NO_PING: "1" }, () => {
    assert.doesNotThrow(() => resolveConfig({ dryRun: false }));
  });
});

// ---- FIX-14: the dry-run plan never prints the ping URL verbatim -------------
test("dry-run redacts the ping URL and never prints its path segment", () => {
  const script = fileURLToPath(new URL("../backup-run.mjs", import.meta.url));
  const sentinel = "ping-uuid-abc123-DO-NOT-LOG";
  const r = spawnSync(process.execPath, [script, "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, CLARA_BACKUP_PING_URL: `https://hc-ping.com/${sentinel}`, CLARA_BACKUP_PING_URL_FILE: "" },
  });
  assert.equal(r.status, 0, `dry-run should exit 0; stderr: ${r.stderr}`);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  assert.ok(!out.includes(sentinel), "the raw ping URL path segment must NOT appear in dry-run output");
  assert.ok(out.includes("hc-ping.com"), "the redacted ping host should still be shown");
});
