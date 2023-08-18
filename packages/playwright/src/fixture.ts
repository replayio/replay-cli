import { Page, TestInfo, test } from "@playwright/test";
import dbg from "debug";
import { ClientInstrumentationListener } from "./playwrightTypes";

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
        debug("Setting up replay fixture");
        let lastId: string | undefined;

        function addAnnotation(event: string, id?: string) {
          if (id) {
            page.evaluate(ReplayAddAnnotation, [event, id]).catch(e => console.error);
          }
        }

        const csiListener: ClientInstrumentationListener = {
          onApiCallBegin: (apiName, params, _stackTrace, _wallTime, userData) => {
            if (isReplayAnnotation(params)) {
              return;
            }

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
      { auto: "all-hooks-included", _title: "Replay fixture" } as any,
    ],
  },
  location: {
    file: "unknown",
    line: 0,
    column: 0,
  },
});
