// Helpers for ensuring that information about a pause has been loaded into backend caches so that they
// can be performed quicky later on. We fill the cache by performing the queries which the devtools will
// want to perform later on.

import ProtocolClient from "./client";
import { defer } from "./utils";
import {
  Location,
  PauseData,
  Frame as ProtocolFrame,
  Object as ProtocolObject,
  Scope as ProtocolScope,
} from "@replayio/protocol";

const gLoadedSources: Map<string, Promise<void>> = new Map();

async function ensureLocationLoaded(
  client: ProtocolClient,
  sessionId: string,
  mappedLocation: Location[]
) {
  // If there are multiple locations then the generated location will be first. Load the last element
  // so that we prefer original locations.
  const { sourceId } = mappedLocation[mappedLocation.length - 1];

  if (gLoadedSources.has(sourceId)) {
    return gLoadedSources.get(sourceId);
  }

  const waiter = defer<void>();
  gLoadedSources.set(sourceId, waiter.promise);

  await client.sendCommand("Debugger.getSourceContents", { sourceId }, sessionId);
  await client.sendCommand("Debugger.getPossibleBreakpoints", { sourceId }, sessionId);

  waiter.resolve();
}

class ConstructedPauseData {
  frames: Map<string, ProtocolFrame> = new Map();
  objects: Map<string, ProtocolObject> = new Map();
  scopes: Map<string, ProtocolScope> = new Map();

  addPauseData(data: PauseData) {
    for (const frame of data.frames || []) {
      if (!this.frames.has(frame.frameId)) {
        this.frames.set(frame.frameId, frame);
      }
    }
    for (const object of data.objects || []) {
      if (!this.objects.has(object.objectId)) {
        this.objects.set(object.objectId, object);
      }
    }
    for (const scope of data.scopes || []) {
      if (!this.scopes.has(scope.scopeId)) {
        this.scopes.set(scope.scopeId, scope);
      }
    }
  }
}

// Maximum number of frames to load for a pause.
const MaxFrames = 10;

export async function ensurePauseLoaded(
  client: ProtocolClient,
  sessionId: string,
  pauseId: string,
  initialData: PauseData
) {
  const data = new ConstructedPauseData();
  data.addPauseData(initialData);

  const { frames, data: framesData } = await client.sendCommand(
    "Pause.getAllFrames",
    {},
    sessionId,
    pauseId
  );
  data.addPauseData(framesData);

  await client.sendCommand("DOM.repaintGraphics", {}, sessionId, pauseId);

  for (let i = 0; i < frames.length && i < MaxFrames; i++) {
    const frameId = frames[i];
    const frame = data.frames.get(frameId);
    if (frame) {
      await ensureLocationLoaded(client, sessionId, frame.location);
      const scopeChain = frame.originalScopeChain || frame.scopeChain;
      for (const scopeId of scopeChain) {
        if (!data.scopes.has(scopeId)) {
          const { data: scopeData } = await client.sendCommand(
            "Pause.getScope",
            { scope: scopeId },
            sessionId,
            pauseId
          );
          data.addPauseData(scopeData);
        }
        const scope = data.scopes.get(scopeId);
        if (scope && scope.object) {
          // Currently the devtools will fetch full previews for any values found on the scope chain,
          // including the window object.
          const object = data.objects.get(scope.object);
          if (!object || !object.preview || object.preview.overflow) {
            const { data: objectData } = await client.sendCommand(
              "Pause.getObjectPreview",
              { object: scope.object },
              sessionId,
              pauseId
            );
            data.addPauseData(objectData);
          }
        }
      }
    }
  }
}
