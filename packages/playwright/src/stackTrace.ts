/**
 * based on:
 * https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright-core/src/utils/stackTrace.ts
 * https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright-core/src/utilsBundle.ts
 * https://github.com/microsoft/playwright/blob/2734a0534256ffde6bd8dc8d27581c7dd26fe2a6/packages/playwright/src/util.ts
 *
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import path from "path";
import StackUtils from "stack-utils";
import url from "url";
import { StackFrame } from "./playwrightTypes";

type RawStack = string[];

// this is slightly different from what can be found in Playwright:
// https://github.com/microsoft/playwright/blob/c9df73bc59799794ab137591828ad1e1e249d0ca/packages/playwright/src/util.ts#L29-L30
// 1. PLAYWRIGHT_TEST_PATH points to `playwright` package there
// 2. Playwright doesn't filter out `@playwright/test` frames at all. Perhaps it's not needed but it seems like a good idea here
const PLAYWRIGHT_TEST_PATH = path.dirname(require.resolve("@playwright/test/package.json"));
let PLAYWRIGHT_PATH: string | undefined;
try {
  // @playwright/test started to depend on playwright package in 1.38.0
  PLAYWRIGHT_PATH = path.dirname(
    require.resolve("playwright/package.json", { paths: [PLAYWRIGHT_TEST_PATH] })
  );
} catch (err) {}
const PLAYWRIGHT_CORE_PATH = path.dirname(
  require.resolve("playwright-core/package.json", {
    paths: [PLAYWRIGHT_PATH || PLAYWRIGHT_TEST_PATH],
  })
);
const REPLAYIO_PLAYWRIGHT_PATH = path.dirname(require.resolve("@replayio/playwright/package.json"));

const nodeInternals = StackUtils.nodeInternals();
const nodeMajorVersion = +process.versions.node.split(".")[0];
const stackUtils = new StackUtils({ internals: nodeInternals });

export function captureRawStack(): RawStack {
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const error = new Error();
  const stack = error.stack || "";
  Error.stackTraceLimit = stackTraceLimit;
  return stack.split("\n");
}

function parseStackTraceLine(line: string): StackFrame | null {
  if (
    !process.env.PWDEBUGIMPL &&
    nodeMajorVersion < 16 &&
    nodeInternals.some(internal => internal.test(line))
  )
    return null;
  const frame = stackUtils.parseLine(line);
  if (!frame) return null;
  if (
    !process.env.PWDEBUGIMPL &&
    (frame.file?.startsWith("internal") || frame.file?.startsWith("node:"))
  )
    return null;
  if (!frame.file) return null;
  // ESM files return file:// URLs, see here: https://github.com/tapjs/stack-utils/issues/60
  const file = frame.file.startsWith("file://")
    ? url.fileURLToPath(frame.file)
    : path.resolve(process.cwd(), frame.file);
  return {
    file,
    line: frame.line || 0,
    column: frame.column || 0,
    function: frame.function,
  };
}

function filterStackFile(file: string) {
  if (!process.env.PWDEBUGIMPL && file.startsWith(PLAYWRIGHT_TEST_PATH)) return false;
  if (!process.env.PWDEBUGIMPL && PLAYWRIGHT_PATH && file.startsWith(PLAYWRIGHT_PATH)) return false;
  if (!process.env.PWDEBUGIMPL && file.startsWith(PLAYWRIGHT_CORE_PATH)) return false;
  if (!process.env.PWDEBUGIMPL && file.startsWith(REPLAYIO_PLAYWRIGHT_PATH)) return false;
  return true;
}

export function filteredStackTrace(rawStack: RawStack): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of rawStack) {
    const frame = parseStackTraceLine(line);
    if (!frame || !frame.file) continue;
    if (!filterStackFile(frame.file)) continue;
    frames.push(frame);
  }
  return frames;
}
