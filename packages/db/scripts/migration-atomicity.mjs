// SESSION and TRANSACTION authority for the migration runner.
// The lexical scan (migration-lexer.mjs) is an early, review-friendly refusal. The
// server-side SECURITY INVOKER wrapper below is the authoritative wall — it is what
// catches anything a body constructs dynamically, which the text scan cannot see.

import { randomUUID } from "node:crypto";

// The session-pin NONCE: the runner's honest answer to "is this body about to run on a
// session that was freshly pinned FOR IT?".
//
// It replaces a pid-distinctness test that was FALSE BY DESIGN through a connection
// pooler. "A fresh client connection gets a fresh server backend" holds on a direct
// connection and nowhere else — Supavisor in SESSION mode legitimately hands a brand-new
// client an already-used backend, which is exactly what refused a live migration. CI
// connects straight to a container, so CI could never ask the question.
//
// The nonce is true in both worlds because it measures the thing that actually protects
// the run: DISCARD ALL plus the baseline, applied for THIS migration. A recycled backend
// that was freshly pinned passes, because being freshly pinned is the protection. A
// session that skipped the pin, carries a previous migration's pin, or silently changed
// underneath the client all fail.
//
// It is also the detector for a pooling mode this runner cannot survive: under
// TRANSACTION pooling a session GUC does not outlive its statement, so the read-back
// fails immediately and loudly. That matters because the advisory lock (F10) and the
// pg_temp execution wrapper are both session-scoped too — they would fail SILENTLY.
export const MIGRATION_SESSION_NONCE_GUC = "clara.migration_session_nonce";

// Re-exported so the runner and its tests keep one import site for the file-level
// refusals; the split is about file size, not about a new public surface.
export {
  assertNoCheckFunctionBodyOverride,
  assertNoTransactionControl,
  migrationStatementTimeout,
} from "./migration-lexer.mjs";

export const MIGRATION_SESSION_BASELINE = Object.freeze({
  // FIRST deliberately, and mirrored by the wrapper's post-RESET ALL block: this is the
  // only entry whose wrong value TERMINATES the session rather than skewing a result,
  // so it is restored before the runner spends round trips on the cosmetic ones.
  transaction_timeout: "0",
  DateStyle: "ISO, YMD",
  TimeZone: "UTC",
  bytea_output: "hex",
  IntervalStyle: "postgres",
  extra_float_digits: "3",
  standard_conforming_strings: "on",
  check_function_bodies: "on",
  transform_null_equals: "off",
  quote_all_identifiers: "off",
  client_encoding: "UTF8",
  client_min_messages: "notice",
  statement_timeout: "0",
  search_path: "pg_catalog",
  session_replication_role: "origin",
  default_transaction_read_only: "off",
  default_transaction_isolation: "read committed",
  default_transaction_deferrable: "off",
  lock_timeout: "0",
});

// The per-migration TRANSACTION ISOLATION.
//
// Distinct from the baseline above, deliberately: that pins the session DEFAULT, this is
// the level the runner's own per-migration transaction opens at. The baseline stays
// "read committed" either way — `BEGIN ISOLATION LEVEL` sets transaction_isolation, not
// default_transaction_isolation, so assertBaseline and the wrapper's post-`RESET ALL`
// restore keep comparing the same parameter they always did.
//
// READ COMMITTED is the default and the corpus depends on it: 0019_wiki_boundary's
// publication path REFUSES outright under repeatable read (CLR32, "wiki publication
// cannot run under repeatable read isolation"). Measured — applying the whole chain
// under a blanket repeatable read dies there. So this is a per-migration exception and
// never a global switch.
//
// 0057 is the one exception, and an APPLIED file's immutable bytes force it. Its S0.9
// birth sentinel proves the watermark instrument by asking whether this transaction's own
// xid is visible in its own snapshot. Measured on PostgreSQL 17.11, that question has no
// stable answer under READ COMMITTED:
//   - a snapshot never lists the caller's own xid in xip_list, and its xmax is
//     latestCompletedXid + 1;
//   - so the predicate is TRUE exactly when some OTHER transaction ANYWHERE on the
//     cluster took an xid after ours and then completed, pushing xmax past us;
//   - which made the sentinel a coin flip — the same bytes passed on a quiet cluster and
//     raised in 4 of 5 applications under a concurrent committer.
// Under REPEATABLE READ the transaction's snapshot is taken before any xid the
// transaction can allocate, so own-xid >= xmax always and the sentinel is deterministically
// false. That is a proof, not a narrower window.
export const DEFAULT_MIGRATION_ISOLATION = "read committed";

