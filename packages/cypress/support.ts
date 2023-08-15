import register from "./src/support";

if (!Cypress.env("REPLAY_DISABLED")) {
  register();
}
