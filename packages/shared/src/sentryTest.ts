import { initSentry, sentry } from "./sentry";

(async function foo() {
  try {
    initSentry("mimi", "b");
    throw new Error("TestError4");
  } finally {
    // sentry.close(true);
  }
})();
