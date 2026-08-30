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
// items. `MenuRadioItem`'s `closeOnClick` defaults to FALSE, which is right here:
// the act is asynchronous and its refusal renders outside this popup, so closing
// on click would take the row's own context away at the moment the answer
// arrives. It closes when the act finishes, from the panel.
//
// NO "..." ICON-ONLY TRIGGER. The trigger carries visible text, because
// test/a11yRules.ts's `button-name` rule and WCAG 4.1.2 both want a discernible
// name and an icon-only control would need an `aria-label` that says the same
// thing the word already says.

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
  onPickRole: (role: MemberRole) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Members.roster");
  const tRoles = useTranslations("Members.roles");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" disabled={busy} aria-label={t("rowMenuLabel", { name })} />}
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
              closeOnClick={false}
              onClick={() => onPickRole(role)}
            >
              <span className="w-4 shrink-0">
                {role === currentRole ? <CheckIcon aria-hidden="true" /> : null}
              </span>
              {tRoles(role)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          {t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
