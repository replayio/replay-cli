import { getAccessToken } from "../authentication/getAccessToken";

export async function checkAuthentication() {
  return await getAccessToken();
}
