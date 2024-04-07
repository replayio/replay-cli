import { DeclarationKind, ExpressionKind } from "ast-types/gen/kinds";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import chalk from "chalk";
import jscodeshift, { ArrayExpression, ObjectExpression, Property } from "jscodeshift";
import path from "path";
import { th } from "date-fns/locale";

const j = jscodeshift.withParser("ts");

export function findPlaywrightConfig() {
  const possibleNames = ["playwright.config.js", "playwright.config.ts"];
  for (const name of possibleNames) {
    const fullPath = path.join(process.cwd(), name);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export function setupReplayConfig(source: string) {
  const root = j(source);

  function ensureReplayImports() {
    const hasReplayImport =
      root
        .find(j.ImportDeclaration, {
          source: { value: "@replayio/playwright" },
        })
        .size() > 0;

    if (hasReplayImport) {
      console.log(chalk.yellow("Replay imports already exist in the playwright.config.ts file."));
      throw new Error("Replay imports already exist in the playwright.config.ts file.");
    }

    const isESModule = root.find(j.ImportDeclaration).size() > 0;

    if (isESModule) {
      root
        .find(j.ImportDeclaration)
        .at(-1)
        .insertAfter("import { devices as replayDevices } from '@replayio/playwright';");
    } else {
      root
        .find(j.VariableDeclaration)
        .at(-1)
        .insertAfter("const replayDevices = require('@replayio/playwright').devices;");
    }
  }

  function extractConfigObject(node: DeclarationKind | ExpressionKind) {
    // Directly exported object. Not sure if this is a valid case.
    if (node.type === "ObjectExpression") {
      return node;
    }
    // Call to defineConfig
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "defineConfig" &&
      node.arguments.length > 0
    ) {
      return node.arguments[0].type === "ObjectExpression" ? node.arguments[0] : null;
    }
    return null;
  }

  function extractConfigObjectFromRequire(node: DeclarationKind | ExpressionKind) {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "require" &&
      node.arguments.length === 1 &&
      node.arguments[0].type === "Literal"
    ) {
      // Case where configuration is required from another module
      // Theoretically, we'd need to read and parse the required file. But we'll ignore that for now.
      console.log(chalk.yellow("Playwright configuration is required from another module. "));
    }
    return null;
  }

  function updateConfigObject() {
    root.find(j.ExportDefaultDeclaration).forEach(path => {
      const configObject =
        extractConfigObject(path.value.declaration) ||
        extractConfigObjectFromRequire(path.value.declaration);

      if (configObject) {
        modifyConfigObject(configObject);
      }
    });

    // Handle module.exports for CommonJS explicitly
    root
      .find(j.AssignmentExpression, {
        left: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "module" },
          property: { type: "Identifier", name: "exports" },
        },
      })
      .forEach(path => {
        const configObject =
          extractConfigObject(path.value.right) || extractConfigObjectFromRequire(path.value.right);

        if (configObject) {
          modifyConfigObject(configObject);
        }
      });

    function modifyConfigObject(configObject: ObjectExpression) {
      if (configObject.type === "ObjectExpression") {
        let reporterPropertyIndex = configObject.properties.findIndex(
          (prop: any) =>
            prop.type === "ObjectProperty" &&
            prop.key.type === "Identifier" &&
            prop.key.name === "reporter"
        );

        if (reporterPropertyIndex === -1) {
          const newReporterProperty = j.property(
            "init",
            j.identifier("reporter"),
            j.arrayExpression([])
          );
          configObject.properties.push(newReporterProperty);
          reporterPropertyIndex = configObject.properties.length - 1;
        }

        const reporterProperty = configObject.properties[reporterPropertyIndex] as Property;
        if (reporterProperty.value.type !== "ArrayExpression") {
          const newValue = reporterProperty.value;
          reporterProperty.value = j.arrayExpression([newValue] as any);
        }

        reporterProperty.value.elements.push(
          j.arrayExpression([
            j.literal("@replayio/playwright/reporter"),
            j.objectExpression([
              j.property(
                "init",
                j.identifier("apiKey"),
                j.memberExpression(
                  j.memberExpression(j.identifier("process"), j.identifier("env")),
                  j.identifier("REPLAY_API_KEY")
                )
              ),
              j.property("init", j.identifier("upload"), j.literal(true)),
            ]),
          ])
        );

        let projectsPropertyIndex = configObject.properties.findIndex(
          (prop: any) =>
            prop.type === "ObjectProperty" &&
            prop.key.type === "Identifier" &&
            prop.key.name === "projects"
        );

        if (projectsPropertyIndex === -1) {
          const newProjectsProperty = j.property(
            "init",
            j.identifier("projects"),
            j.arrayExpression([])
          );
          configObject.properties.push(newProjectsProperty);
          projectsPropertyIndex = configObject.properties.length - 1;
        }

        const projectsProperty = configObject.properties[projectsPropertyIndex] as Property;
        const projectsValueArray = projectsProperty.value as ArrayExpression;
        projectsValueArray.elements.push(
          j.objectExpression([
            j.property("init", j.identifier("name"), j.literal("replay-chromium")),
            j.property(
              "init",
              j.identifier("use"),
              j.objectExpression([
                j.spreadElement(
                  j.memberExpression(
                    j.identifier("replayDevices"),
                    j.literal("Replay Chromium"),
                    true
                  )
                ),
              ])
            ),
          ])
        );
      }
    }
  }

  ensureReplayImports();
  updateConfigObject();

  return root.toSource({ parser: "ts" });
}

export function setupReplayInPlaywrightConfig(configPath: string) {
  const source = readFileSync(configPath, { encoding: "utf8" });

  const updatedSource = setupReplayConfig(source);

  writeFileSync(configPath, updatedSource, { encoding: "utf8" });
}

export function installReplayDependencies(projectDir: string) {
  let command: string;

  if (existsSync(path.join(projectDir, "package-lock.json"))) {
    command = `npm install --save-dev @replayio/playwright`;
  } else if (existsSync(path.join(projectDir, "pnpm-lock.yaml"))) {
    command = `pnpm add --save-dev @replayio/playwright`;
  } else if (existsSync(path.join(projectDir, "yarn.lock"))) {
    command = `yarn add --dev @replayio/playwright`;
  } else if (existsSync(path.join(projectDir, "bun.lockb"))) {
    command = `bun add --dev @replayio/playwright`;
  } else {
    console.error("No supported package manager found.");
    throw new Error("No supported package manager found.");
  }

  execSync(command, { cwd: projectDir });
}
