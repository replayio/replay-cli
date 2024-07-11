import { logDebug, logError, logInfo } from "@replay-cli/shared/logger";
import { warn } from "@replayio/test-utils";
import { RecordingEntry } from "@replayio/test-utils";
import fs, { readFileSync, writeFileSync } from "fs";
import path from "path";
import { INode, stringify, xml } from "txml";

// #region Filesystem Ops

const gFileCache = new Map<string, (INode | string)[]>();
function readXmlFile(path: string) {
  if (gFileCache.has(path)) {
    return gFileCache.get(path);
  }

  try {
    logDebug("ReadXmlFile:Started", { path });
    const contents = readFileSync(path, "utf-8");
    logInfo("ReadXmlFile:FileInfo", { bytes: contents.length, path });
    const dom = xml(contents, { setPos: false, noChildNodes: ["?xml"] });
    gFileCache.set(path, dom);

    return dom;
  } catch (e) {
    logError("ReadXmlFile:Failed", { path, error: e });
    warn("[junit] Failed to read and parse reporter file", e);
  }
}

function writeOutputFile(dom: (string | INode)[], outputFile: string) {
  try {
    const updatedContents = dom
      .filter(isNode)
      .map(n => {
        let str = stringify([n]);
        if (n.tagName.startsWith("?")) {
          // replace ></?xml> with ?>
          str = str.replace(new RegExp(`></\\${n.tagName}>`), "?>");
        }

        return str;
      })
      .join("\n");
    writeFileSync(outputFile, updatedContents, "utf-8");
  } catch (e) {
    logError("WriteOutputFile:Failed", { outputFile, error: e });
    warn("[junit] Failed to update reporter file", e);
  }
}

// #endregion
// #region XML Utilities

function findDescendentsByTagName(node: INode, tagName: string, matches: INode[] = []) {
  node.children.filter(isNode).forEach(c => {
    if (c.tagName === tagName) {
      matches.push(c);
    }
    findDescendentsByTagName(c, tagName, matches);
  });

  return matches;
}

function isNode(n: INode | string | undefined) {
  return !!n && typeof n !== "string";
}

function getTestSuitesNode(dom: (string | INode)[]) {
  return dom.filter(isNode).find(n => n.tagName === "testsuites");
}

function getRootSuite(dom: (string | INode)[]) {
  const ts = getTestSuitesNode(dom);
  return ts?.children.filter(isNode).find(ts => ts.attributes.name === "Root Suite");
}

// #endregion
// #region Replay mutations

function addReplayLinkProperty(node: INode, replayUrls: string[]) {
  try {
    let properties = node.children.filter(isNode).find(c => c.tagName === "properties");

    if (!properties) {
      properties = {
        tagName: "properties",
        attributes: {},
        children: [],
      } as any as INode;
      node.children.push(properties);
    }

    properties.children.push(
      ...replayUrls.map(
        replayUrl =>
          ({
            tagName: "property",
            attributes: {
              name: "Replay URL",
              value: replayUrl,
            } as any,
            children: [],
          } as any as INode)
      )
    );
  } catch (e) {
    logError("AddReplayLinkProperty:Failed", { error: e });
  }
}

function escapeForXml(content: string) {
  return content.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;");
}

function appendReplayUrlsToFailureNodes(node: INode, replayUrls: string[]) {
  try {
    const failures = findDescendentsByTagName(node, "failure");
    logInfo("AppendReplayUrlsToFailures:Started", {
      failures: failures.length,
      replayUrls,
    });
    failures.forEach(failure => {
      if (typeof failure.children[0] !== "string") {
        logInfo("AppendReplayUrlsToFailures:FailureNodeNotString", { failure });
        return;
      }

      const output = `${failure.children[0]}\n\nView in Replay\n${replayUrls
        .map(url => ` * ${url}`)
        .join("\n")}`;

      failure.children[0] = escapeForXml(output);
    });
  } catch (e) {
    logError("AppendReplayUrlsToFailures:Failed", { error: e });
  }
}

// #endregion

function findOutputFileForSpec(specRelativePath: string, xmlFiles: string[]) {
  for (const outputFile of xmlFiles) {
    const dom = readXmlFile(outputFile);
    if (!dom) {
      continue;
    }

    const testSuites = getTestSuitesNode(dom);
    const rootSuite = getRootSuite(dom);

    if (!rootSuite || !testSuites) {
      logError("FindOutputFileForSpec:FailedToFindRootSuite", { dom });
      continue;
    }

    if ("file" in rootSuite.attributes && rootSuite.attributes.file === specRelativePath) {
      return { xmlFile: outputFile, dom };
    }
  }

  return { xmlFile: undefined, dom: undefined };
}

function getPotentialReporterFiles(projectBase: string, mochaFile?: string) {
  const reporterOutputBase = path.dirname(
    path.join(projectBase, mochaFile || "./test-results.xml")
  );
  const allFiles = fs.readdirSync(reporterOutputBase);
  const xmlFiles = allFiles
    .filter(f => f.endsWith(".xml"))
    .map(xmlFile => path.join(reporterOutputBase, xmlFile));

  return xmlFiles;
}

export function updateJUnitReports(
  specRelativePath: string,
  recordings: RecordingEntry[],
  projectBase: string,
  mochaFile?: string
) {
  try {
    logInfo("UpdateJUnitReports:Started", {
      specRelativePath,
      recordings: recordings.map(r => r.id),
      projectBase,
      mochaFile,
    });

    if (mochaFile && typeof mochaFile !== "string") {
      logError("UpdateJUnitReports:InvalidMochaFile", { mochaFile });
      warn(
        "Unsupported reporterOptions configuration",
        new Error("Expected string for mocha file but received " + typeof mochaFile)
      );

      return;
    }

    const xmlFiles = getPotentialReporterFiles(projectBase, mochaFile);
    const { xmlFile, dom } = findOutputFileForSpec(specRelativePath, xmlFiles);

    if (!dom) {
      throw new Error(`Failed to find JUnit reporter output file`);
    }

    logInfo("UpdateJUnitReports:FoundRootSuite", { specRelativePath });

    const testSuites = getTestSuitesNode(dom);
    const rootSuite = getRootSuite(dom);

    if (!rootSuite || !testSuites) {
      // We've already found these in findOutputFileForSpec but confirming here to
      // keep TS happy
      throw new Error(`Failed to find root suite or test suites nodes`);
    }

    const replayUrls = recordings.map(r => `https://app.replay.io/recording/${r.id}`);
    addReplayLinkProperty(rootSuite, replayUrls);
    appendReplayUrlsToFailureNodes(testSuites, replayUrls);

    writeOutputFile(dom, xmlFile);
  } catch (e) {
    logError("UpdateJUnitReports:Failed", { specRelativePath, error: e });
    warn(`[junit] Unexpected reporter error  for ${specRelativePath}`, e);
  }
}
