"use client";

// /admin/members — the roster, the pending invites, the role menu, both confirm
// dialogs and the invite courier's own failures. P4-4.
//
// TWO STACKED SECTIONS, NOT TABS. The Mobbin grounding (§3 takeaway 1) compared
// Height/Upwork/Midday (one list behind a tab) with Krea AI (both stacked on one
// page) and ruled for Krea's shape, because design §4 D puts "the roster, the
// pending-invite list, role change, remove" on ONE screen and because the a11y and
// keyboard scans then see both without a second tab-panel assertion. Two
// `SectionHeader level={2}` sections under one `PageHeader`.
//
// TWO ANTI-PATTERNS THE GROUNDING NAMED, AND NEITHER IS HERE. No "Delivered"
// badge (§3 takeaway 3): `firm_invites` has no delivery-receipt column, the mail
// step is a courier the DB never hears back from, and the only badge this screen
// can render honestly is the invite's OWN status. No bulk approve/deny bar: no
// plural door exists.
//
// RE-GROUNDED LIVE, 2026-08-30 (`mcp__mobbin__search_screens`, platform web,
// deep, limit 4: "team members settings page with a roster table and a separate
// pending invitations section, each row showing role and a per-row actions
// menu"). It returned Height (the same screen §3 cites — and its remove-confirm
// copy, "Remove the invitation for …? Cancel / Remove", is the shape both confirm
// dialogs here follow), plus three §3 did not have. Two changed nothing and one
// is worth writing down:
//   · Bonsai and Exa MERGE the roster and the invites into ONE table, carrying
//     invite state in a status column. NOT ADOPTED, and the reason is Clara's,
//     not taste: the two reads have DIFFERENT FLOORS — `firm_members_visible` is
//     bookkeeper+, `firm_invites_visible` is admin+ — so one merged table would
//     silently show a bookkeeper a list whose invite rows are structurally
//     absent, with nothing on the screen saying so. Two sections, each stating
//     its own floor in its own description, is what makes that absence legible.
//   · Bonsai reports a successful invite as a TOAST ("Invite sent."). Not
//     adopted: R4's house law is StateBanner over a Toast, so the confirmation
//     renders in the section it concerns and stays there.
//   · Sprig offers "Resend Invite" in its row menu. There is no resend door —
//     `invite_member` refuses CLR10 'an invite is already pending for this email'
//     for exactly that address (`0147:399`) — so the control would be a fake one.
//     Revoke-then-invite is the real path, and it is what ships.
//
// EVERY ACT RE-READS, AND NOTHING IS PAINTED OPTIMISTICALLY. `useHydratedPart`'s
// `act()` reloads unconditionally after every call, success or failure
// (apps/web/AGENTS.md). A role change or a removal re-reads the roster; an invite
// or a revoke re-reads the invite list.
//
// AFFORDANCE SHAPING IS NOT A WALL, AND IT FAILS OPEN. This panel reads
// `clara.caller_context` (P4-2's `loadCallerContext`) for ONE purpose: to disable
// the "Invite someone" trigger with the required rank NAMED when the caller's own
// rank is positively below admin (design §4 D — "in-context verbs above it are
// shown disabled with the required rank named"). If that read fails, returns
// nothing, returns more than one row, or returns a NULL `role_rank`, the trigger
// stays ENABLED. That direction is deliberate and is the OPPOSITE of the scope
// spine's: the boundary here is `clara._human_ctx`, which refuses CLR04 either
// way, so a failed courtesy read must never strand a real admin.
// `lib/require-firm-scope.ts` is not imported and this file is not an entrance —
// `tests/firm-scope-surfaces.test.ts` asserts that both ways.
//
// THE TABLES ARE MODULE-LEVEL COMPONENTS, NOT CLOSURES INSIDE THE PANEL. A
// component declared inside another gets a fresh identity on every render, so
// React unmounts and remounts its whole subtree — which would close the open
// DropdownMenu the instant `busy` flipped, i.e. on the very click that opened the
// act. Hoisted, with props.

import { useMemo, useState } from "react";
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
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart, type PartClr } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadCallerContext } from "@/lib/firm/caller-context";
import {
  ADMIN_RANK,
  isKnownInviteStatus,
  isKnownMembershipStatus,
  loadFirmInvites,
  loadFirmMembers,
  type FirmInviteRow,
  type FirmMemberRow,
  type MemberRole,
} from "@/lib/members/reads";
import {
  inviteMember,
  isInviteCourierError,
  removeMember,
  revokeInvite,
  setMemberRole,
  type InviteCourierError,
} from "@/lib/members/doors";
import { InviteDialog } from "./invite-dialog";
import { MemberRowMenu } from "./member-row-menu";
import { MembersConfirmDialog } from "./members-confirm-dialog";

