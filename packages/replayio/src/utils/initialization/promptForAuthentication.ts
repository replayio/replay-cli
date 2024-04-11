import { authenticateByBrowser } from "../authentication/authenticateByBrowser";

export async function promptForAuthentication() {
  return await authenticateByBrowser();
}
