import { create, Struct } from "superstruct";

import { UnstructuredMetadata } from "../src/types";

import v1 from "./test/v1";
import v2 from "./test/v2";

const VERSION = "2.0.0";

const versions = {
  ...v1,
  ...v2,
};

function validate(metadata: { test: UnstructuredMetadata }) {
  if (!metadata || !metadata.test) {
    throw new Error("Test metadata does not exist");
  }

  return init(metadata.test);
}

type Metadata = typeof versions[keyof typeof versions];

function getVersion(k: string): Struct {
  const v: Struct | undefined = (versions as any)[k];
  if (!v) {
    throw new Error(`Test metadata version ${k} not supported`);
  }

  return v;
}

function init(data: Metadata | UnstructuredMetadata = {}) {
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

export { validate, init };
