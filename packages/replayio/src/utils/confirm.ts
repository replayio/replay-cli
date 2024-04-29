// @ts-ignore TS types are busted; see github.com/enquirer/enquirer/issues/212
import enquirer from "bvaughn-enquirer";

const { Confirm } = enquirer as any;

export async function confirm(message: string, defaultValue: boolean, footer?: string) {
  const confirm = new Confirm({
    footer,
    hideHelp: true,
    hideOutput: true,
    initial: defaultValue,
    message,
    name: "confirmation",
  });
  const confirmed = await confirm.run();
  return confirmed === true;
}
