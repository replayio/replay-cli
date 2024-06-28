import { Package } from "@manypkg/get-packages";
import assert from "node:assert/strict";
import { EOL } from "node:os";
import { Plugin } from "rollup";
import type { FormatDiagnosticsHost, Node, Program, ResolvedModuleFull, System } from "typescript";

type EmittedFile = {
  name: string;
  content: string;
};

type EmittedDeclarationOutput = {
  types: EmittedFile;
  filename: string;
};

function getSystem(ts: typeof import("typescript"), { cwd }: { cwd: string }): System {
  return {
    ...ts.sys,
    getCurrentDirectory: () => cwd,
  };
}

function getDiagnosticsHost(
  ts: typeof import("typescript"),
  { cwd }: { cwd: string }
): FormatDiagnosticsHost {
  return {
    getCanonicalFileName: x => (ts.sys.useCaseSensitiveFileNames ? x : x.toLowerCase()),
    getCurrentDirectory: () => cwd,
    getNewLine: () => EOL,
  };
}

function getModuleSpecifier(ts: typeof import("typescript"), node: Node) {
  // import/export { x } from "x"
  const isImportDeclaration = ts.isImportDeclaration(node);
  if (
    (isImportDeclaration || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  // type x = import('a').Blah
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return node.argument.literal;
  }
  // import x = require("x")
  if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression)) {
    return node.expression;
  }
}

async function getProgram(ts: typeof import("typescript"), host: System, dirname: string) {
  const configFileName = ts.findConfigFile(dirname, host.fileExists);
  if (!configFileName) {
    throw new Error("Not tsconfig.json found");
  }
  const result = ts.parseConfigFileTextToJson(
    configFileName,
    host.readFile(configFileName, "utf8")!
  );

  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    host,
    process.cwd(),
    undefined,
    configFileName
  );

  parsed.options.outDir = undefined;
  parsed.options.declarationDir = undefined;
  parsed.options.declaration = true;
  // supporting declarationMap for bundled dependencies is tricky
  // a published package doesn't have the relevant source files
  parsed.options.declarationMap = false;
  parsed.options.emitDeclarationOnly = true;
  parsed.options.noEmit = false;

  return {
    options: parsed.options,
    program: ts.createProgram(parsed.fileNames, parsed.options),
  };
}

function getDeclarations(
  ts: typeof import("typescript"),
  {
    cwd,
    entrypoints,
    program,
    resolveModule,
  }: {
    cwd: string;
    entrypoints: string[];
    program: Program;
    resolveModule: (moduleName: string, containingFile: string) => ResolvedModuleFull | undefined;
  }
) {
  const depQueue = new Set(entrypoints);
  const diagnosticsHost = getDiagnosticsHost(ts, { cwd });
  const emitted: EmittedDeclarationOutput[] = [];

  for (const filename of depQueue) {
    const sourceFile = program.getSourceFile(filename);
    assert(sourceFile, `Could not find source file for ${filename}`);

    if (/\.d\.[cm]?ts$/.test(filename)) {
      throw new Error("Declaration files should not be used. Please use a TS source file.");
    }

    let dts: EmittedFile | undefined;
    const otherEmitted: { name: string; content: string }[] = [];
    const { diagnostics } = program.emit(
      sourceFile,
      (name, content) => {
        if (name.endsWith(".d.ts")) {
          dts = {
            name,
            content,
          };
        } else {
          otherEmitted.push({ name, content });
        }
      },
      undefined,
      true,
      {
        afterDeclarations: [
          context =>
            (node): typeof node => {
              const visitor = (node: Node): Node => {
                const specifier = getModuleSpecifier(ts, node);
                if (specifier) {
                  const resolvedModule = resolveModule(specifier.text, filename);
                  if (
                    resolvedModule &&
                    !resolvedModule.resolvedFileName.includes("/node_modules/")
                  ) {
                    depQueue.add(resolvedModule.resolvedFileName);
                  }
                }
                return ts.visitEachChild(node, visitor, context);
              };
              return ts.visitEachChild(node, visitor, context);
            },
        ],
      }
    );

    if (!dts || diagnostics.length) {
      throw new Error(
        `Generating TypeScript declarations for ${filename} failed:\n${ts.formatDiagnosticsWithColorAndContext(
          diagnostics,
          diagnosticsHost
        )}${
          otherEmitted.length
            ? `\n\nTypeScript emitted other files when attempting to emit .d.ts files:\n${otherEmitted
                .map(x => `${x.name}\n\n${x.content}`)
                .join("\n\n")}`
            : ""
        }`
      );
    }

    emitted.push({ types: dts, filename });
  }
  return emitted;
}

export function typescriptDeclarations(
  pkg: Package,
  {
    cwd,
    entrypoints,
  }: {
    cwd: string;
    entrypoints: string[];
  }
): Plugin {
  return {
    name: "typescript-declarations",
    async generateBundle(opts, bundle) {
      const ts = await import("typescript");
      const host = getSystem(ts, { cwd });
      const { program, options } = await getProgram(ts, host, pkg.dir);

      let moduleResolutionCache = ts.createModuleResolutionCache(
        cwd,
        x => (ts.sys.useCaseSensitiveFileNames ? x : x.toLowerCase()),
        options
      );

      const resolveModule = (moduleName: string, containingFile: string) => {
        return ts.resolveModuleName(
          moduleName,
          containingFile,
          options,
          ts.sys,
          moduleResolutionCache
        ).resolvedModule;
      };

      const declarations = getDeclarations(ts, {
        cwd,
        entrypoints: entrypoints.map(entrypoint => {
          const resolvedModule = resolveModule(entrypoint, pkg.dir);
          assert(resolvedModule, 'Could not resolve module "${entrypoint}"');
          return resolvedModule.resolvedFileName;
        }),
        program,
        resolveModule,
      });

      for (const { filename, types } of declarations) {
        this.emitFile({
          type: "asset",
          fileName: filename,
          source: types.content,
        });
      }
    },
  };
}
