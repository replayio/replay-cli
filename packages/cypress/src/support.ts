import { TASK_NAME } from "./constants";

export interface StepEvent {
  event: string;
  test: string[];
  spec: string;
  timestamp: string;
  name?: string;
  args: any[];
}

const makeEvent = (event: string, cmd?: { name: string; args: string[] }) => ({
  event,
  test: Cypress.currentTest.titlePath,
  spec: Cypress.spec.relative,
  timestamp: new Date().toISOString(),
  ...(cmd
    ? {
        name: cmd.name,
        args: cmd.args,
      }
    : null),
});

const handleCypressEvent = (event: string, cmd?: { name: string; args: string[] }) => {
  if (cmd?.args[0] === TASK_NAME) return;

  const arg = makeEvent(event, cmd);

  Promise.resolve()
    .then(() => {
      // Adapted from https://github.com/archfz/cypress-terminal-report
      // @ts-ignore
      Cypress.backend("task", {
        task: TASK_NAME,
        arg,
      })
        // For some reason cypress throws empty error although the task indeed works.
        .catch(error => {
          /* noop */
        });
    })
    .catch(console.error);

  return cmd;
};

export default function register() {
  Cypress.on("command:enqueued", cmd => handleCypressEvent("step:enqueue", cmd));
  Cypress.on("command:start", cmd => handleCypressEvent("step:start", cmd.toJSON() as any));
  Cypress.on("command:end", cmd => handleCypressEvent("step:end", cmd.toJSON() as any));
  beforeEach(() => handleCypressEvent("test:start"));
  afterEach(() => handleCypressEvent("test:end"));
}

if (!process.env.RECORD_REPLAY_CYPRESS_SKIP_REGISTER) {
  register();
}
