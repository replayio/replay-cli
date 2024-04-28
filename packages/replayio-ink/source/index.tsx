#!/usr/bin/env node

import { program } from "commander";
import { update } from "./commands/update/index.js";
import { watch } from "./commands/watch/index.js";

program.command("update").action(update);
program.command("watch").action(watch);

program.parse();
