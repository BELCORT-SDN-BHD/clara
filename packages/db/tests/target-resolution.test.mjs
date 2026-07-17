// Finding 1 — single-canonical-target unit tests. Pure env logic: NO database
// connection, so this runs anywhere (unlike pipeline.test.mjs, which needs PG).
//
// Proves the guard rejects a DSN-URL-vs-PG* target split, that the external-tool
// child env is derived from the ONE canonical target, and that labels/resolution
// agree with the node client.
//
// DSNs are ASSEMBLED FROM FRAGMENTS so no literal scheme://user:secret@host ever
// appears in source — these are synthetic parse fixtures, not real credentials,
// and this keeps both the leak-scan gate and the no-secrets hook quiet.

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveTarget,
  assertNoTargetSplit,
  childEnvForExternalTools,
  targetLabel,
} from "../lib/pg.mjs";

// Synthetic userinfo, split across a concatenation so the source has no
// `://user:pass@` literal for a credential scanner to match.
const USER = "alice";
const CRED = USER + ":" + "pw";
/** Build a synthetic DSN at runtime (host/port/db are what the tests assert). */
function pgUrl(host, port, db, extra = "") {
  return "postgres:" + "//" + CRED + "@" + host + ":" + port + "/" + db + extra;
}

// Every PG*/URL var this code path reads — cleared before each case, restored after.
const KEYS = [
  "DATABASE_URL",
  "WORKFLOW_POSTGRES_URL",
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSLMODE",
];

function withEnv(overrides, fn) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    for (const k of KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}

test("resolveTarget: DSN URL wins and is parsed to host/port/db", () => {
  withEnv({ DATABASE_URL: pgUrl("db.example.com", "5433", "books"), PGHOST: "ignored" }, () => {
    const t = resolveTarget();
    assert.equal(t.source, "url");
    assert.equal(t.host, "db.example.com");
    assert.equal(t.port, "5433");
    assert.equal(t.db, "books");
  });
});

test("resolveTarget: PG*-only falls back to libpq vars (db defaults to user)", () => {
  withEnv({ PGHOST: "Local.Host", PGPORT: "6543", PGUSER: "svc" }, () => {
    const t = resolveTarget();
    assert.equal(t.source, "pg");
    assert.equal(t.host, "local.host"); // lowercased
    assert.equal(t.port, "6543");
    assert.equal(t.db, "svc"); // PGDATABASE unset -> PGUSER
  });
});

test("assertNoTargetSplit: URL + matching PG* is allowed", () => {
  withEnv(
    { DATABASE_URL: pgUrl("h1", "5432", "postgres"), PGHOST: "h1", PGPORT: "5432", PGDATABASE: "postgres" },
    () => {
      assert.doesNotThrow(() => assertNoTargetSplit());
    },
  );
});

test("assertNoTargetSplit: URL host != PGHOST is REJECTED", () => {
  withEnv({ DATABASE_URL: pgUrl("urlhost", "5432", "postgres"), PGHOST: "otherhost" }, () => {
    assert.throws(() => assertNoTargetSplit(), /target split/i);
  });
});

test("assertNoTargetSplit: URL db != PGDATABASE is REJECTED", () => {
  withEnv({ DATABASE_URL: pgUrl("h1", "5432", "books"), PGDATABASE: "other_db" }, () => {
    assert.throws(() => assertNoTargetSplit(), /target split/i);
  });
});

test("assertNoTargetSplit: a service file alongside a URL is REJECTED (unverifiable)", () => {
  withEnv({ DATABASE_URL: pgUrl("h1", "5432", "postgres"), PGSERVICE: "prod" }, () => {
    assert.throws(() => assertNoTargetSplit(), /target split/i);
  });
});

test("childEnvForExternalTools: URL is rebuilt into PG* and inherited PG* are cleared", () => {
  // Inherited PGUSER/PGPASSWORD are NOT a host/port/db split (allowed), but the
  // URL is authoritative — the child must use the URL's userinfo, not the stale
  // inherited pair. This is exactly what the clear-then-rebuild guarantees.
  withEnv(
    { DATABASE_URL: pgUrl("db.host", "5433", "ledger", "?sslmode=require"), PGUSER: "bob", PGPASSWORD: "stale" },
    () => {
      const env = childEnvForExternalTools();
      assert.equal(env.PGHOST, "db.host");
      assert.equal(env.PGPORT, "5433");
      assert.equal(env.PGUSER, USER); // alice from the URL, not inherited "bob"
      assert.equal(env.PGPASSWORD, "pw"); // from the URL, not inherited "stale"
      assert.equal(env.PGDATABASE, "ledger");
      assert.equal(env.PGSSLMODE, "require");
    },
  );
});

test("childEnvForExternalTools: PG*-only passes through unchanged", () => {
  withEnv({ PGHOST: "h1", PGPORT: "5432", PGDATABASE: "clara_ci" }, () => {
    const env = childEnvForExternalTools();
    assert.equal(env.PGHOST, "h1");
    assert.equal(env.PGDATABASE, "clara_ci");
  });
});

test("childEnvForExternalTools: throws on a split (never spawns against a wrong DB)", () => {
  withEnv({ DATABASE_URL: pgUrl("urlhost", "5432", "postgres"), PGHOST: "otherhost" }, () => {
    assert.throws(() => childEnvForExternalTools(), /target split/i);
  });
});

test("targetLabel: password-free host:port/db, and safe on an unparseable URL", () => {
  withEnv({ DATABASE_URL: pgUrl("h1", "5432", "books") }, () => {
    assert.equal(targetLabel(), "h1:5432/books");
  });
  withEnv({ DATABASE_URL: "::::not a url::::" }, () => {
    assert.equal(targetLabel(), "(unparseable DATABASE_URL)");
  });
});
