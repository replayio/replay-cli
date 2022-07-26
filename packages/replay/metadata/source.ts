import { number, Struct } from "superstruct";
const { create, object, optional, defaulted } = require("superstruct");

import { envString } from "./env";
import { UnstructuredMetadata } from "./types";

const defaultObject = (objStruct: any) => optional(defaulted(object(objStruct), {}));

const VERSION = 1;

const versions: Record<number, Struct> = {
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
        envString("RECORD_REPLAY_METADATA_SOURCE_MERGE_ID", "BUILDKITE_PULL_REQUEST", env =>
          process.env.CIRCLE_PULL_REQUEST?.split("/").pop()
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
        "CIRCLE_PROJECT_REPONAME"
      )
    ),
    version: defaulted(number(), () => 1),
  }),
};

function validate(metadata: { source: UnstructuredMetadata }) {
  if (!metadata || !metadata.source) {
    throw new Error("Source metadata does not exist");
  }

  return init(metadata.source);
}

function init(data: UnstructuredMetadata = {}) {
  const version = typeof data.version === "number" ? data.version : VERSION;
  if (versions[version]) {
    return {
      source: create(data, versions[version]),
    };
  } else {
    throw new Error(`Source metadata version ${data.version} not supported`);
  }
}

export { validate, init };
