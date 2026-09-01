import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { getReplayPath } from "@replay-cli/shared/getReplayPath";
import { printTable } from "@replay-cli/shared/printTable";
import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { canUpload } from "@replay-cli/shared/recording/canUpload";
import { getRecordings } from "@replay-cli/shared/recording/getRecordings";
import type { LocalRecording } from "@replay-cli/shared/recording/types";
import { dim, statusFailed, statusSuccess } from "@replay-cli/shared/theme";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { program } from "commander";
import { fetch } from "undici";
import { replayApiServer, replayAppHost } from "../config";
import { initialize } from "../utils/initialization/initialize";

const DEFAULT_MAX_STEPS = parsePositiveInteger(process.env.REPLAY_AGENT_MAX_STEPS, 12);
const DEFAULT_MODEL = process.env.REPLAY_AGENT_MODEL || "claude-opus-4-6";
const DEFAULT_ANALYZE_ENDPOINT =
  process.env.REPLAY_AGENT_ANALYZE_ENDPOINT || `https://dispatch.replay.io/nut/analyze`;
const AGENT_HISTORY_PATH = getReplayPath("profile", "agent-history.json");
const AGENT_HISTORY_VERSION = 1;
const AGENT_HISTORY_LIMIT = parsePositiveInteger(process.env.REPLAY_AGENT_HISTORY_LIMIT, 200);
const MIN_AGENT_ACTIONS_BEFORE_DONE = 1;
const UPLOAD_PROGRESS_HEARTBEAT_MS = 5000;
const ANTHROPIC_MESSAGES_ENDPOINT =
  process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
const DISALLOWED_ACTIONS = new Set(["close", "close-all", "kill-all", "install", "install-browser"]);
const SYSTEM_PROMPT = [
  "You are a QA reproduction agent controlling Replay Browser through replayio browser commands.",
  "Your goal is to reproduce the reported bug and capture it in the recording.",
  'Reply with exactly one JSON object. No markdown, no prose outside JSON. Use schema: {"done":boolean,"successful":boolean,"summary":string,"command":{"action":string,"args":string[]}|null}.',
  "Rules:",
  "- One command per turn.",
  "- Prefer compact, deterministic actions.",
  "- The session already starts at the provided URL; continue from that page unless a navigation is necessary.",
  "- Do not change to unrelated domains unless the goal explicitly requires it.",
  "- You must run at least one browser action after the initial open before you are allowed to finish.",
  "- Use snapshot frequently to discover refs before click/fill actions.",
  '- Use action "assert" to add deterministic Playwright expectations to the generated test. Format: {"action":"assert","args":["expect(page.getByText(\\"Expected\\")).toBeVisible()"]}.',
  "- Assertions should represent the correct expected behavior so reruns fail until the bug is fixed.",
  "- Add at least one assert command before finishing.",
  "- Never use close, close-all, kill-all, install, or install-browser.",
  '- When the goal has been completed, return {"done":true,"successful":true,...} with command null.',
  '- If blocked after multiple attempts, return {"done":true,"successful":false,...} with command null.',
].join("\n");

type ResolvedCommand = {
  command: string;
  args: string[];
};

type AgentOptions = {
  all?: boolean;
  analyzeEndpoint?: string;
  failed?: boolean;
  headed?: boolean;
  id?: string;
  ids?: string;
  json?: boolean;
  limit?: number;
  maxSteps?: number;
  model?: string;
  passed?: boolean;
  session?: string;
  tests?: boolean;
  url?: string;
};

type StepTranscript = {
  action: string;
  args: string[];
  error?: string;
  exitCode: number;
  snapshotPath?: string;
  success: boolean;
  title?: string;
  url?: string;
};

type BrowserCommandResult = {
  action: string;
  args: string[];
  exitCode: number;
  error?: string;
  snapshot?: string;
  snapshotPath?: string;
  stderr: string;
  stdout: string;
  success: boolean;
  title?: string;
  url?: string;
};

type SubprocessResult = {
  error?: string;
  exitCode: number;
  stderr: string;
  stdout: string;
};

type AgentDecision = {
  command: {
    action: string;
    args: string[];
  } | null;
  done: boolean;
  successful: boolean;
  summary: string;
};

type AnthropicTextBlock = {
  text: string;
  type: "text";
};

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
  error?: {
    message?: string;
  };
};

type AgentRunAnalysis = {
  attempted: boolean;
  body?: string;
  ok?: boolean;
  reason?: string;
  status?: number;
};

type AgentRunHistoryEntry = {
  analysis?: AgentRunAnalysis;
  durationMs: number;
  endedAt: string;
  error?: string;
  generatedTest?: string;
  goal: string;
  goalSucceeded: boolean;
  headed: boolean;
  id: string;
  initialUrl: string;
  maxSteps: number;
  model: string;
  recordingId?: string;
  replayUrl?: string;
  session: string;
  startedAt: string;
  status: "failed" | "passed";
  summary: string;
  transcript: StepTranscript[];
};

type AgentRunHistoryFile = {
  runs: AgentRunHistoryEntry[];
  version: number;
};

type LiveTestState = {
  closed: boolean;
  lines: string[];
  stepCount: number;
};

type AgentCommand = {
  action: string;
  args: string[];
};

