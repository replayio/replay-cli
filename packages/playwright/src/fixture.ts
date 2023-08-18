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
        let idCounter = 0;

        function getPage() {
          return page;
        }

        const csiListener: ClientInstrumentationListener = {
          onApiCallBegin: (apiName, params, _stackTrace, _wallTime, userData) => {
            if (params.expression?.includes("ReplayAddAnnotation")) {
              return;
            }

            lastId = userData?.userObject?.stepId || (lastId ? `${lastId}+${++idCounter}` : null);
            if (lastId) {
              getPage()
                .evaluate(ReplayAddAnnotation, ["step:start", lastId])
                .catch(e => console.error);
            }
          },

          onApiCallEnd: (userData, error) => {
            if (userData?.userObject?.params?.expression?.includes("ReplayAddAnnotation")) {
              return;
            }

            const id = userData?.userObject?.stepId || lastId;
            if (id) {
              getPage()
                .evaluate(ReplayAddAnnotation, ["step:end", id])
                .catch(e => console.error);
            }
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
