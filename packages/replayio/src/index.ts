import { finalizeCommander } from "./utils/commander";

// Commands self-register with "commander"
import "./commands/list";
import "./commands/login";
import "./commands/logout";
import "./commands/record";
import "./commands/remove";
import "./commands/update";
import "./commands/upload";
import "./commands/upload-source-maps";
import "./commands/view";

finalizeCommander();
