import { Struct, any, create } from "superstruct";
import { UnstructuredMetadata } from "../../../types.js";
import v1, { TestMetadataV1 } from "./v1.js";
import v2, { TestMetadataV2 } from "./v2.js";

const VERSION = "2.1.0";

export type { TestMetadataV1, TestMetadataV2 };
export type UserActionEvent = TestMetadataV1.UserActionEvent | TestMetadataV2.UserActionEvent;
export type Test = TestMetadataV1.Test | TestMetadataV2.Test;
export type TestResult = TestMetadataV1.TestResult | TestMetadataV2.TestResult;
export type TestRun = TestMetadataV1.TestRun | TestMetadataV2.TestRun;
export type TestError = TestMetadataV1.TestError | TestMetadataV2.TestError;

const versions = {
  ...v1,
  ...v2,
};

export function validate(test: UnstructuredMetadata) {
  if (!test) {
    throw new Error("Test metadata does not exist");
  }

  return init(test);
}

type Metadata = (typeof versions)[keyof typeof versions];

function getVersion(k: string): Struct {
  const v: Struct | undefined = (versions as any)[k];
  if (!v) {
    console.warn(`Unable to validate unknown version of test metadata:${k} `);
    return any();
  }

  return v;
}

export function init(data: Metadata | UnstructuredMetadata = {}) {
  let version = VERSION;

  if ("version" in data && typeof data.version === "number") {
    // explicitly adapt the pre-semver scheme
    version = "1.0.0";
  } else if ("schemaVersion" in data && typeof data.schemaVersion === "string") {
    version = data.schemaVersion;
  }

  let schema: Struct;
  try {
    schema = getVersion(version);
  } catch {
    console.warn(
      `Unable to validate unknown version of test metadata: ${version || "Unspecified"}`
    );

    return {
      test: data,
    };
  }

  try {
    return {
      test: create(data, schema),
    };
  } catch (e) {
    console.error(e);
    console.error("Metadata:");
    console.error(JSON.stringify(data, undefined, 2));

    return {};
  }
}
