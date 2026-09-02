/** Build-only error-boundary probe selected by CLARA_E2E_ROUTE_ERROR_PROBE=1. */
export function RouteErrorProbe({ trigger }: { trigger: boolean }) {
  if (trigger) throw new Error("intentional e2e route-boundary probe");
  return null;
}
