import type PackageJSON from "../package.json";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const packageJSON = require("../package.json") as typeof PackageJSON;

export const name = packageJSON.name;
export const version = packageJSON.version;
