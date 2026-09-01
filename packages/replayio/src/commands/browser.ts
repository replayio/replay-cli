import { spawn, spawnSync } from "child_process";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { canUpload } from "@replay-cli/shared/recording/canUpload";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { program } from "commander";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import type { LocalRecording } from "@replay-cli/shared/recording/types";
import { getBrowserPath } from "../utils/browser/getBrowserPath";

type ResolvedCommand = {
  command: string;
  args: string[];
};

type StoredSnippet = {
  code: string;
  command: string;
  timestamp: string;
};

type GeneratedTest = {
  testCode: string;
  steps: string[];
};

type BrowserJsonResult = {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
};

const ENV_PATH_KEYS = [
  "REPLAYIO_PLAYWRIGHT_CLI_PATH",
  "REPLAY_PLAYWRIGHT_CLI_PATH",
];
const PLAYWRIGHT_EXECUTABLE_PATH_ENV = "PLAYWRIGHT_MCP_EXECUTABLE_PATH";
const PLAYWRIGHT_SESSION_FLAG = "-s";
const SNIPPET_STORE_DIR = path.join(os.tmpdir(), "replayio-browser-snippets");
const SNIPPET_STORE_VERSION = 1;

const OPTIONS_WITH_VALUES = new Set([
  "--profile",
  "--state",
  "--headers",
  "--extension",
  "--args",
  "--user-agent",
  "--proxy",
  "--proxy-bypass",
  "--provider",
  "--device",
  "--cdp",
  "--config",
  "--browser",
  PLAYWRIGHT_SESSION_FLAG,
]);

program
  .command("browser")
  .description("Proxy to the bundled Replay Playwright CLI")
  .allowUnknownOption()
  .allowExcessArguments(true)
  .helpOption(false)
  .action(runBrowser);