program
  .command("agent [urlOrGoal] [goal...]")
  .description(
    "Drive replayio browser commands in an Anthropic-powered agent loop and submit analysis"
  )
  .option("--url <url>", "Initial URL to open before the loop starts (required for run mode)")
  .option("--session <name>", "Browser session name (default: generated)")
  .option("--max-steps <count>", "Maximum agent browser actions", parseIntegerOption)
  .option("--headed", "Run browser in headed mode (default: headless)")
  .option("--model <name>", "Anthropic model (default from REPLAY_AGENT_MODEL)")
  .option("--analyze-endpoint <url>", "Replay analyze endpoint URL")
  .option("--json", "JSON output for history mode")
  .option("--limit <count>", "Maximum history rows in history mode", parseIntegerOption)
  .option("--tests", "Output selected history tests to stdout")
  .option("--id <runId>", "History run id selector (test output mode)")
  .option("--ids <runIds>", "Comma-separated history run ids (test output mode)")
  .option("--all", "Select all history runs (test output mode)")
  .option("--passed", "Select passed history runs (test output mode)")
  .option("--failed", "Select failed history runs (test output mode)")
  .action(runAgent);

async function runAgent(urlOrGoal: string | undefined, goalTokens: string[] = [], options: AgentOptions = {}) {
  if (urlOrGoal === "history") {
    await runAgentHistory(goalTokens, options);
    return;
  }

  const parsedInput = parseAgentInput(urlOrGoal, goalTokens, options.url);
  if (!parsedInput) {
    console.error(
      'Usage: replayio agent <url> "<goal>"\n' +
        '   or: replayio agent --url <url> "<goal>"\n' +
        "   or: replayio agent history"
    );
    await exitProcess(1);
    return;
  }

  const startedAtMs = Date.now();
  const model = options.model || DEFAULT_MODEL;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const headed = options.headed === true;
  const initialUrl = parsedInput.url;
  const goal = parsedInput.goal;
  const session = options.session || `agent-${Date.now().toString(36)}`;
  const analyzeEndpoint = options.analyzeEndpoint || DEFAULT_ANALYZE_ENDPOINT;
  const processGroupId = getSessionProcessGroupId(session);
  const transcript: StepTranscript[] = [];
  const historyEntry: AgentRunHistoryEntry = {
    durationMs: 0,
    endedAt: "",
    goal,
    goalSucceeded: false,
    headed,
    id: makeAgentRunId(),
    initialUrl,
    maxSteps,
    model,
    session,
    startedAt: new Date(startedAtMs).toISOString(),
    status: "failed",
    summary: "",
    transcript,
  };

  const finalizeRun = async (exitCode: number) => {
    const endedAtMs = Date.now();
    historyEntry.endedAt = new Date(endedAtMs).toISOString();
    historyEntry.durationMs = endedAtMs - startedAtMs;
    historyEntry.status = historyEntry.goalSucceeded ? "passed" : "failed";
    historyEntry.summary ||= exitCode === 0 ? "Completed." : "Failed.";
    historyEntry.transcript = [...transcript];
    appendAgentRunToHistory(historyEntry);
    await exitProcess(exitCode);
  };

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    const message = "Missing ANTHROPIC_API_KEY. Set it before running replayio agent.";
    console.error(message);
    historyEntry.error = message;
    historyEntry.summary = message;
    await finalizeRun(1);
    return;
  }

  try {
    await initialize({
      checkForNpmUpdate: true,
      checkForRuntimeUpdate: true,
      requireAuthentication: true,
    });
  } catch (error) {
    const message = `Initialization failed: ${formatError(error)}`;
    console.error(message);
    historyEntry.error = message;
    historyEntry.summary = message;
    await finalizeRun(1);
    return;
  }

  console.log(`Starting agent session "${session}"`);
  const openResult = await runBrowserCommand(session, "open", [initialUrl], {
    headed,
  });
  if (!openResult.success) {
    const message = formatBrowserFailure(openResult);
    console.error(message);
    historyEntry.error = message;
    historyEntry.summary = "Failed to open browser session.";
    await finalizeRun(1);
    return;
  }
  const liveTest = startLiveTest(goal);
  appendLiveTestCodeFromCommand(liveTest, openResult);

  let loopSummary = "";
  let goalSucceeded = false;
  let loopActionsExecuted = 0;
  try {
    const loopResult = await runAgentLoop({
      anthropicApiKey,
      goal,
      maxSteps,
      model,
      onCommandResult: commandResult => {
        appendLiveTestCodeFromCommand(liveTest, commandResult);
      },
      session,
      transcript,
    });
    loopSummary = loopResult.summary;
    goalSucceeded = loopResult.goalSucceeded;
    loopActionsExecuted = loopResult.actionsExecuted;
  } catch (error) {
    loopSummary = `Agent loop failed: ${formatError(error)}`;
    console.error(loopSummary);
    historyEntry.error = loopSummary;
    goalSucceeded = false;
  }
  historyEntry.goalSucceeded = goalSucceeded;
  historyEntry.summary = loopSummary || (goalSucceeded ? "Goal completed." : "Goal not completed.");
  const generatedTest = finalizeLiveTest(liveTest);
  historyEntry.generatedTest = generatedTest;
  console.log(`Agent loop finished after ${loopActionsExecuted} action(s). goalSucceeded=${goalSucceeded}`);

  const closeResult = await runBrowserCommand(session, "close", []);
  if (!closeResult.success) {
    const closeError = formatBrowserFailure(closeResult);
    console.error(`Failed to close session "${session}": ${closeError}`);
    historyEntry.error = historyEntry.error
      ? `${historyEntry.error}; close failed: ${closeError}`
      : `Close failed: ${closeError}`;
  }

  const recording = await resolveSessionRecording(processGroupId);
  if (!recording) {
    const message = `No recording found for session "${session}" (${processGroupId}).`;
    console.error(message);
    historyEntry.error = historyEntry.error ? `${historyEntry.error}; ${message}` : message;
    historyEntry.summary ||= message;
    await finalizeRun(1);
    return;
  }

  const uploadedRecording = await ensureRecordingUploaded(recording);
  if (!uploadedRecording || uploadedRecording.uploadStatus !== "uploaded") {
    const { accessToken } = await getAccessToken();
    const message =
      `Recording ${recording.id} was not uploaded. ` +
      `recordingStatus=${uploadedRecording?.recordingStatus ?? recording.recordingStatus}, ` +
      `uploadStatus=${uploadedRecording?.uploadStatus ?? "unknown"}.` +
      (accessToken
        ? ""
        : " No Replay auth token found (run `replayio login` or set `REPLAY_API_KEY`).");
    console.error(message);
    historyEntry.recordingId = recording.id;
    historyEntry.error = historyEntry.error ? `${historyEntry.error}; ${message}` : message;
    historyEntry.summary ||= message;
    await finalizeRun(1);
    return;
  }

  const replayUrl = `${replayAppHost}/recording/${uploadedRecording.id}`;
  historyEntry.recordingId = uploadedRecording.id;
  historyEntry.replayUrl = replayUrl;
  console.log(`Recording captured: ${replayUrl}`);
  console.log(`Goal status: ${goalSucceeded ? "successful" : "unsuccessful"}`);

  if (!goalSucceeded && analyzeEndpoint) {
    const analyzeResult = await callAnalyzeEndpoint({
      analyzeEndpoint,
      goalSucceeded,
      goal,
      model,
      recordingId: uploadedRecording.id,
      replayUrl,
      session,
      summary: loopSummary,
      transcript,
    });
    historyEntry.analysis = {
      attempted: true,
      body: truncate(analyzeResult.body, 4000),
      ok: analyzeResult.ok,
      status: analyzeResult.status,
    };
    if (analyzeResult.ok) {
      console.log(`Analyze request submitted (${analyzeResult.status}).`);
    } else {
      console.error(
        `Analyze endpoint request failed (${analyzeResult.status}): ${truncate(
          analyzeResult.body,
          400
        )}`
      );
    }
  } else if (goalSucceeded) {
    console.log("Skipping analyze endpoint because the agent marked the goal as successful.");
    historyEntry.analysis = {
      attempted: false,
      reason: "goal-succeeded",
    };
  } else {
    console.log("Set REPLAY_AGENT_ANALYZE_ENDPOINT or --analyze-endpoint to call your analyze API.");
    historyEntry.analysis = {
      attempted: false,
      reason: "missing-analyze-endpoint",
    };
  }

  console.log(`Agent summary: ${loopSummary || "No summary returned."}`);
  await finalizeRun(0);
}

