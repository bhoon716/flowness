import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
}

export function toUpperSnake(value: string): string {
  const normalized = slugify(value).replace(/-/g, "-").toUpperCase();
  if (normalized !== "UNNAMED") {
    return normalized;
  }

  if (value.trim().toLowerCase() === "unnamed") {
    return "UNNAMED";
  }

  const hash = createHash("sha1").update(value).digest("hex").slice(0, 8).toUpperCase();
  return `UNNAMED-${hash}`;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(path: string): Promise<boolean> {
  const existed = await pathExists(path);
  await mkdir(path, { recursive: true });
  return !existed;
}

export async function writeTextFile(
  path: string,
  contents: string,
  force = false,
): Promise<"written" | "skipped"> {
  if (!force && await pathExists(path)) {
    return "skipped";
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
  return "written";
}

export async function appendTextFile(
  path: string,
  contents: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, contents, "utf8");
}

export async function makeExecutable(path: string): Promise<void> {
  await chmod(path, 0o755);
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readTextFile(path);
  return JSON.parse(text) as T;
}

export async function writeJsonFile(
  path: string,
  value: unknown,
  force = false,
): Promise<"written" | "skipped"> {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`, force);
}

export function joinPaths(...parts: string[]): string {
  return join(...parts);
}
