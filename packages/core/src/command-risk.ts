import { spawnSync } from "node:child_process";
import { pathExists } from "./filesystem.js";

export type CommandRiskLevel = "low" | "medium" | "high" | "critical";

export interface CommandRiskAnalysis {
  readonly command: string;
  readonly normalizedCommand: string;
  readonly category: string;
  readonly riskLevel: CommandRiskLevel;
  readonly warning: string;
  readonly dryRunImpact: readonly string[];
  readonly safeAlternative: string | null;
  readonly requiresExplicitConfirmation: boolean;
  readonly intentClarification: readonly string[];
}

interface GitSnapshot {
  readonly currentBranch: string;
  readonly headCommit: string | null;
  readonly statusLines: readonly string[];
  readonly changedFiles: readonly string[];
  readonly untrackedFiles: readonly string[];
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

function runGit(rootDir: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return "";
  }

  return (result.stdout ?? "").trim();
}

async function collectGitSnapshot(rootDir: string): Promise<GitSnapshot | null> {
  if (!(await pathExists(`${rootDir}/.git`))) {
    return null;
  }

  const status = runGit(rootDir, ["status", "--short", "--untracked-files=all"]);
  const statusLines = status.length === 0 ? [] : status.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const changedFiles: string[] = [];
  const untrackedFiles: string[] = [];

  for (const line of statusLines) {
    const trimmed = line.trimEnd();
    const file = trimmed.replace(/^[ MADRCU?!]{1,3}/, "").trim();
    if (file.length > 0) {
      if (trimmed.startsWith("??")) {
        untrackedFiles.push(file);
      } else {
        changedFiles.push(file);
      }
    }
  }

  const currentBranch = runGit(rootDir, ["branch", "--show-current"]) || "detached HEAD";
  const headCommit = runGit(rootDir, ["rev-parse", "--short", "HEAD"]) || null;

  return {
    currentBranch,
    headCommit,
    statusLines,
    changedFiles,
    untrackedFiles,
  };
}

function formatFileList(label: string, files: readonly string[]): string {
  return `${label}: ${files.length === 0 ? "none" : files.join(", ")}`;
}

function buildGitImpactLines(snapshot: GitSnapshot | null, command: string, affectedFiles: readonly string[], commitRange: string | null): string[] {
  const lines: string[] = [];
  if (snapshot === null) {
    lines.push("Git dry-run impact: no repository snapshot available.");
    return lines;
  }

  lines.push(`Current branch: ${snapshot.currentBranch}`);
  lines.push(`HEAD: ${snapshot.headCommit ?? "unknown"}`);
  lines.push(`Changed files: ${snapshot.changedFiles.length === 0 ? "none" : snapshot.changedFiles.join(", ")}`);
  lines.push(`Untracked files: ${snapshot.untrackedFiles.length === 0 ? "none" : snapshot.untrackedFiles.join(", ")}`);
  lines.push(`Working tree status: ${snapshot.statusLines.length === 0 ? "clean" : "dirty"}`);
  lines.push(formatFileList("Files that would be affected", affectedFiles));
  if (commitRange !== null) {
    lines.push(`Commit range affected: ${commitRange}`);
  }
  lines.push(`Command: ${command}`);
  return lines;
}

function analyzeGitReset(command: string, snapshot: GitSnapshot | null): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  const hardReset = /(?:^|\s)--hard(?:\s|$)/i.test(normalizedCommand);
  const softReset = /(?:^|\s)--soft(?:\s|$)/i.test(normalizedCommand);
  const mergeReset = /(?:^|\s)--merge(?:\s|$)/i.test(normalizedCommand);
  const keepReset = /(?:^|\s)--keep(?:\s|$)/i.test(normalizedCommand);
  const targetMatch = normalizedCommand.match(/\bgit\s+reset\b(?:\s+--(?:soft|mixed|hard|merge|keep))*(?:\s+)([^\s].*)$/i);
  const target = targetMatch?.[1]?.trim() ?? null;
  const intentClarification = [
    "Unstage files only",
    "Move branch pointer",
    "Discard working tree changes",
    "Reset to remote state",
  ];
  const category = hardReset ? "git-reset-hard" : "git-reset";
  const riskLevel: CommandRiskLevel = hardReset ? "critical" : softReset || mergeReset || keepReset ? "high" : "high";
  const affectedFiles = snapshot === null ? [] : [
    ...snapshot.changedFiles,
    ...snapshot.untrackedFiles,
  ];
  const commitRange = target === null ? null : `${snapshot?.headCommit ?? "HEAD"}..${target}`;

  return {
    command,
    normalizedCommand,
    category,
    riskLevel,
    warning: hardReset
      ? "git reset --hard can discard tracked working tree changes and rewrite the local checkout state. I will not run it without an explicit confirmation."
      : "git reset can unstage files, move the branch pointer, or discard local changes. I will not guess the intent.",
    dryRunImpact: buildGitImpactLines(snapshot, normalizedCommand, affectedFiles, commitRange),
    safeAlternative: hardReset
      ? "Use `git restore --staged <files>` to unstage or `git restore --worktree --source=HEAD -- <files>` to discard only selected files."
      : "Use `git restore --staged <files>` to unstage specific files, or `git switch -c <backup-branch>` before rewriting history.",
    requiresExplicitConfirmation: true,
    intentClarification,
  };
}

