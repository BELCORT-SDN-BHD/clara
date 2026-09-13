/**
 * #622 review round — THE ONE VOCABULARY for `/forgot-password?status=`,
 * shared by its writer and its two readers so they cannot drift apart.
 *
 * Before this module the same five-way (four classified + one generic)
 * vocabulary was declared independently in three places: the WRITER
 * (`app/(entry)/auth/recover/handler.ts`'s `RecoveryLinkStatus` type and its
 * two code/status -> status maps), and two READERS
 * (`app/(entry)/forgot-password/page.tsx`'s `LINK_FAILURE_STATUSES` Set +
 * cast, and `components/entry/password-recovery-form.tsx`'s own
 * `RecoveryLinkFailure` type). Nothing tied the writer's spelling to either
 * reader's allowlist — a status renamed on one side would silently stop
 * matching on the other, in EITHER direction, with no typecheck or test
 * failure to catch it.
 *
 * `RECOVERY_LINK_FAILURES` — the four PKCE-exchange failures handler.ts
 * classifies (`app/(entry)/auth/recover/handler.ts`'s own header carries the
 * full Context7-verified GoTrue mapping), each with its own copy in
 * `password-recovery-form.tsx`'s `linkFailure` prop.
 *
 * `RECOVERY_LINK_STATUSES` — the FULL `/forgot-password?status=` vocabulary:
 * the four failures above, plus the pre-existing generic `invalid` bucket
 * (a missing `code` query param, or a provider error this build does not
 * recognise). `invalid` is deliberately NOT a `RecoveryLinkFailure` — it
 * remains `password-recovery-form.tsx`'s separate, unchanged `invalidLink`
 * boolean prop, which `password-reset-form.tsx` also uses for its own,
 * DIFFERENT mechanism (an absent/expired browser recovery session, not a
 * link-exchange classification). Folding the two together would make one
 * generic bucket answer for two unrelated failure shapes.
 */

export const RECOVERY_LINK_FAILURES = ["expired", "used_or_unknown", "refused", "rate_limited"] as const;

export type RecoveryLinkFailure = (typeof RECOVERY_LINK_FAILURES)[number];

export const RECOVERY_LINK_STATUSES = [...RECOVERY_LINK_FAILURES, "invalid"] as const;

export type RecoveryLinkStatus = (typeof RECOVERY_LINK_STATUSES)[number];

const FAILURE_SET: ReadonlySet<string> = new Set(RECOVERY_LINK_FAILURES);
const STATUS_SET: ReadonlySet<string> = new Set(RECOVERY_LINK_STATUSES);

/**
 * The READ-side guard for the full vocabulary (`forgot-password/page.tsx`'s
 * `?status=` query param). `null` for anything this build does not
 * recognise — a page reading `null` renders no distinguishing banner at
 * all, the same fail-closed default the pre-#622 code always had.
 */
export function parseRecoveryLinkStatus(value: string | undefined | null): RecoveryLinkStatus | null {
  return typeof value === "string" && STATUS_SET.has(value) ? (value as RecoveryLinkStatus) : null;
}

/**
 * The narrower guard for the four classified failures alone — what
 * `password-recovery-form.tsx`'s `linkFailure` prop actually accepts.
 * `parseRecoveryLinkStatus(value) === "invalid"` is deliberately NOT also
 * `true` here: `invalid` is not a `RecoveryLinkFailure`, by construction.
 */
export function parseRecoveryLinkFailure(value: string | undefined | null): RecoveryLinkFailure | null {
  return typeof value === "string" && FAILURE_SET.has(value) ? (value as RecoveryLinkFailure) : null;
}
