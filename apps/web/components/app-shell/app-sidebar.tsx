"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ActivityIcon,
  BookOpenIcon,
  BoxesIcon,
  Building2Icon,
  CalculatorIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FilesIcon,
  FingerprintPatternIcon,
  HouseIcon,
  InboxIcon,
  LandmarkIcon,
  ListIcon,
  LockIcon,
  ReceiptIcon,
  RouteIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { useFirmScope, type FirmScopeValue } from "@/components/firm-scope-provider";
import { useClientIdentity } from "@/components/app-shell/scope-context";
import { ScopeSwitcher } from "@/components/app-shell/scope-switcher";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  useSidebar,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  accountingHref,
  clientNavHref,
  resolveActive,
  visibleAccountingItems,
  visibleClientNav,
  visibleFirmNav,
  type ActiveNav,
  type NavIconName,
} from "@/lib/navigation/tree";

/**
 * THE ONE NAVIGATION SURFACE (#614).
 *
 * WHAT IT REPLACED: a firm sidebar (`components/firm-nav.tsx`), a duplicate of
 * that sidebar inside a sheet (`components/firm-nav-drawer.tsx`), and a
 * horizontal nine-tab strip at the client altitude
 * (`components/client-workspace-nav.tsx`) with its own private list of
 * destinations. Three chromes, two registries, and no single place that said
 * where you were. This is one chrome over one registry
 * (`lib/navigation/tree.ts`), with the sheet arm coming from the vendored
 * Sidebar primitive rather than being a second render of the same links.
 *
 * TWO GROUPS, AND THE ORDER IS THE POINT. Inside a client the sidebar opens
 * with a group labelled with THE CLIENT'S OWN NAME, holding that client's
 * destinations, and the firm's group sits below it. The thing you are working in
 * is the thing at the top. At firm altitude there is only the firm group.
 *
 * ACCOUNTING IS A GROUP, NOT A DESTINATION-WITH-CHILDREN-ALWAYS-SHOWN. Eight
 * accounting surfaces flattened into the client list would bury Documents,
 * Knowledge and Reports below the fold at 224px. It is a `Collapsible`, open by
 * default whenever the caller is anywhere under it (including the two register
 * tabs the sidebar deliberately does not name) and openable at any time — never
 * an accordion that closes the section you are standing in.
 *
 * EVERY DESTINATION IS A REAL `next/link`. `SidebarMenuButton render={<Link/>}`
 * is Base UI's `render` prop, not Radix's `asChild`: the primitive merges its own
 * props into the element you hand it. So each row is an `<a href>` — middle-click
 * opens a tab, the browser's own Enter activation applies, and
 * `test/keyboardWalk.ts`'s "is this natively focusable" floor is met without a
 * key handler anywhere in this file.
 *
 * RANK SHAPING IS THE REGISTRY'S, NOT THIS FILE'S. `visibleFirmNav` and friends
 * filter through the one predicate (`lib/firm/navigation.ts`'s
 * `hasNavigationAccess`), so a destination this caller cannot open is ABSENT
 * rather than rendered disabled — a greyed row still asserts the room exists. As
 * ever: hiding grants nothing, and the destination's RLS policy or governed door
 * remains the wall.
 */

const ICONS: Record<NavIconName, LucideIcon> = {
  house: HouseIcon,
  users: UsersIcon,
  inbox: InboxIcon,
  activity: ActivityIcon,
  settings: SettingsIcon,
  user: UserIcon,
  building: Building2Icon,
  shield: ShieldCheckIcon,
  fingerprint: FingerprintPatternIcon,
  clipboard: ClipboardListIcon,
  files: FilesIcon,
  calculator: CalculatorIcon,
  book: BookOpenIcon,
  chart: ChartColumnIcon,
  ledger: ListIcon,
  bank: LandmarkIcon,
  scale: ScaleIcon,
  boxes: BoxesIcon,
  route: RouteIcon,
  list: ListIcon,
  lock: LockIcon,
  receipt: ReceiptIcon,
};

function NavIcon({ name }: { name: NavIconName }) {
  const Icon = ICONS[name];
  // Decorative: the row's own text is its accessible name, and a duplicate
  // announcement of "house, Home" helps nobody.
  return <Icon aria-hidden="true" />;
}