// The only levels this runner will interpolate into a BEGIN. Membership is checked before
// the clause is built, so the isolation string can never be anything but one of these.
const ALLOWED_MIGRATION_ISOLATION = new Set([DEFAULT_MIGRATION_ISOLATION, "repeatable read"]);

// Keyed on the CHECKSUM, because the checksum is the file's identity and the version
// string is only its spelling — a renumbered 0057 is still the file that needs this.
export const MIGRATION_ISOLATION_PINS = Object.freeze([
  Object.freeze({
    version: "0057_wave_e_registry_snapshots",
    checksum: "c0eabe478f08ba1b8f889df5d2a7f09c51f2baf418313709f676caeefe09c697",
    isolation: "repeatable read",
  }),
]);

/**
 * The isolation level a migration with these exact bytes must be applied under.
 *
 * FAIL-CLOSED on the version/checksum split: a version that carries a pin but arrives
 * with different bytes is an edited applied migration, and which isolation the changed
 * file needs is not something the runner may guess.
 * @returns {string} one of ALLOWED_MIGRATION_ISOLATION
 */
export function migrationIsolationLevel(version, checksum) {
  const pinned = MIGRATION_ISOLATION_PINS.find((pin) => pin.checksum === checksum);
  if (!pinned) {
    const byVersion = MIGRATION_ISOLATION_PINS.find((pin) => pin.version === version);
    if (byVersion) {
      throw new Error(
        `migration ${version} carries a transaction-isolation pin for checksum ${byVersion.checksum}, but this file's checksum is ${checksum} — an applied migration's bytes are immutable, and the runner will not guess which isolation the changed file needs. Refusing to migrate.`,
      );
    }
    return DEFAULT_MIGRATION_ISOLATION;
  }
  if (!ALLOWED_MIGRATION_ISOLATION.has(pinned.isolation)) {
    throw new Error(
      `migration ${version} is pinned to a transaction-isolation level the runner does not allow: ${JSON.stringify(pinned.isolation)}`,
    );
  }
  return pinned.isolation;
}

// PostgreSQL 17 introduced transaction_timeout, which bounds a WHOLE transaction and
// terminates the session (FATAL) when it fires — a migration's runner-owned transaction
// is exactly the long transaction it would kill. A poisoned database- or role-level
// default must therefore be pinned off, and the pin re-applied after the server-side
// wrapper's RESET ALL: measured on 17.10, setting the GUC part-way through an open
// transaction arms a FRESH window from that moment, so RESET ALL hands the runner's
// remaining post-body verification work straight back to the poisoned default.
export const TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM = 170000;

// Baseline settings that do not exist on every supported server. Each is pinned only
// when the LIVE server reports a version that has it — an older server answers
// `unrecognized configuration parameter` and would fail the run on the pin itself.
const VERSION_GATED_SETTINGS = Object.freeze({
  transaction_timeout: TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM,
});

// Baseline settings PostgreSQL restricts to superusers. MEASURED, not assumed: on 17.10
// `select name, context from pg_catalog.pg_settings where name = any(<baseline>)` reports
// context 'user' for 18 of the 19 baseline parameters and 'superuser' for this one — the
// check is kept honest by the pg_settings sweep cell in migrate-session-reset.test.mjs, so
// a future baseline addition with a restricted context reds rather than silently joining.
//
// It matters because a MANAGED cluster's owner login is not a superuser (Supabase's
// `postgres` is not), and the SET is denied with 42501. The first live ceremony aborted
// there. The pin's protective intent survives without the SET: what the runner must never
// do is RUN under a non-origin replication role, and that it can still verify by reading.
const SUPERUSER_ONLY_SETTINGS = new Set(["session_replication_role"]);

