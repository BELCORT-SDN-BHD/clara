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
// AFFORDANCE SHAPING IS NOT A WALL, AND IT NOW FAILS CLOSED — reversed on
// 2026-09-04 (E-7 / CB-AE2E-014 / CB-AE2E-033, 裁-187). This paragraph used to
// say a failed/empty/multi-row/NULL-rank read left the invite trigger ENABLED
// "so a failed courtesy read must never strand a real admin". The owner
// reported the consequence — a bookkeeper offered the role menu, Remove and
// Invite, all of which can only answer CLR04 — and the ruling is that a control
// the caller's rank cannot use is NOT RENDERED. An unknown rank therefore
// denies. The whole panel takes ONE capability object from
// `lib/firm/capabilities.ts` (its header carries the full reasoning and the
// named cost). The wall did not move: `_human_ctx(role_rank('admin'))` still
// refuses CLR04 for anyone reaching these doors another way, verbatim.
// `lib/require-firm-scope.ts` is not imported and this file is not an entrance —
// `tests/firm-scope-surfaces.test.ts` asserts that both ways.
//
// THE TABLES LIVE IN ./members-tables.tsx, and they are MODULE-LEVEL components
// rather than closures inside this panel. A component declared inside another
// gets a fresh identity on every render, so React unmounts and remounts its
// whole subtree — which would close the open DropdownMenu the instant `busy`
// flipped, i.e. on the very click that opened the act. They moved to their own
// file when this one crossed the 500-line ceiling; the rule is unchanged and is
// now structural.

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { useHydratedPart, type PartClr } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadCallerContext } from "@/lib/firm/caller-context";
import {
  assignableRoles,
  canActOnMemberOfRole,
  capabilityScopeFromRows,
  firmCapabilities,
} from "@/lib/firm/capabilities";
import {
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
import { InvitesTable, RosterTable } from "./members-tables";
import { MembersConfirmDialog } from "./members-confirm-dialog";

/** The DB's own refusal as a chip beside its verbatim message — the shape
 *  components/common/state.tsx's `code` prop expects, built the same way every
 *  other panel in this app builds it. */
function clrChip(clr: PartClr): string | undefined {
  if (!clr) return undefined;
  return clr.reason ? `${clr.code} · ${clr.reason}` : clr.code;
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

  // FAIL-CLOSED (see the header, and lib/firm/capabilities.ts for the ruling).
  // ONE capability object, derived from the caller context this panel already
  // reads. Zero rows, more than one row, a failed read and a NULL `role_rank`
  // all deny — the fold that used to live here as a hand-written `callerRank`
  // now lives in `capabilityScopeFromRows`, so the three surfaces this ruling
  // touches cannot each get the cardinality judgement slightly differently.
  const scope = useMemo(() => capabilityScopeFromRows(context.data), [context.data]);
  const capabilities = useMemo(() => firmCapabilities(scope), [scope]);
  // The two rank-only walls inside the members doors (0157:277-279 and
  // 0157:320-321) — derived once here, never inside the table, so the whole
  // ruling has exactly one implementation. See lib/firm/capabilities.ts.
  const roles = useMemo(() => assignableRoles(scope), [scope]);
  const canActOnMember = useCallback((memberRole: string) => canActOnMemberOfRole(scope, memberRole), [scope]);

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
          canManageMembers={capabilities.canManageMembers}
          assignableRoles={roles}
          canActOnMember={canActOnMember}
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
            // E-7 (裁-187): ABSENT below admin, not disabled-with-a-reason. The
            // `issueBlocked` copy ("Admin or owner can invite someone") was the
            // old disabled label and is retired with the trigger it labelled.
            capabilities.canInviteMember ? (
              <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                {tInvites("issue")}
              </Button>
            ) : null
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
          canRevokeInvite={capabilities.canRevokeInvite}
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
          if (!row) return;
          await roster.act(async () => {
            await removeMember(sessionTokenAccessor, row.membership_id);
          });
          setRemoving(null);
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
          if (!row) return;
          setCourier(null);
          setIssued(null);
          await invites.act(async () => {
            await revokeInvite(sessionTokenAccessor, row.id);
          });
          setRevoking(null);
        }}
      />
    </div>
  );
}
