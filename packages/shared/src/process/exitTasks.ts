import { flushLog } from "../logger";
import { closeMixpanel } from "../mixpanelClient";
import { ExitTask } from "./types";

export const exitTasks: ExitTask[] = [closeMixpanel, flushLog];
