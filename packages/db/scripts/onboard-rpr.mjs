// onboard-rpr — the Slice-6 beta onboarding operator (contract §9 + companion §10.6).
//
// Onboards ONE firm + ONE client (Rome Properties) + its reviewed chart of accounts +
// memberships onto a live Clara project THROUGH THE AUDITED WRITERS ONLY (create_firm /
// create_client / upsert_account / add_member) — no hand-written books rows (CLAUDE.md law).
//
// DISCOVER-then-CREATE (C-17): DISCOVER an existing firm/client/account/membership with a
// direct read, CREATE only when absent. `create_firm` has NO op-receipt (idempotency is the
// single-use admission token), so we NEVER assume idempotent create — discovery-first is what
// makes the whole script idempotently re-runnable (create_client/upsert_account/add_member DO
// carry op-receipts and replay byte-identically on retry). A re-run of a fully-onboarded firm
// does ZERO writes and exits 0.
//
// HUMAN-CONTEXT IDIOM (the house pattern from seeds/0002_core_seed.sql): runs as the postgres
// operator (superuser). The audited writers are SECURITY DEFINER and derive the acting human
// from `request.jwt.claims ->> 'sub'` + that sub's LIVE active membership — not the connection
// role. So we set the jwt GUC to a real admin+ firm principal (the "actor") and call the writer;
// it enforces identity/rank/firm-scope/provenance/receipts internally. DISCOVERY reads run as
// the raw operator (RLS-bypassed) — the only direct SELECTs, reads only (brief authorization).
//
// SAFETY (fail-closed): refuses without an explicit --firm-name; loud password-free target
// banner; --live REQUIRED for a non-local target; --dry-run prints the plan + checksum and
// touches no DB; never prints a secret; every receipt verified; a reused row that DIVERGES from
// the CSV aborts with a diff. op_keys `onboard-rpr:<class>:<code>` (class firm|client|account|
// member). The client op_key embeds the SSM registration (otherwise not persisted — clara.clients
// has no reg column; see the report). Connection: env only (lib/pg.mjs). Never a DSN in argv.
// Usage: node scripts/onboard-rpr.mjs --firm-name "BELCORT" [--dry-run] [options]  (see --help).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, resolveTarget, isMain, assertNoTargetSplit } from "../lib/pg.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV = join(SCRIPT_DIR, "..", "deploy", "rpr-coa.csv");

// Match lib/guard.mjs's local-host set: a non-local target needs an explicit --live.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const ACCOUNT_TYPES = new Set(["asset", "liability", "equity", "income", "expense"]);
const ACCOUNT_CLASSES = new Set(["payable"]); // DB CHECK: null | 'payable'
const SPECIAL_TYPES = new Set(["rounding"]); // DB CHECK: null | 'rounding'
const ORIGINS = new Set(["tb", "gl", "system_role"]);
const ROLES = new Set(["viewer", "bookkeeper", "admin", "owner"]);
const CSV_COLUMNS = ["account_code", "account_name", "account_type", "account_class", "special_acc_type", "origin"];
// The 0009-widened chart-code domain (companion §6) — validated here so a bad CSV fails before any write.
const ACCOUNT_CODE_RE = /^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$/;

const DEFAULTS = {
  clientName: "ROME PROPERTIES SDN BHD",
  clientReg: "202501005621",
  clientRegAlt: "1607035V",
};

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { members: [], dryRun: false, live: false, help: false };
  const valueFlags = {
    "--csv": "csv",
    "--firm-name": "firmName",
    "--client-name": "clientName",
    "--client-reg": "clientReg",
    "--client-reg-alt": "clientRegAlt",
    "--actor": "actor",
    "--firm-owner": "firmOwner",
    "--firm-admission-token": "firmAdmissionToken",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--live") out.live = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--member") {
      const v = argv[++i];
      if (!v) throw new Error("--member requires an auth-user uuid");
      out.members.push({ uuid: v, role: "bookkeeper" });
    } else if (a === "--role") {
      const v = argv[++i];
      if (!v) throw new Error("--role requires a value");
      if (out.members.length === 0) throw new Error("--role must follow a --member");
      out.members[out.members.length - 1].role = v;
    } else if (a in valueFlags) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      out[valueFlags[a]] = v;
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return out;
}

