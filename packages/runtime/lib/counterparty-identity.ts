// #647 — THE COUNTERPARTY-IDENTITY TOOL'S SCHEMA, ARGUMENT BUILDER AND LOCAL REFUSALS.
//
// NON-FROZEN ONLY UNTIL THE SUCCESSOR IMPORTS IT. `packages/runtime/lib/periodic-adjustment-basis.ts`
// is the precedent and also the warning: it is itself frozen BY CLOSURE with `deployed:true`,
// because `chatTurn_v19` imports it. The rule is "a module is non-frozen only until a successor
// imports it, and then it is hash-locked forever". This file is therefore written to be finished:
// the wave's single shared successor (`chatTurn_v20`, cut ONCE after merge and review by the
// integration worker — WORK-ORDER rule 8) wires it in the four lines at the foot of this file,
// and nothing about it should need to move afterwards.
//
// NOTHING HERE SHIPS A TOOL, AND THAT IS THE POINT. D11 (DECISIONS §0) ruled that Clara gets NO
// identity write verb in this wave: migration 0215 ships PROVENANCE — who wrote an alias, on what
// basis, off which document — plus the correction history, and grants EXECUTE on every identity
// door to `clara_authenticated` and to no machine role at all. So this module is a CONTRACT
// CARRIER, unit-tested standalone, and the day the owner says yes the successor has a schema, an
// argument builder and a refusal map that were reviewed rather than improvised.
//
// THE SUCCESSOR WAS CUT AND THIS FILE IS STILL OUTSIDE IT (wave 2026-09-15 integration cut,
// 2026-09-17). `chatTurn_v20` shipped with #638's and #652's tools and does NOT import this module,
// so it is still absent from `frozen-workflows.json` and the four lines at the foot of this file are
// still owed. Nothing changed about D11's reasoning: `clara.add_counterparty_alias` is still
// `_human_ctx`-fronted, still `clara_authenticated`-only, still refuses `origin='agent_proposed'`,
// and no branch of that wave shipped the OBO twin `clara.add_counterparty_alias_for`. A tool that
// could only return a grant refusal is not a capability, and a workflow cut does not write
// migrations. Named in `docs/plan/active/refresh-wave-2026-09-15/reports/successors-final.md`.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS. Every check below MIRRORS one migration 0215 enforces
// (its own §7.1 arms and the four CHECK constraints on `clara.counterparty_aliases`); none is a
// rule of its own. The point of mirroring is that a model sees the mistake beside the thing that
// caused it instead of as a round-trip refusal — never that the mirror is trusted.

import { z } from "zod";

/** The tool name the successor registers. Kept as a constant so the registry row, the schema and
 *  the refusal map can never drift apart by a typo. */
export const RECORD_COUNTERPARTY_ALIAS_TOOL = "record_counterparty_alias";

/** `clara.counterparty_aliases.origin`'s widened CHECK (0215 §1). `agent_proposed` is the ONE
 *  value the human door refuses and this lane exists for: an alias Clara proposes is labelled as
 *  Clara's, which is exactly what AC1's "without labelling agent writes human" asks. */
export const ALIAS_ORIGINS = [
  "former_name", "trade_name", "human", "extracted", "agent_proposed",
] as const;
export type AliasOrigin = (typeof ALIAS_ORIGINS)[number];

/** The origins an AGENT lane may state. A machine may say "I read this off a document"
 *  (`extracted`) or "I think this is the same party" (`agent_proposed`); it may never say a
 *  person stated it. */
export const AGENT_ORIGINS = ["extracted", "agent_proposed"] as const;

/** `clara.counterparty_aliases.recorded_via`'s four values (0215 §1). The DOOR stamps this from
 *  its own lane and never takes it from a caller — the constant exists so the successor's part
 *  rendering can name the lane it wrote under without re-deriving it. */
export const RECORDED_VIA = ["human_ui", "agent", "seeding", "legacy_unknown"] as const;
export type RecordedVia = (typeof RECORDED_VIA)[number];

const uuid = z.string().uuid();
const nonBlank = z.string().trim().min(1);

/**
 * The tool's input. `.strict()` deliberately: an unknown key is a model inventing a field, and a
 * silently-dropped one is how a "source" nobody stored becomes a provenance claim nobody can
 * check.
 */
export const recordCounterpartyAliasInputSchema = z
  .object({
    counterparty_id: uuid,
    /** As the human would read it. Normalisation is the database's
     *  (`lower(regexp_replace(alias,'[^a-zA-Z0-9]','','g'))`) and is never done here. */
    alias: nonBlank.max(200),
    origin: z.enum(AGENT_ORIGINS),
    /** WHY this alias belongs to this party, in Clara's own words. Required for this lane even
     *  though the column is nullable: a machine-written identity fact with no stated basis is
     *  precisely the thing a human reviewer cannot act on. */
    basis: nonBlank.max(1000),
    /** The document the name was read off. REQUIRED when origin is `extracted` (the database
     *  refuses CLR10 `source_incomplete` otherwise) and forbidden when it is not. */
    source_document_id: uuid.optional(),
    source_extraction_id: uuid.optional(),
    source_region_id: uuid.optional(),
    source_field_path: nonBlank.max(300).optional(),
  })
  .strict();

