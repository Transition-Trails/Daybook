import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(__dirname, ".auth");

/** Path where the storageState for a persona is saved. */
export function authFile(key: string): string {
  return path.join(AUTH_DIR, `${key}.json`);
}