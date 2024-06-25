import { installLatestRuntimeRelease } from "@replay-cli/shared/runtime/installLatestRuntimeRelease";

async function install() {
  await installLatestRuntimeRelease();
}

export default install;
