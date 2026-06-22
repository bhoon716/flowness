#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = join(repoRoot, "packages", "cli", "bin.js");

function readText(pathname) {
  if (!existsSync(pathname)) {
    throw new Error(`Missing release documentation artifact: ${pathname}`);
  }

  const text = readFileSync(pathname, "utf8");
  if (text.trim().length === 0) {
    throw new Error(`Release documentation artifact is empty: ${pathname}`);
  }

  return text;
}

function runHelp() {
  const result = spawnSync(process.execPath, [cliBin, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`Failed to read CLI help: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`CLI help failed with exit code ${result.status ?? "null"}.\n${result.stderr || result.stdout}`);
  }

  return result.stdout ?? "";
}

function ensureIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} is missing "${expected}".`);
  }
}

function ensureAllIncludes(text, expectedValues, label) {
  const missing = expectedValues.filter((value) => !text.includes(value));
  if (missing.length > 0) {
    throw new Error(`${label} is missing: ${missing.join(", ")}`);
  }
}

function ensurePackageMetadata(manifest, label) {
  const expectedRepositoryUrl = "git+https://github.com/bhoon716/flowness.git";
  const expectedIssuesUrl = "https://github.com/bhoon716/flowness/issues";
  const expectedHomepage = "https://github.com/bhoon716/flowness#readme";

  if (manifest.repository?.url !== expectedRepositoryUrl) {
    throw new Error(`${label} has an unexpected repository URL: ${manifest.repository?.url ?? "missing"}`);
  }

  if (manifest.bugs?.url !== expectedIssuesUrl) {
    throw new Error(`${label} has an unexpected issues URL: ${manifest.bugs?.url ?? "missing"}`);
  }

  if (manifest.homepage !== expectedHomepage) {
    throw new Error(`${label} has an unexpected homepage: ${manifest.homepage ?? "missing"}`);
  }
}

function collectHelpUsageLines(helpOutput) {
  return helpOutput
    .split(/\r?\n/)
    .filter((line) => line.startsWith("  flowness "))
    .map((line) => line.trim());
}

function collectReadmeCommandReference(readme) {
  const sectionStart = readme.indexOf("## Command Reference");
  if (sectionStart < 0) {
    throw new Error("packages/cli/README.md is missing the Command Reference section.");
  }

  const section = readme.slice(sectionStart);
  const codeBlockMatch = section.match(/```(?:text|bash)?\n([\s\S]*?)\n```/);
  if (!codeBlockMatch) {
    throw new Error("packages/cli/README.md command reference code block is missing.");
  }

  return codeBlockMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("flowness "));
}

function ensureSameLines(actualLines, expectedLines, label) {
  if (actualLines.length !== expectedLines.length) {
    throw new Error(`${label} length mismatch: expected ${expectedLines.length}, got ${actualLines.length}`);
  }

  const mismatches = actualLines
    .map((line, index) => (line === expectedLines[index] ? null : { index, actual: line, expected: expectedLines[index] }))
    .filter((entry) => entry !== null);

  if (mismatches.length > 0) {
    const preview = mismatches.slice(0, 3).map((entry) => `#${entry.index + 1}: expected "${entry.expected}" but got "${entry.actual}"`);
    throw new Error(`${label} does not match:\n${preview.join("\n")}`);
  }
}

