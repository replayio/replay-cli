import { close as closeLaunchDarklyClient } from "../launchDarklylient";
import { flushLog } from "../logger";
import { closeMixpanel } from "../mixpanelClient";
import { ExitTask } from "./types";

export const exitTasks: ExitTask[] = [closeLaunchDarklyClient, closeMixpanel, flushLog];