// Per client, the superuser-only settings whose SET this login has already been denied.
// Load-bearing, not an optimisation: measured on 17.10, a 42501 inside an OPEN TRANSACTION
// aborts it (25P02, "commands ignored until end of transaction block"). The post-body
// re-apply runs inside the runner's transaction, so it must never ATTEMPT a set it already
// knows will be refused. The first attempt is always safe because it happens in
// pinMigrationSession, which opens with DISCARD ALL — a statement PostgreSQL refuses to
// run inside a transaction block at all, so that call site is structurally autocommit.
const PRIVILEGED_SET_DENIED = new WeakMap();

// One numeric server version per client, read from the server and never inferred.
const SERVER_VERSION_NUM = new WeakMap();

/** Whether a baseline setting exists on a server reporting `serverVersionNum`. */
function baselineAppliesTo(name, serverVersionNum) {
  const minimum = VERSION_GATED_SETTINGS[name];
  return minimum === undefined || serverVersionNum >= minimum;
}

/**
 * The live server's numeric version (`server_version_num`), cached per client.
 * FAIL-CLOSED: an unreadable version is not "assume old" — without it the runner
 * cannot decide the version-gated pins, so it refuses rather than silently skipping
 * a pin the server actually needed.
 */
export async function migrationServerVersionNum(client, beforeStatement = async () => {}) {
  const cached = SERVER_VERSION_NUM.get(client);
  if (cached !== undefined) return cached;
  await beforeStatement();
  const raw = (
    await client.query(
      "select pg_catalog.current_setting('server_version_num'::pg_catalog.text) as server_version_num",
    )
  ).rows[0]?.server_version_num;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `migration runner could not read server_version_num (saw ${JSON.stringify(raw)}) — the version-gated session pins cannot be decided`,
    );
  }
  SERVER_VERSION_NUM.set(client, value);
  return value;
}

async function readSessionState(client, beforeStatement = async () => {}) {
  const serverVersionNum = await migrationServerVersionNum(client, beforeStatement);
  await beforeStatement();
  const identity = (
    await client.query(`select pg_catalog.pg_current_xact_id()::pg_catalog.text as xid,
      session_user::pg_catalog.text as session_user,
      current_user::pg_catalog.text as current_user,
      pg_catalog.current_setting('${MIGRATION_SESSION_NONCE_GUC}'::pg_catalog.text,true) as session_nonce`)
  ).rows[0];
  const names = Object.keys(MIGRATION_SESSION_BASELINE).filter((name) => baselineAppliesTo(name, serverVersionNum));
  await beforeStatement();
  const rows = (
    await client.query(
      `select s.name,pg_catalog.current_setting(s.name) as value
         from pg_catalog.unnest($1::pg_catalog.text[]) with ordinality as s(name,ordinal)
        order by s.ordinal`,
      [names],
    )
  ).rows;
  return {
    ...identity,
    serverVersionNum,
    settings: Object.fromEntries(rows.map((row) => [row.name, row.value])),
  };
}

function assertBaseline(state, expectedTimeout) {
  for (const [name, baseline] of Object.entries(MIGRATION_SESSION_BASELINE)) {
    // The gate is decided from the version the STATE was read at, so the assertion
    // and the pin can never disagree about which settings this server has.
    if (!baselineAppliesTo(name, state.serverVersionNum)) continue;
    const expected = name === "statement_timeout" && expectedTimeout !== undefined ? expectedTimeout : baseline;
    if (state.settings[name] !== expected) {
      throw new Error(`migration runner session baseline mismatch for ${name}: expected ${expected}, saw ${state.settings[name]}`);
    }
  }
}