async function runBrowser() {
  const forwardArgs = getForwardArgs();
  const jsonMode = forwardArgs.includes("--json");
  const normalizedArgs = normalizePlaywrightCliArgs(forwardArgs);
  const helpRequested = isHelpRequest(normalizedArgs);
  const action = getForwardAction(normalizedArgs);
  const session = resolveBrowserSession(normalizedArgs);

  let childEnv: NodeJS.ProcessEnv;
  try {
    childEnv = buildBrowserEnv(normalizedArgs);
  } catch (error) {
    if (jsonMode) {
      process.stdout.write(
        `${JSON.stringify({
          success: false,
          data: {},
          error: formatError(error),
        } satisfies BrowserJsonResult)}\n`
      );
    } else {
      console.error(formatError(error));
    }
    await exitProcess(1);
    return;
  }

  const resolved = resolvePlaywrightCliCommand();
  const command = resolved?.command ?? "playwright-cli";
  const args = [...(resolved?.args ?? []), ...normalizedArgs];
  const closeContext = getSessionCloseContext(normalizedArgs);

  if (action === "open") {
    clearSessionSnippets(session);
  }

  if (helpRequested) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      env: childEnv,
    });

    if (result.error) {
      if (jsonMode) {
        process.stdout.write(
          `${JSON.stringify({
            success: false,
            data: {},
            error: result.error.message,
          } satisfies BrowserJsonResult)}\n`
        );
      } else {
        await handleSpawnError(result.error);
      }
      await exitProcess(1);
      return;
    }

    if (result.stdout) {
      process.stdout.write(rewriteHelpOutput(result.stdout));
    }
    if (result.stderr) {
      process.stderr.write(rewriteHelpOutput(result.stderr));
    }

    await exitProcess(result.status ?? 0);
    return;
  }

  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: childEnv });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", chunk => {
    const text = String(chunk);
    stdout += text;
    if (!jsonMode) {
      process.stdout.write(text);
    }
  });

  child.stderr.on("data", chunk => {
    const text = String(chunk);
    stderr += text;
    if (!jsonMode) {
      process.stderr.write(text);
    }
  });

  child.on("error", async (error: NodeJS.ErrnoException) => {
    if (jsonMode) {
      process.stdout.write(
        `${JSON.stringify({
          success: false,
          data: {},
          error: error.message,
        } satisfies BrowserJsonResult)}\n`
      );
      await exitProcess(1);
      return;
    }

    await handleSpawnError(error);
  });

  child.on("exit", async code => {
    const exitCode = code ?? 0;
    const capturedBlocks = extractPlaywrightCodeBlocks(`${stdout}\n${stderr}`);
    if (capturedBlocks.length > 0) {
      appendSessionSnippets(session, action ?? "unknown", capturedBlocks);
    }

    let generatedTest: GeneratedTest | null = null;
    if (exitCode === 0 && isCloseAction(action)) {
      generatedTest = generateTestForSession(session);
    }

    if (jsonMode) {
      const payload = buildJsonResult({
        args: normalizedArgs,
        stdout,
        stderr,
        exitCode,
        generatedTest,
      });
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    } else if (generatedTest) {
      printGeneratedTest(generatedTest, session);
    }

    if (exitCode === 0 && closeContext) {
      await autoUploadClosedSessionRecordings(closeContext, { silent: jsonMode });
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

function isCloseAction(action: string | undefined): boolean {
  return action === "close";
}

function rewriteHelpOutput(text: string): string {
  return text.replace(/\bplaywright-cli\b/g, "replayio browser");
}

async function handleSpawnError(error: NodeJS.ErrnoException) {
  if (error.code === "ENOENT") {
    const help = [
      "Replay Playwright CLI not found.",
      "",
      "Reinstall replayio or point to a local build with:",
      "  export REPLAYIO_PLAYWRIGHT_CLI_PATH=/path/to/playwright-cli/bin/playwright-cli.js",
    ].join("\n");
    console.error(help);
  } else {
    console.error(`Failed to launch playwright-cli: ${error.message}`);
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
  if (!isCloseAction(action)) {
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
        `Automatic upload failed for browser session "${
          context.session
        }". Failed recording id(s): ${failedIds.join(", ")}`
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
  if (context.scopedRecordingIds.size === 0 && context.fallbackRecordingIds.size === 0) {
    return [];
  }

  const pollIntervalMs = 1000;
  const maxWaitMs = 20000;
  const maxAttempts = Math.floor(maxWaitMs / pollIntervalMs) + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const scopedRecordings = getRecordings(context.processGroupId);
    const scopedUploadable = scopedRecordings.filter(
      recording => context.scopedRecordingIds.has(recording.id) && canUpload(recording)
    );

    if (scopedUploadable.length > 0) {
      return scopedUploadable;
    }

    if (context.scopedRecordingIds.size === 0) {
      const fallbackRecordings = getRecordings();
      const fallbackUploadable = fallbackRecordings.filter(
        recording => context.fallbackRecordingIds.has(recording.id) && canUpload(recording)
      );

      if (fallbackUploadable.length > 0) {
        return fallbackUploadable;
      }
    }

    if (attempt < maxAttempts - 1) {
      await sleep(pollIntervalMs);
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

function normalizePlaywrightCliArgs(args: string[]): string[] {
  return args.filter(arg => arg !== "--json");
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
  let session = process.env.PLAYWRIGHT_CLI_SESSION || "default";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === PLAYWRIGHT_SESSION_FLAG) {
      session = args[i + 1] ?? session;
      i += 1;
      continue;
    }
    if (arg.startsWith(`${PLAYWRIGHT_SESSION_FLAG}=`)) {
      session = arg.slice(`${PLAYWRIGHT_SESSION_FLAG}=`.length);
    }
  }
  return session;
}

function getSessionProcessGroupId(session: string): string {
  return `playwright-cli-session:${session}`;
}

function buildBrowserEnv(args: string[]): NodeJS.ProcessEnv {
  const session = resolveBrowserSession(args);
  const processGroupId = getSessionProcessGroupId(session);
  const action = getForwardAction(args);

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

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RECORD_ALL_CONTENT: process.env.RECORD_ALL_CONTENT || "1",
    RECORD_REPLAY_METADATA: JSON.stringify({
      ...metadata,
      browserSession: session,
      processGroupId,
    }),
    RECORD_REPLAY_VERBOSE: process.env.RECORD_REPLAY_VERBOSE || "1",
  };

  const shouldSetExecutablePath =
    !isHelpRequest(args) &&
    action !== "install" &&
    action !== "install-browser" &&
    !env[PLAYWRIGHT_EXECUTABLE_PATH_ENV];

  if (shouldSetExecutablePath) {
    const executablePath = getBrowserPath();
    if (!existsSync(executablePath)) {
      throw new Error(
        `Replay Browser not found at ${executablePath}. Run 'replayio install' to install it.`
      );
    }

    env[PLAYWRIGHT_EXECUTABLE_PATH_ENV] = executablePath;
  }

  if (!env.PLAYWRIGHT_CLI_SESSION) {
    env.PLAYWRIGHT_CLI_SESSION = session;
  }

  return env;
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

function resolvePlaywrightCliCommand(): ResolvedCommand | null {
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
    const pkgPath = require.resolve("@playwright/cli/package.json");
    const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const binValue = pkgJson.bin;
    const binRelative =
      typeof binValue === "string"
        ? binValue
        : binValue?.["playwright-cli"] ?? binValue?.playwright ?? Object.values(binValue ?? {})[0];

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

function extractPlaywrightCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const pattern = /### Ran Playwright code\s*```(?:\w+)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const code = match[1]?.trim();
    if (code) {
      blocks.push(code);
    }
  }

  return blocks;
}

function appendSessionSnippets(session: string, command: string, codeBlocks: string[]) {
  const previous = readSessionSnippets(session);
  const next = [
    ...previous,
    ...codeBlocks.map(
      code =>
        ({
          code,
          command,
          timestamp: new Date().toISOString(),
        }) satisfies StoredSnippet
    ),
  ];
  writeSessionSnippets(session, next);
}

function clearSessionSnippets(session: string) {
  const filePath = getSessionStorePath(session);
  try {
    rmSync(filePath, { force: true });
  } catch {
    // Best effort cleanup.
  }
}

function generateTestForSession(session: string): GeneratedTest | null {
  const snippets = readSessionSnippets(session);
  if (snippets.length === 0) {
    clearSessionSnippets(session);
    return null;
  }

  const steps = snippets.map(snippet => summarizeSnippet(snippet.code));
  const lines: string[] = [];
  lines.push(`import { test } from "@playwright/test";`);
  lines.push("");
  lines.push(`test("replayio browser session ${escapeForDoubleQuotedString(session)}", async ({ page }) => {`);

  snippets.forEach((snippet, index) => {
    lines.push(`  // Step ${index + 1}: ${snippet.command}`);
    snippet.code.split(/\r?\n/).forEach(codeLine => {
      lines.push(`  ${codeLine}`);
    });
    lines.push("");
  });

  lines.push("});");

  clearSessionSnippets(session);

  return {
    testCode: lines.join("\n"),
    steps,
  };
}

function printGeneratedTest(generated: GeneratedTest, session: string) {
  process.stdout.write(`\n### Deterministic Playwright Test (${session})\n`);
  process.stdout.write("```ts\n");
  process.stdout.write(`${generated.testCode.trimEnd()}\n`);
  process.stdout.write("```\n");
  process.stdout.write(`### Steps (${generated.steps.length})\n`);
  generated.steps.forEach((step, index) => {
    process.stdout.write(`${index + 1}. ${step}\n`);
  });
}

function summarizeSnippet(code: string): string {
  const firstLine = code
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  const summary = firstLine || "(empty snippet)";
  return summary.length > 140 ? `${summary.slice(0, 137)}...` : summary;
}

function escapeForDoubleQuotedString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getSessionStorePath(session: string): string {
  return path.join(SNIPPET_STORE_DIR, `${sanitizeSessionName(session)}.json`);
}

function sanitizeSessionName(session: string): string {
  return session.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function readSessionSnippets(session: string): StoredSnippet[] {
  const filePath = getSessionStorePath(session);
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      version?: number;
      snippets?: StoredSnippet[];
    };
    if (parsed?.version !== SNIPPET_STORE_VERSION || !Array.isArray(parsed.snippets)) {
      return [];
    }

    return parsed.snippets.filter(
      snippet =>
        Boolean(snippet) &&
        typeof snippet.code === "string" &&
        typeof snippet.command === "string" &&
        typeof snippet.timestamp === "string"
    );
  } catch {
    return [];
  }
}

function writeSessionSnippets(session: string, snippets: StoredSnippet[]) {
  mkdirSync(SNIPPET_STORE_DIR, { recursive: true });
  const filePath = getSessionStorePath(session);
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        version: SNIPPET_STORE_VERSION,
        snippets,
      },
      null,
      2
    )
  );
}