function analyzeGitClean(command: string, snapshot: GitSnapshot | null): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  const dryRunOnly = /(?:^|\s)-n(?:\s|$)|(?:^|\s)--dry-run(?:\s|$)/i.test(normalizedCommand);
  const affectedFiles = dryRunOnly || snapshot === null ? [] : snapshot.untrackedFiles;

  return {
    command,
    normalizedCommand,
    category: "git-clean",
    riskLevel: dryRunOnly ? "medium" : "high",
    warning: dryRunOnly
      ? "git clean dry-run is informational. It shows untracked files that would be removed."
      : "git clean can permanently remove untracked files. I will not run it without an explicit confirmation.",
    dryRunImpact: buildGitImpactLines(snapshot, normalizedCommand, affectedFiles, null),
    safeAlternative: "Use `git clean -nd` first, or remove only the specific untracked paths you expect.",
    requiresExplicitConfirmation: !dryRunOnly,
    intentClarification: ["Preview the files", "Remove only selected untracked files", "Delete everything untracked"],
  };
}

function analyzeGitCheckoutRestore(command: string, snapshot: GitSnapshot | null): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  return {
    command,
    normalizedCommand,
    category: "git-restore",
    riskLevel: "high",
    warning: "git checkout . and git restore . can discard local changes across the working tree.",
    dryRunImpact: buildGitImpactLines(snapshot, normalizedCommand, snapshot === null ? [] : snapshot.changedFiles, null),
    safeAlternative: "Use `git restore --staged <files>` or `git restore --worktree --source=HEAD -- <files>` for selected paths.",
    requiresExplicitConfirmation: true,
    intentClarification: ["Restore specific files", "Unstage specific files", "Reset the full tree"],
  };
}

function analyzeForcePush(command: string): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  return {
    command,
    normalizedCommand,
    category: "force-push",
    riskLevel: "high",
    warning: "Force pushing can rewrite shared branch history and discard other work.",
    dryRunImpact: [
      "Current branch: unknown",
      "Changed files: unavailable from the push command alone",
      "Remote history: would be rewritten if the push succeeds",
      `Command: ${normalizedCommand}`,
    ],
    safeAlternative: "Use a normal push first, or coordinate a branch backup and explicit approval before rewriting history.",
    requiresExplicitConfirmation: true,
    intentClarification: ["Normal push", "Safe lease-based force push", "Rewrite shared history"],
  };
}

function analyzeMergeRebase(command: string): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  return {
    command,
    normalizedCommand,
    category: normalizedCommand.startsWith("git merge") ? "git-merge" : "git-rebase",
    riskLevel: "high",
    warning: normalizedCommand.startsWith("git merge")
      ? "git merge can introduce conflicts and unexpected merge commits."
      : "git rebase rewrites commit history and can drop local changes if used carelessly.",
    dryRunImpact: [
      "Current branch: unknown",
      "Changed files: unavailable from the command alone",
      "Commit range affected: depends on the branch arguments",
      `Command: ${normalizedCommand}`,
    ],
    safeAlternative: normalizedCommand.startsWith("git merge")
      ? "Review the target branch and merge plan first, then merge with explicit approval."
      : "Use `git rebase -i` only after backing up the branch or creating a safety branch.",
    requiresExplicitConfirmation: true,
    intentClarification: ["Fast-forward only", "Interactive rebase", "Merge commit with review"],
  };
}

