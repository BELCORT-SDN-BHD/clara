"use client";

// The two tables of /admin/members — the roster and the pending invites — split
// out of `members-panel.tsx` when that file crossed the 500-line ceiling while
// taking E-7's capability gating and E-8's date fix. Nothing about the shape
// changed in the move: both were already MODULE-LEVEL components rather than
// closures inside the panel (a component declared inside another gets a fresh
// identity on every render, so React would unmount and remount its whole
// subtree — which would close the open DropdownMenu the instant `busy` flipped,
// i.e. on the very click that opened the act). This file is where that rule now
// lives structurally rather than by convention.
//
// LOADING, EMPTY AND FAILED ARE THREE DISTINGUISHABLE STATES (the order's own
// instrument law). A failed read renders NO table — the panel's error banner is
// the whole answer — so an empty table can never stand in for a failure.

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, LoadingState } from "@/components/common/state";
import { businessDate } from "@/lib/business-date";
import {
  isKnownInviteStatus,
  isKnownMembershipStatus,
  type FirmInviteRow,
  type FirmMemberRow,
  type MemberRole,
} from "@/lib/members/reads";
import { MemberRowMenu } from "./member-row-menu";

/** E-8 / CB-AE2E-025: the local `day()` this replaces sliced an ISO string at
 *  the "T", on the stated premise that "the DB's own value is unambiguous as it
 *  stands". **That premise was false for a timestamptz.**
 *  `firm_memberships.created_at` is `timestamptz not null default now()`
 *  (0002_foundation.sql:218), projected unchanged by `clara.firm_members_visible`
 *  (0141:519-521), and PostgREST serialises timestamptz in UTC. Malaysia is
 *  UTC+8, so a membership created at 01:30 MYT on 2026-09-04 arrives as
 *  `2026-09-03T17:30:00+00:00` and the slice returned 2026-09-03 — the PREVIOUS
 *  DAY, on all four columns that used it, for the whole 00:00-08:00 MYT window.
 *
 *  `businessDate` (lib/business-date.ts — "a law that lives in one call site is
 *  not a law. This module is the law.") formats in Asia/Kuala_Lumpur through
 *  Intl with an `en-CA` (ISO) short date. It is DETERMINISTIC given a fixed
 *  timeZone, so the server/client-disagreement worry the old comment raised does
 *  not apply: that worry was about the VIEWER's locale, which this never
 *  consults. Every other firm surface already uses this family.
 *
 *  The empty-string return for a null is preserved deliberately — three of the
 *  four call sites sit inside a `row.x ? … : null` guard. */
function day(iso: string | null): string {
  if (!iso) return "";
  return businessDate(new Date(iso));
}

const INVITE_STATUS_KEY = {
  pending: "statusPending",
  expired: "statusExpired",
  accepted: "statusAccepted",
  revoked: "statusRevoked",
} as const;