const USAGE = `onboard-rpr — Slice-6 beta onboarding (audited writers only)
  node scripts/onboard-rpr.mjs --firm-name "BELCORT" [--dry-run] [options]

  --firm-name <name>       REQUIRED (no default — fail-closed)
  --csv <path>             reviewed CoA CSV (default ../deploy/rpr-coa.csv)
  --client-name/-reg/-reg-alt   defaults "${DEFAULTS.clientName}" / ${DEFAULTS.clientReg} / ${DEFAULTS.clientRegAlt}
  --member <uuid> --role <r>    add a membership (repeatable; r in viewer|bookkeeper|admin|owner)
  --actor <uuid>           admin+ principal writes attribute to (reuse path; default = firm owner)
  --firm-owner <uuid> --firm-admission-token <uuid>   create-firm path (only when firm is ABSENT)
  --dry-run                print plan + checksum, touch no DB
  --live                   required when the target host is not local`;

// ---------------------------------------------------------------------------
// CSV (comment-aware, minimal RFC4180 quoting)
// ---------------------------------------------------------------------------

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/** Load + validate the reviewed chart. Returns account rows in file order. Throws on any defect. */
function loadCoa(path) {
  const text = readFileSync(path, "utf8");
  const rows = [];
  const errors = [];
  const seenCodes = new Set();
  let roundingCount = 0;
  let header = null;
  let lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue; // blank or comment
    const fields = parseCsvLine(trimmed);
    if (!header) {
      header = fields.map((f) => f.toLowerCase());
      if (header.length !== CSV_COLUMNS.length || CSV_COLUMNS.some((c, i) => header[i] !== c)) {
        throw new Error(
          `CSV header mismatch — expected exactly [${CSV_COLUMNS.join(", ")}] but got [${header.join(", ")}]`,
        );
      }
      continue;
    }
    const row = Object.fromEntries(header.map((h, i) => [h, (fields[i] ?? "").trim()]));
    const where = `line ${lineNo} (${row.account_code || "?"})`;
    if (!row.account_code) errors.push(`${where}: empty account_code`);
    else if (!ACCOUNT_CODE_RE.test(row.account_code)) errors.push(`${where}: account_code fails the 0009 domain ${ACCOUNT_CODE_RE}`);
    else if (seenCodes.has(row.account_code)) errors.push(`${where}: duplicate account_code`);
    seenCodes.add(row.account_code);
    if (!row.account_name) errors.push(`${where}: empty account_name`);
    if (!ACCOUNT_TYPES.has(row.account_type)) errors.push(`${where}: account_type "${row.account_type}" not in ${[...ACCOUNT_TYPES].join("|")}`);
    if (row.account_class && !ACCOUNT_CLASSES.has(row.account_class)) errors.push(`${where}: account_class "${row.account_class}" not in (empty|payable)`);
    if (row.special_acc_type && !SPECIAL_TYPES.has(row.special_acc_type)) errors.push(`${where}: special_acc_type "${row.special_acc_type}" not in (empty|rounding)`);
    if (!ORIGINS.has(row.origin)) errors.push(`${where}: origin "${row.origin}" not in ${[...ORIGINS].join("|")}`);
    if (row.special_acc_type === "rounding") roundingCount++;
    rows.push({
      code: row.account_code,
      name: row.account_name,
      type: row.account_type,
      class: row.account_class || null,
      special: row.special_acc_type || null,
      origin: row.origin,
    });
  }
  if (!header) throw new Error(`CSV ${path} has no header row`);
  if (rows.length === 0) throw new Error(`CSV ${path} has no account rows`);
  // A client may hold at most one special_acc_type='rounding' (uq_coa_special); reject a CSV that
  // would trip 23505 mid-run.
  if (roundingCount > 1) errors.push(`CSV declares ${roundingCount} rounding accounts — at most one is allowed per client`);
  if (errors.length) throw new Error(`CSV ${path} is invalid:\n  - ${errors.join("\n  - ")}`);
  return rows;
}

// ---------------------------------------------------------------------------
// Plan + checksum (a pure function of the CSV + flags — DB-independent, stable across runs)
// ---------------------------------------------------------------------------

