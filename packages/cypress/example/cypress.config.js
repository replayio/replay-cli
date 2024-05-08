const { defineConfig } = require("cypress");
const { plugin: replayPlugin } = require("@replayio/cypress");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      replayPlugin(on, config, {
        upload: true,
        apiKey: process.env.REPLAY_API_KEY,
      });
      return config;
    },
  },
});
