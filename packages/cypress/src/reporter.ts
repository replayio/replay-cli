/// <reference types="cypress" />

import { listAllRecordings } from "@replayio/replay";
import { add, test as testMetadata } from "@replayio/replay/metadata";
import { writeFileSync } from "fs";

const uuid = require("uuid");

class ReplayReporter {
  browser?: string;
  baseId = uuid.validate(process.env.RECORD_REPLAY_TEST_RUN_ID || "")
    ? process.env.RECORD_REPLAY_TEST_RUN_ID
    : uuid.v4();
  baseMetadata: Record<string, any> | null = null;
  runTitle?: string;
  metadataFilePath: string;

  constructor(metadataFilePath: string) {
    this.metadataFilePath = metadataFilePath;
  }

  getTestId(spec: Cypress.Spec) {
    return `${this.baseId}-${spec.relative}`;
  }

  parseConfig() {
    // always favor environment variables over config so the config can be
    // overwritten at runtime
    this.runTitle = process.env.RECORD_REPLAY_TEST_RUN_TITLE;

    // RECORD_REPLAY_METADATA is our "standard" metadata environment variable.
    // We suppress it for the browser process so we can use
    // RECORD_REPLAY_METADATA_FILE but can still use the metadata here which
    // runs in the test runner process. However, cypress's convention for
    // reporter-specific environment configuration is to prefix with CYPRESS_
    // so we use that as the first priority and RECORD_REPLAY_METADATA last.
    if (process.env.CYPRESS_REPLAY_METADATA && process.env.RECORD_REPLAY_METADATA) {
      console.warn(
        "Cannot set metadata via both RECORD_REPLAY_METADATA and CYPRESS_REPLAY_METADATA. Using CYPRESS_REPLAY_METADATA."
      );
    }

    const baseMetadata =
      process.env.CYPRESS_REPLAY_METADATA || process.env.RECORD_REPLAY_METADATA || null;
    if (baseMetadata) {
      try {
        this.baseMetadata = JSON.parse(baseMetadata);
      } catch {
        console.warn("Failed to parse Replay metadata");
      }
    }
  }

  onBegin(browser: string) {
    this.browser = browser;
    this.parseConfig();
  }

  onTestBegin(spec: Cypress.Spec) {
    writeFileSync(
      this.metadataFilePath,
      JSON.stringify(
        {
          ...(this.baseMetadata || {}),
          "x-cypress": {
            id: this.getTestId(spec),
          },
        },
        undefined,
        2
      ),
      {}
    );
  }

  onTestEnd(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
    const status = result.tests.reduce<string>(
      (acc, t) => (acc === "failed" || !t.state ? acc : t.state),
      "passed"
    );

    if (!["passed", "failed"].includes(status)) return;

    const recs = listAllRecordings().filter(r => {
      if (r.metadata["x-cypress"] && typeof r.metadata["x-cypress"] === "object") {
        return (r.metadata["x-cypress"] as any).id === this.getTestId(spec);
      }

      return false;
    });

    if (recs.length > 0) {
      recs.forEach(rec =>
        add(rec.id, {
          title: spec.relative,
          ...testMetadata.init({
            title: spec.relative,
            result: status,
            path: ["", this.browser || "", spec.relative, spec.specType].filter(
              s => typeof s === "string"
            ),
            run: {
              id: this.baseId,
              title: this.runTitle,
            },
            file: spec.relative,
          }),
        })
      );
    }
  }
}

export default ReplayReporter;
