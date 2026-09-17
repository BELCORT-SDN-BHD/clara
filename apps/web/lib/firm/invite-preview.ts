// clara.preview_invite (0224) — the typed, FAIL-CLOSED read behind the invite surface's
// preview step, shaped on lib/firm/caller-context.ts: a declared column census, a row validator
// that checks EVERY declared field, and an outcome that keeps facts apart instead of collapsing
// them.
//
// RUNG-0 CENSUS, at the LIVE body. `clara.preview_invite(p_token text) returns jsonb` is created
// exactly once, at `packages/db/migrations/0224_preview_invite.sql` §A, and no later migration
// replaces it (0224 is the frontier this module ships with). Its posture, asserted by that file's
// own §C tail and re-read by `packages/db/tests/preview-invite.test.mjs`:
//
//   - SECURITY DEFINER, `search_path = clara, pg_temp`, owned by `clara_fn_owner`;
//   - EXECUTE granted to `clara_authenticated` and to NOBODY else (no runtime, no agent, no wake
//     lane, no PUBLIC, and this estate declares no `anon` role at all);
//   - it answers for the ONE invite whose `sha256(token)` matches AND whose stored email equals
//     `clara._jwt_email()` — TWO of the three facts `clara.accept_invite` (`0145:694`) walls on.
//     The THIRD is a named residual, not a claim this module makes: the acceptance door also
//     re-checks the ISSUER's CURRENT rank (`CLR04 'invite exceeds the issuer''s rank -- re-issue
//     by an owner'`), which neither this door nor `clara.firm_invites_visible` can see, so an
//     invitation whose issuer was demoted or has left the firm previews as `pending`, the
//     password form renders, and `acceptInvite`'s own verbatim CLR path is what refuses it.
//     Pinned by `packages/db/tests/preview-invite.test.mjs` → `p625.preview.issuer_rank`;
//     see `packages/db/README.md`'s 0224 note for why closing it needs a fifth status;
//   - the answer is `{firm_name, role, status, masked_email}` and nothing else: never the token,
//     never `token_hash`, never the invite id, never the unmasked address;
//   - `status` is the EFFECTIVE status — `clara.firm_invites_visible`'s own expression
//     (`0141:532-534`), computed live off `expires_at`, because `accept_invite` deliberately never
//     persists a `pending` → `expired` transition.
//
// THE ONE REFUSAL, AND WHY THIS MODULE MUST NOT SPLIT IT. An unknown token, a real token whose
// invite belongs to a different address, and a session with no verified email all raise the SAME
// `CLR10 'this invite link is not valid for the signed-in address'` with the SAME
// `detail.reason = 'invite_not_previewable'`. Telling them apart would rebuild the existence
// oracle 0141 §B closed, so the caller gets ONE refusal face and this module offers no way to ask
// which of the three it was — there is nothing to ask.
//
// ===========================================================================================
// DEFINITE vs INDEFINITE — the distinction the calling surface hangs a password form on.
//
// A DEFINITE negative BLOCKS: the door answered, and its answer was no (a governed refusal), or
// it answered with a status that is not `pending`. An INDEFINITE observation DEGRADES: we never
// heard back (transport, no session), or what came back is not what the door returns. In that
// case the surface renders the password form WITHOUT the preview block and says so honestly,
// because `clara.accept_invite` is still the authority on whether this invitation can be
// accepted and a reader that could not read is not a verdict. This is the same reading
// `components/invite-accept-form.tsx` already applies to the membership post-condition: absence
// is not evidence, in EITHER direction.

import { callDoor, isDoorRefusal, type CallDoorOptions } from "@/lib/doors";

/** The RPC name as PostgREST exposes it (schema `clara` comes from `Accept-Profile`, which
 *  lib/wire.ts sets — never spelled into the path). */
export const PREVIEW_INVITE_DOOR = "preview_invite";

/** The FOUR keys 0224 §A builds, in the order its `jsonb_build_object` lists them. The
 *  migration's own tail asserts the returned object carries exactly these four quoted keys and
 *  names neither a token nor the unmasked address, so this list is the mirror of a contract the
 *  database enforces rather than a hopeful copy. */
export const PREVIEW_INVITE_KEYS = ["firm_name", "role", "status", "masked_email"] as const;

/** The four values `clara.firm_invites.status` admits (`0141:181`'s CHECK), which is also the
 *  closed set the effective-status expression can produce: `pending` becomes `expired` when
 *  `expires_at` has passed, and the other three are reported as stored. A fifth value is a DB
 *  the app does not understand, and it denies rather than guessing. */
export const INVITE_PREVIEW_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type InvitePreviewStatus = (typeof INVITE_PREVIEW_STATUSES)[number];

