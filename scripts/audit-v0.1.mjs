#!/usr/bin/env node

import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
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
  ensureOutputIncludes(helpOutput, "flowness run", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness status", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness locate", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness test", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness audit", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness evidence:add", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness rule:update", "CLI help");
  ensureOutputIncludes(helpOutput, "flowness step", "CLI help");

  const sandboxRoot = mkdtempSync(join(tmpdir(), "flowness-audit-"));
  try {
    const initOutput = runCommand("init-sandbox", flownessCommand, ["init", sandboxRoot, "--name", "audit-sandbox"]);
    ensureOutputIncludes(initOutput, "Initialized Flowness project", "init output");
    ensureOutputIncludes(initOutput, "Initialized a git repository", "init output");

    ensureFile(join(sandboxRoot, "AGENTS.md"), "init scaffold AGENTS.md");
    ensureFile(join(sandboxRoot, ".flowness/config/project.yaml"), "init scaffold config");
    ensureFile(join(sandboxRoot, ".flowness/project-profile.md"), "init scaffold project profile");
    ensureFile(join(sandboxRoot, ".flowness/context-index.json"), "init scaffold context index");
    ensureFile(join(sandboxRoot, ".flowness/commands.json"), "init scaffold commands");
    ensureFile(join(sandboxRoot, ".flowness/harness-manifest.json"), "init scaffold harness manifest");
    ensureFile(join(sandboxRoot, ".flowness/navigation.md"), "init scaffold navigation");
    ensureFile(join(sandboxRoot, ".flowness/state/active-issue.md"), "init scaffold active issue");
    ensureFile(join(sandboxRoot, ".flowness/findings/README.md"), "init scaffold findings readme");
    ensureFile(join(sandboxRoot, ".flowness/templates/finding-template.md"), "init scaffold finding template");
    ensureFile(join(sandboxRoot, ".flowness/rules/git.md"), "init scaffold git rules");
    ensureFile(join(sandboxRoot, ".flowness/rules/commit-policy.md"), "init scaffold commit policy");
    ensureFile(join(sandboxRoot, ".flowness/rules/project-overrides.md"), "init scaffold project overrides");
    ensureFile(join(sandboxRoot, ".flowness/rules/change-log.md"), "init scaffold rule change log");
    ensureFile(join(sandboxRoot, ".flowness/rules/tech/README.md"), "init scaffold tech rule index");
    ensureFile(join(sandboxRoot, ".flowness/rules/tech/react.md"), "init scaffold react rule");
    ensureFile(join(sandboxRoot, ".flowness/rules/tech/typescript.md"), "init scaffold typescript rule");
    ensureFile(join(sandboxRoot, ".flowness/scripts/flowness-runner.ts"), "init scaffold runner script");
    ensureFile(join(sandboxRoot, ".flowness/scripts/workflow-guard.ts"), "init scaffold workflow guard");
    ensureFile(join(sandboxRoot, ".flowness/scripts/check-md-size.py"), "init scaffold script");
    ensureFile(join(sandboxRoot, "docs/PRD.md"), "init scaffold PRD");
    ensureFile(join(sandboxRoot, "docs/ARD.md"), "init scaffold ARD");
    ensureFile(join(sandboxRoot, ".flowness/workflows/feature-development/README.md"), "init scaffold feature workflow");
    ensureFile(join(sandboxRoot, ".flowness/workflows/feature-development/07-commit.md"), "init scaffold feature commit step");
    ensureFile(join(sandboxRoot, ".flowness/workflows/mvp-planning/08-commit.md"), "init scaffold mvp commit step");
    ensureFile(join(sandboxRoot, ".flowness/workflows/mvp-planning/09-close.md"), "init scaffold mvp close step");

    if (!existsSync(join(sandboxRoot, ".git"))) {
      throw new Error("git init did not create a .git directory.");
    }

    if (existsSync(join(sandboxRoot, ".agent")) || existsSync(join(sandboxRoot, ".codex"))) {
      throw new Error("init created legacy .agent or .codex directories.");
    }

    const commandsJson = JSON.parse(readFileSync(join(sandboxRoot, ".flowness/commands.json"), "utf8"));
    if (commandsJson.commands.run !== "flowness run \"<request>\"") {
      throw new Error("commands.json run command is incorrect.");
    }
    if (commandsJson.commands.status !== "flowness status --issue ISSUE-ID") {
      throw new Error("commands.json status command is incorrect.");
    }
    if (commandsJson.commands.locate !== "flowness locate \"<task description>\"") {
      throw new Error("commands.json locate command is incorrect.");
    }
    if (commandsJson.commands.testSummary !== "flowness test --summary") {
      throw new Error("commands.json test command is incorrect.");
    }
    if (commandsJson.commands.auditChanged !== "flowness audit --changed") {
      throw new Error("commands.json audit command is incorrect.");
    }
    if (commandsJson.commands.evidenceAdd !== "flowness evidence:add --issue ISSUE-ID --kind file --title \"...\" --location path") {
      throw new Error("commands.json evidence command is incorrect.");
    }
    if (commandsJson.commands.ruleUpdate !== "flowness rule:update --id RULE-ID --input \"...\"") {
      throw new Error("commands.json rule update command is incorrect.");
    }

    const manifestJson = JSON.parse(readFileSync(join(sandboxRoot, ".flowness/harness-manifest.json"), "utf8"));
    if (manifestJson.version !== "0.2.0") {
      throw new Error("harness manifest version is incorrect.");
    }
    if (manifestJson.contextFiles.findings !== ".flowness/findings/README.md") {
      throw new Error("harness manifest findings path is incorrect.");
    }
    if (manifestJson.contextFiles.activeIssue !== ".flowness/state/active-issue.md") {
      throw new Error("harness manifest active issue path is incorrect.");
    }
    if (manifestJson.contextFiles.navigation !== ".flowness/navigation.md") {
      throw new Error("harness manifest navigation path is incorrect.");
    }
    if (manifestJson.contextFiles.prd !== "docs/PRD.md") {
      throw new Error("harness manifest PRD path is incorrect.");
    }
    if (manifestJson.commands.locate !== "flowness locate \"<task description>\"") {
      throw new Error("harness manifest locate command is incorrect.");
    }
    if (manifestJson.commands.testSummary !== "flowness test --summary") {
      throw new Error("harness manifest test command is incorrect.");
    }
    if (manifestJson.commands.auditChanged !== "flowness audit --changed") {
      throw new Error("harness manifest audit command is incorrect.");
    }

    const contextIndexJson = readFileSync(join(sandboxRoot, ".flowness/context-index.json"), "utf8");
    const contextIndex = JSON.parse(contextIndexJson);
    if (!Array.isArray(contextIndex.areas)) {
      throw new Error("context index is missing an areas array.");
    }
    if (!contextIndex.areas.some((area) => area.area === "findings")) {
      throw new Error("context index is missing the findings area.");
    }
    if (!contextIndex.areas.some((area) => area.area === "navigation")) {
      throw new Error("context index is missing the navigation area.");
    }
    if (!contextIndex.areas.some((area) => area.area === "source")) {
      throw new Error("context index is missing the source area.");
    }

    const agents = readFileSync(join(sandboxRoot, "AGENTS.md"), "utf8");
    ensureOutputIncludes(agents, "flowness locate \"<task description>\"", "AGENTS.md");
    ensureOutputIncludes(agents, "flowness test --summary", "AGENTS.md");
    ensureOutputIncludes(agents, "flowness audit --changed", "AGENTS.md");

    const validateOutput = runCommand("validate-sandbox", flownessCommand, ["validate"], sandboxRoot);
    ensureOutputIncludes(validateOutput, "Workflow validation passed for workspace.", "validate output");
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }

  const legacyRoot = mkdtempSync(join(tmpdir(), "flowness-legacy-"));
  try {
    mkdirSync(join(legacyRoot, ".agent"), { recursive: true });
    const legacyOutput = runCommand("legacy-sandbox", flownessCommand, ["init", legacyRoot, "--name", "legacy-sandbox"]);
    ensureOutputIncludes(legacyOutput, "Legacy .agent workspace files were detected", "legacy init output");
    ensureFile(join(legacyRoot, ".flowness/config/project.yaml"), "legacy init config");
  } finally {
    rmSync(legacyRoot, { recursive: true, force: true });
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
