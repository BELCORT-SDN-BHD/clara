import { ClientNotFound } from "@/components/common/client-not-found";

/**
 * #614 D6 — catches `notFound()` from
 * `app/(firm)/clients/[clientId]/layout.tsx`. A `not-found.tsx` under this
 * segment renders inside `(firm)/layout.tsx`, so the caller keeps the
 * sidebar and rail rather than falling through to the root 404.
 */
export default function ClientsNotFound() {
  return <ClientNotFound />;
}
