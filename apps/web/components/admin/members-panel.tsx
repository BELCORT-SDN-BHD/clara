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
// `act()` reloads unconditionally after every call, success or failure.
// A role change or a removal re-reads the roster; an invite
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
  callerContextRowFromRows,
  canActOnMemberOfRole,
  capabilityScopeFromRows,
  firmCapabilities,
} from "@/lib/firm/capabilities";
import type { DialogRefusal } from "@/components/common/dialog-refusal";
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
  // #625 AC3 — THE FIRM, BY NAME. `clara.caller_context` publishes `firm_name` (`0141:544`) and
  // this panel has always read the view; it simply never rendered the column. Both destructive
  // confirmations now say which firm they are about, because "remove them from this firm" is
  // ambiguous on a screen someone may have opened in two tabs. `null` when the read is not a
  // single well-formed row — the same fold `capabilityScopeFromRows` applies — and the copy then
  // falls back to the wording that claims nothing.
  const firmName = useMemo(() => callerContextRowFromRows(context.data)?.firm_name ?? null, [context.data]);
  // The two rank-only walls inside the members doors (0157:277-279 and
  // 0157:320-321) — derived once here, never inside the table, so the whole
  // ruling has exactly one implementation. See lib/firm/capabilities.ts.
  const roles = useMemo(() => assignableRoles(scope), [scope]);
  const canActOnMember = useCallback((memberRole: string) => canActOnMemberOfRole(scope, memberRole), [scope]);

  /**
   * #625 AC4 — THE SECOND READ, FOLDED INTO EVERY ACT'S OWN SETTLE.
   *
   * THE DEFECT. `scope`/`capabilities`/`roles` are derived from `context.data`, and `context` was
   * read ONCE at mount and never again: this panel called `roster.act()` and `invites.act()`,
   * each of which reloads only ITS OWN part. So an admin demoted to bookkeeper mid-session kept
   * the role menu and the Invite entry until the whole page remounted — controls their live rank
   * can no longer use, offered by a surface that had simply stopped asking.
   *
   * THE FIX IS ONE EXTRA READ, NOT A NEW MECHANISM. `lib/parts/hooks.ts` is deliberately NOT
   * touched: `act()`'s reload discipline is shared by every hydrated surface in this app, and
   * widening it here would change behaviour on screens nobody on this ticket looked at. There is
   * no polling and no server push either — the acceptance is "on the next AUTHORITATIVE
   * response", and this is exactly that: the caller context is re-read as part of settling
   * whatever the person just did.
   *
   * ALL FOUR ACT SITES GO THROUGH IT — invite, role change, remove, revoke — because a caller
   * whose next action is a role change ON SOMEBODY ELSE, or an invite attempt, must lose the
   * control on THAT response too, not only on the one that happened to touch their own row.
   *
   * A REFUSED ACT COUNTS. `act()` re-reads on failure as well as success, and a refusal is
   * frequently the FIRST evidence that the rank moved — refusing to believe it would be the
   * defect wearing a different hat.
   */
  const settleAndRefreshContext = useCallback(
    async (act: () => Promise<boolean>): Promise<boolean> => {
      const ok = await act();
      // Deliberately AFTER the act's own settle (its re-read has already finished): the panel then
      // re-derives capabilities from a context read taken no earlier than the response that just
      // landed. A failure here is not fatal — the part's own error banner already tells the truth
      // about the act, and a context read that did not come back must not blank a page.
      await context.reload().catch(() => {});
      return ok;
    },
    [context],
  );

  async function submitInvite(email: string, role: MemberRole): Promise<void> {
    setCourier(null);
    setIssued(null);
    // WHY THE DIALOG STAYS OPEN, and for exactly which failures.
    //
    // A GOVERNED refusal always keeps it open (`refused`): the admin can correct the role or the
    // address without retyping either. #625 adds the two COURIER verdicts that are about the
    // ADDRESS ITSELF — `unsupported_address` (the transport cannot send there) and
    // `recipient_has_account` (that address is already somebody's sign-in). Both create nothing
    // and both are corrected in this dialog, so closing it over them threw away the field the
    // verdict was asking the person to change, and a field-level invalid that appears only after
    // the field is gone is not an affordance.
    //
    // EVERY OTHER COURIER CODE STILL CLOSES IT, and one of them must: `mail_failed` DID create an
    // invitation whose link is unrecoverable, and the admin has to reach the list below to revoke
    // it. `no_session`, `not_permitted`, `mail_not_configured`, `mail_unavailable`, `transport`,
    // `cross_origin` and `invalid_request` are not about the address either, and their receipt is
    // the panel's own courier banner.
    let refused = false;
    let addressRefused = false;
    await settleAndRefreshContext(() => invites.act(async () => {
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
          addressRefused = e.code === "unsupported_address" || e.code === "recipient_has_account";
          return;
        }
        refused = true;
        throw e; // a DoorRefusal — act() records code + message, rendered verbatim
      }
    }));
    // Stay open on a governed refusal, and on a courier verdict about the address itself, so the
    // field being corrected survives; close on anything else (see the note above).
    if (!refused && !addressRefused) setInviteOpen(false);
  }

  /** The two hydrated parts' own standing failures, in the shape `DoorDialogRefusal` renders.
   *  `MembersConfirmDialog` shows one only AFTER that dialog has settled a confirm of its own
   *  (`refusalForThisDialog`), so a refusal raised by a different door is never painted here. */
  const rosterRefusal: DialogRefusal = { err: roster.err, clr: roster.clr };
  const invitesRefusal: DialogRefusal = { err: invites.err, clr: invites.clr };
  /** The INVITE dialog's refusal is either the DB's (through `invites`) or the COURIER's — two
   *  different authorities, and the courier's is deliberately NOT folded into `invites.err`
   *  (submitInvite swallows it so the unconditional re-read still runs and the admin can see the
   *  invite `mail_failed` really did create). The dialog has to be able to show both. */
  const inviteRefusal: DialogRefusal = courier
    ? { err: tCourier(courier.code), clr: { code: courier.code, reason: null } }
    : invitesRefusal;
  /** #625 AC6 — FIELD-LEVEL INVALID, and only from a typed SERVER verdict.
   *
   *  This surface deliberately carries no client-side email judgement (`invite-dialog.tsx`'s own
   *  header: a second, drifting gate is worse than none). These two courier codes are the
   *  server's own verdict ABOUT THE ADDRESS — `unsupported_address` (the transport cannot send
   *  there) and `recipient_has_account` (that address is already somebody's sign-in) — so the
   *  field they are about says so, beside the control the person has to change. Matched on the
   *  typed CODE, never on the message: spelling is not identity. Every other refusal, governed or
   *  courier, stays form-level, because it is not the address that is wrong. */
  const addressInvalid =
    courier !== null && (courier.code === "unsupported_address" || courier.code === "recipient_has_account");

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
            settleAndRefreshContext(() =>
              roster.act(async () => {
                await setMemberRole(sessionTokenAccessor, row.membership_id, role);
              }),
            )
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
        {/* #625 D2 — TWO ABSENCES, WRITTEN DOWN RATHER THAN LEFT AS A SILENCE.
            There is no RESEND door and there never will be: `clara.invite_member` refuses a
            second pending invitation for the same address (CLR10, `0147:399`) and the plaintext
            token is never stored (裁-16a), so nothing can re-send a link that already went out.
            Revoke-then-invite is the real path and the copy names it.
            There is no per-firm SEAT LIMIT either: the estate's only capacity is the estate-wide
            Admission capacity on new FIRMS (`CONTEXT.md` "Admission capacity"), which this path
            never touches, and per-firm seats are explicitly deferred product scope
            (`docs/PRD.md:126`). A capacity control here would be inventing the thing a blueprint
            deferred. Both are stated ONCE, where an admin would otherwise go looking. */}
        <p className="max-w-prose text-xs text-muted-foreground">{tInvites("noResendNote")}</p>
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

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        busy={invites.busy}
        refusal={inviteRefusal}
        addressInvalid={addressInvalid}
        onSubmit={submitInvite}
      />

      <MembersConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={
          // #625 AC3 — the member AND the firm. The unnamed-firm spelling is not a lesser variant
          // of the same sentence: it is the honest one for a caller context this panel could not
          // read as a single well-formed row, and it claims nothing it cannot see.
          firmName
            ? tRemove("titleInFirm", { name: removing?.display_name ?? "", firm: firmName })
            : tRemove("title", { name: removing?.display_name ?? "" })
        }
        description={tRemove("description")}
        confirmLabel={tRemove("confirm")}
        busy={roster.busy}
        // #625 AC3 — the slot this component has declared since CB-AE2E-004 and nobody passed.
        // The panel's own StateBanner sits BEHIND the modal backdrop; a refusal the human is being
        // asked to act on has to travel in here with them.
        refusal={rosterRefusal}
        onConfirm={async () => {
          const row = removing;
          if (!row) return false;
          // CB-AE2E-004: the dialog closes only on an accepted act, and the row
          // it is confirming is cleared only then too — a refusal keeps both.
          const ok = await settleAndRefreshContext(() =>
            roster.act(async () => {
              await removeMember(sessionTokenAccessor, row.membership_id);
            }),
          );
          if (ok) setRemoving(null);
          return ok;
        }}
      />

      <MembersConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={
          firmName
            ? tRevoke("titleInFirm", { email: revoking?.email ?? "", firm: firmName })
            : tRevoke("title", { email: revoking?.email ?? "" })
        }
        description={tRevoke("description")}
        confirmLabel={tRevoke("confirm")}
        busy={invites.busy}
        refusal={invitesRefusal}
        onConfirm={async () => {
          const row = revoking;
          if (!row) return false;
          setCourier(null);
          setIssued(null);
          // CB-AE2E-004: see the remove dialog above — clear the pending row
          // only when the door actually accepted.
          const ok = await settleAndRefreshContext(() =>
            invites.act(async () => {
              await revokeInvite(sessionTokenAccessor, row.id);
            }),
          );
          if (ok) setRevoking(null);
          return ok;
        }}
      />
    </div>
  );
}
