import fs from "fs";
import { create, defaulted, number, object, optional } from "superstruct";
import { cachedFetch } from "../../../cachedFetch";
import { logError, logInfo } from "../../../logger";
import { UnstructuredMetadata } from "../../types";
import { envString } from "./env";

const defaultObject = (value: any) => optional(defaulted(object(value), {}));

const VERSION = 1;

class GitHubHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type CacheEntry = { json: any | null; status: number; statusText: string };

export const cache: Map<string, CacheEntry> = new Map();

export function resetCache(url?: string) {
  if (url) {
    cache.delete(url);
  } else {
    cache.clear();
  }
}

function getCircleCISourceControlProvider(env: NodeJS.ProcessEnv) {
  return env.CIRCLE_PULL_REQUEST?.startsWith("https://github.com")
    ? "github"
    : env.CIRCLE_PULL_REQUEST?.startsWith("https://bitbucket.com")
    ? "bitbucket"
    : undefined;
}

function getCircleCIRepository(env: NodeJS.ProcessEnv) {
  return env.CIRCLE_PROJECT_USERNAME && env.CIRCLE_PROJECT_REPONAME
    ? `${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`
    : "";
}

function getCircleCIMergeId(env: NodeJS.ProcessEnv) {
  logInfo("GetCircleCIMergeId:Started");
  if (env.CIRCLE_PULL_REQUEST) {
    logInfo("GetCircleCIMergeId:WillExtract", { circlePullRequest: env.CIRCLE_PULL_REQUEST });
    return env.CIRCLE_PULL_REQUEST.split("/").pop();
  }
}

function getBuildkiteMessage(env: NodeJS.ProcessEnv) {
  if (env.BUILDKITE_SOURCE === "webhook") {
    return env.BUILDKITE_MESSAGE;
  }
}

function getBuildkiteRepository(env: NodeJS.ProcessEnv) {
  return env.BUILDKITE_REPO?.match(/.*:(.*)\.git/)?.[1];
}

let gGitHubEvent: Record<string, any> | null = null;

function readGithubEvent(env: NodeJS.ProcessEnv) {
  logInfo("ReadGithubEvent:Started");
  const { GITHUB_EVENT_PATH } = env;
  if (!GITHUB_EVENT_PATH) {
    logInfo("ReadGithubEvent:NoEventFileSpecified");
    return;
  }

  if (!fs.existsSync(GITHUB_EVENT_PATH)) {
    logInfo("ReadGithubEvent:EventFileNotFound", { githubEventPath: GITHUB_EVENT_PATH });
    return;
  }

  try {
    if (!gGitHubEvent) {
      logInfo("ReadGithubEvent:WillReadFromFile", { githubEventPath: GITHUB_EVENT_PATH });
      const contents = fs.readFileSync(GITHUB_EVENT_PATH, "utf8");
      gGitHubEvent = JSON.parse(contents);
    } else {
      logInfo("ReadGithubEvent:WillUseExistingFile");
    }

    return gGitHubEvent;
  } catch (error) {
    logError("ReadGithubEvent:Failed", { error });
  }
}

function expandGitHubEvent() {
  const event = readGithubEvent(process.env);

  if (event?.pull_request) {
    if (event.pull_request.number) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_ID ||= String(event.pull_request.number);
    }

    if (event.pull_request.title) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE ||= event.pull_request.title;
    }

    if (event.pull_request.html_url) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_URL ||= event.pull_request.html_url;
    }

    if (event.pull_request.user?.login) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_USER ||= event.pull_request.user.login;
    }

    if (event.pull_request.head?.ref) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_BRANCH ||= event.pull_request.head.ref;
    }
  }

  if (event?.head_commit) {
    if (event.head_commit.message) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE ||= event.head_commit.message;
    }

    if (event.head_commit.url) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL ||= event.head_commit.url;
    }

    if (event.head_commit.committer.username) {
      process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER ||=
        event.head_commit.committer.username;
    }
  }
}

function getGitHubMergeSHA(env: NodeJS.ProcessEnv): string | undefined {
  const event = readGithubEvent(env);
  if (event?.pull_request?.head?.sha) {
    return event.pull_request.head.sha;
  }
}