/**
 * The fail-closed half of a guarded pin: the SET was refused, so READ the parameter and
 * refuse the run unless the session is ALREADY at the value the pin exists to guarantee.
 * Reading needs no privilege (measured), so this branch works on a managed cluster.
 */
async function verifyUnsettableBaseline(client, name, expected, beforeStatement) {
  await beforeStatement();
  const observed = (
    await client.query("select pg_catalog.current_setting($1::pg_catalog.text) as value", [name])
  ).rows[0]?.value;
  if (observed !== expected) {
    throw new Error(
      `migration runner cannot set ${name} (PostgreSQL restricts it to superusers and this login is not one) and the session reports ${JSON.stringify(observed)} rather than ${JSON.stringify(expected)} — refusing to migrate under a setting it can neither control nor trust`,
    );
  }
}

async function applyMigrationSessionBaseline(client, beforeStatement = async () => {}, expectedTimeout = MIGRATION_SESSION_BASELINE.statement_timeout) {
  const serverVersionNum = await migrationServerVersionNum(client, beforeStatement);
  const verifiedNotSet = [];
  for (const [name, value] of Object.entries(MIGRATION_SESSION_BASELINE)) {
    if (!baselineAppliesTo(name, serverVersionNum)) continue;
    const privileged = SUPERUSER_ONLY_SETTINGS.has(name);
    if (privileged && PRIVILEGED_SET_DENIED.get(client)?.has(name)) {
      // Already denied on this connection — never re-attempt, see PRIVILEGED_SET_DENIED.
      await verifyUnsettableBaseline(client, name, value, beforeStatement);
      verifiedNotSet.push(name);
      continue;
    }
    await beforeStatement();
    try {
      await client.query(
        "select pg_catalog.set_config($1::pg_catalog.text,$2::pg_catalog.text,false)",
        [name, value],
      );
    } catch (error) {
      // Narrow on BOTH the parameter and the SQLSTATE: any other failure, and any other
      // parameter, is a genuine fault and still refuses.
      if (!privileged || error?.code !== "42501") throw error;
      const denied = PRIVILEGED_SET_DENIED.get(client) ?? new Set();
      denied.add(name);
      PRIVILEGED_SET_DENIED.set(client, denied);
      await verifyUnsettableBaseline(client, name, value, beforeStatement);
      verifiedNotSet.push(name);
    }
  }
  const state = await readSessionState(client, beforeStatement);
  // Belt and braces: the state read re-reads every baseline parameter, so a verified-not-set
  // one is compared here too, by value, exactly like every parameter the runner did set.
  assertBaseline(state, expectedTimeout);
  return { ...state, verifiedNotSet };
}

export async function pinMigrationSession(client) {
  // DISCARD ALL resets every session GUC and the other per-session resources a
  // migration can create. The lock lives on a dedicated client, so it is not
  // released here. Reapply only the runner's deliberate non-default baseline.
  await client.query("discard all");
  const state = await applyMigrationSessionBaseline(client);
  // The nonce is stamped LAST, so possessing it means the whole pin ran: DISCARD ALL
  // wiped the session, the full baseline was applied, and only then was this session
  // marked as belonging to the migration about to run. A half-finished pin cannot
  // produce it. DISCARD ALL above also clears any previous nonce, so a stale one can
  // never be mistaken for a fresh one.
  const nonce = randomUUID();
  await client.query(
    "select pg_catalog.set_config($1::pg_catalog.text,$2::pg_catalog.text,false)",
    [MIGRATION_SESSION_NONCE_GUC, nonce],
  );
  return { ...state, nonce };
}

/**
 * Refuse to execute a body unless the session still carries the nonce stamped when it
 * was pinned FOR THIS migration. Fail-closed on a missing expectation: no nonce means
 * the runner never pinned this session, which is not a reason to proceed.
 */
