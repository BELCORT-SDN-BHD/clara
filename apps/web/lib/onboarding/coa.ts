// 裁-128 — THE "APPLY THE FIRM'S STANDARD CHART OF ACCOUNTS" DOOR, and the three reads the
// checklist row needs to offer it honestly.
//
// THE GAP THIS CLOSES, measured. `clientOnboarding_v4`'s interview mints a SECOND plan item
// per client, `coa_chart_apply` (packages/runtime/workflows/interview.v3.questions.ts:89) —
// a `todo` in the `firm_template` arm carrying `{chart:"firm_template", applied:false}` and
// the question text "Apply the firm's standard chart of accounts to this client". The door
// that does it, `clara.apply_coa_template`, has existed since 0156. And the row rendered
// with NO control: `OnboardingItemRow` offered only `resolve_onboarding_plan_item`, disabled
// for a non-pending item, and the interview writes that row in state `deferred`. A shipped
// promise on happy-path step 5, with the verb live behind it.
//
// THE ITEM KEY IS `coa_chart_apply`, found at rung 0 rather than assumed: it appears in
// exactly three places in the repo — interview.v3.questions.ts:89 (the writer) and two
// header comments — and NOWHERE in `packages/db/migrations`. The DB-contract key
// `coa_seed_decision` is a DIFFERENT item (the yes/no decision), and it is the one
// `clara.coa_chart_state` reads by name (0156:1084).
//
// ============================ THE DOOR, AT ITS LIVE BODY ============================
// `clara.apply_coa_template(p_client uuid, p_template uuid, p_families text[], p_op_key text)
//  returns jsonb` — 0156_coa_apply_template.sql:726, BOOKKEEPER floor
//  (`_human_ctx(role_rank('bookkeeper'))`, :735), granted to clara_authenticated at :1228.
//  No CREATE OR REPLACE anywhere after it. NO WAKE GRANT ON PURPOSE (0156's S7 header:
//  Annex E's first non-goal is "any agent path to the BULK apply") — so a human clicking
//  this row is the ONLY path to it in the estate, which is why the row has to carry it.
//
// Its nine rungs, every one a NAMED refusal rendered verbatim by the caller, never
// replicated client-side (0156:706-724):
//   CLR10 op_key_required · CLR10 family_key_null · CLR11 client_not_in_firm ·
//   CLR11 template_not_found · CLR10 template_not_published · CLR10 chart_not_empty ·
//   CLR10 already_adopted · CLR10 families_required · CLR10 unknown_family ·
//   CLR10 core_family_dropped · CLR10 chart_adoption_race
//
// `p_families` NULL asks the database for its own deterministic plan; a caller array is the
// ruled EDIT path (裁-23 Q3). This module always sends the array the human confirmed —
// which STARTS as the DB's own `keep` list and is only ever a subset/superset the human
// chose — so the receipt's `families_source` reads `caller` and the audit records what a
// person actually approved rather than what a default happened to be.
//
// ============================ THE READS ============================
// All three are INVOKER-rights and granted to clara_authenticated at 0156:1232-1234 /
// 0150:1341, so RLS decides what each one sees and none of them is a new surface:
//   `clara.coa_chart_state(p_client)`            0156:1076 — the six-state verdict
//   `clara.coa_template_family_plan(p_client,t)` 0156:1029 — the default keep/drop
//   `clara.list_coa_templates()`                 0150:1273 — platform + own-firm templates
//
// A read-flavoured RPC still rides `callDoor` as TRANSPORT but is NOT a governed act — each
// is LABELLED as a read at its call site below, per apps/web/AGENTS.md's own rule.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opKey = (): string => crypto.randomUUID();

/** The plan item the interview mints for the chart decision's consequence. */
export const COA_CHART_APPLY_ITEM_KEY = "coa_chart_apply";

/** `clara.coa_chart_state`'s own six states (0156:1069-1075's header enumerates them, and
 *  the body's CASE produces exactly these). Kept as a closed array so an unrecognised state
 *  renders honestly rather than being silently treated as one of these. */
export const COA_CHART_STATES = ["adopted", "pending", "declined", "off_standard", "undecided", "no_client"] as const;
export type CoaChartState = (typeof COA_CHART_STATES)[number];

export function isKnownCoaChartState(state: string): state is CoaChartState {
  return (COA_CHART_STATES as readonly string[]).includes(state);
}

export type CoaChartStateRow = {
  state: string;
  seedDecision: string | null;
  seedWantsTemplate: boolean;
  accounts: number | null;
  templateId: string | null;
  templateVersion: number | null;
  adoptionState: string | null;
};

/** READ (not a governed act): `clara.coa_chart_state(p_client)`. Returns `null` when the
 *  RPC yields nothing this caller can see — never a fabricated "undecided". */
export async function readCoaChartState(clientId: string, opts: Opts = {}): Promise<CoaChartStateRow | null> {
  const raw = await callDoor("coa_chart_state", { p_client: clientId }, opts);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.state !== "string") return null;
  return {
    state: r.state,
    seedDecision: typeof r.seed_decision === "string" ? r.seed_decision : null,
    seedWantsTemplate: r.seed_wants_template === true,
    // Every numeral here is the DB's own count, rendered as read — this module computes none.
    accounts: Number.isInteger(r.accounts) ? (r.accounts as number) : null,
    templateId: typeof r.template_id === "string" ? r.template_id : null,
    templateVersion: Number.isInteger(r.template_version) ? (r.template_version as number) : null,
    adoptionState: typeof r.adoption_state === "string" ? r.adoption_state : null,
  };
}

