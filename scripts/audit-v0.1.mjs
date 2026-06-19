#!/usr/bin/env node

import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const flownessCommand = process.platform === "win32" ? "flowness.cmd" : "flowness";

function runCommand(label, command, args, cwd = repoRoot) {
  process.stdout.write(`\n== ${label} ==\n$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
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

function ensureFile(pathname, description) {
  if (!existsSync(pathname)) {
    throw new Error(`${description} is missing: ${pathname}`);
  }

  const contents = readFileSync(pathname, "utf8");
  if (contents.trim().length === 0) {
    throw new Error(`${description} is empty: ${pathname}`);
  }
}

function ensureOutputIncludes(output, expected, label) {
  if (!output.includes(expected)) {
    throw new Error(`${label} did not include "${expected}".`);
  }
}

async function main() {
  runCommand("build", npmCommand, ["run", "build"]);
  runCommand("test", npmCommand, ["test"]);

  const helpOutput = runCommand("cli-help", flownessCommand, ["--help"]);
  ensureOutputIncludes(helpOutput, "Implemented commands:", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness validate", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness init", "CLI help");

  const sandboxRoot = mkdtempSync(join(tmpdir(), "flowness-audit-"));
  try {
    const initOutput = runCommand("init-sandbox", flownessCommand, ["init", sandboxRoot, "--name", "audit-sandbox"]);
    ensureOutputIncludes(initOutput, "Initialized Flowness project", "init output");

    ensureFile(join(sandboxRoot, "AGENTS.md"), "init scaffold AGENTS.md");
    ensureFile(join(sandboxRoot, ".codex/hooks.json"), "init scaffold hooks");
    ensureFile(join(sandboxRoot, ".flowness/config.yaml"), "init scaffold config");
    ensureFile(join(sandboxRoot, ".agent/README.md"), "init scaffold agent README");
    ensureFile(join(sandboxRoot, ".agent/prompts/core-agent.md"), "init scaffold core prompt");
    ensureFile(join(sandboxRoot, ".agent/prompts/review-agent.md"), "init scaffold review prompt");
    ensureFile(join(sandboxRoot, ".agent/scripts/flowness-runner.ts"), "init scaffold runner script");
    ensureFile(join(sandboxRoot, ".agent/scripts/workflow-guard.ts"), "init scaffold workflow guard");
    ensureFile(join(sandboxRoot, ".agent/scripts/check-md-size.py"), "init scaffold script");
    ensureFile(join(sandboxRoot, ".codex/hooks/package.json"), "init scaffold hook package");
    ensureFile(join(sandboxRoot, ".codex/hooks/user-prompt-submit.ts"), "init scaffold prompt hook");
    ensureFile(join(sandboxRoot, ".agent/workflows/feature-development/README.md"), "init scaffold feature workflow");

    const validateOutput = runCommand("validate-sandbox", flownessCommand, ["validate"], sandboxRoot);
    ensureOutputIncludes(validateOutput, "Workflow validation passed for workspace.", "validate output");
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }

  ensureFile(join(repoRoot, ".agent/audit/audit-log.md"), "audit log");
  ensureFile(join(repoRoot, ".agent/audit/audit-findings.md"), "audit findings");
  ensureFile(join(repoRoot, ".agent/audit/audit-final-report.md"), "audit final report");
  ensureFile(join(repoRoot, ".agent/audit/master-plan-compliance-matrix.md"), "compliance matrix");
  ensureFile(join(repoRoot, "docs/releases/v0.1-readiness.md"), "release readiness doc");

  process.stdout.write("\nAudit checks passed.\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`\n${message}\n`);
  process.exitCode = 1;
});