function parseAgentInput(
  urlOrGoal: string | undefined,
  goalTokens: string[],
  overrideUrl: string | undefined
): { goal: string; url: string } | null {
  if (!urlOrGoal && goalTokens.length === 0 && !overrideUrl) {
    return null;
  }

  if (overrideUrl) {
    const tokens = [urlOrGoal, ...goalTokens].filter((value): value is string => Boolean(value));
    if (tokens.length === 0) {
      return null;
    }
    const goal = tokens.join(" ").trim();
    if (!goal) {
      return null;
    }
    return {
      goal,
      url: overrideUrl,
    };
  }

  if (urlOrGoal && looksLikeUrl(urlOrGoal)) {
    const goal = goalTokens.join(" ").trim();
    if (!goal) {
      return null;
    }
    return {
      goal,
      url: urlOrGoal,
    };
  }

  return null;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("about:");
}

async function runAgentHistory(historyArgs: string[], options: AgentOptions) {
  const runs = readAgentHistory();
  const historySubcommand = historyArgs[0];
  const selectorRequested =
    Boolean(options.tests) ||
    Boolean(options.id || options.ids || options.all || options.passed || options.failed);

  if (historySubcommand === "copy" || historySubcommand === "tests") {
    await runAgentHistoryTests(historyArgs.slice(1), options, runs);
    return;
  }

  if (options.json) {
    if (selectorRequested) {
      console.error("Cannot combine --json with test selectors. Remove selectors or use history tests.");
      await exitProcess(1);
      return;
    }
    const limit = options.limit ?? runs.length;
    console.log(JSON.stringify(runs.slice(0, limit), null, 2));
    await exitProcess(0);
    return;
  }

  if (selectorRequested) {
    await runAgentHistoryTests(historyArgs, options, runs);
    return;
  }

  if (runs.length === 0) {
    console.log(`No agent history found at ${AGENT_HISTORY_PATH}`);
    await exitProcess(0);
    return;
  }

  const limit = options.limit ?? 30;
  const visibleRuns = runs.slice(0, limit);
  const table = printTable({
    headers: ["Run ID", "Started", "Status", "Goal", "Recording", "Analysis", "Test"],
    rows: visibleRuns.map(run => [
      run.id,
      formatHistoryDate(run.startedAt),
      run.status === "passed" ? statusSuccess("passed") : statusFailed("failed"),
      truncate(run.goal.replace(/\s+/g, " "), 52),
      run.recordingId ?? dim("-"),
      formatAnalysisCell(run.analysis),
      run.generatedTest ? statusSuccess("yes") : dim("no"),
    ]),
  });

  console.log(table);
  if (runs.length > visibleRuns.length) {
    console.log(dim(`Showing ${visibleRuns.length} of ${runs.length} runs (use --limit to adjust).`));
  }
  console.log(dim(`History file: ${AGENT_HISTORY_PATH}`));
  await exitProcess(0);
}