export type RecordCounterpartyAliasInput = z.infer<typeof recordCounterpartyAliasInputSchema>;

/** The argument list `clara.add_counterparty_alias` takes, in ITS OWN parameter order — the ten
 *  parameters 0215 §7.1 cut, with the five leading ones unchanged from 0011:1706 so the shipped
 *  web door's five-named-argument call still resolves against the same single body. */
export type AliasDoorArgs = {
  p_client: string;
  p_counterparty: string;
  p_alias: string;
  p_origin: AliasOrigin;
  p_op_key: string;
  p_basis: string | null;
  p_source_document: string | null;
  p_source_extraction: string | null;
  p_source_region: string | null;
  p_source_field_path: string | null;
};

/**
 * Build the door's arguments. It NEVER supplies `recorded_via`: the door stamps that from its own
 * lane, and a caller that could state it could state `human_ui`.
 *
 * NOTE FOR WHOEVER WIRES THIS. The door as cut by 0215 is `_human_ctx`-fronted at bookkeeper and
 * refuses `agent_proposed` outright, so an agent lane needs a NEW sibling door (an OBO twin in
 * the `clara.capture_knowledge_for` shape, 0192:2167 — actor-explicit, `clara_runtime`-granted,
 * verifying the named human's live membership itself). That door does not exist yet and this
 * module does not pretend it does: `aliasDoorArgs` builds the arguments BOTH shapes take, and the
 * successor's query names whichever door the owner rules in.
 */
export function aliasDoorArgs(
  input: RecordCounterpartyAliasInput,
  ctx: { clientId: string; opKey: string },
): AliasDoorArgs {
  return {
    p_client: ctx.clientId,
    p_counterparty: input.counterparty_id,
    p_alias: input.alias.trim(),
    p_origin: input.origin,
    p_op_key: ctx.opKey,
    p_basis: input.basis.trim(),
    p_source_document: input.source_document_id ?? null,
    p_source_extraction: input.source_extraction_id ?? null,
    p_source_region: input.source_region_id ?? null,
    p_source_field_path: input.source_field_path?.trim() ?? null,
  };
}

export type LocalRefusal = { refusal: true; reason: string; message: string };

/**
 * The shape refusals a model can act on without a database round trip — each one a MIRROR of a
 * rule 0215 enforces, named with the SAME reason token the database raises, so a reviewer reading
 * a transcript cannot tell whether the wall that fired was local or remote and does not need to.
 */
export function localAliasRefusal(input: RecordCounterpartyAliasInput): LocalRefusal | null {
  const hasExtractionPin =
    input.source_extraction_id !== undefined
    || input.source_region_id !== undefined
    || input.source_field_path !== undefined;

  if (input.origin === "extracted") {
    // 0215 §7.1: an extracted alias OWES both halves of its pin (CLR10 source_incomplete), and
    // the table's own ck_counterparty_aliases_extraction_required says the same thing.
    if (!input.source_document_id || !input.source_extraction_id) {
      return {
        refusal: true,
        reason: "source_incomplete",
        message:
          "An alias recorded as read off a document must name both the document and the extraction it came from.",
      };
    }
  } else if (hasExtractionPin) {
    // ck_counterparty_aliases_extraction_pins: a stray EXTRACTION, REGION or FIELD pin on any
    // other origin is provenance theatre, and the door refuses CLR10 source_not_extracted. A
    // DOCUMENT-only pin is deliberately NOT refused here, because neither 0215 section 7.1's
    // guard nor ck_counterparty_aliases_extraction_pins mentions source_document_id: a mirror
    // that is stricter than the wall it mirrors would refuse locally what the door would admit.
    return {
      refusal: true,
      reason: "source_not_extracted",
      message:
        "Only an alias recorded as read off a document may carry an extraction, region or field reference.",
    };
  }

  // ck_counterparty_aliases_region_needs_extraction / _field_needs_extraction: each deeper pin
  // needs the one above it.
  if ((input.source_region_id || input.source_field_path) && !input.source_extraction_id) {
    return {
      refusal: true,
      reason: "source_incomplete",
      message: "A region or field reference only means something beside the extraction it came from.",
    };
  }

  // The normalisation the database applies must leave SOMETHING; an alias of punctuation alone is
  // refused CLR10 `counterparty alias is malformed` there. Mirrored so a model is told which
  // field, rather than being handed a malformed-input refusal it has to guess at.
  if (input.alias.replace(/[^a-zA-Z0-9]/g, "") === "") {
    return {
      refusal: true,
      reason: "alias_unusable",
      message: "That alias contains no letters or digits, so it cannot be matched against anything.",
    };
  }
  return null;
}

