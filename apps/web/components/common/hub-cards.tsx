import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type HubCardItem = {
  readonly key: string;
  readonly href: string;
  readonly title: ReactNode;
  readonly badge?: ReactNode;
  readonly description: ReactNode;
};

/**
 * The card-grid hub shared by `components/settings/settings-hub.tsx` and
 * `components/accounting/accounting-hub.tsx` — extracted (#614 code review)
 * once the two had drifted to the same `nav`/`ul`/`Link`/`Card` composition
 * and the same `h2`-inside-`CardTitle` structure. Each caller keeps its own
 * "no sections" empty state (both) and its own not-built note (settings only
 * — the accounting hub has no billing-shaped gap to disclose), since those
 * are per-destination judgment calls, not shared markup.
 */
export function HubCards({ label, items }: { label: string; items: readonly HubCardItem[] }) {
  return (
    <nav aria-label={label}>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
            >
              <Card className="h-full transition-colors group-hover:bg-accent/40">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <h2>{item.title}</h2>
                    {item.badge}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
