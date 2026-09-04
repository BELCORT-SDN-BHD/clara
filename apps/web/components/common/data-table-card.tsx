import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The ONE way a read-only data table is presented: the shared `<Table>`
 * primitive, on a `<Card>` surface, with the content-arrival transition
 * already attached.
 *
 * Six surfaces (the client register, the four registers, and the firm
 * activity's siblings) had each hand-rolled `<table className="w-full
 * text-left text-sm">` with `py-2 pr-4` cells and no container at all, so
 * the product had two table densities AND a class of table that floated
 * edgeless on the shell grey while every neighbouring panel sat on a card.
 *
 * Composing it here rather than at each call site is what keeps
 * `enter-content` from being forgotten on the seventh table — the motion is
 * a property of "a table of freshly-read rows", not of whoever wrote it.
 */
export function DataTableCard({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** ADDITIVE (裁-190, the journals table). An accessible name for the
   *  `<table>` itself. A table whose only heading is a page-level <h1> two
   *  landmarks up is announced by a screen reader as an unnamed table, and
   *  the journals surface now shows two tables on one route (posted entries,
   *  and a draft's own lines). Optional on purpose: every existing call site
   *  keeps exactly the markup it shipped with, since a WRONG name is worse
   *  than none and naming the other twenty tables is their own lanes' call. */
  label?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent>
        <Table className="enter-content" aria-label={label}>
          {children}
        </Table>
      </CardContent>
    </Card>
  );
}