/** The four roles `clara.firm_invites.role` admits (`0141:179`, the same CHECK
 *  `clara.firm_memberships.role` carries at `0002:215`), in ladder order. A role outside it is
 *  refused rather than rendered: `lib/firm/capabilities.ts` cannot rank it, so no surface could
 *  say honestly what it grants. */
export const INVITE_PREVIEW_ROLES = ["viewer", "bookkeeper", "admin", "owner"] as const;
export type InvitePreviewRole = (typeof INVITE_PREVIEW_ROLES)[number];

export type InvitePreviewRow = {
  firm_name: string;
  role: InvitePreviewRole;
  status: InvitePreviewStatus;
  /** A HINT, never an address: `0224` masks to one leading character, three fixed stars and the
   *  domain. Fixed stars on purpose — a length-proportional run would publish the address's
   *  length. Rendered as-is; this module never tries to reconstruct anything from it. */
  masked_email: string;
};

/** Why a preview could not be shown. Two kinds, and the difference is what the surface does:
 *  `refused` BLOCKS (the door answered, and the answer was no); `indefinite` DEGRADES. */
export type InvitePreviewFailure =
  | {
      ok: false;
      kind: "refused";
      /** The DB's own CLR code, or null when the refusal is this module's own pre-flight (an
       *  empty token cannot identify anything, so it never reaches the wire). */
      code: string | null;
      /** The typed `detail.reason` discriminant, when the refusal carried one. */
      reason: string | null;
      /** The DB's own sentence, VERBATIM — the caller renders it or ignores it, never re-words it. */
      message: string | null;
    }
  | {
      ok: false;
      kind: "indefinite";
      /** `transport` — we never heard back (a network failure, a 5xx, no live session).
       *  `unreadable` — a 200 whose body is not what the door returns. */
      reason: "transport" | "unreadable";
    };

export type InvitePreviewOutcome = { ok: true; preview: InvitePreviewRow } | InvitePreviewFailure;

const NON_EMPTY = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/**
 * Does this value carry EVERY declared key, each of the type the door returns?
 *
 * All four are checked, not the two a given face happens to render. A row is trusted downstream
 * as a whole, so a partial check hands a half-validated object onward wearing a fully-typed name
 * — the exact defect `lib/identity/doors.ts`'s own validator was widened to close (Codex
 * MEDIUM-2). An EXTRA key is not a reason to deny: the four declared ones are the contract, and
 * a future additive field must not break a deployed client.
 */
export function isInvitePreviewRow(value: unknown): value is InvitePreviewRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!NON_EMPTY(row.firm_name)) return false;
  if (typeof row.role !== "string" || !(INVITE_PREVIEW_ROLES as readonly string[]).includes(row.role)) return false;
  if (typeof row.status !== "string" || !(INVITE_PREVIEW_STATUSES as readonly string[]).includes(row.status)) return false;
  if (!NON_EMPTY(row.masked_email)) return false;
  return true;
}

/**
 * Read the preview for ONE invite token. NEVER THROWS — every observation, including a thrown
 * transport, becomes one of the typed outcomes above.
 *
 * That is deliberate and it is the difference between this reader and `acceptInvite`. The door
 * `acceptInvite` calls is an ACT: its refusal is the journey's answer and must propagate
 * untouched. This one is a COURTESY READ taken between two steps of someone's sign-up; a thrown
 * read here would replace the password form with an exception, which is a worse outcome than
 * showing the form without the preview block.
 */
export async function readInvitePreview(
  token: string,
  opts: CallDoorOptions = {},
): Promise<InvitePreviewOutcome> {
  // A blank token identifies nothing, so there is nothing to look up and no reason to spend a
  // governed call proving it. DEFINITE, because it is decidable here and nothing about the
  // estate could change the answer.
  if (typeof token !== "string" || token.trim() === "") {
    return { ok: false, kind: "refused", code: null, reason: "invite_not_previewable", message: null };
  }

  let payload: unknown;
  try {
    payload = await callDoor(PREVIEW_INVITE_DOOR, { p_token: token }, opts);
  } catch (e) {
    if (isDoorRefusal(e)) {
      return { ok: false, kind: "refused", code: e.code, reason: e.reason, message: e.message };
    }
    // A `DoorError` (no session, 4xx that is not a governed refusal, 5xx), an abort, or anything
    // else the wire threw. None of them is a verdict on the invitation.
    return { ok: false, kind: "indefinite", reason: "transport" };
  }

  if (!isInvitePreviewRow(payload)) {
    return { ok: false, kind: "indefinite", reason: "unreadable" };
  }
  return { ok: true, preview: payload };
}
