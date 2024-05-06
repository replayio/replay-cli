import { Help, program } from "commander";
import { formatOutput } from "./formatOutput";

export function finalizeCommander() {
  try {
    program.configureHelp({
      formatHelp: (command, helper) => {
        const help = new Help();
        const helpText = help.formatHelp(command, helper);
        return formatOutput(helpText);
      },
      sortOptions: true,
      sortSubcommands: true,
    });
    program.configureOutput({
      writeErr: (text: string) => process.stderr.write(formatOutput(text)),
      writeOut: (text: string) => process.stdout.write(formatOutput(text)),
    });
    program.helpCommand("help [command]", "Display help for command");
    program.helpOption("-h, --help", "Display help for command");
    program.parse();
  } catch (error) {
    console.error(error);
  }
}
