import { notFound } from "next/navigation";

/** Production/default target for the dedicated harness route. The e2e build
 * aliases this module to the enabled implementation in next.config.ts. */
export function MoneyInputHarnessRoute() {
  notFound();
  return null;
}
