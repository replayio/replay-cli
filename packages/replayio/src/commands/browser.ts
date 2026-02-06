import { spawn, spawnSync } from "child_process";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { canUpload } from "@replay-cli/shared/recording/canUpload";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { program } from "commander";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import type { LocalRecording } from "@replay-cli/shared/recording/types";

type ResolvedCommand = {
  command: string;
  args: string[];
};

const ENV_PATH_KEYS = ["REPLAYIO_AGENT_BROWSER_PATH", "REPLAY_AGENT_BROWSER_PATH"];
const OPTIONS_WITH_VALUES = new Set([
  "--session",
  "--profile",
  "--state",
  "--headers",
  "--executable-path",
  "--extension",
  "--args",
  "--user-agent",
  "--proxy",
  "--proxy-bypass",
  "--provider",
  "--device",
  "--cdp",
  "-p",
]);

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
  const childEnv = buildBrowserEnv(forwardArgs);
  const closeContext = getSessionCloseContext(forwardArgs);

  if (isHelpRequest(forwardArgs)) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      env: childEnv,
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

  const child = spawn(command, args, { stdio: "inherit", env: childEnv });

  child.on("error", async (error: NodeJS.ErrnoException) => {
    await handleSpawnError(error);
  });

  child.on("exit", async code => {
    const exitCode = code ?? 0;
    if (exitCode === 0 && closeContext) {
      await autoUploadClosedSessionRecordings(closeContext, { silent: forwardArgs.includes("--json") });
    }
    await exitProcess(exitCode);
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

type SessionCloseContext = {
  processGroupId: string;
  session: string;
  scopedRecordingIds: Set<string>;
  fallbackRecordingIds: Set<string>;
};

function getSessionCloseContext(args: string[]): SessionCloseContext | null {
  const action = getForwardAction(args);
  if (!action || !["close", "quit", "exit"].includes(action)) {
    return null;
  }

  const session = resolveBrowserSession(args);
  const processGroupId = getSessionProcessGroupId(session);
  const scopedRecordings = getRecordings(processGroupId);
  const fallbackRecordings = getRecordings();

  return {
    processGroupId,
    session,
    scopedRecordingIds: new Set(
      scopedRecordings
        .filter(recording => recording.recordingStatus === "recording")
        .map(recording => recording.id)
    ),
    fallbackRecordingIds: new Set(
      fallbackRecordings
        .filter(recording => recording.recordingStatus === "recording")
        .map(recording => recording.id)
    ),
  };
}

async function autoUploadClosedSessionRecordings(
  context: SessionCloseContext,
  options: { silent: boolean }
) {
  const recordings = await waitForSessionRecordings(context);
  if (recordings.length === 0) {
    return;
  }

  const { accessToken } = await getAccessToken();
  if (!accessToken) {
    if (!options.silent) {
      console.log(
        `Recording(s) found for browser session "${context.session}". Run replayio login or set REPLAY_API_KEY to auto-upload.`
      );
    }
    return;
  }

  try {
    const failedIds = await uploadRecordingsInSubprocess(recordings, options);
    if (!options.silent && failedIds.length > 0) {
      console.error(
        `Automatic upload failed for browser session "${context.session}". Failed recording id(s): ${failedIds.join(", ")}`
      );
    }
  } catch (error) {
    if (!options.silent) {
      console.error(
        `Automatic upload failed for browser session "${context.session}": ${formatError(error)}`
      );
    }
  }
}

async function uploadRecordingsInSubprocess(
  recordings: LocalRecording[],
  options: { silent: boolean }
) {
  const failedIds: string[] = [];
  for (const recording of recordings) {
    const exitCode = await runReplayioSubprocess(["upload", recording.id], options);
    if (exitCode !== 0) {
      failedIds.push(recording.id);
    }
  }
  return failedIds;
}

async function runReplayioSubprocess(args: string[], options: { silent: boolean }) {
  const replayio = resolveReplayioCommand();
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(replayio.command, [...replayio.args, ...args], {
      env: process.env,
      stdio: options.silent ? "ignore" : "inherit",
    });

    child.on("error", reject);
    child.on("exit", code => {
      resolve(code ?? 1);
    });
  });
}

