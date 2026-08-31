import { handleEmailConfirmationPost } from "./handler";

export async function POST(request: Request): Promise<Response> {
  return handleEmailConfirmationPost(request);
}