function buildPlan({ firmName, clientName, clientReg, clientRegAlt, accounts, members }) {
  return {
    firm: { class: "firm", op_key: `onboard-rpr:firm:${firmName}`, fn: "create_firm", name: firmName },
    client: {
      class: "client",
      op_key: `onboard-rpr:client:${clientReg}`,
      fn: "create_client",
      name: clientName,
      registration_no: clientReg,
      registration_alt: clientRegAlt,
    },
    accounts: accounts.map((a) => ({ class: "account", op_key: `onboard-rpr:account:${a.code}`, fn: "upsert_account", ...a })),
    members: members.map((m) => ({ class: "member", op_key: `onboard-rpr:member:${m.uuid}`, fn: "add_member", user_id: m.uuid, role: m.role })),
  };
}

/** sha256 over a canonical, order-independent projection of the plan. */
function planChecksum(plan) {
  const canonical = {
    firm: { op_key: plan.firm.op_key, name: plan.firm.name },
    client: { op_key: plan.client.op_key, name: plan.client.name, registration_no: plan.client.registration_no, registration_alt: plan.client.registration_alt },
    accounts: [...plan.accounts]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ op_key: a.op_key, code: a.code, name: a.name, type: a.type, class: a.class, special: a.special })),
    members: [...plan.members].sort((a, b) => a.user_id.localeCompare(b.user_id)).map((m) => ({ op_key: m.op_key, user_id: m.user_id, role: m.role })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function printPlan(plan, checksum, log) {
  log(`PLAN (checksum ${checksum}):`);
  log(`  [firm]    ${plan.firm.fn.padEnd(14)} op_key=${plan.firm.op_key}`);
  log(`            name="${plan.firm.name}"`);
  log(`  [client]  ${plan.client.fn.padEnd(14)} op_key=${plan.client.op_key}`);
  log(`            name="${plan.client.name}" reg=${plan.client.registration_no}/${plan.client.registration_alt}`);
  log(`            (registration is NOT persisted — clara.clients has no reg column; it lives in the op_key + this plan)`);
  for (const a of plan.accounts) {
    log(
      `  [account] ${a.fn.padEnd(14)} op_key=${a.op_key.padEnd(30)} ${a.code.padEnd(8)} "${a.name}" type=${a.type} class=${a.class ?? "-"} special=${a.special ?? "-"} origin=${a.origin}`,
    );
  }
  for (const m of plan.members) {
    log(`  [member]  ${m.fn.padEnd(14)} op_key=${m.op_key.padEnd(30)} user=${m.user_id} role=${m.role}`);
  }
}

// --- DB helpers ---
const q = (client, sql, params) => client.query(sql, params).then((r) => r.rows);
const one = async (client, sql, params) => (await q(client, sql, params))[0] ?? null;

/** Set the human identity for the audited writers (session-level; the operator stays superuser). */
async function setActor(client, sub) {
  await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
}
async function clearActor(client) {
  await client.query("select set_config('request.jwt.claims', '', false)");
}

/** Verify the current jwt actor is an active admin+ member of `firmId` (uses the DB's own resolvers). */
async function assertActorAuthorized(client, firmId, sub) {
  const r = await one(client, "select clara.jwt_firm() as firm, clara.actor_role_rank() as rank, clara.role_rank('admin') as admin_rank");
  if (!r || r.firm !== firmId) {
    throw new Error(`actor ${sub} resolves to firm ${r?.firm ?? "(none)"} — not the target firm ${firmId}. The actor must be an active member of the target firm.`);
  }
  if (r.rank === null || r.rank < r.admin_rank) {
    throw new Error(`actor ${sub} is below admin in the target firm (rank ${r.rank ?? "none"}); onboarding writes need an admin+ principal.`);
  }
}

// --- Resolution steps (discover-then-create; every receipt verified) ---
/** @returns {Promise<{firm:{id:string,name:string}, actorSub:string, action:string, writes:number}>} */
async function resolveFirm(client, args, plan, log) {
  const found = await q(client, "select id, name from clara.firms where name = $1", [args.firmName]);
  if (found.length > 1) {
    throw new Error(`ambiguous firm name "${args.firmName}" — ${found.length} firms match (firms.name is not unique). Disambiguate before onboarding.`);
  }
  if (found.length === 1) {
    const firm = found[0];
    let actorSub = args.actor;
    if (!actorSub) {
      const owner = await one(
        client,
        `select user_id from clara.firm_memberships
         where firm_id=$1 and status='active' and role in ('owner','admin')
         order by clara.role_rank(role) desc limit 1`,
        [firm.id],
      );
      if (!owner) throw new Error(`firm "${firm.name}" has no active owner/admin member to act as — pass --actor <admin+-auth-user-uuid>.`);
      actorSub = owner.user_id;
    } else if (!(await one(client, "select 1 from clara.users where id=$1", [actorSub]))) {
      throw new Error(`--actor ${actorSub} is not a known clara.users row.`);
    }
    await setActor(client, actorSub);
    await assertActorAuthorized(client, firm.id, actorSub);
    log(`  firm      REUSE   ${firm.name} (${firm.id}) · acting as ${actorSub}`);
    return { firm, actorSub, action: "reuse", writes: 0 };
  }

  // CREATE path — needs an owner + admission token (create_firm has no op-receipt; not idempotent).
  if (!args.firmOwner || !args.firmAdmissionToken) {
    throw new Error(
      `firm "${args.firmName}" does not exist and cannot be created without --firm-owner <uuid> and ` +
        `--firm-admission-token <uuid>. On live BELCORT already exists (this is the reuse path); firm ` +
        `creation is a heavier operator step (a fresh owner user + an unconsumed admission token).`,
    );
  }
  const owner = await one(client, "select id, is_agent from clara.users where id=$1", [args.firmOwner]);
  if (!owner) throw new Error(`--firm-owner ${args.firmOwner} is not a known clara.users row (auth-user provisioning is a manual dashboard step).`);
  if (owner.is_agent) throw new Error(`--firm-owner ${args.firmOwner} is the agent identity — it can never own a firm.`);
  if (await one(client, "select 1 from clara.firm_memberships where user_id=$1 and status='active'", [args.firmOwner])) {
    throw new Error(`--firm-owner ${args.firmOwner} already belongs to a firm; create_firm requires an owner with no active membership.`);
  }
  if (!(await one(client, "select 1 from clara.firm_admissions where token=$1 and consumed_at is null", [args.firmAdmissionToken]))) {
    throw new Error(`--firm-admission-token ${args.firmAdmissionToken} is missing or already consumed.`);
  }
  await setActor(client, args.firmOwner);
  const receipt = (await one(client, "select clara.create_firm($1, $2::uuid, $3) as result", [args.firmName, args.firmAdmissionToken, plan.firm.op_key]))?.result;
  const firmId = receipt?.firm_id;
  if (!firmId) throw new Error(`create_firm returned no firm_id: ${JSON.stringify(receipt)}`);
  const firm = await one(client, "select id, name from clara.firms where id=$1", [firmId]);
  if (!firm || firm.name !== args.firmName) throw new Error(`create_firm verification failed for ${firmId}`);
  await assertActorAuthorized(client, firm.id, args.firmOwner);
  log(`  firm      CREATE  ${firm.name} (${firm.id}) · owner ${args.firmOwner}`);
  return { firm, actorSub: args.firmOwner, action: "create", writes: 1 };
}

async function resolveClient(client, firm, plan, log) {
  const existing = await one(client, "select id, name from clara.clients where firm_id=$1 and lower(name)=lower($2)", [firm.id, plan.client.name]);
  if (existing) {
    log(`  client    REUSE   ${existing.name} (${existing.id})`);
    return { id: existing.id, name: existing.name, writes: 0 };
  }
  const receipt = (await one(client, "select clara.create_client($1, $2) as result", [plan.client.name, plan.client.op_key]))?.result;
  const clientId = receipt?.client_id;
  if (!clientId) throw new Error(`create_client returned no client_id: ${JSON.stringify(receipt)}`);
  const verify = await one(client, "select id, firm_id, name from clara.clients where id=$1", [clientId]);
  if (!verify || verify.firm_id !== firm.id || verify.name !== plan.client.name) {
    throw new Error(`create_client verification failed for ${clientId}: ${JSON.stringify(verify)}`);
  }
  log(`  client    CREATE  ${verify.name} (${verify.id})`);
  return { id: clientId, name: plan.client.name, writes: 1 };
}

function accountDiff(csv, row) {
  const diffs = [];
  if (row.name !== csv.name) diffs.push(`name: stored "${row.name}" vs CSV "${csv.name}"`);
  if (row.account_type !== csv.type) diffs.push(`type: stored "${row.account_type}" vs CSV "${csv.type}"`);
  if ((row.account_class ?? null) !== csv.class) diffs.push(`class: stored ${row.account_class ?? "null"} vs CSV ${csv.class ?? "null"}`);
  if ((row.special_acc_type ?? null) !== csv.special) diffs.push(`special_acc_type: stored ${row.special_acc_type ?? "null"} vs CSV ${csv.special ?? "null"}`);
  if (row.is_active !== true) diffs.push(`is_active: stored ${row.is_active} (expected active)`);
  return diffs;
}

async function resolveAccounts(client, clientId, plan, log) {
  let creates = 0;
  let reuses = 0;
  // Guard the rounding uniqueness up front: a rounding account at a DIFFERENT code would 23505.
  const roundingCsv = plan.accounts.find((a) => a.special === "rounding");
  if (roundingCsv) {
    const other = await one(
      client,
      "select account_code from clara.coa_accounts where client_id=$1 and special_acc_type='rounding' and account_code<>$2",
      [clientId, roundingCsv.code],
    );
    if (other) throw new Error(`a rounding account already exists at ${other.account_code} — the CSV's ${roundingCsv.code} would collide (uq_coa_special).`);
  }
  for (const a of plan.accounts) {
    const row = await one(
      client,
      "select account_code, name, account_type, account_class, special_acc_type, is_active from clara.coa_accounts where client_id=$1 and account_code=$2",
      [clientId, a.code],
    );
    if (row) {
      const diffs = accountDiff(a, row);
      if (diffs.length) throw new Error(`account ${a.code} exists but DIVERGES from the CSV — refusing to overwrite:\n    - ${diffs.join("\n    - ")}`);
      reuses++;
      continue;
    }
    const receipt = (await one(client, "select clara.upsert_account($1::uuid, $2, $3, $4, $5, $6, $7) as result", [clientId, a.code, a.name, a.type, a.special, a.op_key, a.class]))?.result;
    if (receipt?.account_code !== a.code) throw new Error(`upsert_account(${a.code}) returned ${JSON.stringify(receipt)}`);
    const verify = await one(
      client,
      "select account_code, name, account_type, account_class, special_acc_type, is_active from clara.coa_accounts where client_id=$1 and account_code=$2",
      [clientId, a.code],
    );
    const diffs = verify ? accountDiff(a, verify) : ["row not found after write"];
    if (diffs.length) throw new Error(`account ${a.code} failed post-write verification:\n    - ${diffs.join("\n    - ")}`);
    log(`  account   CREATE  ${a.code.padEnd(8)} "${a.name}"${a.class ? ` class=${a.class}` : ""}${a.special ? ` special=${a.special}` : ""}`);
    creates++;
  }
  log(`  accounts  ${creates} created / ${reuses} reused (of ${plan.accounts.length})`);
  return { writes: creates };
}

async function resolveMembers(client, firm, plan, log) {
  let creates = 0;
  for (const m of plan.members) {
    if (!(await one(client, "select 1 from clara.users where id=$1", [m.user_id]))) {
      throw new Error(
        `member ${m.user_id} is not a known clara.users row. Auth-user provisioning is a manual dashboard step (out of scope for this script): create the user in the auth plane first, then re-run with --member ${m.user_id} --role ${m.role}.`,
      );
    }
    const active = await one(client, "select firm_id, role from clara.firm_memberships where user_id=$1 and status='active'", [m.user_id]);
    if (active) {
      if (active.firm_id !== firm.id) throw new Error(`member ${m.user_id} already belongs to a DIFFERENT firm (${active.firm_id}); a user has one active membership.`);
      if (active.role !== m.role) log(`  member    REUSE   ${m.user_id} (role ${active.role}, CSV asked ${m.role} — add_member cannot re-role; use set_member_role)`);
      else log(`  member    REUSE   ${m.user_id} (role ${active.role})`);
      continue;
    }
    const receipt = (await one(client, "select clara.add_member($1::uuid, $2::uuid, $3, $4) as result", [firm.id, m.user_id, m.role, m.op_key]))?.result;
    if (!receipt?.membership_id) throw new Error(`add_member(${m.user_id}) returned ${JSON.stringify(receipt)}`);
    const verify = await one(client, "select firm_id, role, status from clara.firm_memberships where id=$1", [receipt.membership_id]);
    if (!verify || verify.firm_id !== firm.id || verify.role !== m.role || verify.status !== "active") {
      throw new Error(`add_member(${m.user_id}) verification failed: ${JSON.stringify(verify)}`);
    }
    log(`  member    CREATE  ${m.user_id} role=${m.role}`);
    creates++;
  }
  return { writes: creates };
}

// --- Main ---
export async function onboard({ argv = process.argv.slice(2), log = console.log } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    log(USAGE);
    return { ok: true, help: true };
  }
  if (!args.firmName) throw new Error(`--firm-name is required (no default — refusing to create/guess a firm). Run with --help for usage.`);

  const csvPath = args.csv || DEFAULT_CSV;
  const clientName = args.clientName || DEFAULTS.clientName;
  const clientReg = args.clientReg || DEFAULTS.clientReg;
  const clientRegAlt = args.clientRegAlt || DEFAULTS.clientRegAlt;
  for (const m of args.members) {
    if (!ROLES.has(m.role)) throw new Error(`member ${m.uuid}: role "${m.role}" not in ${[...ROLES].join("|")}`);
  }

  const accounts = loadCoa(csvPath);
  const plan = buildPlan({ firmName: args.firmName, clientName, clientReg, clientRegAlt, accounts, members: args.members });
  const checksum = planChecksum(plan);

  // Target banner (password-free) + fail-closed --live guard for a non-local target.
  assertNoTargetSplit();
  const target = resolveTarget();
  const label = targetLabel();
  log("=".repeat(72));
  log(`onboard-rpr · ${args.dryRun ? "DRY-RUN (no DB touched)" : args.live ? "LIVE-WRITE" : "WRITE"}`);
  log(`  target : ${label}`);
  log(`  firm   : ${args.firmName}`);
  log(`  client : ${clientName} (${clientReg} / ${clientRegAlt})`);
  log(`  csv    : ${csvPath}  (${accounts.length} accounts)`);
  log(`  members: ${plan.members.length}`);
  log("=".repeat(72));
  printPlan(plan, checksum, log);

  if (args.dryRun) {
    log(`\nDRY-RUN complete — no database was contacted. Plan checksum ${checksum}.`);
    return { ok: true, dryRun: true, checksum, accounts: accounts.length, members: plan.members.length };
  }

  if (!LOCAL_HOSTS.has(target.host) && !args.live) {
    throw new Error(`target ${label} is not local — refusing to write without --live. Pass --live to confirm you mean this EXACT target.`);
  }

  const client = makeClient();
  await client.connect();
  let writes = 0;
  try {
    log(`\nEXECUTING (checksum ${checksum}) against ${label}:`);
    const firmRes = await resolveFirm(client, args, plan, log);
    writes += firmRes.writes;
    const clientRes = await resolveClient(client, firmRes.firm, plan, log);
    writes += clientRes.writes;
    const acctRes = await resolveAccounts(client, clientRes.id, plan, log);
    writes += acctRes.writes;
    const memberRes = await resolveMembers(client, firmRes.firm, plan, log);
    writes += memberRes.writes;

    log("=".repeat(72));
    log(
      `RESULT: firm ${firmRes.action.toUpperCase()}, client ${clientRes.writes ? "CREATE" : "REUSE"}, ` +
        `${acctRes.writes} account(s) created, ${memberRes.writes} member(s) added · writes=${writes}` +
        (writes === 0 ? "  (idempotent — nothing to do)" : ""),
    );
    log(`  firm_id=${firmRes.firm.id} client_id=${clientRes.id} · target ${label}`);
    log("=".repeat(72));
    return { ok: true, writes, firmId: firmRes.firm.id, clientId: clientRes.id, checksum };
  } finally {
    try {
      await clearActor(client);
    } catch {
      /* best-effort */
    }
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  onboard().catch((err) => {
    console.error("onboard-rpr: FAIL —", err.message);
    process.exit(1);
  });
}