function main() {
  const rootReadme = readText(join(repoRoot, "README.md"));
  const koreanReadme = readText(join(repoRoot, "README.ko.md"));
  const cliReadme = readText(join(repoRoot, "packages", "cli", "README.md"));
  const coreReadme = readText(join(repoRoot, "packages", "core", "README.md"));
  const chineseReadme = readText(join(repoRoot, "README.zh-CN.md"));
  const changelog = readText(join(repoRoot, "CHANGELOG.md"));
  const releaseChecklist = readText(join(repoRoot, "docs", "release-checklist.md"));
  const releaseNotesTemplate = readText(join(repoRoot, "docs", "templates", "release-notes.md"));

  const packageEntries = [
    ["package.json", JSON.parse(readText(join(repoRoot, "package.json")))],
    ["packages/cli/package.json", JSON.parse(readText(join(repoRoot, "packages", "cli", "package.json")))],
    ["packages/core/package.json", JSON.parse(readText(join(repoRoot, "packages", "core", "package.json")))],
    ["packages/config-system/package.json", JSON.parse(readText(join(repoRoot, "packages", "config-system", "package.json")))],
    ["packages/decision-system/package.json", JSON.parse(readText(join(repoRoot, "packages", "decision-system", "package.json")))],
    ["packages/evidence-system/package.json", JSON.parse(readText(join(repoRoot, "packages", "evidence-system", "package.json")))],
    ["packages/issue-system/package.json", JSON.parse(readText(join(repoRoot, "packages", "issue-system", "package.json")))],
    ["packages/log-system/package.json", JSON.parse(readText(join(repoRoot, "packages", "log-system", "package.json")))],
    ["packages/review-system/package.json", JSON.parse(readText(join(repoRoot, "packages", "review-system", "package.json")))],
    ["packages/templates/package.json", JSON.parse(readText(join(repoRoot, "packages", "templates", "package.json")))],
    ["packages/workflow-engine/package.json", JSON.parse(readText(join(repoRoot, "packages", "workflow-engine", "package.json")))],
  ];

  const version = packageEntries[0][1].version;
  for (const [label, manifest] of packageEntries) {
    if (manifest.version !== version) {
      throw new Error(`Package versions do not match: ${label}=${manifest.version}, expected=${version}`);
    }
    ensurePackageMetadata(manifest, label);
  }
  ensureIncludes(changelog, "## [Unreleased]", "CHANGELOG.md");
  ensureIncludes(changelog, `## [${version}]`, "CHANGELOG.md");
  ensureAllIncludes(changelog, [
    "### Added",
    "### Changed",
    "### Fixed",
    "### Deprecated",
    "### Removed",
    "### Security",
  ], "CHANGELOG.md");

  ensureAllIncludes(releaseChecklist, [
    "GitHub README: `README.md`",
    "npm README for the CLI package / command reference: `packages/cli/README.md`",
    "Korean README: `README.ko.md`",
    "Changelog: `CHANGELOG.md`",
    "package.json metadata updated",
    "Release notes template: `docs/templates/release-notes.md`",
    "Versioned release notes: `docs/releases/<version>.md`",
    "flowness locate",
    "flowness test --summary",
    "flowness audit --changed",
    "flowness upgrade",
    "docs/troubleshooting/performance-improvements.md",
    "docs/troubleshooting/evidence-summary.md",
  ], "docs/release-checklist.md");

  ensureAllIncludes(releaseNotesTemplate, [
    "## Summary",
    "## Added",
    "## Changed",
    "## Fixed",
    "## Migration Notes",
    "## Breaking Changes",
    "## Commands",
    "## Verification",
    "## Known Limitations",
  ], "docs/templates/release-notes.md");

  ensureAllIncludes(rootReadme, [
    "What Flowness Is",
    "The Normal Flow",
    "Install",
    "Initialize Once",
    "Escape Hatches",
    "Docs",
    "README.ko.md",
    "conversational workflow harness",
    "flowness locate",
    "flowness test --summary",
    "flowness audit --changed",
    "flowness review:run",
    "flowness upgrade --dry-run",
    "flowness upgrade --apply",
    "Add login validation.",
    "Review the current diff.",
    "Refactor UserService safely.",
    "From now on, require tests for performance improvements.",
    "README.zh-CN.md",
    "docs/troubleshooting/performance-improvements.md",
    "docs/troubleshooting/evidence-summary.md",
  ], "README.md");

  ensureAllIncludes(cliReadme, [
    "Package at a Glance",
    "Start Here",
    "Core Concepts",
    "Escape Hatches",
    "Common Commands",
    "Command Reference",
    "Upgrade Path",
    "Release Docs",
    "README.ko.md",
    "conversational workflow harness",
    "In normal use, run `flowness init` once",
    "work through the coding agent in natural language",
    "flowness init",
    "flowness run",
    "flowness request:create",
    "flowness issue:create",
    "flowness step",
    "flowness workflow:step",
    "flowness status",
    "flowness review:run",
    "flowness locate",
    "flowness test --summary",
    "flowness audit --changed",
    "flowness upgrade --dry-run",
    "flowness upgrade --apply",
    "CHANGELOG.md",
    "release-checklist.md",
    "README.zh-CN.md",
    "docs/troubleshooting/performance-improvements.md",
    "docs/troubleshooting/evidence-summary.md",
    "## Command Reference",
  ], "packages/cli/README.md");

  ensureAllIncludes(coreReadme, [
    "conversational harness",
    "flowness init",
    "natural language",
    "README.zh-CN.md",
    "docs/troubleshooting/performance-improvements.md",
    "docs/troubleshooting/evidence-summary.md",
    "GitHub repository",
    "Issues",
    "Homepage",
  ], "packages/core/README.md");

  ensureAllIncludes(koreanReadme, [
    "README.zh-CN.md",
    "conversational workflow harness",
    "flowness init",
  ], "README.ko.md");

  ensureAllIncludes(chineseReadme, [
    "Flowness 是什么",
    "README.ko.md",
    "conversational workflow harness",
    "安装与初始化",
    "对话式工作模型",
    "Review、Issue、证据与规则",
    "升级已有项目",
    "Add login validation.",
    "Review the current diff.",
    "Refactor UserService safely.",
    "docs/troubleshooting/performance-improvements.md",
    "docs/troubleshooting/evidence-summary.md",
  ], "README.zh-CN.md");

  const helpOutput = runHelp();
  const helpUsageLines = collectHelpUsageLines(helpOutput);
  const documentedUsageLines = collectReadmeCommandReference(cliReadme);
  ensureSameLines(documentedUsageLines, helpUsageLines, "packages/cli/README.md command reference");

  ensureAllIncludes(helpOutput, [
    "flowness init",
    "flowness run",
    "flowness request:create",
    "flowness issue:create",
    "flowness step",
    "flowness workflow:step",
    "flowness review:run",
    "flowness status",
    "flowness locate",
    "flowness test",
    "flowness audit",
    "flowness upgrade",
    "flowness validate",
  ], "CLI help");

  const releaseNotesPath = join(repoRoot, "docs", "releases", `v${version}.md`);
  if (!existsSync(releaseNotesPath)) {
    throw new Error(`Missing versioned release notes: ${releaseNotesPath}`);
  }

  process.stdout.write([
    "Release documentation check passed.",
    `- Version: ${version}`,
    "- README mapping: root README.md -> GitHub, packages/cli/README.md -> npm",
    "- Command documentation: core commands and release-sensitive commands are covered",
    `- Versioned release notes: docs/releases/v${version}.md`,
  ].join("\n") + "\n");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