function isSecondaryRateLimitError(json: unknown) {
  return (
    !!json &&
    typeof json === "object" &&
    "message" in json &&
    typeof json.message === "string" &&
    // https://github.com/octokit/plugin-throttling.js/blob/2970c6fbc2e2ad4e749804b0708c1a863800a7e4/src/index.ts#L134
    /\bsecondary rate\b/i.test(json.message)
  );
}

async function fetchGitHubUrl(url: string) {
  const { GITHUB_TOKEN } = process.env;

  const resp = await cachedFetch(
    url,
    {
      headers: GITHUB_TOKEN
        ? {
            Authorization: `token ${GITHUB_TOKEN}`,
          }
        : undefined,
    },
    {
      shouldRetry: async (response, json, retryAfter) => {
        // secondary rate limit can be returned with 403 so we hve to check this before checking status codes
        // https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api?apiVersion=2022-11-28#rate-limit-errors
        if (isSecondaryRateLimitError(json)) {
          // https://github.com/octokit/plugin-throttling.js/blob/32c82b80a29a7a48c1cdf100fe0a3fb01b24fb23/src/index.ts#L138-L142
          return {
            after: Number(response.headers.get("retry-after")) || 60 * 1000,
          };
        }
        if (response.headers.get("x-ratelimit-remaining") === "0") {
          // https://github.com/octokit/plugin-throttling.js/blob/32c82b80a29a7a48c1cdf100fe0a3fb01b24fb23/src/index.ts#L163-171
          const rateLimitReset = new Date(
            ~~(response.headers.get("x-ratelimit-reset") as string) * 1000
          ).getTime();
          return {
            after: Math.max(Math.ceil((rateLimitReset - Date.now()) / 1000) + 1, 0),
          };
        }
        // https://github.com/octokit/plugin-retry.js/blob/d3577fcc8e6f602af3a959dbd1d8e7479971d0d5/src/error-request.ts#L9-L10
        // https://github.com/octokit/plugin-retry.js/blob/d3577fcc8e6f602af3a959dbd1d8e7479971d0d5/src/index.ts#L14
        if ([400, 401, 403, 404, 422, 451].includes(response.status)) {
          return false;
        }
        return { after: retryAfter };
      },
    }
  );
  return resp;
}

async function expandCommitMetadataFromGitHub(repo: string, sha?: string) {
  const {
    GITHUB_TOKEN,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER,
  } = process.env;

  if (
    [
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE,
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL,
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER,
    ].every(Boolean)
  ) {
    return;
  }

  if (!repo || !sha) {
    logError("ExpandCommitMetadataFromGitHub:MissingInfo", { hasRepo: !!repo, hasSha: !!sha });
    return;
  }

  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;

  logInfo("ExpandCommitMetadataFromGitHub:Started", {
    url,
    tokenLength: GITHUB_TOKEN?.length || 0,
  });

  const resp = await fetchGitHubUrl(url);

  // override the SHA if passed because it might be the SHA from the github
  // event rather than GITHUB_SHA. we update this regardless of our ability to
  // fetch the details because that can fail due to a missing token.
  process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_ID = sha;
  if (resp.ok) {
    const json = resp.json;
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE ||= json.commit.message
      .split("\n")
      .shift()
      .substring(0, 80);
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL ||= json.html_url;
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER ||= json.author?.login;
  } else {
    const message = resp.json?.message ?? resp.statusText;
    logError("ExpandCommitMetadataFromGitHub:Failed", {
      message,
      responseStatusText: resp.statusText,
      responseStatus: resp.status,
    });
    throw new GitHubHttpError(message, resp.status);
  }
}

