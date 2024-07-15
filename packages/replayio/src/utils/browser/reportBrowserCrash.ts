import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { getReplayPath } from "@replay-cli/shared/getReplayPath";
import { logError } from "@replay-cli/shared/logger";
import { getUserAgent } from "@replay-cli/shared/session/getUserAgent";
import { readFile, writeFileSync } from "fs-extra";
import { File, FormData, fetch } from "undici";
import { replayApiServer } from "../../config";
import { getCurrentRuntimeMetadata } from "../../utils/initialization/getCurrentRuntimeMetadata";
import { runtimeMetadata } from "../../utils/installation/config";
import { findMostRecentFile } from "../findMostRecentFile";

export async function reportBrowserCrash(stderr: string) {
  const errorLogPath = getReplayPath("recorder-crash.log");
  writeFileSync(errorLogPath, stderr, "utf8");

  const { accessToken } = await getAccessToken();
  if (!accessToken) {
    return {
      errorLogPath,
      uploaded: false,
    };
  }

  const userAgent = await getUserAgent();

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
    if (response.ok) {
      return {
        errorLogPath,
        uploaded: true,
      };
    }
  } catch (error) {
    logError("ReportBrowserCrash:FailedToUpload", { error });
  }

  return {
    errorLogPath,
    uploaded: false,
  };
}
