import { getAccessToken } from "../authentication/getAccessToken.js";

export async function checkAuthentication() {
  return await getAccessToken();
}
