#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCommand = process.execPath;
const dryRun = process.argv.slice(2).includes("--dry-run");

function runCommand(label, command, args, cwd = repoRoot) {
  process.stdout.write(`\n== ${label} ==\n$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "null"}`);
  }

  return result.stdout ?? "";
}

function printDryRunPlan() {
  process.stdout.write([
    "Release check dry run.",
    "No commands were executed.",
    "",
    "Planned commands:",
    `- ${npmCommand} run build`,
    `- ${npmCommand} run test`,
    `- ${npmCommand} run audit`,
    "- node scripts/release-docs-check.mjs",
    `- ${npmCommand} pack --dry-run --workspace packages/cli`,
  ].join("\n") + "\n");
}

function main() {
  if (dryRun) {
    printDryRunPlan();
    return;
  }

  runCommand("build", npmCommand, ["run", "build"]);
  runCommand("test", npmCommand, ["run", "test"]);
  runCommand("audit", npmCommand, ["run", "audit"]);
  runCommand("release-docs-check", nodeCommand, [join(repoRoot, "scripts", "release-docs-check.mjs")]);
  runCommand("pack-dry-run", npmCommand, ["pack", "--dry-run", "--workspace", "packages/cli"]);

  process.stdout.write("\nRelease check passed.\n");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