function analyzeRmRf(command: string): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  return {
    command,
    normalizedCommand,
    category: "rm-rf",
    riskLevel: "critical",
    warning: "rm -rf can delete directories recursively and permanently.",
    dryRunImpact: [
      "Current branch: unknown",
      "Changed files: unavailable from the command alone",
      "Files removed: all paths matching the command arguments",
      `Command: ${normalizedCommand}`,
    ],
    safeAlternative: "Use a targeted removal command that names only the expected paths, or inspect the tree first.",
    requiresExplicitConfirmation: true,
    intentClarification: ["Remove one file", "Remove one directory", "Remove all generated output", "Clean the workspace"],
  };
}

function analyzePackageLockRemoval(command: string): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  return {
    command,
    normalizedCommand,
    category: "package-lock-removal",
    riskLevel: "high",
    warning: "Removing package-lock.json can change dependency resolution and reproducibility.",
    dryRunImpact: [
      "Package lock file: package-lock.json would be removed or recreated",
      `Command: ${normalizedCommand}`,
    ],
    safeAlternative: "Keep the lockfile unless you intentionally need to regenerate it under review.",
    requiresExplicitConfirmation: true,
    intentClarification: ["Regenerate the lockfile", "Remove a stale lockfile", "Keep the lockfile untouched"],
  };
}

function analyzeDatabaseDestructive(command: string): CommandRiskAnalysis {
  const normalizedCommand = normalizeCommand(command);
  return {
    command,
    normalizedCommand,
    category: "database-destructive",
    riskLevel: "critical",
    warning: "Destructive database commands can permanently delete data or schema.",
    dryRunImpact: [
      "Database object: depends on the command and target environment",
      `Command: ${normalizedCommand}`,
    ],
    safeAlternative: "Use a migration or backup-first path, then re-run with explicit approval.",
    requiresExplicitConfirmation: true,
    intentClarification: ["Drop a table", "Reset local data", "Run a migration", "Clean test data only"],
  };
}

export async function analyzeCommandRisk(command: string, rootDir?: string): Promise<CommandRiskAnalysis> {
  const normalizedCommand = normalizeCommand(command);
  const snapshot = rootDir === undefined ? null : await collectGitSnapshot(rootDir);

  if (/^git\s+reset\b/i.test(normalizedCommand)) {
    return analyzeGitReset(normalizedCommand, snapshot);
  }

  if (/^git\s+clean\b/i.test(normalizedCommand)) {
    return analyzeGitClean(normalizedCommand, snapshot);
  }

  if (/^git\s+(checkout|restore)\s+\./i.test(normalizedCommand)) {
    return analyzeGitCheckoutRestore(normalizedCommand, snapshot);
  }

  if (/^git\s+push\b/i.test(normalizedCommand) && /--force(?:-with-lease)?\b/i.test(normalizedCommand)) {
    return analyzeForcePush(normalizedCommand);
  }

  if (/^git\s+(rebase|merge)\b/i.test(normalizedCommand)) {
    return analyzeMergeRebase(normalizedCommand);
  }

  if (/\brm\s+-rf\b/i.test(normalizedCommand) || /\brm\s+-fr\b/i.test(normalizedCommand)) {
    return analyzeRmRf(normalizedCommand);
  }

  if (/\bpackage-lock\.json\b/i.test(normalizedCommand) && /\b(rm|del|remove|unlink)\b/i.test(normalizedCommand)) {
    return analyzePackageLockRemoval(normalizedCommand);
  }

  if (/\b(drop\s+table|drop\s+database|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$)\b/i.test(normalizedCommand)) {
    return analyzeDatabaseDestructive(normalizedCommand);
  }

  return {
    command,
    normalizedCommand,
    category: "low-risk",
    riskLevel: "low",
    warning: "No dangerous command pattern was detected.",
    dryRunImpact: snapshot === null
      ? [`Command: ${normalizedCommand}`, "Git dry-run impact: unavailable because no repository snapshot was provided."]
      : buildGitImpactLines(snapshot, normalizedCommand, [], null),
    safeAlternative: null,
    requiresExplicitConfirmation: false,
    intentClarification: [],
  };
}