export function assertMigrationSessionNonce(observed, expected) {
  if (typeof expected !== "string" || expected === "") {
    throw new Error(
      "migration runner holds no session-pin nonce for this migration — the session was never pinned for it, and a body must never run on a session the runner cannot vouch for",
    );
  }
  if (observed !== expected) {
    throw new Error(
      `migration session-pin nonce mismatch: the session reports ${JSON.stringify(observed)}, not the nonce this migration was pinned with — the body would run on a session that is not the one freshly pinned for it (a lost pin, a swapped session, or transaction-mode pooling, under which session state does not outlive a statement). Refusing.`,
    );
  }
}

async function readWrapperIdentity(client, oid, beforeStatement = async () => {}) {
  await beforeStatement();
  const byOid = oid !== undefined;
  const result = await client.query(
    `select p.oid::pg_catalog.text as oid,p.proowner::pg_catalog.text as owner,
       coalesce(p.proacl::pg_catalog.text,''::pg_catalog.text) as acl,
       (pg_catalog.to_jsonb(p)-'proacl'-'proowner')::pg_catalog.text as definition
       from pg_catalog.pg_proc p
      where p.oid OPERATOR(pg_catalog.=) ${byOid ? "$1::pg_catalog.oid" : "pg_catalog.to_regprocedure('pg_temp.__clara_execute_migration(pg_catalog.text,pg_catalog.xid8)'::pg_catalog.text)"}`,
    byOid ? [oid] : [],
  );
  if (result.rowCount !== 1) throw new Error("migration runner could not identify its exact execution wrapper");
  return result.rows[0];
}

/**
 * Arm the transaction-local statement_timeout and return the value as PostgreSQL will
 * DISPLAY it. set_config answers with the normalized spelling ('1200s' comes back
 * '20min', measured on 17.10), which is the spelling every later current_setting read
 * will report — so the caller compares like with like instead of comparing the file's
 * raw literal against the server's canonical form and aborting AFTER the body ran on a
 * migration whose only sin was a legal non-canonical unit.
 * @returns {Promise<string>} the canonical, as-displayed timeout
 */
export async function armMigrationTimeout(client, timeout) {
  return (
    await client.query(
      "select pg_catalog.set_config('statement_timeout'::pg_catalog.text,$1::pg_catalog.text,true) as applied",
      [timeout ?? MIGRATION_SESSION_BASELINE.statement_timeout],
    )
  ).rows[0].applied;
}

export async function runRollbackOnlyProbe(client, probe, beforeStatement = async () => {}) {
  await beforeStatement();
  await client.query("savepoint clara_runner_probe");
  let result;
  let failure;
  try {
    await beforeStatement();
    result = await probe();
  } catch (error) {
    failure = error;
  }
  let rolledBack = false;
  try {
    await beforeStatement();
    await client.query("rollback to savepoint clara_runner_probe");
    rolledBack = true;
  } catch (error) {
    if (!failure) failure = error;
    else failure.rollbackOnlyCleanup = error;
  }
  if (rolledBack) try {
    await beforeStatement();
    await client.query("release savepoint clara_runner_probe");
  } catch (error) {
    if (!failure) failure = error;
    else failure.rollbackOnlyCleanup = error;
  }
  if (failure) throw failure;
  return result;
}

