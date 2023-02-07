import { number, Struct } from "superstruct";
import fetch from "node-fetch";
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

function getCircleCISourceControlProvider(env: NodeJS.ProcessEnv) {
  return env.CIRCLE_PULL_REQUEST?.startsWith("https://github.com") ? "github" : "";
}

function getCircleCIRepository(env: NodeJS.ProcessEnv) {
  return env.CIRCLE_PROJECT_USERNAME && env.CIRCLE_PROJECT_REPONAME
    ? `${env.CIRCLE_PROJECT_USERNAME}/${env.CIRCLE_PROJECT_REPONAME}`
    : "";
}

function getCircleCIMergeId(env: NodeJS.ProcessEnv) {
  debug("Extracting merge id from %s", env.CIRCLE_PULL_REQUEST);
  return env.CIRCLE_PULL_REQUEST?.split("/").pop();
}

async function expandCommitMetadataFromGitHub(repo: string, sha?: string) {
  const {
    GITHUB_TOKEN,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE,
    RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL,
  } = process.env;

  if (!!repo || !sha) return;

  const url = `https://api.github.com/repos/${repo}/commits/${sha}`;

  debug("Fetching commit metadata from %s with %d char token", url, GITHUB_TOKEN?.length || 0);

  const resp = await fetch(url, {
    headers: GITHUB_TOKEN
      ? {
          Authorization: `token ${GITHUB_TOKEN}`,
        }
      : undefined,
  });

  if (resp.status === 200) {
    const json = await resp.json();
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE =
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE ||
      json.commit.message.split("\n").shift().substring(0, 80);
    process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL =
      RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL || json.html_url;
  } else {
    debug("Failed to fetch GitHub commit metadata: %o", resp);
    throw new GitHubHttpError(resp.status, resp.statusText);
  }
}

async function expandMergeMetadataFromGitHub(repo: string, pr?: string) {
  const {
    GITHUB_TOKEN,
    RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE,
    RECORD_REPLAY_METADATA_SOURCE_MERGE_URL,
  } = process.env;

  if (!!repo || !pr) return;

  const url = `https://api.github.com/repos/${repo}/pulls/${pr}`;

  debug("Fetching merge metadata from %s with %d char token", url, GITHUB_TOKEN?.length || 0);

  const resp = await fetch(url, {
    headers: GITHUB_TOKEN
      ? {
          Authorization: `token ${GITHUB_TOKEN}`,
        }
      : undefined,
  });

  if (resp.status === 200) {
    const json = await resp.json();
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE =
      RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE || json.title;
    process.env.RECORD_REPLAY_METADATA_SOURCE_MERGE_URL =
      RECORD_REPLAY_METADATA_SOURCE_MERGE_URL || json.html_url;
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
        "CIRCLE_BRANCH"
      )
    ),
    commit: defaultObject({
      id: envString(
        "RECORD_REPLAY_METADATA_SOURCE_COMMIT_ID",
        "GITHUB_SHA",
        "BUILDKITE_COMMIT",
        "CIRCLE_SHA1"
      ),
      title: optional(envString("RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE")),
      url: optional(envString("RECORD_REPLAY_METADATA_SOURCE_COMMIT_URL")),
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
          "CIRCLE_BUILD_NUM"
        )
      ),
      url: optional(
        envString(
          "RECORD_REPLAY_METADATA_SOURCE_TRIGGER_URL",
          env =>
            env.GITHUB_WORKFLOW &&
            `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
          "BUILDKITE_BUILD_URL",
          "CIRCLE_BUILD_URL"
        )
      ),
    }),
    merge: defaultObject({
      id: optional(
        envString(
          "RECORD_REPLAY_METADATA_SOURCE_MERGE_ID",
          "BUILDKITE_PULL_REQUEST",
          getCircleCIMergeId
        )
      ),
      title: optional(envString("RECORD_REPLAY_METADATA_SOURCE_MERGE_TITLE")),
      url: optional(envString("RECORD_REPLAY_METADATA_SOURCE_MERGE_URL")),
    }),
    provider: optional(
      envString(
        "RECORD_REPLAY_METADATA_SOURCE_PROVIDER",
        env => env.GITHUB_WORKFLOW && "github",
        "BUILDKITE_PIPELINE_PROVIDER",
        env =>
          env.CIRCLE_REPOSITORY_URL?.includes("github.com")
            ? "github"
            : env.CIRCLE_REPOSITORY_URL?.includes("bitbucket.com")
            ? "bitbucket"
            : undefined
      )
    ),
    repository: optional(
      envString(
        "RECORD_REPLAY_METADATA_SOURCE_REPOSITORY",
        "GITHUB_REPOSITORY",
        env => env.BUILDKITE_REPO?.match(/.*:(.*)\.git/)?.[1],
        getCircleCIRepository
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
  const { CIRCLECI, CIRCLE_SHA1 } = process.env;

  const repo = getCircleCIRepository(process.env);

  try {
    if (CIRCLECI) {
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
