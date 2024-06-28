import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";

export async function checkAuthentication() {
  return await getAccessToken();
}