async function runAgentHistoryTests(
  selectorArgs: string[],
  options: AgentOptions,
  runs: AgentRunHistoryEntry[]
) {
  if (runs.length === 0) {
    console.error("No agent history available.");
    await exitProcess(1);
    return;
  }

  const selector = resolveHistorySelector(selectorArgs, options);
  if ("error" in selector) {
    console.error(selector.error);
    await exitProcess(1);
    return;
  }

  const selectedRuns = selectHistoryRuns(runs, selector);
  if (selectedRuns.length === 0) {
    console.error("No matching history runs found for that selector.");
    await exitProcess(1);
    return;
  }

  const runsWithTests = selectedRuns.filter(run => typeof run.generatedTest === "string" && run.generatedTest.trim());
  if (runsWithTests.length === 0) {
    console.error("Matched runs do not contain generated tests.");
    await exitProcess(1);
    return;
  }

  const payload = buildCopiedTestsPayload(runsWithTests);
  process.stdout.write(payload);
  if (!payload.endsWith("\n")) {
    process.stdout.write("\n");
  }
  await exitProcess(0);
}

function resolveHistorySelector(
  selectorArgs: string[],
  options: AgentOptions
):
  | { mode: "all" | "failed" | "passed" }
  | { ids: string[]; mode: "ids" }
  | { error: string } {
  const idsFromOptions = [
    ...(options.id ? [options.id] : []),
    ...parseCommaSeparatedValues(options.ids),
  ];
  const selectorFlags = [
    options.all ? "all" : undefined,
    options.passed ? "passed" : undefined,
    options.failed ? "failed" : undefined,
    idsFromOptions.length > 0 ? "ids" : undefined,
  ].filter((value): value is string => Boolean(value));

  if (selectorFlags.length > 1) {
    return { error: "History test selectors are mutually exclusive. Use only one of --all/--passed/--failed/--id/--ids." };
  }

  if (idsFromOptions.length > 0) {
    return { ids: normalizeIdTokens(idsFromOptions), mode: "ids" };
  }

  if (options.all) {
    return { mode: "all" };
  }
  if (options.passed) {
    return { mode: "passed" };
  }
  if (options.failed) {
    return { mode: "failed" };
  }

  if (selectorArgs.length === 0) {
    return { mode: "all" };
  }

  const firstToken = selectorArgs[0];
  if (firstToken === "all" || firstToken === "passed" || firstToken === "failed") {
    if (selectorArgs.length > 1) {
      return { error: `Unexpected extra selector arguments after "${firstToken}".` };
    }
    return { mode: firstToken };
  }

  return { ids: normalizeIdTokens(selectorArgs), mode: "ids" };
}

function selectHistoryRuns(
  runs: AgentRunHistoryEntry[],
  selector: { mode: "all" | "failed" | "passed" } | { ids: string[]; mode: "ids" }
) {
  switch (selector.mode) {
    case "all":
      return runs;
    case "failed":
      return runs.filter(run => run.status === "failed");
    case "passed":
      return runs.filter(run => run.status === "passed");
    case "ids":
      return selectRunsByIds(runs, selector.ids);
    default:
      return runs;
  }
}

function selectRunsByIds(runs: AgentRunHistoryEntry[], ids: string[]) {
  const selected: AgentRunHistoryEntry[] = [];
  for (const idToken of ids) {
    const exact = runs.find(run => run.id === idToken);
    if (exact) {
      selected.push(exact);
      continue;
    }

    const prefixed = runs.filter(run => run.id.startsWith(idToken));
    if (prefixed.length === 1) {
      selected.push(prefixed[0]);
    }
  }

  return dedupeRunsById(selected);
}

function buildCopiedTestsPayload(runs: AgentRunHistoryEntry[]) {
  if (runs.length === 1) {
    return runs[0].generatedTest?.trim() || "";
  }

  return runs
    .map(
      run =>
        [
          `// Run ${run.id} (${run.status})`,
          `// Goal: ${run.goal.replace(/\s+/g, " ")}`,
          run.generatedTest?.trim() || "",
        ].join("\n")
    )
    .join("\n\n");
}