/** Production wiring — reads the URL and the layout's one positively-read scope. */
export function AppSidebar() {
  const scope = useFirmScope();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const identity = useClientIdentity();
  const { setOpenMobile } = useSidebar();
  // CLOSE THE MOBILE SHEET ON THE NAVIGATION IT PERFORMS (#614; the same law
  // the retired firm-nav-drawer carried). The vendored Sidebar keeps its Sheet
  // open across a route change, so without this a tap on "Clients" left the
  // panel sitting over the page it had just opened — measured in the browser
  // leg. The dependency is the URL, not a click handler on each link: a
  // middle-click restore, a `router.push` from a child and the browser's own
  // Back all change the URL without any handler in this file firing. The
  // query string is part of the key because `/work` → `/work?view=needs-you`
  // and a registers `?tab=` are navigations too.
  const location = `${pathname}?${searchParams.toString()}`;
  React.useEffect(() => {
    setOpenMobile(false);
  }, [location, setOpenMobile]);
  return (
    <AppSidebarView
      scope={scope}
      pathname={pathname}
      searchParams={searchParams}
      clientName={identity.name}
    />
  );
}

/** Exported for the rank/a11y/keyboard cells; production uses `AppSidebar`. */
export function AppSidebarView({
  scope,
  pathname,
  searchParams,
  clientName,
}: {
  scope: FirmScopeValue;
  pathname: string;
  searchParams: { get(name: string): string | null };
  /** Null until the client layout below has published it — never a guess. */
  clientName: string | null;
}) {
  const t = useTranslations("AppShell");
  const tBrand = useTranslations("Brand");
  const active = resolveActive(pathname, searchParams);
  const firmName = scope.firm_name ?? tBrand("productName");

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <span className="px-2 text-xs font-medium text-sidebar-foreground">
          {tBrand("productName")}
        </span>
        <ScopeSwitcher
          pathname={pathname}
          searchParams={searchParams}
          clientId={active.clientId}
          clientName={clientName}
          firmName={firmName}
        />
      </SidebarHeader>

      <SidebarContent>
        {/* THE LANDMARK. The vendored primitive is all `<div>`s — it has no
            `<nav>` anywhere — so the shell supplies one, named, around BOTH
            groups rather than one per group: two navigation landmarks in a
            224px column is two things for a screen-reader user to choose
            between when there is only one menu. The scope switcher stays
            outside it, in the sidebar header, because switching client is not a
            destination in this menu. */}
        <nav aria-label={t("mainNavLabel")} className="flex flex-col">
          {active.scope === "client" && active.clientId !== null ? (
            <ClientGroup
              scope={scope}
              clientId={active.clientId}
              // The id is the honest stand-in until the name lands — see
              // components/app-shell/scope-context.tsx for why it can be late and
              // why it is never another client's name.
              label={clientName ?? t("scope.clientPlaceholder")}
              active={active}
            />
          ) : null}
          <FirmGroup scope={scope} firmName={firmName} active={active} />
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-1 px-2">
          <span className="truncate text-xs text-sidebar-foreground">
            {t("signedInAs", { firmName })}
          </span>
          {scope.role ? <RoleLabel role={scope.role} /> : null}
        </div>
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}

const KNOWN_ROLES = ["viewer", "bookkeeper", "admin", "owner"] as const;
type KnownRole = (typeof KNOWN_ROLES)[number];
const isKnownRole = (value: string): value is KnownRole =>
  (KNOWN_ROLES as readonly string[]).includes(value);

/**
 * The caller's own role, in words. A CHECKED lookup, never `t(\`roles.${role}\`)`
 * on a raw string: the DB's CHECK constraint admits four roles today, and a
 * fifth arriving from the wire would otherwise render next-intl's raw key path
 * in the sidebar footer. An unrecognised role renders VERBATIM instead — the
 * database's own word, which is more useful than "AppShell.roles.auditor".
 */
function RoleLabel({ role }: { role: string }) {
  const t = useTranslations("AppShell.roles");
  return (
    <span className="truncate text-xs text-muted-foreground">
      {isKnownRole(role) ? t(role) : role}
    </span>
  );
}

