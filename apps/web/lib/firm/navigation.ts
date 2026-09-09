import type { CallerContextRow } from "./caller-context";
import { roleRank, type MemberRole } from "../members/reads";
import { isOperatorConsoleEligible } from "../registration/doors";

/**
 * THE RANK FLOOR AUTHORITY — one predicate, and the citations behind it.
 *
 * #614 moved the destination LISTS out of this file into `lib/navigation/
 * tree.ts`, the one registry the sidebar, the breadcrumb, ⌘K and the settings
 * hub all read. What stays here is the half that is not a list: the shape of a
 * floored entry, the fail-closed comparison, and the record of WHICH read sets
 * each floor. Two files, two jobs — the tree says what exists, this says who is
 * offered it, and there is exactly one implementation of the second.
 *
 * Each floor is the lowest rank admitted by the destination's primary READ, not
 * the floor of a write that happens to live on the same page. Writes stay
 * visible at that read floor and meet their own governed door when submitted.
 * The per-row citations now live beside the rows themselves, in tree.ts, where a
 * reader adding a row will actually see them.
 *
 * THIS IS LEGIBILITY, NOT AUTHORITY. A hidden entry grants or revokes nothing;
 * the destination's RLS policy or governed door remains the wall. A caller who
 * types the URL still meets it.
 *
 * THE "ADMIN" -> "FIRM" RANK-SHAPED RENAME IS RETIRED, and it is worth recording
 * why rather than leaving its absence unexplained. E-7 / CB-AE2E-014 (裁-187)
 * found that a bookkeeper read "Admin" in the sidebar, found nothing
 * administrative under it, and reasonably concluded the product was offering
 * something they could not use — so the LABEL was rewritten per rank while the
 * read floor stayed viewer. #614 removes the lie at its source instead: the
 * destination is "Settings", which is honest at every rank, and the one section
 * that genuinely is administration (Members) is the one section that appears
 * only at admin+. A label that is true for everybody needs no per-rank rewrite,
 * and the rewrite was the machinery a later lane would have had to keep in sync.
 */

export type NavigationScope = Pick<CallerContextRow, "role_rank" | "is_operator">;

/** The shape `hasNavigationAccess` judges. Every registry row in
 *  `lib/navigation/tree.ts` carries it, so the predicate is CALLED on the row
 *  itself rather than a second copy of the floor being written anywhere. */
export type NavigationEntry = {
  readonly minimumRole: MemberRole;
  readonly operatorOnly?: true;
};

/** Fail closed on a NULL/unknown rank, matching the DB's `coalesce(rank, -1)`. */
export function hasNavigationAccess(
  scope: NavigationScope,
  entry: NavigationEntry,
): boolean {
  const minimumRank = roleRank(entry.minimumRole)!;
  if ((scope.role_rank ?? -1) < minimumRank) return false;
  if (entry.operatorOnly) return isOperatorConsoleEligible(scope);
  return true;
}
