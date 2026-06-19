import { spawnSync } from "node:child_process";
import type { EvidenceRecord, WorkflowStepContext, WorkflowStepResult } from "@flowness-labs/core";
import { joinPaths, pathExists, readTextFile, resolveWorkspacePaths } from "@flowness-labs/core";

function runGitCommand(rootDir: string, args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync("git", [...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").trim();
}

function shouldIgnorePath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized.length === 0
    || normalized.endsWith(".DS_Store")
    || normalized.includes("/.DS_Store")
    || normalized.startsWith("node_modules/")
    || normalized.includes("/node_modules/")
    || normalized.startsWith(".git/")
    || normalized.includes("/.git/")
    || normalized.startsWith(".flowness/.flowness-cache/");
}

function isSourcePath(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path)
    || /(^|\/)src\//.test(path)
    || /(^|\/)packages\/[^/]+\/src\//.test(path);
}

function isTestPath(path: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path)
    || /(^|\/)__tests__\//.test(path)
    || /(^|\/)test\//.test(path);
}

function isDocPath(path: string): boolean {
  return /\.(md|mdx|txt|adoc|rst|json)$/i.test(path)
    || /(^|\/)(docs?|readme)(\/|$)/i.test(path)
    || normalizePath(path) === "AGENTS.md";
}

function parseChangedPaths(statusOutput: string): readonly string[] {
  const paths = new Set<string>();
  for (const rawLine of statusOutput.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length < 4) {
      continue;
    }

    const pathPart = line.slice(3).trim();
    if (pathPart.length === 0) {
      continue;
    }

    for (const segment of pathPart.split(" -> ")) {
      const normalized = normalizePath(segment);
      if (!shouldIgnorePath(normalized)) {
        paths.add(normalized);
      }
    }
  }

  return [...paths].sort();
}

function extractCommitPrefix(logOutput: string): string | null {
  for (const rawLine of logOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const match = line.match(/^([a-z]+)(?:\([^)]+\))?:\s+/i);
    if (match?.[1] !== undefined) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

function chooseCommitPrefix(files: readonly string[], recentLog: string): string {
  const recentPrefix = extractCommitPrefix(recentLog);
  if (files.every(isDocPath)) {
    return "docs";
  }

  if (files.every(isTestPath)) {
    return "test";
  }

  if (files.some(isSourcePath)) {
    if (recentPrefix !== null && ["feat", "fix", "docs", "chore", "test", "refactor"].includes(recentPrefix)) {
      return recentPrefix;
    }

    return "feat";
  }

  return recentPrefix ?? "chore";
}

function chooseCommitMessage(input: {
  readonly issueId: string;
  readonly workflowId: string;
  readonly files: readonly string[];
  readonly recentLog: string;
}): string {
  const prefix = chooseCommitPrefix(input.files, input.recentLog);
  const subject = `finalize ${input.issueId}`;
  if (input.workflowId.trim().length > 0) {
    return `${prefix}: ${subject}`;
  }

  return `${prefix}: ${subject}`;
}

function createCommandOutputEvidence(title: string, detail: string): EvidenceRecord {
  return {
    kind: "command_output",
    title,
    detail,
  };
}

export async function runCommitWorkflowStep(
  context: WorkflowStepContext,
  workflowName: string,
): Promise<WorkflowStepResult> {
  const rootDir = context.rootDir;
  const commitPolicyPath = joinPaths(rootDir, ".flowness", "rules", "commit-policy.md");
  if (!(await pathExists(commitPolicyPath))) {
    throw new Error([
      `Commit policy file is missing: ${commitPolicyPath}.`,
      "Recovery: run `flowness init` or add the commit policy before retrying commit.",
    ].join("\n"));
  }

  const policyText = await readTextFile(commitPolicyPath);
  const statusBefore = runGitCommand(rootDir, ["status", "--short", "--untracked-files=all"]);
  if (statusBefore.status === 128) {
    throw new Error([
      "Git repository is not initialized.",
      "Recovery: run `flowness init` in this directory so the commit step can create a repository.",
    ].join("\n"));
  }

  const recentLog = runGitCommand(rootDir, ["log", "--oneline", "--graph", "--decorate", "-n", "5"]);
  const intendedFiles = parseChangedPaths(statusBefore.stdout);
  if (intendedFiles.length === 0) {
    throw new Error([
      "No intended changes were available to commit.",
      "Recovery: make sure the workflow produced changes, then retry the commit step.",
    ].join("\n"));
  }

  const addArgs = ["add", "-A", "--", ...intendedFiles];
  const addResult = runGitCommand(rootDir, addArgs);
  if (addResult.status !== 0) {
    throw new Error(addResult.stderr.trim() || addResult.stdout.trim() || "Failed to stage commit files.");
  }

  const stagedDiffStat = runGitCommand(rootDir, ["diff", "--stat", "--cached"]);
  const commitMessage = chooseCommitMessage({
    issueId: context.issueId,
    workflowId: context.workflowId || workflowName,
    files: intendedFiles,
    recentLog: recentLog.stdout,
  });

  const commitResult = runGitCommand(rootDir, ["commit", "-m", commitMessage]);
  if (commitResult.status !== 0) {
    throw new Error(commitResult.stderr.trim() || commitResult.stdout.trim() || "Git commit failed.");
  }

  const hashResult = runGitCommand(rootDir, ["rev-parse", "HEAD"]);
  const commitHash = hashResult.stdout.trim();

  const evidence: EvidenceRecord[] = [
    {
      kind: "file",
      title: ".flowness/rules/commit-policy.md",
      location: commitPolicyPath,
      detail: policyText.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "Commit policy",
    },
    createCommandOutputEvidence(
      "git status --short",
      statusBefore.stdout.trim().length === 0 ? "Clean working tree before staging." : statusBefore.stdout.trim(),
    ),
    createCommandOutputEvidence(
      "git log --oneline --graph --decorate -n 5",
      recentLog.stdout.trim().length === 0 ? "No recent git log output." : recentLog.stdout.trim(),
    ),
    createCommandOutputEvidence(
      "git diff --stat --cached",
      stagedDiffStat.stdout.trim().length === 0 ? "No staged diff stat output." : stagedDiffStat.stdout.trim(),
    ),
    ...intendedFiles.map((file) => ({
      kind: "file",
      title: file,
      location: joinPaths(rootDir, file),
    }) satisfies EvidenceRecord),
    createCommandOutputEvidence("git commit", `${commitHash} ${commitMessage}`.trim()),
  ];

  return {
    summary: [
      `Committed ${commitHash}.`,
      `Message: ${commitMessage}`,
      `Files: ${intendedFiles.join(", ")}`,
    ].join("\n"),
    evidence,
  };
}
