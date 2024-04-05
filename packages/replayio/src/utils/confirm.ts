// @ts-ignore TS types are busted; see github.com/enquirer/enquirer/issues/212
import { Confirm } from "bvaughn-enquirer";

export async function confirm(message: string) {
  const confirm = new Confirm({
    hideAfterSubmit: true,
    hideHelp: true,
    hideOutput: true,
    message,
    name: "confirmation",
  });
  const confirmed = await confirm.run();
  return confirmed === true;
}
