import { Event, State } from "jest-circus";
import NodeEnvironment from "jest-environment-node";

class ReplayEnvironment extends NodeEnvironment {
  testPath?: string;

  constructor(config: any, context: any) {
    super(config);
    this.testPath = context.testPath;
    console.log(">>>>>>", this.testPath);
  }

  async handleTestEvent(event: Event, state: State) {
    if (event.name === "test_start") {
      process.env;
    }
  }
}

export default ReplayEnvironment;