export function RosterTable({
  rows,
  loading,
  failed,
  busy,
  canManageMembers,
  onPickRole,
  onRemove,
}: {
  rows: FirmMemberRow[] | null;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  /** E-7 (裁-190): the row menu is the role-change and remove control, both
   *  admin-floor doors. FALSE hides it entirely rather than rendering it
   *  disabled — see lib/firm/capabilities.ts for the ruling and the mirrored
   *  floors. A removed membership still renders its role as plain text, which
   *  is what it did before and is not a control. */
  canManageMembers: boolean;
  /** RETURNS THE ACT'S OWN PROMISE. `MemberRowMenu` disables its items and holds
   *  its single-fire guard until this settles; a `void`-ing caller would leave
   *  the double-fire window open (independent review of #455, MEDIUM-4). */
  onPickRole: (row: FirmMemberRow, role: MemberRole) => Promise<void>;
  onRemove: (row: FirmMemberRow) => void;
}) {
  const t = useTranslations("Members.roster");
  const tRoles = useTranslations("Members.roles");

  if (rows === null) {
    if (failed) return null;
    return <LoadingState>{t("loading")}</LoadingState>;
  }
  if (rows.length === 0) return <EmptyState>{t("empty")}</EmptyState>;
  const anyWithheld = rows.some((r) => r.email === null);

  return (
    <div className="flex flex-col gap-2">
      <Card>
        <CardContent>
          <Table className="enter-content">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colJoined")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.membership_id}>
                  <TableCell className="font-medium text-foreground">{row.display_name}</TableCell>
                  <TableCell>
                    {/* NEVER A BLANK CELL. `email` is null either because the
                        column is floored below admin+ or because the member has
                        none on record, and nothing on the wire tells the two
                        apart — so the cell states the absence and the note under
                        the table names both causes rather than guessing one. */}
                    {row.email ?? <span className="text-muted-foreground">{t("emailWithheld")}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "active" ? "secondary" : "outline"}>
                      {isKnownMembershipStatus(row.status)
                        ? t(row.status === "active" ? "statusActive" : "statusRemoved")
                        : row.status}
                    </Badge>
                    {row.removed_at ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("removedOn", { date: day(row.removed_at) })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{day(row.created_at)}</TableCell>
                  <TableCell>
                    {row.status === "active" && canManageMembers ? (
                      <MemberRowMenu
                        name={row.display_name}
                        currentRole={row.role}
                        busy={busy}
                        onPickRole={(role) => onPickRole(row, role)}
                        onRemove={() => onRemove(row)}
                      />
                    ) : (
                      // Two causes, one rendering, and neither is a control. A
                      // REMOVED membership has no verb at all: `set_member_role`
                      // and `remove_member` both refuse CLR11 'membership is not
                      // active' (`0157:346`+, `0005:743`). A caller below admin
                      // has no verb either (E-7). Both read the role as text.
                      <span className="text-sm text-muted-foreground">{tRoles(row.role as MemberRole)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {anyWithheld ? <p className="max-w-prose text-xs text-muted-foreground">{t("emailNote")}</p> : null}
      {loading ? <LoadingState>{t("loading")}</LoadingState> : null}
    </div>
  );
}

export function InvitesTable({
  rows,
  loading,
  failed,
  busy,
  canRevokeInvite,
  onRevoke,
}: {
  rows: FirmInviteRow[] | null;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  /** E-7 (裁-190): `clara.revoke_invite` floors at admin (`0157:424`). Below it
   *  the Actions column carries nothing — the column header stays so the table
   *  shape is stable across ranks. */
  canRevokeInvite: boolean;
  onRevoke: (row: FirmInviteRow) => void;
}) {
  const t = useTranslations("Members.invites");
  const tRoles = useTranslations("Members.roles");

  if (rows === null) {
    if (failed) return null;
    return <LoadingState>{t("loading")}</LoadingState>;
  }
  if (rows.length === 0) return <EmptyState>{t("empty")}</EmptyState>;

  return (
    <div className="flex flex-col gap-2">
      <Card>
        <CardContent>
          <Table className="enter-content">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("colSent")}</TableHead>
                <TableHead>{t("colExpires")}</TableHead>
                <TableHead>{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">{row.email}</TableCell>
                  <TableCell>{tRoles(row.role as MemberRole)}</TableCell>
                  <TableCell>
                    {/* The view's EFFECTIVE status, rendered as the DB computed
                        it: a row past `expires_at` reads `expired` even though
                        nothing transitioned (`0141:526-529`). Anything outside the
                        closed set renders raw rather than being mapped to a label
                        this app invented. */}
                    <Badge variant={row.status === "pending" ? "secondary" : "outline"}>
                      {isKnownInviteStatus(row.status) ? t(INVITE_STATUS_KEY[row.status]) : row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{day(row.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{day(row.expires_at)}</TableCell>
                  <TableCell>
                    {/* Offered on EXPIRED rows too, deliberately: the view's
                        status is computed while the ROW is still `pending`, and
                        revoking is the only way to free that address before the
                        seven days elapse. On a genuinely closed row
                        `revoke_invite` refuses CLR09 'this invite is no longer
                        open' (`0141:477`) — verbatim, which is the honest
                        answer. */}
                    {canRevokeInvite ? (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => onRevoke(row)}>
                        {t("revoke")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {loading ? <LoadingState>{t("loading")}</LoadingState> : null}
    </div>
  );
}