/** The DB's own refusal as a chip beside its verbatim message — the shape
 *  components/common/state.tsx's `code` prop expects, built the same way every
 *  other panel in this app builds it. */
function clrChip(clr: PartClr): string | undefined {
  if (!clr) return undefined;
  return clr.reason ? `${clr.code} · ${clr.reason}` : clr.code;
}

/** An ISO timestamp's date part. No `toLocaleDateString()`: it would disagree
 *  between the server render and the client hydration, and the DB's own value is
 *  unambiguous as it stands. */
function day(iso: string | null): string {
  if (!iso) return "";
  const cut = iso.indexOf("T");
  return cut > 0 ? iso.slice(0, cut) : iso;
}

const INVITE_STATUS_KEY = {
  pending: "statusPending",
  expired: "statusExpired",
  accepted: "statusAccepted",
  revoked: "statusRevoked",
} as const;

function RosterTable({
  rows,
  loading,
  failed,
  busy,
  onPickRole,
  onRemove,
}: {
  rows: FirmMemberRow[] | null;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  /** RETURNS THE ACT'S OWN PROMISE. `MemberRowMenu` disables its items and holds
   *  its single-fire guard until this settles; a `void`-ing caller would leave
   *  the double-fire window open (independent review of #455, MEDIUM-4). */
  onPickRole: (row: FirmMemberRow, role: MemberRole) => Promise<boolean>;
  onRemove: (row: FirmMemberRow) => void;
}) {
  const t = useTranslations("Members.roster");
  const tRoles = useTranslations("Members.roles");

  // LOADING, EMPTY AND FAILED ARE THREE DISTINGUISHABLE STATES (the order's own
  // instrument law). A failed read renders NO table — the error banner above is
  // the whole answer — so an empty table can never stand in for a failure.
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
                    {row.status === "active" ? (
                      <MemberRowMenu
                        name={row.display_name}
                        currentRole={row.role}
                        busy={busy}
                        onPickRole={(role) => onPickRole(row, role)}
                        onRemove={() => onRemove(row)}
                      />
                    ) : (
                      // A removed membership has no verb: `set_member_role` and
                      // `remove_member` both refuse CLR11 'membership is not
                      // active' (`0145:611`, `0005:743`). A menu that can only
                      // refuse would be a control that cannot act.
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

function InvitesTable({
  rows,
  loading,
  failed,
  busy,
  onRevoke,
}: {
  rows: FirmInviteRow[] | null;
  loading: boolean;
  failed: boolean;
  busy: boolean;
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
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => onRevoke(row)}>
                      {t("revoke")}
                    </Button>
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

export function MembersPanel() {
  const tRoster = useTranslations("Members.roster");
  const tInvites = useTranslations("Members.invites");
  const tCourier = useTranslations("Members.courier");
  const tRemove = useTranslations("Members.removeDialog");
  const tRevoke = useTranslations("Members.revokeDialog");

  const roster = useHydratedPart(sessionTokenAccessor, (s) => loadFirmMembers(s));
  const invites = useHydratedPart(sessionTokenAccessor, (s) => loadFirmInvites(s));
  const context = useHydratedPart(sessionTokenAccessor, (s) => loadCallerContext(s));

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<FirmMemberRow | null>(null);
  const [revoking, setRevoking] = useState<FirmInviteRow | null>(null);
  // The COURIER's own failures — never a governed refusal, which arrives as a
  // DoorRefusal and lands in `invites.clr` like every other door's.
  const [courier, setCourier] = useState<InviteCourierError | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  // FAIL-OPEN (see the header): only a positively-read rank below admin blocks
  // the trigger. Zero rows, more than one row, a failed read and a NULL rank all
  // leave it enabled, because the DB is the wall.
  const callerRank = useMemo(() => {
    const rows = context.data;
    if (!rows || rows.length !== 1) return null;
    const rank = rows[0]?.role_rank;
    return typeof rank === "number" ? rank : null;
  }, [context.data]);
  const inviteBlocked = callerRank !== null && callerRank < ADMIN_RANK;

  async function submitInvite(email: string, role: MemberRole): Promise<void> {
    setCourier(null);
    setIssued(null);
    let refused = false;
    await invites.act(async () => {
      try {
        await inviteMember(email, role);
        setIssued(email);
      } catch (e) {
        // A COURIER failure is not a governed refusal. It is swallowed here on
        // purpose so `act()` still performs its unconditional re-read — the
        // `mail_failed` branch DID create an invite, and the admin has to see it
        // in the list below in order to revoke it. The banner renders it
        // separately, with its own title, so it is never mistaken for the DB's
        // own words.
        if (isInviteCourierError(e)) {
          setCourier(e);
          return;
        }
        refused = true;
        throw e; // a DoorRefusal — act() records code + message, rendered verbatim
      }
    });
    // Stay open on a governed refusal so the address or the role can be corrected
    // without retyping; close on anything else.
    if (!refused) setInviteOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeader level={2}>{tRoster("heading")}</SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{tRoster("description")}</p>
        {roster.err ? (
          <StateBanner tone="error" code={clrChip(roster.clr)}>
            {roster.err}
          </StateBanner>
        ) : null}
        <RosterTable
          rows={roster.data}
          loading={roster.loading}
          failed={roster.err !== null}
          busy={roster.busy}
          onPickRole={(row, role) =>
            // RETURNED, not `void`-ed. `useHydratedPart`'s `act()` resolves only
            // after the call AND its unconditional re-read have finished, so this
            // promise is exactly "the act has settled" — which is what
            // `MemberRowMenu`'s guard and its disabled items hang on.
            roster.act(async () => {
              await setMemberRole(sessionTokenAccessor, row.membership_id, role);
            })
          }
          onRemove={(row) => setRemoving(row)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          level={2}
          action={
            <Button variant="outline" size="sm" disabled={inviteBlocked} onClick={() => setInviteOpen(true)}>
              {inviteBlocked ? tInvites("issueBlocked") : tInvites("issue")}
            </Button>
          }
        >
          {tInvites("heading")}
        </SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{tInvites("description")}</p>
        {courier ? (
          <StateBanner tone="error" title={tCourier("title")} code={courier.code}>
            {tCourier(courier.code)}
            {/* CLARA'S OWN detail, when there is one — today only the list of
                unset environment variable NAMES on `mail_not_configured`. The
                courier stopped relaying upstream strings entirely (independent
                review of #455, MEDIUM-3), so this can no longer be a provider's
                words. */}
            {courier.detail ? <> ({courier.detail})</> : null}
            {/* THE CORRELATION ID, rendered because an id nobody can see is not
                a support channel. It is the ONE handle joining this banner to
                the server log line that holds the real, classified failure —
                which is the whole trade MEDIUM-3 makes: the browser is told
                less, so it must be told where the rest of it went. */}
            {courier.correlationId ? <> {tCourier("reference", { id: courier.correlationId })}</> : null}
          </StateBanner>
        ) : null}
        {invites.err ? (
          <StateBanner tone="error" code={clrChip(invites.clr)}>
            {invites.err}
          </StateBanner>
        ) : null}
        {issued !== null && courier === null && invites.err === null ? (
          <StateBanner tone="info">{tInvites("issued", { email: issued })}</StateBanner>
        ) : null}
        <InvitesTable
          rows={invites.data}
          loading={invites.loading}
          failed={invites.err !== null}
          busy={invites.busy}
          onRevoke={(row) => setRevoking(row)}
        />
      </section>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} busy={invites.busy} onSubmit={submitInvite} />

      <MembersConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={tRemove("title", { name: removing?.display_name ?? "" })}
        description={tRemove("description")}
        confirmLabel={tRemove("confirm")}
        busy={roster.busy}
        onConfirm={async () => {
          const row = removing;
          if (!row) return false;
          // CB-AE2E-004: the dialog closes only on an accepted act, and the row
          // it is confirming is cleared only then too — a refusal keeps both.
          const ok = await roster.act(async () => {
            await removeMember(sessionTokenAccessor, row.membership_id);
          });
          if (ok) setRemoving(null);
          return ok;
        }}
      />

      <MembersConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={tRevoke("title", { email: revoking?.email ?? "" })}
        description={tRevoke("description")}
        confirmLabel={tRevoke("confirm")}
        busy={invites.busy}
        onConfirm={async () => {
          const row = revoking;
          if (!row) return false;
          setCourier(null);
          setIssued(null);
          // CB-AE2E-004: see the remove dialog above — clear the pending row
          // only when the door actually accepted.
          const ok = await invites.act(async () => {
            await revokeInvite(sessionTokenAccessor, row.id);
          });
          if (ok) setRevoking(null);
          return ok;
        }}
      />
    </div>
  );
}