function formatAnalysisCell(analysis: AgentRunAnalysis | undefined) {
  if (!analysis) {
    return dim("-");
  }
  if (!analysis.attempted) {
    return dim(`skipped${analysis.reason ? ` (${analysis.reason})` : ""}`);
  }
  if (analysis.ok) {
    return statusSuccess(`ok ${analysis.status ?? ""}`.trim());
  }
  return statusFailed(`failed ${analysis.status ?? ""}`.trim());
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function normalizeIdTokens(values: string[]) {
  return values
    .flatMap(value => value.split(","))
    .map(value => value.trim())
    .filter(Boolean);
}

function parseCommaSeparatedValues(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function dedupeRunsById(runs: AgentRunHistoryEntry[]) {
  const ids = new Set<string>();
  return runs.filter(run => {
    if (ids.has(run.id)) {
      return false;
    }
    ids.add(run.id);
    return true;
  });
}

function makeAgentRunId() {
  return `ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAgentHistory(): AgentRunHistoryEntry[] {
  if (!existsSync(AGENT_HISTORY_PATH)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(AGENT_HISTORY_PATH, "utf8")) as AgentRunHistoryFile;
    if (!parsed || parsed.version !== AGENT_HISTORY_VERSION || !Array.isArray(parsed.runs)) {
      return [];
    }
    return parsed.runs.filter(isAgentRunHistoryEntry);
  } catch {
    return [];
  }
}

function appendAgentRunToHistory(run: AgentRunHistoryEntry) {
  const runs = [run, ...readAgentHistory()].slice(0, AGENT_HISTORY_LIMIT);
  const payload: AgentRunHistoryFile = {
    runs,
    version: AGENT_HISTORY_VERSION,
  };
  mkdirSync(path.dirname(AGENT_HISTORY_PATH), { recursive: true });
  writeFileSync(AGENT_HISTORY_PATH, JSON.stringify(payload, null, 2));
}

function isAgentRunHistoryEntry(value: unknown): value is AgentRunHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as Partial<AgentRunHistoryEntry>;
  return (
    typeof maybe.id === "string" &&
    typeof maybe.goal === "string" &&
    typeof maybe.startedAt === "string" &&
    typeof maybe.status === "string" &&
    Array.isArray(maybe.transcript)
  );
}

async function runAgentLoop(input: {
  anthropicApiKey: string;
  goal: string;
  maxSteps: number;
  model: string;
  onCommandResult?: (result: BrowserCommandResult) => void;
  session: string;
  transcript: StepTranscript[];
}) {
  const messages: { content: string; role: "assistant" | "user" }[] = [];
  let actionsExecuted = 0;
  let assertionsAdded = 0;
  messages.push({
    role: "user",
    content: [
      `Bug report: ${input.goal}`,
      `Current session: ${input.session}`,
      "The browser is already open.",
      'You can add test expectations using command {"action":"assert","args":["expect(...)"]}.',
      "Decide the first command.",
    ].join("\n"),
  });

  for (let step = 1; step <= input.maxSteps; step += 1) {
    const assistantText = await requestAgentDecision({
      anthropicApiKey: input.anthropicApiKey,
      messages,
      model: input.model,
    });
    const decision = parseAgentDecision(assistantText);

    messages.push({ role: "assistant", content: assistantText });

    if (!decision) {
      messages.push({
        role: "user",
        content:
          'Invalid response. Return strict JSON only using schema {"done":boolean,"successful":boolean,"summary":string,"command":{"action":string,"args":string[]}|null}.',
      });
      continue;
    }

    if (decision.done || !decision.command) {
      if (actionsExecuted < MIN_AGENT_ACTIONS_BEFORE_DONE) {
        messages.push({
          role: "user",
          content:
            "Do not finish yet. You must execute at least one browser action beyond the initial open before returning done=true.",
        });
        continue;
      }
      if (assertionsAdded < 1) {
        messages.push({
          role: "user",
          content:
            'Before finishing, add at least one assert command. Example: {"command":{"action":"assert","args":["expect(page.getByText(\\"Expected\\")).toBeVisible()"]}}',
        });
        continue;
      }
      return {
        actionsExecuted,
        goalSucceeded: decision.successful,
        summary: decision.summary || (decision.successful ? "Goal completed." : "Stopped."),
      };
    }

    const command = normalizeAgentCommand(decision.command);
    if (DISALLOWED_ACTIONS.has(command.action)) {
      const blocked = `Action "${command.action}" is not allowed. Choose another action.`;
      input.transcript.push({
        action: command.action,
        args: command.args,
        error: blocked,
        exitCode: 1,
        success: false,
      });
      messages.push({ role: "user", content: blocked });
      continue;
    }

    if (command.action === "assert") {
      const assertion = normalizeAssertionCommand(command.args);
      if (!assertion.ok) {
        input.transcript.push({
          action: command.action,
          args: command.args,
          error: assertion.error,
          exitCode: 1,
          success: false,
        });
        messages.push({
          role: "user",
          content: `Invalid assert command: ${assertion.error}`,
        });
        continue;
      }

      assertionsAdded += 1;
      const syntheticResult: BrowserCommandResult = {
        action: command.action,
        args: command.args,
        exitCode: 0,
        stderr: "",
        stdout: `### Ran Playwright code\n\`\`\`ts\n${assertion.code}\n\`\`\``,
        success: true,
      };
      input.transcript.push({
        action: command.action,
        args: command.args,
        exitCode: 0,
        success: true,
      });
      input.onCommandResult?.(syntheticResult);
      messages.push({
        role: "user",
        content: formatCommandFeedback(step, syntheticResult),
      });
      continue;
    }

    const commandResult = await runBrowserCommand(input.session, command.action, command.args);
    actionsExecuted += 1;
    input.transcript.push({
      action: command.action,
      args: command.args,
      error: commandResult.error,
      exitCode: commandResult.exitCode,
      snapshotPath: commandResult.snapshotPath,
      success: commandResult.success,
      title: commandResult.title,
      url: commandResult.url,
    });
    input.onCommandResult?.(commandResult);

    messages.push({
      role: "user",
      content: formatCommandFeedback(step, commandResult),
    });
  }

  return {
    actionsExecuted,
    goalSucceeded: false,
    summary: `Reached max steps (${input.maxSteps}) before confirming reproduction.`,
  };
}

