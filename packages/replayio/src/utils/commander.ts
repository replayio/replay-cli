import { Help, program } from "commander";
import { logPromise } from "./async/logPromise";
import { raceWithTimeout } from "./async/raceWithTimeout";
import { getAccessToken } from "./authentication/getAccessToken";
import { requireAuthentication } from "./authentication/requireAuthentication";
import { drawBoxAroundText } from "./formatting";
import { initLaunchDarklyFromAccessToken } from "./launch-darkly/initLaunchDarklyFromAccessToken";
import { promptNpmUpdate } from "./promptNpmUpdate";
import { dim, highlight, highlightAlternate } from "./theme";

type Block = {
  label: string;
  lines: string[];
};

export function finalizeCommander() {
  try {
    program.configureHelp({
      formatHelp: (command, helper) => {
        const help = new Help();
        const helpText = help.formatHelp(command, helper);
        return formatOutput(helpText);
      },
    });
    program.configureOutput({
      writeErr: (text: string) => process.stderr.write(formatOutput(text)),
      writeOut: (text: string) => process.stdout.write(formatOutput(text)),
    });
    program.hook("preAction", async () => {
      try {
        await raceWithTimeout(promptNpmUpdate(), 5_000);
      } catch (error) {
        // Ignore
      }
    });
    program.helpCommand("help [command]", "Display help for command");
    program.helpOption("-h, --help", "Display help for command");
    program.parse();
  } catch (error) {
    console.error(error);
  }
}

export function formatOutput(originalText: string): string {
  const blocks: Block[] = [];

  let currentBlock: null | Block = null;
  let lines: string[] = [];

  originalText.split("\n").forEach(line => {
    if (currentBlock != null) {
      if (!line.trim()) {
        blocks.push(currentBlock);
        currentBlock = null;
      } else {
        currentBlock.lines.push(formatCommandOrOptionLine(line));
      }
    } else if (
      line.startsWith("Arguments:") ||
      line.startsWith("Commands:") ||
      line.startsWith("Options:")
    ) {
      currentBlock = {
        label: line.replace(":", "").trim(),
        lines: [],
      };
    } else if (line.startsWith("Usage:")) {
      line = line.replace(/ (-{1,2}[a-zA-Z0-9\-\_]+)/g, highlightAlternate(" $1"));
      line = line.replace(/ ([<\[][a-zA-Z0-9\-\_\.]+[>\]])/g, highlight(" $1"));

      lines.push(line);
    } else {
      lines.push(line);
    }
  });

  blocks.forEach(block => {
    const blockText = block.lines.map(line => `${line}  `).join("\n");
    const boxedText =
      drawBoxAroundText(blockText, {
        headerLabel: block.label,
      }) + "\n";

    lines.push(...boxedText.split("\n"));
  });

  return lines.join("\n");
}

export function registerAuthenticatedCommand(commandName: string) {
  return program.command(commandName).hook("preAction", async () => {
    await requireAuthentication();

    const accessToken = await getAccessToken();
    if (accessToken) {
      const launchDarklyPromise = initLaunchDarklyFromAccessToken(accessToken);

      logPromise({
        delayBeforeLoggingMs: 500,
        messages: {
          pending: "Initializing session…",
        },
        promise: launchDarklyPromise,
      });

      try {
        await raceWithTimeout(launchDarklyPromise, 5_000);
      } catch (error) {
        // Ignore
      }
    }
  });
}

export function registerCommand(commandName: string) {
  return program.command(commandName);
}

function formatCommandOrOptionLine(line: string): string {
  line = line.replace(/ (-{1,2}[a-zA-Z0-9\-\_]+)/g, highlightAlternate(" $1"));
  line = line.replace(/ ([<\[][a-zA-Z0-9\-\_\.]+[>\]])/g, highlight(" $1"));
  line = line.replace(/\(default: ([^)]+)\)/, dim(`(default: ${highlight("$1")})`));
  return line;
}