export type CoaTemplateRow = {
  template_id: string;
  scope: string;
  template_key: string;
  version: number;
  title: string;
  state: string;
  families: number;
  accounts: number;
};

/** READ: `clara.list_coa_templates()` — every template RLS admits (platform scope, or this
 *  firm's own fork). Narrowed to `published` HERE rather than in the query because the RPC
 *  takes no argument; rung 4 of the door refuses `template_not_published` regardless, so
 *  this is shaping the choice a human is offered, not a wall. */
export async function listPublishedCoaTemplates(opts: Opts = {}): Promise<CoaTemplateRow[]> {
  const raw = await callDoor("list_coa_templates", {}, opts);
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is CoaTemplateRow => {
    if (typeof row !== "object" || row === null) return false;
    const r = row as Record<string, unknown>;
    return typeof r.template_id === "string"
      && typeof r.template_key === "string"
      && typeof r.title === "string"
      && Number.isInteger(r.version)
      && r.state === "published";
  });
}

export type CoaFamilyPlan = {
  keep: string[];
  drop: string[];
  absentAxes: string[];
  /** `full` · `partial` · `core_only` — 0156:625-627. `core_only` is the honest label for a
   *  plan no axis contributed to; the card SAYS which, because a professional deciding
   *  whether to trust a proposed chart needs to know it was proposed on no facts. */
  axis: string | null;
};

/** READ: `clara.coa_template_family_plan(p_client, p_template)` — the deterministic keep/drop
 *  the database computes from the client's own axes. This is the checkbox DEFAULT, and the
 *  human edits it; the door re-derives nothing from this value. */
export async function readCoaFamilyPlan(
  clientId: string,
  templateId: string,
  opts: Opts = {},
): Promise<CoaFamilyPlan | null> {
  const raw = await callDoor("coa_template_family_plan", { p_client: clientId, p_template: templateId }, opts);
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    keep: strings(r.keep),
    drop: strings(r.drop),
    absentAxes: strings(r.absent_axes),
    axis: typeof r.axis === "string" ? r.axis : null,
  };
}

export type CoaTemplateFamily = {
  familyKey: string;
  label: string;
  /** `core` families are NEVER trimmable — rung 8 refuses `core_family_dropped` and NAMES
   *  what was dropped (0156:829-836). The fieldset therefore renders them locked rather than
   *  letting a human uncheck one and meet a refusal for it. The door is still the wall; this
   *  only stops offering a choice that has none. */
  inclusion: string;
  basis: string | null;
};

/** READ: `clara.get_coa_template(p_template)` — the family roster with its labels and its
 *  `inclusion`. Needed because the plan read returns family KEYS, and a fieldset of raw keys
 *  is not a decision a professional can make. */
export async function readCoaTemplateFamilies(templateId: string, opts: Opts = {}): Promise<CoaTemplateFamily[]> {
  const raw = await callDoor("get_coa_template", { p_template: templateId }, opts);
  if (typeof raw !== "object" || raw === null) return [];
  const families = (raw as Record<string, unknown>).families;
  if (!Array.isArray(families)) return [];
  const out: CoaTemplateFamily[] = [];
  for (const item of families) {
    if (typeof item !== "object" || item === null) continue;
    const f = item as Record<string, unknown>;
    if (typeof f.family_key !== "string" || typeof f.inclusion !== "string") continue;
    out.push({
      familyKey: f.family_key,
      label: typeof f.label === "string" && f.label ? f.label : f.family_key,
      inclusion: f.inclusion,
      basis: typeof f.basis === "string" ? f.basis : null,
    });
  }
  return out;
}

export type ApplyChartReceipt = {
  templateId: string | null;
  templateVersion: number | null;
  adoptionId: string | null;
  families: string[];
  familiesSource: string | null;
  accounts: number | null;
};

/** GOVERNED ACT: `clara.apply_coa_template`. Refusals propagate as `DoorRefusal` and are
 *  rendered VERBATIM by the caller — never caught, re-worded or retried here. The receipt is
 *  the door's OWN returned jsonb; `accounts` is `cardinality(v_planted)`, counted by the
 *  database over the rows it actually planted (0156:900-903). */
export async function applyCoaTemplate(
  args: { clientId: string; templateId: string; families: string[] },
  opts: Opts = {},
): Promise<ApplyChartReceipt> {
  const raw = await callDoor(
    "apply_coa_template",
    { p_client: args.clientId, p_template: args.templateId, p_families: args.families, p_op_key: opKey() },
    opts,
  );
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    templateId: typeof r.template_id === "string" ? r.template_id : null,
    templateVersion: Number.isInteger(r.template_version) ? (r.template_version as number) : null,
    adoptionId: typeof r.adoption_id === "string" ? r.adoption_id : null,
    families: Array.isArray(r.families) ? r.families.filter((x): x is string => typeof x === "string") : [],
    familiesSource: typeof r.families_source === "string" ? r.families_source : null,
    accounts: Number.isInteger(r.accounts) ? (r.accounts as number) : null,
  };
}
