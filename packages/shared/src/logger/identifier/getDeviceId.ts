import { readFromCache, writeToCache } from "../../cache";
import { cachePath } from "./cachePath";
import { randomUUID } from "crypto";

type Cached = {
  [id: string]: string;
};

function getDeviceId(): string {
  const cached = readFromCache<Cached>(cachePath) ?? {};
  let deviceId = cached["id"];

  if (!deviceId) {
    deviceId = randomUUID();
    cached["id"] = deviceId;
    writeToCache(cachePath, cached);
  }

  return deviceId;
}

export { getDeviceId };
