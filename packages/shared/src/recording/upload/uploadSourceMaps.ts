import fs from "fs/promises";
import { createPromiseQueue } from "../../async/createPromiseQueue";
import { hashValue } from "../../hashValue";
import { logDebug } from "../../logger";
import ProtocolClient from "../../protocol/ProtocolClient";
import { addOriginalSource } from "../../protocol/api/addOriginalSource";
import { addSourceMap } from "../../protocol/api/addSourceMap";
import { checkIfResourceExists } from "../../protocol/api/checkIfResourceExists";
import { createResource } from "../../protocol/api/createResource";
import { getResourceToken } from "../../protocol/api/getResourceToken";
import { LocalRecording } from "../types";

async function ensureResource(client: ProtocolClient, content: string) {
  const { token } = await getResourceToken(client, { hash: `sha256:${hashValue(content)}` });
  const resource = {
    token,
    saltedHash: `sha256:${hashValue(token + content)}`,
  };
  const { exists } = await checkIfResourceExists(client, {
    resource,
  });
  if (exists) {
    return resource;
  }
  return (await createResource(client, { content })).resource;
}

const queue = createPromiseQueue({ concurrency: 10 });

export async function uploadSourceMaps(client: ProtocolClient, recording: LocalRecording) {
  const queueGroup = queue.fork();

  for (const sourceMap of recording.metadata.sourceMaps) {
    queueGroup.add(async () => {
      logDebug(`Uploading source map ${sourceMap.path} for recording ${recording.id}`, {
        recording,
        sourceMap,
      });
      let sourceMapId: string;
      try {
        const sourceMapContent = await fs.readFile(sourceMap.path, "utf-8");
        const result = await addSourceMap(client, {
          recordingId: recording.id,
          baseURL: sourceMap.baseURL,
          targetContentHash: sourceMap.targetContentHash,
          targetURLHash: sourceMap.targetURLHash,
          targetMapURLHash: sourceMap.targetMapURLHash,
          resource: await ensureResource(client, sourceMapContent),
        });
        sourceMapId = result.id;
      } catch (error) {
        logDebug(`Failed to upload source map ${sourceMap.path} for recording ${recording.id}`, {
          error,
          recording,
          sourceMap,
        });
        return;
      }

      for (const source of sourceMap.originalSources) {
        queueGroup.add(async () => {
          logDebug(
            `Uploading original source ${source.path} for source map ${sourceMap.path} for recording ${recording.id}`,
            { recording, source, sourceMap }
          );
          try {
            const sourceContent = await fs.readFile(source.path, "utf-8");
            await addOriginalSource(client, {
              recordingId: recording.id,
              parentId: sourceMapId,
              parentOffset: source.parentOffset,
              resource: await ensureResource(client, sourceContent),
            });
          } catch (error) {
            logDebug(
              `Failed to upload original source ${source.path} for source map ${sourceMap.path} for recording ${recording.id}`,
              { error, recording, source, sourceMap }
            );
          }
        });
      }
    });
  }

  await queueGroup.waitUntilIdle();
}
