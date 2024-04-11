import { execSync } from "child_process";
import { PackageManager } from "./types";

export function isPackageManagerInstalled(name: PackageManager): boolean {
  try {
    const output = execSync(`${name} --version`);
    const text = output.toString().trim();
    return /^\d+.\d+.\d+$/.test(text);
  } catch (error) {
    return false;
  }
}
