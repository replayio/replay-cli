import { Package } from "@manypkg/get-packages";
import { createFSBackedSystem, createVirtualCompilerHost } from "@typescript/vfs";
import assert from "node:assert/strict";
import { EOL } from "node:os";
import path from "path";
import { Plugin } from "rollup";
import type { FormatDiagnosticsHost, Node, Program, ResolvedModuleFull, System } from "typescript";

type EmittedFile = {
  fileName: string;
  content: string;
};

type EmittedDeclarationOutput = {
  fileName: string;
  dts: EmittedFile;
};

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

async function getProgram(
  ts: typeof import("typescript"),
  { cwd, system }: { cwd: string; system: System }
) {
  // intentionally use `ts.sys` here over `system` because the latter doesn't want to load `tsconfig.json` files:
  // https://github.com/microsoft/TypeScript-Website/blob/c341935c7f3b7b34812a7438b1b0de5c5cc42e04/packages/typescript-vfs/src/index.ts#L505-L506
  const configFileName = ts.findConfigFile(cwd, ts.sys.fileExists);
  if (!configFileName) {
    throw new Error("Not tsconfig.json found");
  }
  const result = ts.parseConfigFileTextToJson(
    configFileName,
    system.readFile(configFileName, "utf8")!
  );

  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    system,
    cwd,
    undefined,
    configFileName
  );

  // parsed.options.outDir = "dist";
  // parsed.options.declarationDir = "dist";
  parsed.options.declaration = true;
  // supporting declarationMap for bundled dependencies is tricky
  // a published package doesn't have the relevant source files
  parsed.options.declarationMap = false;
  parsed.options.emitDeclarationOnly = true;
  parsed.options.noEmit = false;

  const { compilerHost } = createVirtualCompilerHost(system, parsed.options, ts);

  return {
    options: parsed.options,
    program: ts.createProgram(parsed.fileNames, parsed.options, compilerHost),
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

  for (const fileName of depQueue) {
    const sourceFile = program.getSourceFile(fileName);
    assert(sourceFile, `Could not find source file for ${fileName}`);

    if (/\.d\.[cm]?ts$/.test(fileName)) {
      throw new Error("Declaration files should not be used. Please use a TS source file.");
    }

    let dts: EmittedFile | undefined;
    const otherEmitted: EmittedFile[] = [];
    const { diagnostics } = program.emit(
      sourceFile,
      (fileName, content) => {
        if (fileName.endsWith(".d.ts")) {
          dts = {
            fileName,
            content,
          };
        } else {
          otherEmitted.push({ fileName, content });
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
                if (specifier?.text.startsWith(".")) {
                  const resolvedModule = resolveModule(specifier.text, fileName);
                  if (resolvedModule) {
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
        `Generating TypeScript declarations for ${fileName} failed:\n${ts.formatDiagnosticsWithColorAndContext(
          diagnostics,
          diagnosticsHost
        )}${
          otherEmitted.length
            ? `\n\nTypeScript emitted other files when attempting to emit .d.ts files:\n${otherEmitted
                .map(x => `${x.fileName}\n\n${x.content}`)
                .join("\n\n")}`
            : ""
        }`
      );
    }

    emitted.push({ dts, fileName });
  }
  return emitted;
}

export function typescriptDeclarations(
  pkg: Package,
  {
    cwd,
    entrypoints,
    fsMap,
  }: {
    cwd: string;
    entrypoints: string[];
    fsMap: Map<string, string>;
  }
): Plugin {
  return {
    name: "typescript-declarations",
    options(opts) {},
    async generateBundle(opts, bundle) {
      const ts = await import("typescript");
      const system = createFSBackedSystem(fsMap, cwd, ts);
      const { program, options } = await getProgram(ts, { cwd, system });

      let moduleResolutionCache = ts.createModuleResolutionCache(
        cwd,
        x => (system.useCaseSensitiveFileNames ? x : x.toLowerCase()),
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

      for (const { dts } of declarations) {
        this.emitFile({
          type: "asset",
          fileName: path.relative(opts.dir!, dts.fileName),
          source: dts.content,
        });
      }
    },
  };
}
