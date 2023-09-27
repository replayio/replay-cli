import fs from "fs";
import path from "path";
import dbg from "debug";
import { xml, stringify, INode } from "txml";
import { readFileSync, writeFileSync } from "fs";
import { warn } from "@replayio/test-utils";
import { RecordingEntry } from "@replayio/replay";

const debug = dbg("replay:cypress:junit");

// #region Filesystem Ops

const gFileCache = new Map<string, (INode | string)[]>();
function readXmlFile(path: string) {
  if (gFileCache.has(path)) {
    return gFileCache.get(path);
  }

  try {
    debug("Reading %s", path);
    const contents = readFileSync(path, "utf-8");
    debug("Read %d bytes from %s", contents.length, path);
    const dom = xml(contents, { setPos: false, noChildNodes: ["?xml"] });
    gFileCache.set(path, dom);

    return dom;
  } catch (e) {
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
          // add \\ before the ? in the tagName to escape it
          str = str.replace(new RegExp(`</\\${n.tagName}>`), "");
        }

        return str;
      })
      .join("\n");
    writeFileSync(outputFile, updatedContents, "utf-8");
  } catch (e) {
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

function isNode(n: INode | string | undefined): n is INode {
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
    debug("Failed to add replay url to properties: %s", e);
  }
}

function appendReplayUrlsToFailureNodes(node: INode, replayUrls: string[]) {
  try {
    const failures = findDescendentsByTagName(node, "failure");
    debug("Found %d failures to append replay URLs", failures.length);
    failures.forEach(failure => {
      if (typeof failure.children[0] !== "string") {
        debug("<failure> contained a node instead of an error message");
        return;
      }

      failure.children[0] +=
        "\n\n View in Replay\n" + replayUrls.map(url => ` * ${url}`).join("\n");
    });
  } catch (e) {
    debug("Failed to add replay url to failure output: %s", e);
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
      debug("Failed to find root suite in reporter xml");
      debug(JSON.stringify(dom, undefined, 2));
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
    debug("Updating JUnit reporter output %o", {
      specRelativePath,
      recordings: recordings.map(r => r.id),
      projectBase,
      mochaFile,
    });

    if (mochaFile && typeof mochaFile !== "string") {
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

    debug("Found matching root suite node for %s", specRelativePath);

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
    warn(`[junit] Unexpected reporter error  for ${specRelativePath}`, e);
  }
}