function FirmGroup({
  scope,
  firmName,
  active,
}: {
  scope: FirmScopeValue;
  firmName: string;
  active: ActiveNav;
}) {
  const t = useTranslations("AppShell");
  const items = visibleFirmNav(scope);
  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="truncate">{firmName}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const current = active.firmItem === item.id;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={current}
                  render={
                    <Link href={item.href} aria-current={current ? "page" : undefined} />
                  }
                >
                  <NavIcon name={item.icon} />
                  <span>{t(item.labelKey)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ClientGroup({
  scope,
  clientId,
  label,
  active,
}: {
  scope: FirmScopeValue;
  clientId: string;
  label: string;
  active: ActiveNav;
}) {
  const t = useTranslations("AppShell");
  const items = visibleClientNav(scope);
  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="truncate">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) =>
            item.id === "accounting" ? (
              <AccountingGroup
                key={item.id}
                scope={scope}
                clientId={clientId}
                label={t(item.labelKey)}
                indexHref={clientNavHref(clientId, item)}
                active={active}
              />
            ) : (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={active.clientItem === item.id}
                  render={
                    <Link
                      href={clientNavHref(clientId, item)}
                      aria-current={active.clientItem === item.id ? "page" : undefined}
                    />
                  }
                >
                  <NavIcon name={item.icon} />
                  <span>{t(item.labelKey)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * THE COLLAPSIBLE, and the two decisions inside it.
 *
 * (1) THE TRIGGER IS NOT THE DESTINATION. `/clients/:id/accounting` is a real
 * index page and a real breadcrumb ancestor, so it needs a real link; a
 * disclosure needs a real button. Making one control do both is the pattern that
 * produces "I clicked the section and it collapsed instead of opening" — so the
 * row is a LINK, and the chevron beside it is the disclosure button with its own
 * accessible name. Two controls, two jobs, both reachable by keyboard.
 *
 * (2) OPEN BY DEFAULT WHEN YOU ARE IN IT, and freely openable otherwise. The
 * open state is React state seeded from the URL and re-seeded whenever the URL
 * moves into or out of the section — not a derived value, because deriving it
 * would make the disclosure button inert on the pages where the section is
 * active, which is the failure a "controlled by the route" accordion always has.
 */
function AccountingGroup({
  scope,
  clientId,
  label,
  indexHref,
  active,
}: {
  scope: FirmScopeValue;
  clientId: string;
  label: string;
  indexHref: string;
  active: ActiveNav;
}) {
  const t = useTranslations("AppShell");
  const items = visibleAccountingItems(scope);
  const inSection = active.accountingOpen;
  const [open, setOpen] = React.useState(inSection);
  const [seededFor, setSeededFor] = React.useState(inSection);
  if (seededFor !== inSection) {
    // Re-seed on a route change that crosses the section boundary, during
    // render rather than in an effect, so the panel is never briefly wrong.
    setSeededFor(inSection);
    setOpen(inSection);
  }

  const currentIndex = active.clientItem === "accounting";

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuButton
          isActive={currentIndex}
          render={<Link href={indexHref} aria-current={currentIndex ? "page" : undefined} />}
        >
          <NavIcon name="calculator" />
          <span>{label}</span>
        </SidebarMenuButton>
        {/* 24px square, not the vendored `SidebarMenuAction`'s 20: a control
            whose pinned box is under the `--target-min` floor needs a written
            SC 2.5.8 exception (test/a11yRules.ts), and "it has a bigger
            invisible hit area" is a worse answer than simply meeting the floor. */}
        <CollapsibleTrigger
          aria-label={t("toggleSection", { section: label })}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="motion-fast size-4 shrink-0 motion-safe:transition-transform in-data-panel-open:rotate-90"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((item) => {
              const current = active.accountingItem === item.id;
              return (
                <SidebarMenuSubItem key={item.id}>
                  <SidebarMenuSubButton
                    isActive={current}
                    render={
                      <Link
                        href={accountingHref(clientId, item)}
                        aria-current={current ? "page" : undefined}
                      />
                    }
                  >
                    <span>{t(item.labelKey)}</span>
                  </SidebarMenuSubButton>
                  {item.beta ? (
                    <SidebarMenuBadge className="top-1">{t("betaBadge")}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
