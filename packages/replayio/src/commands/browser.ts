import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { program } from "commander";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";

type ResolvedCommand = {
  command: string;
  args: string[];
};

const ENV_PATH_KEYS = ["REPLAYIO_AGENT_BROWSER_PATH", "REPLAY_AGENT_BROWSER_PATH"];

program
  .command("browser")
  .description("Proxy to the bundled Replay agent-browser CLI")
  .allowUnknownOption()
  .allowExcessArguments(true)
  .helpOption(false)
  .action(runBrowser);

async function runBrowser() {
  const forwardArgs = getForwardArgs();
  const resolved = resolveAgentBrowserCommand();
  const command = resolved?.command ?? "replay-browser";
  const args = [...(resolved?.args ?? []), ...forwardArgs];

  if (isHelpRequest(forwardArgs)) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
    });

    if (result.error) {
      await handleSpawnError(result.error);
      return;
    }

    if (result.stdout) {
      process.stdout.write(rewriteHelpOutput(result.stdout));
    }
    if (result.stderr) {
      process.stderr.write(rewriteHelpOutput(result.stderr));
    }

    await exitProcess(result.status ?? 0);
  }

  const child = spawn(command, args, { stdio: "inherit" });

  child.on("error", async (error: NodeJS.ErrnoException) => {
    await handleSpawnError(error);
  });

  child.on("exit", async code => {
    await exitProcess(code ?? 0);
  });
}

function isHelpRequest(args: string[]): boolean {
  if (args.length === 0) {
    return false;
  }
  return args[0] === "help" || args.includes("--help") || args.includes("-h");
}

function rewriteHelpOutput(text: string): string {
  return text.replace(/\bagent-browser\b/g, "replayio browser");
}

async function handleSpawnError(error: NodeJS.ErrnoException) {
  if (error.code === "ENOENT") {
    const help = [
      "Replay agent-browser CLI not found.",
      "",
      "Reinstall replayio or point to a local build with:",
      "  export REPLAYIO_AGENT_BROWSER_PATH=/path/to/agent-browser/bin/agent-browser.js",
    ].join("\n");
    console.error(help);
  } else {
    console.error(`Failed to launch agent-browser: ${error.message}`);
  }

  await exitProcess(1);
}

function getForwardArgs(): string[] {
  const argv = process.argv;
  const index = argv.findIndex(arg => arg === "browser");
  if (index === -1) {
    return [];
  }
  return argv.slice(index + 1);
}

function resolveAgentBrowserCommand(): ResolvedCommand | null {
  const fromEnv = resolveFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  const fromPackage = resolveFromPackage();
  if (fromPackage) {
    return fromPackage;
  }

  return null;
}

function resolveFromEnv(): ResolvedCommand | null {
  for (const key of ENV_PATH_KEYS) {
    const envPath = process.env[key];
    if (!envPath) {
      continue;
    }

    if (envPath.endsWith(".js") || envPath.endsWith(".mjs")) {
      return { command: process.execPath, args: [envPath] };
    }

    return { command: envPath, args: [] };
  }

  return null;
}

function resolveFromPackage(): ResolvedCommand | null {
  try {
    const pkgPath = require.resolve("agent-browser/package.json");
    const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const binValue = pkgJson.bin;
    const binRelative = typeof binValue === "string" ? binValue : binValue?.["replay-browser"];

    if (!binRelative) {
      return null;
    }

    const binPath = path.resolve(path.dirname(pkgPath), binRelative);
    if (!existsSync(binPath)) {
      return null;
    }

    if (binPath.endsWith(".js") || binPath.endsWith(".mjs")) {
      return { command: process.execPath, args: [binPath] };
    }

    return { command: binPath, args: [] };
  } catch {
    return null;
  }
}
