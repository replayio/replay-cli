import { readFile, writeFileSync } from "fs-extra";
import { fetch, File, FormData } from "undici";
import { replayApiServer } from "../../config";
import { findMostRecentFile } from "../../utils/findMostRecentFile";
import { getReplayPath } from "../../utils/getReplayPath";
import { getUserAgent } from "../../utils/getUserAgent";
import { checkAuthentication } from "../../utils/initialization/checkAuthentication";
import { getCurrentRuntimeMetadata } from "../../utils/initialization/getCurrentRuntimeMetadata";
import { runtimeMetadata } from "../../utils/installation/config";
import { debug } from "./debug";

export async function reportBrowserCrash(stderr: string) {
  const errorLogPath = getReplayPath("recorder-crash.log");
  writeFileSync(errorLogPath, stderr, "utf8");

  const accessToken = await checkAuthentication();

  if (!accessToken) {
    return {
      errorLogPath,
      uploaded: false,
    };
  }

  const userAgent = getUserAgent();

  const formData = new FormData();

  formData.set("buildId", getCurrentRuntimeMetadata("chromium")?.buildId ?? "unknown");
  formData.set("createdAt", new Date().toISOString());
  formData.set("userAgent", userAgent);

  formData.append(
    "log",
    new File([await readFile(errorLogPath)], "log.txt", { type: "text/plain" })
  );

  const latestCrashpad =
    runtimeMetadata.crashpadDirectory &&
    (await findMostRecentFile(runtimeMetadata.crashpadDirectory, fileName =>
      fileName.endsWith(".dmp")
    ));
  if (latestCrashpad) {
    formData.append(
      "crashpad",
      new File([await readFile(latestCrashpad)], "crash.dmp", { type: "application/octet-stream" })
    );
  }

  try {
    const response = await fetch(`${replayApiServer}/v1/browser-crash`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": userAgent,
      },
      body: formData,
    });
    if (response.status >= 200 && response.status < 300) {
      return {
        errorLogPath,
        uploaded: true,
      };
    }
  } catch (err) {
    debug("Crash data failed to be uploaded: %o", err);
  }

  return {
    errorLogPath,
    uploaded: false,
  };
}
