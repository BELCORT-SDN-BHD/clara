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
export function DataTableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn(className)}>
      <CardContent>
        <Table className="enter-content">{children}</Table>
      </CardContent>
    </Card>
  );
}