function buildJsonResult(input: {
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  generatedTest: GeneratedTest | null;
}): BrowserJsonResult {
  const data: Record<string, unknown> = {};
  const action = getForwardAction(input.args);
  const screenshotPath = extractMarkdownLinkTarget(input.stdout, "Screenshot");
  const snapshotPath = extractMarkdownLinkTarget(input.stdout, "Snapshot");
  const maybeUrl = extractPageField(input.stdout, "Page URL");
  const maybeTitle = extractPageField(input.stdout, "Page Title");
  const evalResult = extractResultValue(input.stdout);

  if (screenshotPath) {
    data.path = screenshotPath;
  }

  if (snapshotPath) {
    data.snapshot = snapshotPath;
    data.refs = {};
  }

  if (maybeUrl) {
    data.url = maybeUrl;
  }

  if (maybeTitle) {
    data.title = maybeTitle;
  }

  if (evalResult !== undefined) {
    data.result = evalResult;
  }

  if (
    action === "eval" &&
    input.args[1] === "() => location.href" &&
    typeof evalResult === "string"
  ) {
    data.url = evalResult;
  }

  if (
    action === "eval" &&
    input.args[1] === "() => document.title" &&
    typeof evalResult === "string"
  ) {
    data.title = evalResult;
  }

  if (action === "list") {
    data.sessions = extractSessionNamesFromList(input.stdout);
  }

  if (input.generatedTest) {
    data.generatedTest = input.generatedTest.testCode;
    data.generatedSteps = input.generatedTest.steps;
  }

  if (input.exitCode !== 0) {
    return {
      success: false,
      data,
      error: input.stderr.trim() || input.stdout.trim() || `Command exited with code ${input.exitCode}`,
    };
  }

  return {
    success: true,
    data,
  };
}

function extractMarkdownLinkTarget(text: string, label: string): string | undefined {
  const regex = new RegExp(`- \\[${escapeRegex(label)}\\]\\(([^)]+)\\)`);
  const match = text.match(regex);
  return match?.[1];
}

function extractPageField(text: string, key: string): string | undefined {
  const regex = new RegExp(`- ${escapeRegex(key)}:\\s*(.+)`);
  const match = text.match(regex);
  return match?.[1]?.trim();
}

function extractResultValue(text: string): unknown {
  const match = text.match(/### Result\s*([\s\S]*?)(?:\n### |\s*$)/);
  if (!match?.[1]) {
    return undefined;
  }

  const raw = match[1].trim();
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractSessionNamesFromList(text: string): string[] {
  const sessions: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^- ([^:]+):\s*$/);
    if (match?.[1]) {
      sessions.push(match[1].trim());
    }
  }
  return sessions;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
