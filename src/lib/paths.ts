import path from "path";
import { mkdirSync } from "fs";

export const dataDir = path.join(process.cwd(), "data");
export const uploadsDir = path.join(dataDir, "uploads");
export const dbPath = path.join(dataDir, "poc.sqlite");

export function ensureDataDirs() {
  mkdirSync(uploadsDir, { recursive: true });
}
