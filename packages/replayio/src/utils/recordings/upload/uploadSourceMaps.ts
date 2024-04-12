import fs from "fs/promises";
import { createPromiseQueue } from "../../async/createPromiseQueue";
import { hashValue } from "../../hashValue";
import ProtocolClient from "../../protocol/ProtocolClient";
import { addOriginalSource } from "../../protocol/api/addOriginalSource";
import { addSourceMap } from "../../protocol/api/addSourceMap";
import { checkIfResourceExists } from "../../protocol/api/checkIfResourceExists";
import { createResource } from "../../protocol/api/createResource";
import { getResourceToken } from "../../protocol/api/getResourceToken";
import { debug } from "../debug";
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
      debug("Uploading source map %s for recording %s", sourceMap.path, recording.id);
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
        debug(
          "Failed to upload source map %s for recording %s: %o",
          sourceMap.path,
          recording.id,
          error
        );
        return;
      }

      for (const source of sourceMap.originalSources) {
        queueGroup.add(async () => {
          debug(
            "Uploading original source %s for source map %s for recording %s",
            source.path,
            sourceMap.path,
            recording.id
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
            debug(
              "Failed to upload original source %s for source map %s for recording %s: %o",
              source.path,
              sourceMap.path,
              recording.id,
              error
            );
          }
        });
      }
    });
  }

  await queueGroup.waitUntilIdle();
}
