const originalConsoleError = console.error;

console.error = function (...args) {
  // Custom logic to handle the error
  console.log("Intercepted error:", ...args);

  // Call the original console.error to ensure normal behavior
  originalConsoleError.apply(console, args);
};

// Example usage:
console.error("This is an error message");

// Your Custom Reporter class as before
class CustomReporter {
  constructor() {
    // Register handlers as early as possible
    process.prependListener("uncaughtException", error => {
      console.log("🌈 🌈 🌈 Custom Reporter: Caught uncaught exception");
      console.error(error);
    });

    process.prependListener("unhandledRejection", (reason, promise) => {
      console.log("🌈 🌈 🌈 Custom Reporter: Caught unhandled rejection");
      console.error(reason);
    });
  }

  onBegin(config) {
    console.log("Starting the test run...");
    throw new Error("OnBeginTestError");
  }

  async onEnd(result) {
    try {
      // Your cleanup or final logic here
      console.log("Finished the test run.");
      // Deliberately throw an error to test the handler
      throw new Error("Yo");
    } catch (error) {
      console.log("Custom Reporter: Caught error in onEnd");
      console.error(error);
      // Rethrow to let Playwright handle it if necessary
      throw error;
    }
  }
}

module.exports = CustomReporter;
