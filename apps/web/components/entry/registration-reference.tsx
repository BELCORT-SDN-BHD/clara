// #628 REVIEW — THE REGISTRATION REFERENCE, RENDERED THE SAME WAY EVERYWHERE.
//
// THE DEFECT THIS CLOSES. `capacity_full`'s copy on `/checkout/success` ends
// "…contact support if you need to know when this opens again, and quote your
// registration reference" — and the card rendered no reference at all. A
// promise a surface does not keep is worse than no promise: the person is sent
// to support to quote a value they were never shown, and the only other place
// the product prints it is a waiting face they may never reach.
//
// ONE COMPONENT, THREE CALL SITES (7.3). `CheckoutWaitingRefresh` already
// printed the reference when its bounded wait gave up, and it printed it with
// its own inline markup. Two more surfaces now need the same value in the same
// shape, so the markup moves here and all three read it — a second spelling of
// "the reference, in mono, wrapping anywhere" is a second thing to keep in
// step with the first.
//
// IT IS RENDERED, NEVER ACCEPTED. NIT-6 keeps identifiers OFF the wire: no form
// on either card carries a hidden field, and every route reads the registration
// from the caller's own session. Putting a value on screen is not the same as
// taking one from a request.

export function RegistrationReference({
  registration,
  label,
}: {
  registration: string;
  /** Said aloud before the value, so the string is not a bare identifier to
   *  anyone reading the page with their ears. */
  label: string;
}) {
  return (
    <p className="mt-1.5">
      <span className="sr-only">{label}: </span>
      <span className="font-mono text-xs wrap-anywhere">{registration}</span>
    </p>
  );
}
