import { Plugin } from "rollup";
import normalizePath from "normalize-path";
import path from "path";
import { Package } from "@manypkg/get-packages";

export async function getProgram(dirname: string, ts: typeof import("typescript")) {
  const configFileName = ts.findConfigFile(dirname, ts.sys.fileExists);
  if (!configFileName) {
    throw new Error("Not tsconfig.json found");
  }
  const result = ts.parseConfigFileTextToJson(
    configFileName,
    ts.sys.readFile(configFileName, "utf8")!
  );

  const parsed = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
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

export function typescriptDeclarations(pkg: Package): Plugin {
  return {
    name: "typescript-declarations",
    async generateBundle(opts, bundle) {
      const typescript = await import("typescript");

      const { program, options } = await getProgram(pkg.dir, typescript);

      let normalizedDirname = normalizePath(pkg.dir);

      let moduleResolutionCache = typescript.createModuleResolutionCache(
        normalizedDirname,
        x => x,
        options
      );

      const resolveModule = (moduleName: string, containingFile: string) => {
        let { resolvedModule } = typescript.resolveModuleName(
          moduleName,
          containingFile,
          options,
          typescript.sys,
          moduleResolutionCache
        );
        return resolvedModule;
      };
    },
  };
}
