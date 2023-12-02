import { number, Struct } from "superstruct";
import fs from "fs";
import fetch, { RequestInit, Response } from "node-fetch";
import dbg from "debug";
const { create, object, optional, defaulted } = require("superstruct");

import { UnstructuredMetadata } from "../src/types";
import { envString } from "./env";

const defaultObject = (objStruct: any) => optional(defaulted(object(objStruct), {}));

const debug = dbg("replay:cli:metadata:source");
const VERSION = 1;

class GitHubHttpError extends Error {
  status: number;
  statusText: string;

  constructor(status: number, statusText: string) {
    super();
    this.status = status;
    this.statusText = statusText;
  }
}

// Add a basic cache so we don't refetch data from GH repeatedly for the same resources
const gFetchCache: Record<string, { json: any | null; status: number; statusText: string }> = {};
async function fetchWithCache(
  url: string,
  init?: RequestInit
): Promise<{ json: any | null; status: number; statusText: string }> {
  if (!(url in gFetchCache)) {
    const resp = await fetch(url, init);
    if (resp.status === 200) {
      const json = await resp.json();
      gFetchCache[url] = {
        status: resp.status,
        statusText: resp.statusText,
        json,
      };
    } else {
      gFetchCache[url] = {
        json: null,
        status: resp.status,
        statusText: resp.statusText,
      };
    }
  }

  return gFetchCache[url];
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
  if (env.CIRCLE_PULL_REQUEST) {
    debug("Extracting merge id from %s", env.CIRCLE_PULL_REQUEST);
    return env.CIRCLE_PULL_REQUEST.split("/").pop();
  }
}

let gGitHubEvent: Record<string, any> | null = null;

function readGithubEvent(env: NodeJS.ProcessEnv) {
  const { GITHUB_EVENT_PATH } = env;
  if (!GITHUB_EVENT_PATH) {
    debug("No github event file specified.");
    return;
  }

  if (!fs.existsSync(GITHUB_EVENT_PATH)) {
    debug("Github event file does not exist at %s", GITHUB_EVENT_PATH);
    return;
  }

  try {
    if (!gGitHubEvent) {
      debug("Reading Github event file from %s", GITHUB_EVENT_PATH);
      const contents = fs.readFileSync(GITHUB_EVENT_PATH, "utf8");
      gGitHubEvent = JSON.parse(contents);
    } else {
      debug("Using previously read Github event file");
    }

    return gGitHubEvent;
  } catch (e) {
    debug("Failed to read pull request number from event: %s", e);
  }
}

function getGitHubMergeId(env: NodeJS.ProcessEnv) {
  const event = readGithubEvent(env);
  if (event?.pull_request?.number) {
    return String(event.pull_request.number);
  }
}

function getGitHubMergeSHA(env: NodeJS.ProcessEnv) {
  const event = readGithubEvent(env);
  if (event?.pull_request?.head?.sha) {
    return event.pull_request.head.sha;
  }
}

async function expandCommitMetadataFromGitHub(repo: string, sha?: string) {
  const {
    GITHUB_TOKEN,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER,
  } = process.env;

  if (!repo || !sha) return;

  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;

  debug("Fetching commit metadata from %s with %d char token", url, GITHUB_TOKEN?.length || 0);

  const resp = await fetchWithCache(url, {
    headers: GITHUB_TOKEN
      ? {
          Authorization: `token ${GITHUB_TOKEN}`,
        }
      : undefined,
  });

  if (resp.status === 200) {
    const json = resp.json;
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE =
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE ||
      json.commit.message.split("\n").shift().substring(0, 80);
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL =
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL || json.html_url;
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER =
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_USER || json.author?.login;
  } else {
    debug("Failed to fetch GitHub commit metadata: %s", resp.statusText);
    throw new GitHubHttpError(resp.status, resp.statusText);
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

  if (!repo || !pr) {
    debug("Unable to retrieve merge metadata: Repo and PR number missing");
    return;
  }

  const url = `https://api.github.com/repos/${repo}/pulls/${pr}`;

  debug("Fetching merge metadata from %s with %d char token", url, GITHUB_TOKEN?.length || 0);

  const resp = await fetchWithCache(url, {
    headers: GITHUB_TOKEN
      ? {
          Authorization: `token ${GITHUB_TOKEN}`,
        }
      : undefined,
  });

  if (resp.status === 200) {
    const json = await resp.json;
    process.env.RECORD_REPLAY_METADATA_SOURCE_BRANCH =
      RECORD_REPLAY_METADATA_SOURCE_BRANCH || json.head?.ref;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_ID =
      RECORD_REPLAY_METADATA_SOURCE_MERGE_ID || pr;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE =
      RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE || json.title;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_URL =
      RECORD_REPLAY_METADATA_SOURCE_MERGE_URL || json.html_url;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_USER =
      RECORD_REPLAY_METADATA_SOURCE_MERGE_USER || json.user?.login;
  } else {
    debug("Failed to fetch GitHub commit metadata: %o", resp);
    throw new GitHubHttpError(resp.status, resp.statusText);
  }
}

const versions: () => Record<number, Struct> = () => ({
  1: object({
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
      title: optional(envString("RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE")),
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
          "BUILDKITE_BUILD_NUMBER",
          "CIRCLE_BUILD_NUM",
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
          "BUILDKITE_PULL_REQUEST",
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
        env => env.BUILDKITE_REPO?.match(/.*:(.*)\.git/)?.[1],
        getCircleCIRepository,
        "SEMAPHORE_GIT_REPO_SLUG"
      )
    ),
    version: defaulted(number(), () => 1),
  }),
});

function validate(metadata: { source: UnstructuredMetadata }) {
  if (!metadata || !metadata.source) {
    throw new Error("Source metadata does not exist");
  }

  return init(metadata.source);
}

async function expandEnvironment() {
  const { CIRCLECI, CIRCLE_SHA1, GITHUB_SHA, GITHUB_REPOSITORY } = process.env;

  try {
    if (GITHUB_SHA && GITHUB_REPOSITORY) {
      await expandCommitMetadataFromGitHub(
        GITHUB_REPOSITORY,
        getGitHubMergeSHA(process.env) ?? GITHUB_SHA
      );
      debug("Merge ID:", getGitHubMergeId(process.env));
      await expandMergeMetadataFromGitHub(GITHUB_REPOSITORY, getGitHubMergeId(process.env));
    } else if (CIRCLECI) {
      const repo = getCircleCIRepository(process.env);
      const provider = getCircleCISourceControlProvider(process.env);

      if (provider !== "github") {
        debug("Unsupported source control provider: %s", process.env.CIRCLE_PULL_REQUEST);
        return;
      }

      await expandCommitMetadataFromGitHub(repo, CIRCLE_SHA1);
      await expandMergeMetadataFromGitHub(repo, getCircleCIMergeId(process.env));
    }
  } catch (e) {
    if (e instanceof GitHubHttpError) {
      console.warn(`Unable to fetch pull request from GitHub: ${e.statusText}`);
      if (!process.env.GITHUB_TOKEN && e.status === 404) {
        console.warn(
          "If this is a private repo, you can set the GITHUB_TOKEN environment variable\nwith a personal access token to allow the Replay CLI to fetch this metadata."
        );
      }
    }

    console.warn("Failed to expand environment details", e);
  }
}

async function init(data: UnstructuredMetadata = {}) {
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

export { validate, init };
