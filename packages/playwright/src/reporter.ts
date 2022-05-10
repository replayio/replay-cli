import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { getDirectory } from "@replayio/replay/src/utils";
import { listAllRecordings } from "@replayio/replay";
import { test as testMetadata } from "@replayio/replay/metadata";
import { writeFileSync, appendFileSync, existsSync } from "fs";
import path from "path";

const uuid = require("uuid");

import { getMetadataFilePath } from "./index";

interface ReplayReporterConfig {
  runTitle?: string;
  metadata?: Record<string, any> | string;
}

class ReplayReporter implements Reporter {
  baseId = uuid.v4();
  baseMetadata: Record<string, any> | null = null;
  runTitle?: string;

  getTestId(test: TestCase) {
    return `${this.baseId}-${test.titlePath().join("-")}`;
  }

  parseConfig(config: FullConfig) {
    let cfg: ReplayReporterConfig = {};
    config.reporter.forEach(r => {
      // the reporter is imported from the root reporter.js which imports this
      // file so we compare the base directory to see if this is our config
      if (r[0].startsWith(path.resolve(__dirname, ".."))) {
        if (r[1]) {
          if (typeof r[1] === "object") {
            cfg = r[1];
          } else {
            console.warn("Expected an object for @replayio/playwright/reporter configuration but received", typeof r[1]);
          }
        }
      }
    });

    // always favor environment variables over config so the config can be
    // overwritten at runtime
    this.runTitle = process.env.PLAYWRIGHT_REPLAY_RUN_TITLE || cfg.runTitle;

    // RECORD_REPLAY_METADATA is our "standard" metadata environment variable.
    // We suppress it for the browser process so we can use
    // RECORD_REPLAY_METADATA_FILE but can still use the metadata here which
    // runs in the test runner process. However, playwright's convention for
    // reporter-specific environment configuration is to prefix with PLAYWRIGHT_
    // so we use that as the first priority, RECORD_REPLAY_METADATA second, and
    // the config value last.
    if (process.env.PLAYWRIGHT_REPLAY_METADATA && process.env.RECORD_REPLAY_METADATA) {
      console.warn("Cannot set metadata via both RECORD_REPLAY_METADATA and PLAYWRIGHT_REPLAY_METADATA. Using PLAYWRIGHT_REPLAY_METADATA.");
    }

    const baseMetadata = process.env.PLAYWRIGHT_REPLAY_METADATA || process.env.RECORD_REPLAY_METADATA || cfg.metadata || null;
    if (baseMetadata) {
      // Since we support either a string in an environment variable or an
      // object in the cfg, we need to parse out the string value. Technically,
      // you could use a string in the config file too but that'd be unexpected.
      // Nonetheless, it'll be handled correctly here if you're into that sort
      // of thing.
      if (typeof baseMetadata === "string") {
        try {
          this.baseMetadata = JSON.parse(baseMetadata);
        } catch {
          console.warn("Failed to parse Replay metadata");
        }
      } else {
        this.baseMetadata = baseMetadata;
      }
    }
  }

  onBegin(config: FullConfig) {
    // prime all the metadata files
    for (let i = 0; i < config.workers; i++) {
      writeFileSync(getMetadataFilePath(i), "{}");
    }

    this.parseConfig(config);
  }

  onTestBegin(test: TestCase, testResult: TestResult) {
    const metadataFilePath = getMetadataFilePath(testResult.workerIndex);
    if (existsSync(metadataFilePath)) {
      writeFileSync(
        metadataFilePath,
        JSON.stringify(
          {
            ...(this.baseMetadata || {}),
            "x-playwright": {
              id: this.getTestId(test),
            },
          },
          undefined,
          2
        ),
        {}
      );
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    // skipped tests won't have a reply so nothing to do here
    if (status === "skipped") return;

    const recs = listAllRecordings().filter((r) => {
      if (
        r.metadata["x-playwright"] &&
        typeof r.metadata["x-playwright"] === "object"
      ) {
        return (r.metadata["x-playwright"] as any).id === this.getTestId(test);
      }

      return false;
    });

    if (recs.length > 0) {
      recs.forEach((rec) => {
        const metadata = {
          id: rec.id,
          kind: "addMetadata",
          metadata: {
            title: test.title,
            ...testMetadata.init({
              title: test.title,
              result: status,
              path: test.titlePath(),
              run: {
                id: this.baseId,
                title: this.runTitle
              },
              // extract the relative path from titlePath() but fall back to the
              // full path
              file: test.titlePath()[2] || test.location.file,
            }),
          },
          timestamp: Date.now(),
        };

        appendFileSync(
          path.join(getDirectory(), "recordings.log"),
          `\n${JSON.stringify(metadata)}\n`
        );
      });
    }
  }
}

export default ReplayReporter;