async function requestAgentDecision(input: {
  anthropicApiKey: string;
  messages: { content: string; role: "assistant" | "user" }[];
  model: string;
}) {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(ANTHROPIC_MESSAGES_ENDPOINT, {
      body: JSON.stringify({
        max_tokens: 900,
        messages: input.messages,
        model: input.model,
        system: SYSTEM_PROMPT,
        temperature: 0.2,
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": input.anthropicApiKey,
      },
      method: "POST",
    });

    let payload: AnthropicResponse | undefined;
    try {
      payload = (await response.json()) as AnthropicResponse;
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      const message = payload?.error?.message || response.statusText;
      lastError = `Anthropic request failed (${response.status}): ${message}`;
      if (response.status >= 500 && attempt < 2) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw new Error(lastError);
    }

    const text = (payload?.content ?? [])
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n")
      .trim();
    if (!text) {
      lastError = "Anthropic response did not include text.";
      if (attempt < 2) {
        await sleep(250);
        continue;
      }
      throw new Error(lastError);
    }

    return text;
  }

  throw new Error(lastError || "Unknown Anthropic error.");
}

function parseAgentDecision(text: string): AgentDecision | null {
  const rawJson = extractJsonObject(text);
  if (!rawJson) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }

  const done = parsed.done === true;
  const successful =
    parsed.successful === true || parsed.goalSucceeded === true || parsed.bugRecorded === true;
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const commandValue = (parsed.command ?? parsed.nextCommand) as Record<string, unknown> | null;

  if (done) {
    return {
      command: null,
      done,
      successful,
      summary,
    };
  }

  if (!commandValue || typeof commandValue.action !== "string") {
    return null;
  }

  const action = commandValue.action.trim();
  if (!action) {
    return null;
  }

  const args = Array.isArray(commandValue.args)
    ? commandValue.args.filter(value => typeof value === "string")
    : [];

  return {
    command: { action, args },
    done,
    successful,
    summary,
  };
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    const json = fenced[1].trim();
    if (json.startsWith("{") && json.endsWith("}")) {
      return json;
    }
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

async function runBrowserCommand(
  session: string,
  action: string,
  args: string[],
  options: { headed?: boolean } = {}
): Promise<BrowserCommandResult> {
  const browserFlags = options.headed ? ["--headed"] : [];
  const result = await runReplayioSubprocess([
    "browser",
    `-s=${session}`,
    ...browserFlags,
    action,
    ...args,
  ]);
  const snapshotPath = extractSnapshotPath(result.stdout);
  const snapshot = snapshotPath ? readSnapshot(snapshotPath) : undefined;

  return {
    action,
    args,
    exitCode: result.exitCode,
    error: result.error,
    snapshot,
    snapshotPath,
    stderr: result.stderr,
    stdout: result.stdout,
    success: result.exitCode === 0,
    title: extractPageField(result.stdout, "Page Title"),
    url: extractPageField(result.stdout, "Page URL"),
  };
}

function formatCommandFeedback(step: number, result: BrowserCommandResult): string {
  const lines = [
    `Step ${step} result`,
    `Command: ${result.action} ${result.args.join(" ")}`.trim(),
    `Exit code: ${result.exitCode}`,
    `Success: ${result.success}`,
  ];

  if (result.url) {
    lines.push(`Page URL: ${result.url}`);
  }
  if (result.title) {
    lines.push(`Page Title: ${result.title}`);
  }
  if (result.snapshotPath) {
    lines.push(`Snapshot path: ${result.snapshotPath}`);
  }
  if (result.error) {
    lines.push(`Runtime error: ${result.error}`);
  }

  if (result.stdout.trim()) {
    lines.push(`stdout:\n${truncate(result.stdout.trim(), 6000)}`);
  }
  if (result.stderr.trim()) {
    lines.push(`stderr:\n${truncate(result.stderr.trim(), 4000)}`);
  }
  if (result.snapshot && result.snapshot.trim()) {
    lines.push(`snapshot:\n${truncate(result.snapshot.trim(), 12000)}`);
    lines.push(
      'If snapshot reveals a bug or expected state, add an assert command with Playwright expect(...).'
    );
  }

  lines.push("Choose the next command.");
  return lines.join("\n");
}

function formatBrowserFailure(result: BrowserCommandResult): string {
  const message = result.error || result.stderr.trim() || result.stdout.trim();
  return message || `Command failed with exit code ${result.exitCode}`;
}

function extractSnapshotPath(text: string): string | undefined {
  const matches = [...text.matchAll(/- \[Snapshot\]\(([^)]+)\)/g)];
  const last = matches[matches.length - 1];
  return last?.[1];
}

function startLiveTest(goal: string): LiveTestState {
  const lines: string[] = [];
  console.log("Equivalent Playwright test (building as steps run):");
  console.log("```ts");
  lines.push(`import { expect, test } from "@playwright/test";`);
  lines.push("");
  lines.push(`test("${escapeForDoubleQuotedString(goal)}", async ({ page }) => {`);
  console.log(lines[0]);
  console.log("");
  console.log(lines[2]);
  return {
    closed: false,
    lines,
    stepCount: 0,
  };
}

function appendLiveTestCodeFromCommand(state: LiveTestState, commandResult: BrowserCommandResult) {
  if (state.closed) {
    return;
  }

  state.stepCount += 1;
  const stepTitle = `  // Step ${state.stepCount}: ${commandResult.action}`;
  state.lines.push(stepTitle);
  console.log(stepTitle);

  const blocks = extractPlaywrightCodeBlocks(commandResult.stdout);
  if (!commandResult.success) {
    const failure = commandResult.error || commandResult.stderr.trim() || commandResult.stdout.trim();
    const line = `  // Command failed: ${escapeForDoubleQuotedString(truncate(failure || "unknown error", 180))}`;
    state.lines.push(line);
    console.log(line);
    state.lines.push("");
    console.log("");
    return;
  }

  if (blocks.length === 0) {
    const line = "";
    state.lines.push(line);
    console.log(line);
    state.lines.push("");
    console.log("");
    return;
  }

  for (const code of blocks) {
    const codeLines = code.split(/\r?\n/).map(line => line.trimEnd());
    for (const codeLine of codeLines) {
      const line = `  ${codeLine}`;
      state.lines.push(line);
      console.log(line);
    }
    state.lines.push("");
    console.log("");
  }
}