/**
 * The database's own typed `(code, detail.reason)` pairs for this lane, mapped to the sentence a
 * model may say. EVERY entry is a refusal migration 0215 or 0011 actually raises; nothing here
 * invents a failure mode, and an unmapped pair MUST fall through to the door's own message rather
 * than being re-worded (the estate's verbatim-refusal law).
 */
export const ALIAS_REFUSAL_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  "CLR23:target_retired":
    "That counterparty has been retired or merged away, so nothing more can be recorded against it.",
  "CLR23:alias_collision":
    "Another identity of this client already owns that name, so recording it as an alias would make two parties indistinguishable.",
  "CLR23:source_not_this_client":
    "That document is not filed to this client, so an alias may not be pinned to it.",
  "CLR10:source_incomplete":
    "An alias read off a document must name both the document and the extraction it came from.",
  "CLR10:source_not_extracted":
    "Only an alias read off a document may carry an extraction, region or field reference.",
  "CLR10:source_extraction_not_of_document":
    "That extraction does not belong to the document named, so the two together do not describe where this name was read.",
  "CLR10:source_region_not_of_extraction":
    "That region does not belong to the extraction named, so the two together do not describe where this name was read.",
  "CLR04:":
    "This lane is not authorised to record an identity for this client.",
});

/** `CLRxx:reason` — the key `ALIAS_REFUSAL_MESSAGES` is looked up by. A refusal with no reason
 *  token keys on its code alone, which is why the CLR04 entry above has an empty tail. */
export function refusalKey(code: string, reason: string | null | undefined): string {
  return `${code}:${reason ?? ""}`;
}

// ---------------------------------------------------------------------------------------------
// THE SUCCESSOR CONTRACT — what `chatTurn_v20` must wire, and nothing more.
//
//   1. `tool({ inputSchema: recordCounterpartyAliasInputSchema, execute })` under the name
//      `RECORD_COUNTERPARTY_ALIAS_TOOL`, registered beside the existing tools. The tool does NOT
//      replace `start_journal_work` or any identity read: there is no identity read tool at all,
//      because `clara.get_counterparty_identity` is granted to `clara_authenticated` only.
//   2. In `execute`: the v19 client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localAliasRefusal(input); if (local) return local;`.
//   3. `const opKey = stableOpKey(ctx.taskId, RECORD_COUNTERPARTY_ALIAS_TOOL, input);` — the same
//      identity discipline every other tool uses, so a re-run turn resolves to the alias it
//      already recorded instead of recording a second one.
//   4. ONE query, against whichever door the owner rules in (see `aliasDoorArgs`' own note: the
//      0215 door is human-lane only, so an agent lane needs an OBO twin first):
//
//        select clara.add_counterparty_alias_for(
//          $1::uuid,  -- ctx.clientId
//          $2::uuid,  -- ctx.createdBy  (the human the proposal is attributed to)
//          $3::uuid,  -- p_counterparty
//          $4::text,  -- p_alias
//          $5::text,  -- p_origin ('agent_proposed' | 'extracted')
//          $6::text,  -- p_op_key
//          $7::text,  -- p_basis
//          $8::uuid, $9::uuid, $10::uuid, $11::text  -- the four source pins
//        ) as r
//
//      …stamping `recorded_via = 'agent'` inside the door from its OWN lane. The caller never
//      supplies it: `clara._tf_counterparty_alias_recorded_via` (0215 §2) refuses any row
//      claiming `human_ui` with no `clara.jwt_sub()`, and a door that accepted a caller-supplied
//      lane would make that trigger the only wall left.
//   5. PART KIND on success: the existing generic `knowledge_recorded`-shaped acknowledgement is
//      NOT right here (an alias is not a `clara.knowledge_records` row and has no record id); use
//      a plain text part naming the alias, the party and the lane — `recorded_via: 'agent'` — so
//      the transcript says Clara wrote it. On a refusal: hand back the database's typed
//      `(code, detail.reason)` through `ALIAS_REFUSAL_MESSAGES[refusalKey(code, reason)]`, falling
//      through to the door's own message VERBATIM when the pair is unmapped.
//   6. NO `WORK_ACCEPTED_PURPOSES` widening, NO `claraWork` change, NO new bundle: an identity act
//      is not accounting Work and runs inside no Work bundle at all.
//   7. NO `clara.wake_fn_allowlist` row (C-22: the allowlist is keyed by BARE NAME, so a row for
//      `add_counterparty_alias` would widen wake reach over the HUMAN door too).
//
// WHAT v20 MUST NOT DO: call `clara.add_counterparty_alias` itself. That body is granted to
// `clara_authenticated` and to no machine role (0215's tail asserts it), refuses `agent_proposed`
// outright, and is `_human_ctx`-fronted — so a runtime call can only ever be a 42501.
// ---------------------------------------------------------------------------------------------
