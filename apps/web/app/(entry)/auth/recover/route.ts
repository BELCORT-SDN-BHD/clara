import { handlePasswordRecovery } from "./handler";

export async function GET(request: Request): Promise<Response> {
  return handlePasswordRecovery(request);
}