function finalizeLiveTest(state: LiveTestState): string {
  if (!state.closed) {
    state.closed = true;
    state.lines.push("});");
    console.log("});");
    console.log("```");
  }
  return state.lines.join("\n");
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

function escapeForDoubleQuotedString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeAgentCommand(command: AgentCommand): AgentCommand {
  const action = command.action.toLowerCase();
  if (action === "navigate" || action === "visit") {
    return {
      action: "goto",
      args: command.args,
    };
  }
  if (action === "scroll") {
    return normalizeScrollCommand(command.args);
  }
  return command;
}

function normalizeAssertionCommand(args: string[]): { ok: true; code: string } | { error: string; ok: false } {
  const raw = args.join(" ").trim();
  if (!raw) {
    return { error: 'assert requires one argument, e.g. "expect(page.getByText(\\"Expected\\")).toBeVisible()"', ok: false };
  }

  const withoutFence = raw
    .replace(/^```(?:ts|js|javascript|typescript)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!withoutFence) {
    return { error: "assert argument is empty", ok: false };
  }

  if (!/expect\s*\(/.test(withoutFence)) {
    return { error: 'assert must include "expect(...)"', ok: false };
  }

  const noSemicolon = withoutFence.endsWith(";")
    ? withoutFence.slice(0, -1).trim()
    : withoutFence;
  const code = noSemicolon.startsWith("await ")
    ? `${noSemicolon};`
    : `await ${noSemicolon};`;
  return { ok: true, code };
}

function normalizeScrollCommand(args: string[]): AgentCommand {
  const tokens = args.map(token => token.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return { action: "mousewheel", args: ["0", "1200"] };
  }

  // Pass-through for explicit mousewheel coordinates, e.g. "scroll 0 2500".
  if (tokens.length >= 2) {
    const dx = parseMaybeNumber(tokens[0]);
    const dy = parseMaybeNumber(tokens[1]);
    if (dx !== undefined && dy !== undefined) {
      return { action: "mousewheel", args: [String(dx), String(dy)] };
    }
  }

  // Directional forms: "scroll down", "scroll up 2000", "scroll left", ...
  const direction = tokens[0].toLowerCase();
  const amount = parseMaybeNumber(tokens[1]) ?? 1200;
  switch (direction) {
    case "down":
      return { action: "mousewheel", args: ["0", String(Math.abs(amount))] };
    case "up":
      return { action: "mousewheel", args: ["0", String(-Math.abs(amount))] };
    case "right":
      return { action: "mousewheel", args: [String(Math.abs(amount)), "0"] };
    case "left":
      return { action: "mousewheel", args: [String(-Math.abs(amount)), "0"] };
    default:
      break;
  }

  // Numeric single-value form: "scroll 1500" => vertical scroll.
  const singleAmount = parseMaybeNumber(tokens[0]);
  if (singleAmount !== undefined) {
    return { action: "mousewheel", args: ["0", String(singleAmount)] };
  }

  return { action: "mousewheel", args: ["0", "1200"] };
}

function parseMaybeNumber(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function readSnapshot(snapshotPath: string): string | undefined {
  const absolutePath = path.isAbsolute(snapshotPath)
    ? snapshotPath
    : path.resolve(process.cwd(), snapshotPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  try {
    return readFileSync(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

function extractPageField(text: string, key: string): string | undefined {
  const regex = new RegExp(`- ${escapeRegex(key)}:\\s*(.+)`);
  const match = text.match(regex);
  return match?.[1]?.trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runReplayioSubprocess(args: string[]): Promise<SubprocessResult> {
  const replayio = resolveReplayioCommand();

  return await new Promise(resolve => {
    const child = spawn(replayio.command, [...replayio.args, ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let error: string | undefined;

    child.stdout.on("data", chunk => {
      stdout += String(chunk);
    });

    child.stderr.on("data", chunk => {
      stderr += String(chunk);
    });

    child.on("error", childError => {
      error = childError.message;
    });

    child.on("exit", code => {
      resolve({
        error,
        exitCode: code ?? 1,
        stderr,
        stdout,
      });
    });
  });
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

function getSessionProcessGroupId(session: string): string {
  return `playwright-cli-session:${session}`;
}

async function resolveSessionRecording(processGroupId: string): Promise<LocalRecording | null> {
  let fallback: LocalRecording | null = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const recordings = getRecordings(processGroupId);
    const preferred = pickPreferredRecording(recordings);
    if (preferred) {
      fallback = preferred;
      if (preferred.recordingStatus !== "recording") {
        return preferred;
      }
    }

    if (attempt < 19) {
      await sleep(1000);
    }
  }

  return fallback;
}

function pickPreferredRecording(recordings: LocalRecording[]): LocalRecording | null {
  if (recordings.length === 0) {
    return null;
  }

  const sorted = [...recordings].sort((a, b) => {
    const scoreDiff = scoreRecording(b) - scoreRecording(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return b.date.getTime() - a.date.getTime();
  });

  return sorted[0] ?? null;
}

function scoreRecording(recording: LocalRecording): number {
  let score = 0;
  if (recording.metadata.processType === "root") {
    score += 1000;
  }
  if (recording.uploadStatus === "uploaded") {
    score += 200;
  } else if (recording.uploadStatus === "uploading") {
    score += 150;
  }
  if (recording.recordingStatus === "finished") {
    score += 120;
  } else if (recording.recordingStatus === "recording") {
    score -= 100;
  }
  if (recording.recordingStatus === "unusable") {
    score -= 500;
  }
  if (canUpload(recording)) {
    score += 50;
  }

  return score;
}

async function ensureRecordingUploaded(recording: LocalRecording): Promise<LocalRecording | null> {
  return ensureRecordingUploadedWithProgress(recording, {
    onProgress: message => console.log(message),
  });
}

async function ensureRecordingUploadedWithProgress(
  recording: LocalRecording,
  options: { onProgress?: (message: string) => void } = {}
): Promise<LocalRecording | null> {
  const onProgress = options.onProgress;
  const startedAt = Date.now();
  let current = recording;
  let attemptedManualUpload = false;
  let lastStatusKey = "";
  let lastHeartbeatAt = 0;

  const emitProgress = (message: string, force = false) => {
    if (!onProgress) {
      return;
    }
    if (!force && message === lastStatusKey) {
      return;
    }
    onProgress(message);
    lastStatusKey = message;
  };

  emitProgress(`Upload progress: ${formatRecordingUploadState(current, startedAt)}`, true);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const refreshed = getRecordings().find(item => item.id === current.id);
    if (refreshed) {
      current = refreshed;
    }

    const now = Date.now();
    const statusLine = `Upload progress: ${formatRecordingUploadState(current, startedAt)}`;
    if (statusLine !== lastStatusKey) {
      emitProgress(statusLine, true);
      lastHeartbeatAt = now;
    } else if (now - lastHeartbeatAt >= UPLOAD_PROGRESS_HEARTBEAT_MS) {
      emitProgress(statusLine, true);
      lastHeartbeatAt = now;
    }

    if (current.uploadStatus === "uploaded") {
      emitProgress(
        `Upload complete (${formatDurationMs(Date.now() - startedAt)}): ${current.id}`,
        true
      );
      return current;
    }

    if (!attemptedManualUpload && canUpload(current)) {
      attemptedManualUpload = true;
      emitProgress(`Upload action: starting manual upload for ${current.id}`, true);
      const uploadStartedAt = Date.now();
      const uploadResult = await runReplayioSubprocess(["upload", current.id]);
      const uploadDuration = formatDurationMs(Date.now() - uploadStartedAt);
      if (uploadResult.exitCode !== 0) {
        emitProgress(
          `Upload action failed after ${uploadDuration}: ${truncate(
            uploadResult.stderr || uploadResult.stdout || uploadResult.error || "unknown error",
            300
          )}`,
          true
        );
      } else {
        emitProgress(`Upload action finished in ${uploadDuration}. Waiting for uploaded status...`, true);
      }

      const refreshedAfterUpload = getRecordings().find(item => item.id === current.id);
      if (refreshedAfterUpload) {
        current = refreshedAfterUpload;
      }
      const refreshedStatus = `Upload progress: ${formatRecordingUploadState(current, startedAt)}`;
      emitProgress(refreshedStatus, true);
      lastHeartbeatAt = Date.now();
      if (current.uploadStatus === "uploaded") {
        emitProgress(
          `Upload complete (${formatDurationMs(Date.now() - startedAt)}): ${current.id}`,
          true
        );
        return current;
      }
    }

    if (attempt < 59) {
      await sleep(1000);
    }
  }

  emitProgress(
    `Upload timed out after ${formatDurationMs(Date.now() - startedAt)}: ${formatRecordingUploadState(
      current,
      startedAt
    )}`,
    true
  );
  return current;
}

function formatRecordingUploadState(recording: LocalRecording, startedAtMs: number): string {
  const parts: string[] = [];
  parts.push(`elapsed=${formatDurationMs(Date.now() - startedAtMs)}`);
  parts.push(`recording=${recording.recordingStatus}`);
  parts.push(`upload=${recording.uploadStatus ?? "pending"}`);
  if (recording.processingStatus) {
    parts.push(`processing=${recording.processingStatus}`);
  }
  if (recording.unusableReason) {
    parts.push(`reason=${truncate(recording.unusableReason, 80)}`);
  }
  return parts.join(", ");
}

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

async function callAnalyzeEndpoint(input: {
  analyzeEndpoint: string;
  goalSucceeded: boolean;
  goal: string;
  model: string;
  recordingId: string;
  replayUrl: string;
  session: string;
  summary: string;
  transcript: StepTranscript[];
}) {
  const { accessToken } = await getAccessToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  // Print a curl command equivalent to the fetch request for debugging purposes
  const analyzeUrl = `https://dispatch.replay.io/nut/recording/${input.recordingId}/analyze`;
  const curlHeaders = [
    '-H "content-type: application/json"',
    ...(headers.authorization ? [`-H "authorization: ${headers.authorization}"`] : []),
  ].join(" ");
  const curlBody = `-d '${JSON.stringify({ goal: input.goal })}'`;
  console.log(
    `curl -X POST ${curlHeaders} ${curlBody} "${analyzeUrl}"`
  );

  const response = await fetch(analyzeUrl, {
    body: JSON.stringify({
      goal: input.goal,
    }),
    headers,
    method: "POST",
  });

  const body = await response.text();
  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got "${value}".`);
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
