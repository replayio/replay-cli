/* Copyright 2020 Record Replay Inc. */

import type { Compiler } from "webpack";
import {
  uploadSourceMaps,
  UploadOptions,
  LogCallback,
} from "@replayio/sourcemap-upload";
import assert from "assert";
import path from "path";

export interface PluginOptions extends UploadOptions {
  logLevel?: "quiet" | "normal" | "verbose";
  warnOnFailure?: boolean;
}

export default class ReplaySourceMapUploadWebpackPlugin {
  options: UploadOptions;
  warnOnFailure: boolean;

  constructor(opts: PluginOptions) {
    assert(opts, "ReplaySourceMapUploadWebpackPlugin requires options");
    const { logLevel = "normal", warnOnFailure, ...restOpts } = opts;
    assert(
      typeof warnOnFailure === "boolean" ||
        typeof warnOnFailure === "undefined",
      "ReplaySourceMapUploadWebpackPlugin's 'warnOnFailure' must be a boolean or undefined."
    );

    let log: LogCallback | undefined;
    if (logLevel === "normal") {
      log = (level, message) => {
        if (level === "normal") {
          console.log(message);
        }
      };
    } else if (logLevel === "verbose") {
      log = (level, message) => {
        console.log(message);
      };
    }

    this.warnOnFailure = !!warnOnFailure;
    this.options = {
      ...restOpts,
      log,
      userAgentAddition: getNameAndVersion(),
    };
  }

  async afterAssetEmit(): Promise<void> {
    await uploadSourceMaps(this.options);
  }

  apply(compiler: Compiler): void {
    const logger =
      compiler.getInfrastructureLogger?.(
        "ReplaySourceMapUploadWebpackPlugin"
      ) || console;
    compiler.hooks.afterEmit.tapPromise("ReplayWebpackPlugin", async () => {
      try {
        await this.afterAssetEmit();
      } catch (err) {
        if (!this.warnOnFailure) {
          throw err;
        }

        logger.warn("ReplaySourceMapUploadWebpackPlugin upload failure", err);
      }
    });
  }
}

function getNameAndVersion() {
  const pkg = require(path.join(__dirname, "../package.json"));
  return `${pkg.name}/${pkg.version}`;
}
