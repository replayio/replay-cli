import { Page, TestInfo, test } from "@playwright/test";
import dbg from "debug";
import { ClientInstrumentationListener, ParsedStackTrace } from "./playwrightTypes";
import WebSocket from "ws";

export interface FixtureStepStart {
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

const testTypeSymbol = Object.getOwnPropertySymbols(test).find(s => s.description === "testType");
const fixtures = testTypeSymbol ? (test as any)[testTypeSymbol]?.fixtures : null;
if (!fixtures) {
  debug("Failed to inject replay fixture");
}

fixtures.push({
  fixtures: {
    _replay: [
      async (
        { playwright, page }: { playwright: any; page: Page },
        use: () => Promise<void>,
        testInfo: TestInfo
      ) => {
        const ws = new WebSocket(`ws://localhost:52025`);
        debug("Setting up replay fixture");
        let lastId: string | undefined;

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

            ws.send(
              JSON.stringify({
                event: "step:start",
                apiName,
                params,
                stackTrace,
              })
            );

            lastId = getLastStepId(testInfo);
            addAnnotation("step:start", lastId);
          },

          onApiCallEnd: (userData, error) => {
            if (isReplayAnnotation(userData?.userObject?.params)) {
              return;
            }

            addAnnotation("step:end", lastId);
          },
        };

        const clientInstrumentation = playwright._instrumentation;
        clientInstrumentation.addListener(csiListener);

        // @ts-ignore
        await use();

        clientInstrumentation.removeListener(csiListener);
      },
      { auto: true, _title: "Replay.io fixture" },
    ],
  },
  location: {
    file: "unknown",
    line: 0,
    column: 0,
  },
});