async function expandMergeMetadataFromGitHub(repo: string, pr?: string) {
  const {
    GITHUB_TOKEN,
    RECORD_REPLAY_METADATA_SOURCE_MERGE_ID,
    RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE,
    RECORD_REPLAY_METADATA_SOURCE_MERGE_URL,
    RECORD_REPLAY_METADATA_SOURCE_MERGE_USER,
    RECORD_REPLAY_METADATA_SOURCE_BRANCH,
  } = process.env;

  if (
    [
      RECORD_REPLAY_METADATA_SOURCE_MERGE_ID,
      RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE,
      RECORD_REPLAY_METADATA_SOURCE_MERGE_URL,
      RECORD_REPLAY_METADATA_SOURCE_MERGE_USER,
      RECORD_REPLAY_METADATA_SOURCE_BRANCH,
    ].every(Boolean)
  ) {
    return;
  }

  if (!repo || !pr) {
    logError("ExpandMergeMetadataFromGitHub:MissingInfo", { hasRepo: !!repo, hasPr: !!pr });
    return;
  }

  const url = `https://api.github.com/repos/${repo}/pulls/${pr}`;

  logInfo("ExpandMergeMetadataFromGitHub:WillFetch", {
    url,
    tokenLength: GITHUB_TOKEN?.length || 0,
  });

  const resp = await fetchGitHubUrl(url);

  if (resp.ok) {
    const json = await resp.json;
    process.env.RECORD_REPLAY_METADATA_SOURCE_BRANCH ||= json.head?.ref;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_ID ||= pr;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE ||= json.title;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_URL ||= json.html_url;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_USER ||= json.user?.login;
  } else {
    const message = resp.json?.message ?? resp.statusText;
    logError("ExpandMergeMetadataFromGitHub:Failed", {
      message,
      responseStatus: resp.status,
      responseStatusText: resp.statusText,
    });
    throw new GitHubHttpError(message, resp.status);
  }
}

function buildTestRunId(repository: string | undefined, runId: string | undefined) {
  if (repository && runId) {
    return `${repository}--${runId}`;
  }
}

export function getTestRunIdFromEnvironment(env: NodeJS.ProcessEnv) {
  const userTestRunId =
    process.env.REPLAY_METADATA_TEST_RUN_ID ||
    process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID ||
    process.env.RECORD_REPLAY_TEST_RUN_ID;

  let ciTestRunId =
    buildTestRunId(process.env.GITHUB_REPOSITORY, process.env.GITHUB_RUN_ID) ||
    buildTestRunId(process.env.CIRCLE_PROJECT_REPONAME, process.env.CIRCLE_WORKFLOW_ID) ||
    buildTestRunId(getBuildkiteRepository(process.env), process.env.BUILDKITE_BUILD_ID) ||
    buildTestRunId(process.env.SEMAPHORE_GIT_REPO_SLUG, process.env.SEMAPHORE_WORKFLOW_ID);

  return userTestRunId || ciTestRunId;
}

