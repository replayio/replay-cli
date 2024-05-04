import { createLog as createLogExternal } from "replayio";

export const debug = createLogExternal("watch", "watch-output.log");
