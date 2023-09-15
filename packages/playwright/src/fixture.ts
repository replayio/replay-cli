import { Page, TestInfo, test } from "@playwright/test";
import dbg from "debug";
import { ClientInstrumentationListener, ParsedStackTrace } from "./playwrightTypes";
import WebSocket from "ws";
import { getServerPort } from "./server";

export interface FixtureStepStart {
  id: string;
  apiName: string;
  params: Record<string, any>;
  stackTrace: ParsedStackTrace;
}

interface FixtureStepStartEvent extends FixtureStepStart {
  event: "step:start";
}

export interface FixtureStepEnd {
  id: string;
  error: Error | undefined;
}

interface FixtureStepEndEvent extends FixtureStepEnd {
  event: "step:end";
}

export type FixtureEvent = FixtureStepStartEvent | FixtureStepEndEvent;

const debug = dbg("replay:playwright:fixture");

function ReplayAddAnnotation([event, id, data]: any) {
  // @ts-ignore
  window.__RECORD_REPLAY_ANNOTATION_HOOK__?.("replay-playwright", {
    event,
    id,
    data: data ? JSON.parse(data) : undefined,
  });
}

function getLastStepId(testInfo: any) {
  return testInfo._steps[testInfo._steps.length - 1].stepId;
}

function isReplayAnnotation(params?: any) {
  return params?.expression?.includes("ReplayAddAnnotation");
}

export async function replayFixture(
  { playwright, page }: { playwright: any; page: Page },
  use: () => Promise<void>,
  testInfo: TestInfo
) {
  const port = getServerPort();
  const ws = new WebSocket(`ws://localhost:${port}`);
  debug("Setting up replay fixture");
  let currentStepId: string | undefined;

  function addAnnotation(event: string, id?: string, data?: Record<string, any>) {
    if (id) {
      page
        .evaluate(ReplayAddAnnotation, [event, id, data ? JSON.stringify(data) : undefined])
        .catch(e => console.error);
    }
  }

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", () => reject("Socket errored"));
  });

  const csiListener: ClientInstrumentationListener = {
    onApiCallBegin: (apiName, params, stackTrace, _wallTime) => {
      if (isReplayAnnotation(params)) {
        return;
      }

      currentStepId = getLastStepId(testInfo);

      if (!currentStepId) {
        return;
      }

      ws.send(
        JSON.stringify({
          event: "step:start",
          id: currentStepId,
          apiName,
          params,
          stackTrace,
        })
      );

      addAnnotation("step:start", currentStepId, { apiName, params, stackTrace });
    },

    onApiCallEnd: (userData, error) => {
      if (isReplayAnnotation(userData?.userObject?.params)) {
        return;
      }

      ws.send(
        JSON.stringify({
          event: "step:end",
          id: currentStepId,
          error,
        })
      );

      addAnnotation("step:end", currentStepId);
    },
  };

  const clientInstrumentation = playwright._instrumentation;
  clientInstrumentation.addListener(csiListener);

  await use();

  clientInstrumentation.removeListener(csiListener);
}

export function addReplayFixture() {
  const testTypeSymbol = Object.getOwnPropertySymbols(test).find(s => s.description === "testType");
  const fixtures = testTypeSymbol ? (test as any)[testTypeSymbol]?.fixtures : null;
  if (!fixtures) {
    debug("Failed to inject replay fixture");
    return;
  }

  fixtures.push({
    fixtures: {
      _replay: [replayFixture, { auto: true, _title: "Replay.io fixture" }],
    },
    location: {
      file: __filename,
      line: 38,
      column: 1,
    },
  });
}

export function isFixtureEnabled() {
  return !!process.env.REPLAY_PLAYWRIGHT_FIXTURE;
}