const versions = () => ({
  [1 as number]: object({
    branch: optional(
      envString(
        "RECORD_REPLAY_METADATA_SOURCE_BRANCH",
        "GITHUB_REF_NAME",
        "BUILDKITE_BRANCH",
        "CIRCLE_BRANCH",
        "SEMAPHORE_GIT_PR_BRANCH"
      )
    ),
    commit: defaultObject({
      id: envString(
        "RECORD_REPLAY_METADATA_SOURCE_COMMIT_ID",
        "GITHUB_SHA",
        "BUILDKITE_COMMIT",
        "CIRCLE_SHA1",
        "SEMAPHORE_GIT_SHA"
      ),
      title: optional(envString("RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE", getBuildkiteMessage)),
      url: optional(envString("RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL")),
      user: optional(envString("RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER")),
    }),
    trigger: defaultObject({
      user: optional(
        envString(
          "RECORD_REPLAY_METADATA_SOURCE_TRIGGER_USER",
          "GITHUB_ACTOR",
          "BUILDKITE_BUILD_CREATOR",
          "BUILDKITE_BUILD_AUTHOR",
          "CIRCLE_USERNAME",
          "CIRCLE_PR_USERNAME"
        )
      ),
      name: optional(envString("RECORD_REPLAY_METADATA_SOURCE_TRIGGER_NAME")),
      workflow: optional(
        envString(
          "RECORD_REPLAY_METADATA_SOURCE_TRIGGER_WORKFLOW",
          "GITHUB_RUN_ID",
          "BUILDKITE_BUILD_ID",
          "CIRCLE_WORKFLOW_ID",
          "SEMAPHORE_WORKFLOW_ID"
        )
      ),
      url: optional(
        envString(
          "RECORD_REPLAY_METADATA_SOURCE_TRIGGER_URL",
          env =>
            env.GITHUB_WORKFLOW &&
            `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${
              env.GITHUB_REPOSITORY
            }/actions/runs/${env.GITHUB_RUN_ID}`,
          "BUILDKITE_BUILD_URL",
          "CIRCLE_BUILD_URL",
          env =>
            env.SEMAPHORE_ORGANIZATION_URL &&
            env.SEMAPHORE_WORKFLOW_ID &&
            `${env.SEMAPHORE_ORGANIZATION_URL}/workflows/${env.SEMAPHORE_WORKFLOW_ID}`
        )
      ),
    }),
    merge: defaultObject({
      id: optional(
        envString(
          "RECORD_REPLAY_METADATA_SOURCE_MERGE_ID",
          env =>
            env.BUILDKITE_PULL_REQUEST && env.BUILDKITE_PULL_REQUEST !== "false"
              ? env.BUILDKITE_PULL_REQUEST
              : undefined,
          getCircleCIMergeId,
          "SEMAPHORE_GIT_PR_NUMBER"
        )
      ),
      title: optional(
        envString("RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE", "SEMAPHORE_GIT_PR_NAME")
      ),
      url: optional(envString("RECORD_REPLAY_METADATA_SOURCE_MERGE_URL")),
      user: optional(envString("RECORD_REPLAY_METADATA_SOURCE_MERGE_USER")),
    }),
    provider: optional(
      envString(
        "RECORD_REPLAY_METADATA_SOURCE_PROVIDER",
        env => env.GITHUB_WORKFLOW && "github",
        "BUILDKITE_PIPELINE_PROVIDER",
        getCircleCISourceControlProvider,
        "SEMAPHORE_GIT_PROVIDER"
      )
    ),
    repository: optional(
      envString(
        "RECORD_REPLAY_METADATA_SOURCE_REPOSITORY",
        "GITHUB_REPOSITORY",
        getBuildkiteRepository,
        getCircleCIRepository,
        "SEMAPHORE_GIT_REPO_SLUG"
      )
    ),
    version: defaulted(number(), () => 1),
  }),
});

export function validate(source?: UnstructuredMetadata) {
  if (!source) {
    throw new Error("Source metadata does not exist");
  }

  return init(source);
}

async function expandEnvironment() {
  const { CIRCLECI, CIRCLE_SHA1, GITHUB_SHA, GITHUB_REPOSITORY } = process.env;

  try {
    if (GITHUB_SHA && GITHUB_REPOSITORY) {
      expandGitHubEvent();
      const sha = getGitHubMergeSHA(process.env) ?? GITHUB_SHA;
      const mergeId = process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_ID;
      logInfo("ExpandEnvironment:GithubContext", { mergeId, sha });

      await expandCommitMetadataFromGitHub(GITHUB_REPOSITORY, sha);
      await expandMergeMetadataFromGitHub(GITHUB_REPOSITORY, mergeId);
    } else if (CIRCLECI) {
      const repo = getCircleCIRepository(process.env);
      const provider = getCircleCISourceControlProvider(process.env);

      if (provider !== "github") {
        logError("ExpandEnvironment:UnsupportedSourceControlProvider", {
          circlePullRequest: process.env.CIRCLE_PULL_REQUEST,
        });
        return;
      }

      await expandCommitMetadataFromGitHub(repo, CIRCLE_SHA1);
      await expandMergeMetadataFromGitHub(repo, getCircleCIMergeId(process.env));
    }
  } catch (e) {
    if (e instanceof GitHubHttpError) {
      console.warn(`Unable to fetch pull request from GitHub: ${e.message}`);
      if (!process.env.GITHUB_TOKEN && e.status === 404) {
        console.warn(
          "If this is a private repo, you can set the GITHUB_TOKEN environment variable\nwith a personal access token to allow the Replay CLI to fetch this metadata."
        );
      }
      return;
    }

    console.warn("Failed to expand environment details", e);
  }
}

export async function init(data: UnstructuredMetadata = {}) {
  const version = typeof data.version === "number" ? data.version : VERSION;

  await expandEnvironment();
  const structs = versions();

  if (structs[version]) {
    return {
      source: create(data, structs[version]),
    };
  } else {
    throw new Error(`Source metadata version ${data.version} not supported`);
  }
}