async function waitForSessionRecordings(context: SessionCloseContext): Promise<LocalRecording[]> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const scopedRecordings = getRecordings(context.processGroupId);
    const scopedUploadable = scopedRecordings.filter(
      recording => context.scopedRecordingIds.has(recording.id) && canUpload(recording)
    );

    if (scopedUploadable.length > 0) {
      return scopedUploadable;
    }

    const hasScopedPending = scopedRecordings.some(
      recording => context.scopedRecordingIds.has(recording.id) && recording.recordingStatus === "recording"
    );

    if (context.scopedRecordingIds.size === 0) {
      const fallbackRecordings = getRecordings();
      const fallbackUploadable = fallbackRecordings.filter(
        recording => context.fallbackRecordingIds.has(recording.id) && canUpload(recording)
      );

      if (fallbackUploadable.length > 0) {
        return fallbackUploadable;
      }

      const hasFallbackPending = fallbackRecordings.some(
        recording =>
          context.fallbackRecordingIds.has(recording.id) && recording.recordingStatus === "recording"
      );
      if (!hasFallbackPending) {
        return [];
      }
    } else if (!hasScopedPending) {
      return [];
    }

    if (attempt < 5) {
      await sleep(1000);
    }
  }

  return [];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getForwardArgs(): string[] {
  const argv = process.argv;
  const index = argv.findIndex(arg => arg === "browser");
  if (index === -1) {
    return [];
  }
  return argv.slice(index + 1);
}

function getForwardAction(args: string[]): string | undefined {
  let consumeNext = false;
  for (const arg of args) {
    if (consumeNext) {
      consumeNext = false;
      continue;
    }

    if (arg === "--") {
      return undefined;
    }

    if (arg.startsWith("--")) {
      const key = arg.split("=", 1)[0];
      if (OPTIONS_WITH_VALUES.has(key) && !arg.includes("=")) {
        consumeNext = true;
      }
      continue;
    }

    if (arg.startsWith("-")) {
      if (OPTIONS_WITH_VALUES.has(arg)) {
        consumeNext = true;
      }
      continue;
    }

    return arg;
  }

  return undefined;
}

function resolveBrowserSession(args: string[]): string {
  let session = process.env.AGENT_BROWSER_SESSION || "default";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--session") {
      session = args[i + 1] ?? session;
      i += 1;
      continue;
    }
    if (arg.startsWith("--session=")) {
      session = arg.slice("--session=".length);
    }
  }
  return session;
}

function getSessionProcessGroupId(session: string): string {
  return `agent-browser-session:${session}`;
}

function buildBrowserEnv(args: string[]): NodeJS.ProcessEnv {
  const session = resolveBrowserSession(args);
  const processGroupId = getSessionProcessGroupId(session);

  let metadata: Record<string, unknown> = {};
  const rawMetadata = process.env.RECORD_REPLAY_METADATA;
  if (rawMetadata) {
    try {
      const parsed = JSON.parse(rawMetadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid user-provided metadata and continue with session metadata.
    }
  }

  return {
    ...process.env,
    RECORD_REPLAY_METADATA: JSON.stringify({
      ...metadata,
      browserSession: session,
      processGroupId,
    }),
  };
}

function resolveReplayioCommand(): ResolvedCommand {
  const argv1 = process.argv[1];
  if (argv1 && existsSync(argv1)) {
    if (argv1.endsWith(".js") || argv1.endsWith(".mjs")) {
      return { command: process.execPath, args: [argv1] };
    }
    return { command: argv1, args: [] };
  }
  return { command: "replayio", args: [] };
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
