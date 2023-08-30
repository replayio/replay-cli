import { Page, TestInfo, test } from "@playwright/test";
import dbg from "debug";
import { ClientInstrumentationListener, ParsedStackTrace } from "./playwrightTypes";
import WebSocket from "ws";

export interface FixtureStepStart {
  id: string;
  apiName: string;
  params: Record<string, any>;
  stackTrace: ParsedStackTrace;
}

interface FixtureStepStartEvent extends FixtureStepStart {
  event: "step:start";
}

export type FixtureEvent = FixtureStepStartEvent;

const debug = dbg("replay:playwright:fixture");

function ReplayAddAnnotation([event, id]: string[]) {
  // @ts-ignore
  window.__RECORD_REPLAY_ANNOTATION_HOOK__?.("replay-playwright", {
    event,
    id,
  });
}

function getLastStepId(testInfo: any) {
  return testInfo._steps[testInfo._steps.length - 1].stepId;
}

function isReplayAnnotation(params?: any) {
  return params?.expression?.includes("ReplayAddAnnotation");
}

async function replayFixture(
  { playwright, page }: { playwright: any; page: Page },
  use: () => Promise<void>,
  testInfo: TestInfo
) {
  const ws = new WebSocket(`ws://localhost:52025`);
  debug("Setting up replay fixture");
  let currentStepId: string | undefined;

  function addAnnotation(event: string, id?: string) {
    if (id) {
      page.evaluate(ReplayAddAnnotation, [event, id]).catch(e => console.error);
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

      addAnnotation("step:start", currentStepId);
    },

    onApiCallEnd: (userData, error) => {
      if (isReplayAnnotation(userData?.userObject?.params)) {
        return;
      }

      addAnnotation("step:end", currentStepId);
    },
  };

  const clientInstrumentation = playwright._instrumentation;
  clientInstrumentation.addListener(csiListener);

  await use();

  clientInstrumentation.removeListener(csiListener);
}

if (process.env.REPLAY_PLAYWRIGHT_FIXTURE) {
  const testTypeSymbol = Object.getOwnPropertySymbols(test).find(s => s.description === "testType");
  const fixtures = testTypeSymbol ? (test as any)[testTypeSymbol]?.fixtures : null;
  if (!fixtures) {
    debug("Failed to inject replay fixture");
  }

  fixtures.push({
    fixtures: {
      _replay: [replayFixture, { auto: true, _title: "Replay.io fixture" }],
    },
    location: {
      file: "unknown",
      line: 0,
      column: 0,
    },
  });
}
