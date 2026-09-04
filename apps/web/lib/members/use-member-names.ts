"use client";

// CB-AE2E-027 / CB-AE2E-028 — ONE resolver for "who is this uuid", used wherever a
// professional would otherwise read a raw `clara.users(id)`.
//
// THE READ ALREADY EXISTS AND WAS USED ONCE. `clara.firm_members_visible`
// (0141:512, `grant select … to clara_authenticated` at 0141:597) publishes
// membership_id, user_id, display_name, email, role, role_rank, status,
// created_at, removed_at — firm-scoped by `clara.jwt_firm()`, floored at
// bookkeeper+, email null-masked below admin+. Its reader,
// `loadFirmMembers` (lib/members/reads.ts:208), was called from exactly one place
// in the whole app (components/admin/members-panel.tsx), while six other surfaces
// printed the uuid.
//
// THE RENDER CONTRACT IS FAIL-OPEN-TO-HONESTY, and it is the point of this module:
//
//   * A uuid IN the roster resolves to its `display_name`.
//   * A uuid NOT in the roster resolves to `null`, and the CALLER renders the
//     shortened raw id (`shortId`) — never a guessed name, never a blank. That
//     happens for real reasons: a member of another firm, a departed member whose
//     row the view still publishes but whose id the caller mistyped, or a caller
//     BELOW the bookkeeper floor, for whom the view returns ZERO ROWS rather than
//     refusing (lib/members/reads.ts's own note). Those causes are not
//     distinguishable on the wire, so this module claims none of them.
//   * A FAILED read resolves everything to `null` too. Absence is not evidence:
//     "the read failed" and "this id is not a member" must both fall through to
//     the honest raw-id rendering, never to a name.
//
// The view does NOT filter removed memberships, so a departed colleague still
// resolves — which is what an audit surface wants. The agent identity is itself a
// member row (reads.ts:38-39), so an agent-lane `acting_actor` resolves too.
//
// ONE READ PER MOUNT of whatever component holds this hook. The roster is small
// and firm-scoped; callers that show many actors on one page should hold the hook
// ONCE at the panel level and pass `resolve` down, rather than mounting it per row.

import { useCallback, useEffect, useState } from "react";

import { loadFirmMembers, type FirmMemberRow } from "./reads";
import type { SessionTokenAccessor } from "@/lib/session";

export type ResolvedMember = {
  display_name: string;
  /** null-masked below admin+, and genuinely null for a member with no address on
   *  file — the two are indistinguishable, so a caller must not claim either. */
  email: string | null;
  role: string;
  status: string;
  /** The membership's own end date, when the view published one. A resolved name
   *  for a DEPARTED colleague is still the right answer on an audit surface; the
   *  caller may say so beside it. */
  removed_at: string | null;
};

export type MemberNameResolver = {
  /** `null` for every id this firm's roster does not carry, and for every id at
   *  all while the read is still in flight or after it failed. */
  resolve: (userId: string | null | undefined) => ResolvedMember | null;
  /** The roster itself, for the surfaces that need to OFFER members (the export
   *  recipient picker) rather than resolve one. Empty until the read settles. */
  members: FirmMemberRow[];
  loading: boolean;
  /** The read's own failure, for a caller that wants to say the roster could not
   *  be read. Rendering it is optional — the fallback rendering is already
   *  honest without it. */
  error: unknown;
};

export function useMemberNames(session: SessionTokenAccessor | null): MemberNameResolver {
  const [members, setMembers] = useState<FirmMemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const hasSession = session !== null;

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    loadFirmMembers(session, controller.signal)
      .then((rows) => {
        if (!live) return;
        setMembers(rows);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!live) return;
        // The roster stays EMPTY on a failure, which is what drives every caller
        // to the raw-id rendering. Never a partial list, never a cached one.
        setMembers([]);
        setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
    // `hasSession` (a primitive), never the accessor's object identity — the same
    // discipline lib/parts/hooks.ts documents for its own mount effect, and for the
    // same reason its header gives: a caller that hands a fresh accessor object on
    // every render must not be able to drive an infinite reload loop. This project's
    // eslint config does not register `react-hooks/exhaustive-deps`, so no
    // suppression comment is possible (one reds the build as an unknown rule); if
    // that rule is ever added, this effect's deps are intentionally narrower than a
    // naive "close over everything the body reads" would suggest.
  }, [hasSession]);

  const resolve = useCallback(
    (userId: string | null | undefined): ResolvedMember | null => {
      if (!userId) return null;
      const row = members.find((m) => m.user_id === userId);
      if (!row) return null;
      return {
        display_name: row.display_name,
        email: row.email,
        role: row.role,
        status: row.status,
        removed_at: row.removed_at,
      };
    },
    [members],
  );

  return { resolve, members, loading, error };
}
