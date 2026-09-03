import { handleClaimPaidFirmPost } from "./handler";

/**
 * `POST /checkout/success/claim` — server entry 3 of 3, the one that creates
 * the firm. POST only, deliberately: there is no GET export here at all, so
 * nothing that merely follows a URL can mint a tenant.
 */
export async function POST(request: Request): Promise<Response> {
  return handleClaimPaidFirmPost(request);
}
