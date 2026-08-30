"use client";

// THE ROW-LEVEL ROLE/REMOVE MENU — the surface the DropdownMenu primitive was
// vendored for (design annex 2 §E; P4-4's file list).
//
// THE FOUR ROLES ARE ALWAYS ALL OFFERED, AND THAT IS THE POINT.
// `set_member_role` refuses **CLR04 'cannot assign a role above your own rank'**
// (`0145:603`) against the CALLER's own rank, and the last-owner trigger refuses
// **CLR09 'cannot demote/remove the last active owner'** (`0003:423`) when this
// row is the firm's last active non-agent owner. This menu pre-empts NEITHER:
// filtering the list to the caller's rank would hide the ceiling instead of
// teaching it, and greying out the last owner's demotion would be the UI guessing
// a fact only the DB can count (plan §2 rule (b); design §4 D says the last-owner
// wall is "not pre-empted in the UI" in those words). The click happens; the DB's
// own message renders verbatim, above the table.
//
// THE CURRENT ROLE IS CHECK-MARKED rather than removed — the Mobbin grounding's
// own shape (§3 takeaway 2, TheyDo/Tailscale: a single-select list with the
// current selection marked), rendered with the menu's `role="menuitemradio"`
// items.
//
// ONE SELECTION IS ONE GOVERNED CALL — independent review of #455, MEDIUM-4, and
// this file's own previous header was WRONG about it. That header argued for
// `closeOnClick={false}` on the ground that the menu "closes when the act
// finishes, from the panel". It did not: the menu was UNCONTROLLED, so nothing
// ever closed it, and the items carried no `disabled` and no guard. Two clicks
// were MEASURED to send two `set_member_role` calls with two different op keys —
// two governed writes from one human intent, the second of which can only either
// duplicate the first or undo it.
//
// THE THREE THINGS THAT CLOSE THAT WINDOW, weakest to strongest:
//   1. The menu is now CONTROLLED and closes on selection. Nothing is lost by
//      closing: the refusal renders ABOVE THE TABLE, outside this popup, which is
//      the whole reason the old header's worry did not apply.
//   2. Every item is `disabled` while an act is in flight. Cosmetic on its own —
//      `disabled` only takes effect on the NEXT render, and the race lives before
//      that render.
//   3. A REF-BACKED SINGLE-FIRE GUARD (`lib/parts/single-fire-guard.ts`), read
//      and written synchronously in the same microtask as the click, with no
//      React re-render in between. This is the correctness wall; 1 and 2 are
//      affordance. `InviteDialog` and `MembersConfirmDialog` already carry the
//      same guard for the same reason (review finding M3).
//
// `onPickRole` RETURNS ITS PROMISE, which is what makes "in flight" observable
// at all — a bare `void act(...)` gave this component nothing to await and no
// settlement to disable until.
//
// NO "..." ICON-ONLY TRIGGER. The trigger carries visible text, because
// test/a11yRules.ts's `button-name` rule and WCAG 4.1.2 both want a discernible
// name and an icon-only control would need an `aria-label` that says the same
// thing the word already says.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { ROLE_LADDER, type MemberRole } from "@/lib/members/reads";

export function MemberRowMenu({
  name,
  currentRole,
  busy,
  onPickRole,
  onRemove,
}: {
  name: string;
  currentRole: string;
  busy: boolean;
  /** Performs exactly one governed call and RESOLVES WHEN IT HAS SETTLED. The
   *  returned promise is this component's only signal that an act is in flight;
   *  a caller that returns nothing re-opens the double-fire window. */
  onPickRole: (role: MemberRole) => Promise<void>;
  onRemove: () => void;
}) {
  const t = useTranslations("Members.roster");
  const tRoles = useTranslations("Members.roles");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // See the header: this ref is the correctness wall, not the `disabled` below.
  const guardRef = useRef(createSingleFireGuard());

  async function pick(role: MemberRole): Promise<void> {
    // Closed FIRST and synchronously, so the popup is already on its way out
    // before the await — the refusal it would have covered renders above the
    // table anyway.
    setOpen(false);
    setPending(true);
    try {
      await runOnce(guardRef.current, async () => {
        await onPickRole(role);
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={busy || pending} aria-label={t("rowMenuLabel", { name })} />
        }
      >
        {tRoles(currentRole as MemberRole)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* `DropdownMenuLabel` is Base UI's `Menu.GroupLabel`, which throws
            outright unless it sits inside a `Menu.Group` — so the four role items
            and their heading are one labelled group, which is also the correct
            semantics for a single-select set. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("roleGroupLabel")}</DropdownMenuLabel>
          {ROLE_LADDER.map((role) => (
            // A plain `DropdownMenuItem` carrying `role="menuitemradio"` +
            // `aria-checked`, rather than the vendored `DropdownMenuRadioGroup`:
            // the group primitive reports its choice through `onValueChange` on
            // the GROUP, which hands a test no per-item handler to drive and no
            // way to tell "the admin picked bookkeeper" from "React re-rendered
            // with a new value". An item with its own `onClick` keeps the act
            // attributable to the row and the role that was actually clicked. The
            // ARIA is the same either way, and test/a11yRules.ts's own rule that
            // `role="radio"` requires `aria-checked` is honoured here too.
            <DropdownMenuItem
              key={role}
              role="menuitemradio"
              aria-checked={role === currentRole ? "true" : "false"}
              // `pick` owns the close (see the header), so the primitive's own
              // close-on-click is turned off rather than racing it.
              closeOnClick={false}
              disabled={pending}
              onClick={() => {
                void pick(role);
              }}
            >
              <span className="w-4 shrink-0">
                {role === currentRole ? <CheckIcon aria-hidden="true" /> : null}
              </span>
              {tRoles(role)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* Remove opens a CONFIRM DIALOG rather than acting — one call happens
            there, behind that dialog's own single-fire guard. It closes the menu
            on click (the primitive's default), which is required and not merely
            tidy: a menu item that stayed mounted would be the dialog trigger's
            own parent unmounting underneath it. */}
        <DropdownMenuItem variant="destructive" disabled={pending} onClick={onRemove}>
          {t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