export async function executeMigrationBody(client, sql, timeout, expectedNonce) {
  const before = await readSessionState(client);
  assertBaseline(before);
  // Read SERVER-SIDE in the same statement as the session identity — no extra round
  // trip — and checked here rather than at the call site so no caller can execute a
  // body without it.
  assertMigrationSessionNonce(before.session_nonce, expectedNonce);
  await client.query(`create function pg_temp.__clara_execute_migration(
      p_sql pg_catalog.text,p_expected_xid pg_catalog.xid8)
    returns pg_catalog.xid8 language plpgsql security invoker as
    $wrapper$declare
      v_after pg_catalog.xid8;
      v_session_user pg_catalog.name:=session_user;
      v_current_user pg_catalog.name:=current_user;
      v_replication_role pg_catalog.text:=pg_catalog.current_setting('session_replication_role'::pg_catalog.text);
      v_wrapper_oid pg_catalog.oid;
      v_wrapper_owner pg_catalog.oid;
      v_wrapper_acl pg_catalog.text;
      v_wrapper_definition pg_catalog.text;
    begin
      if pg_catalog.pg_current_xact_id() OPERATOR(pg_catalog.<>) p_expected_xid then
        raise exception 'migration wrapper entered a replacement transaction';
      end if;
      select p.oid,p.proowner,coalesce(p.proacl::pg_catalog.text,''::pg_catalog.text),
             (pg_catalog.to_jsonb(p)-'proacl'-'proowner')::pg_catalog.text
        into strict v_wrapper_oid,v_wrapper_owner,v_wrapper_acl,v_wrapper_definition
        from pg_catalog.pg_proc p
       where p.oid OPERATOR(pg_catalog.=) pg_catalog.to_regprocedure(
         'pg_temp.__clara_execute_migration(pg_catalog.text,pg_catalog.xid8)'::pg_catalog.text);
      execute p_sql;
      perform pg_catalog.set_config('search_path'::pg_catalog.text,'pg_catalog'::pg_catalog.text,false);
      v_after:=pg_catalog.pg_current_xact_id();
      if v_after OPERATOR(pg_catalog.<>) p_expected_xid then
        raise exception 'migration wrapper exited in a replacement transaction';
      end if;
      if session_user OPERATOR(pg_catalog.<>) v_session_user or current_user OPERATOR(pg_catalog.<>) v_current_user then
        raise exception 'migration leaked runner-owned session authorization or role';
      end if;
      if pg_catalog.current_setting('session_replication_role'::pg_catalog.text) OPERATOR(pg_catalog.<>) v_replication_role then
        raise exception 'migration leaked runner-owned replication state';
      end if;
      -- The AUTHORITATIVE half of the check_function_bodies refusal. The text scan
      -- cannot see inside a dollar-quoted block, and a body that toggles validation off
      -- from within one leaves it off here (measured on 17.10, where the invalid
      -- function then COMMITTED). Raising is the point: restoring it silently would
      -- launder a bypass whose damage — unvalidated functions — is already done.
      if pg_catalog.current_setting('check_function_bodies'::pg_catalog.text) OPERATOR(pg_catalog.<>) 'on' then
        raise exception 'migration disabled check_function_bodies — function-body validation requires explicit owner authorization';
      end if;
      reset all;
      -- transaction_timeout FIRST, and only where it exists (PostgreSQL 17+; an older
      -- server raises 'unrecognized configuration parameter'). RESET ALL just handed the
      -- rest of this runner-owned transaction back to whatever database/role default the
      -- server carries, and a non-zero one arms a fresh window from this instant — so the
      -- most dangerous GUC is the first one restored, before the other fifteen.
      if pg_catalog.current_setting('server_version_num'::pg_catalog.text)::pg_catalog.int4
         OPERATOR(pg_catalog.>=) 170000 then
        perform pg_catalog.set_config('transaction_timeout'::pg_catalog.text,'0'::pg_catalog.text,false);
      end if;
      -- session_replication_role is SUPERUSER-only, and RESET ALL has just handed it back
      -- to the database default. Restoring it closes the same window, but the SET must be
      -- guarded: on a managed cluster the owner login is not a superuser and this raises
      -- 42501. Denied is acceptable ONLY while the session is already origin — which is
      -- the property the pin exists to guarantee, and which reading proves unprivileged.
      begin
        perform pg_catalog.set_config('session_replication_role'::pg_catalog.text,'origin'::pg_catalog.text,false);
      exception when insufficient_privilege then
        if pg_catalog.current_setting('session_replication_role'::pg_catalog.text) OPERATOR(pg_catalog.<>) 'origin' then
          raise exception 'migration runner cannot restore session_replication_role and the session is not origin';
        end if;
      end;
      perform pg_catalog.set_config('DateStyle'::pg_catalog.text,'ISO, YMD'::pg_catalog.text,false);
      perform pg_catalog.set_config('TimeZone'::pg_catalog.text,'UTC'::pg_catalog.text,false);
      perform pg_catalog.set_config('bytea_output'::pg_catalog.text,'hex'::pg_catalog.text,false);
      perform pg_catalog.set_config('IntervalStyle'::pg_catalog.text,'postgres'::pg_catalog.text,false);
      perform pg_catalog.set_config('extra_float_digits'::pg_catalog.text,'3'::pg_catalog.text,false);
      perform pg_catalog.set_config('standard_conforming_strings'::pg_catalog.text,'on'::pg_catalog.text,false);
      perform pg_catalog.set_config('check_function_bodies'::pg_catalog.text,'on'::pg_catalog.text,false);
      perform pg_catalog.set_config('transform_null_equals'::pg_catalog.text,'off'::pg_catalog.text,false);
      perform pg_catalog.set_config('quote_all_identifiers'::pg_catalog.text,'off'::pg_catalog.text,false);
      perform pg_catalog.set_config('client_encoding'::pg_catalog.text,'UTF8'::pg_catalog.text,false);
      perform pg_catalog.set_config('client_min_messages'::pg_catalog.text,'notice'::pg_catalog.text,false);
      perform pg_catalog.set_config('statement_timeout'::pg_catalog.text,'0'::pg_catalog.text,false);
      perform pg_catalog.set_config('default_transaction_read_only'::pg_catalog.text,'off'::pg_catalog.text,false);
      perform pg_catalog.set_config('default_transaction_isolation'::pg_catalog.text,'read committed'::pg_catalog.text,false);
      perform pg_catalog.set_config('default_transaction_deferrable'::pg_catalog.text,'off'::pg_catalog.text,false);
      perform pg_catalog.set_config('lock_timeout'::pg_catalog.text,'0'::pg_catalog.text,false);
      if not exists(
        select 1 from pg_catalog.pg_proc p
         where p.oid OPERATOR(pg_catalog.=) v_wrapper_oid
           and p.proowner OPERATOR(pg_catalog.=) v_wrapper_owner
           and coalesce(p.proacl::pg_catalog.text,''::pg_catalog.text) OPERATOR(pg_catalog.=) v_wrapper_acl
           and (pg_catalog.to_jsonb(p)-'proacl'-'proowner')::pg_catalog.text OPERATOR(pg_catalog.=) v_wrapper_definition
      ) then raise exception 'migration replaced the runner-owned execution wrapper';
      end if;
      return v_after;
    end$wrapper$`);
  const wrapperBefore = await readWrapperIdentity(client);
  // Prearming before this call makes the timeout bound the whole server-side body
  // statement. The armed value comes back CANONICAL, and that is what every later
  // baseline assertion compares against — the file may legally spell it any way
  // PostgreSQL accepts.
  const armedTimeout = await armMigrationTimeout(client, timeout);
  const wrapper = await client.query(
    `select pg_temp.__clara_execute_migration(
       $1::pg_catalog.text,$2::pg_catalog.xid8)::pg_catalog.text as xid`,
    [sql, before.xid],
  );
  const rearm = () => armMigrationTimeout(client, timeout);
  const after = await applyMigrationSessionBaseline(client, rearm, armedTimeout);
  const wrapperAfter = await readWrapperIdentity(client, wrapperBefore.oid, rearm);
  if (wrapper.rows[0]?.xid !== before.xid || after.xid !== before.xid) {
    throw new Error("migration replaced the runner-owned transaction");
  }
  if (after.session_user !== before.session_user || after.current_user !== before.current_user) {
    throw new Error("migration changed the runner-owned session identity");
  }
  if (after.settings.session_replication_role !== before.settings.session_replication_role) {
    throw new Error("migration changed the runner-owned replication state");
  }
  assertBaseline(after, armedTimeout);
  if (JSON.stringify(wrapperAfter) !== JSON.stringify(wrapperBefore)) {
    throw new Error("migration changed the runner-owned execution wrapper identity");
  }
  await rearm();
  await client.query(
    "drop function pg_temp.__clara_execute_migration(pg_catalog.text,pg_catalog.xid8)",
  );
  return { xid: before.xid, rearm };
}
