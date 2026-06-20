import { spawnSync } from "node:child_process";
import { realpath, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  EvidenceRecord,
  IssueRecord,
  IssueType,
  WorkflowState,
  WorkflowStepContext,
  WorkflowStepResult,
} from "@flowness-labs/core";
import {
  joinPaths,
  pathExists,
  readJsonFile,
  readTextFile,
  resolveExistingIssuePaths,
} from "@flowness-labs/core";

type CommitMessageStyle = "conventional" | "imperative";
type RepoRelationship = "standalone" | "nested-repo" | "submodule" | "worktree";
type CommitStatus = "ready" | "blocked";
type NeverCommitPattern =
  | { readonly kind: "exact"; readonly value: string }
  | { readonly kind: "prefix"; readonly value: string }
  | { readonly kind: "suffix"; readonly value: string }
  | { readonly kind: "contains"; readonly value: string };

interface GitCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface GitRepositoryProbe {
  readonly candidateDir: string;
  readonly root: string;
  readonly gitDir: string;
  readonly commonGitDir: string;
  readonly superprojectWorkingTree: string | null;
}

interface GitRuleConfig {
  autoCommitAllowed: boolean;
  humanApprovalRequired: boolean;
  conventionalCommitsRequired: boolean;
  commitMessageStyle: CommitMessageStyle;
  forbidGitAddDot: boolean;
  forbidGitCommitA: boolean;
  forbidForcePush: boolean;
  forbidRebase: boolean;
  forbidResetHard: boolean;
  forbidMerge: boolean;
  nestedRepositories: "allow" | "disallow";
  submodules: "allow" | "disallow";
  worktrees: "allow" | "disallow";
  neverCommitPatterns: readonly NeverCommitPattern[];
}

interface IssueSnapshot {
  readonly issue: IssueRecord;
  readonly workflowState: WorkflowState;
  readonly description: string | null;
  readonly issuePaths: Awaited<ReturnType<typeof resolveExistingIssuePaths>>;
}

interface ParsedReviewReport {
  readonly filePath: string;
  readonly passed: boolean;
  readonly blockingRoles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly commandEvidence: readonly string[];
  readonly summary: string;
}

export interface CommitAssessment {
  readonly issueId: string;
  readonly workflowName: string;
  readonly issueTitle: string;
  readonly repoRoot: string | null;
  readonly gitDir: string | null;
  readonly repoRelationship: RepoRelationship | null;
  readonly approvalRequired: boolean;
  readonly autoCommitAllowed: boolean;
  readonly conventionalCommitsRequired: boolean;
  readonly commitMessageStyle: CommitMessageStyle;
  readonly proposedCommitMessage: string | null;
  readonly changedFiles: readonly string[];
  readonly excludedFiles: readonly string[];
  readonly stagedFiles: readonly string[];
  readonly statusPreview: string;
  readonly diffPreview: string;
  readonly reviewReportPath: string | null;
  readonly reviewReportPassed: boolean | null;
  readonly evidenceReviewLogged: boolean;
  readonly blockingReason: string | null;
  readonly rulesPath: string;
  readonly evidence: readonly EvidenceRecord[];
  readonly actions: readonly string[];
}

export class CommitApprovalRequiredError extends Error {
  readonly assessment: CommitAssessment;

  constructor(assessment: CommitAssessment) {
    super(assessment.blockingReason ?? "Commit approval is required.");
    this.name = "CommitApprovalRequiredError";
    this.assessment = assessment;
  }
}

const baselineNeverCommitPatterns: readonly NeverCommitPattern[] = [
  { kind: "prefix", value: ".flowness/issues/" },
  { kind: "prefix", value: ".flowness/logs/" },
  { kind: "prefix", value: ".flowness/state/" },
  { kind: "prefix", value: ".flowness/backups/" },
  { kind: "prefix", value: ".flowness/.flowness-cache/" },
  { kind: "prefix", value: ".flowness/findings/" },
  { kind: "prefix", value: "node_modules/" },
  { kind: "prefix", value: ".git/" },
  { kind: "suffix", value: ".log" },
  { kind: "suffix", value: ".out" },
  { kind: "suffix", value: ".err" },
  { kind: "suffix", value: ".tmp" },
  { kind: "suffix", value: ".temp" },
  { kind: "suffix", value: ".swp" },
  { kind: "suffix", value: ".bak" },
];

function runGitCommand(rootDir: string, args: readonly string[]): GitCommandResult {
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

function normalizeRelativePath(value: string): string {
  return normalizePath(value).replace(/^\.\/+/, "");
}

function resolvePath(baseDir: string, value: string): string {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

async function canonicalizePath(value: string): Promise<string> {
  try {
    return normalizePath(await realpath(value));
  } catch {
    return normalizePath(value);
  }
}

function parseBoolean(value: string, defaultValue: boolean): boolean {
  switch (normalizePath(value).toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "y":
    case "allow":
    case "allowed":
    case "enabled":
      return true;
    case "0":
    case "false":
    case "no":
    case "n":
    case "disallow":
    case "disallowed":
    case "disabled":
      return false;
    default:
      return defaultValue;
  }
}

function parseStyle(value: string, defaultValue: CommitMessageStyle): CommitMessageStyle {
  switch (normalizePath(value).toLowerCase()) {
    case "conventional":
      return "conventional";
    case "imperative":
      return "imperative";
    default:
      return defaultValue;
  }
}

function parseAllowDisallow(value: string, defaultValue: "allow" | "disallow"): "allow" | "disallow" {
  switch (normalizePath(value).toLowerCase()) {
    case "allow":
    case "allowed":
    case "yes":
    case "true":
      return "allow";
    case "disallow":
    case "disallowed":
    case "no":
    case "false":
      return "disallow";
    default:
      return defaultValue;
  }
}

function parseNeverCommitPattern(key: string, value: string): NeverCommitPattern | null {
  const normalizedValue = normalizeRelativePath(value);
  if (normalizedValue.length === 0) {
    return null;
  }

  switch (key) {
    case "path":
    case "never commit path":
      return { kind: "prefix", value: normalizedValue.endsWith("/") ? normalizedValue : `${normalizedValue}/` };
    case "prefix":
    case "never commit prefix":
      return { kind: "prefix", value: normalizedValue };
    case "suffix":
    case "never commit suffix":
      return { kind: "suffix", value: normalizedValue };
    case "contains":
    case "never commit contains":
      return { kind: "contains", value: normalizedValue };
    case "exact":
    case "never commit exact":
      return { kind: "exact", value: normalizedValue };
    default:
      return null;
  }
}

function defaultGitRuleConfig(): GitRuleConfig {
  return {
    autoCommitAllowed: false,
    humanApprovalRequired: true,
    conventionalCommitsRequired: true,
    commitMessageStyle: "conventional",
    forbidGitAddDot: true,
    forbidGitCommitA: true,
    forbidForcePush: true,
    forbidRebase: true,
    forbidResetHard: true,
    forbidMerge: true,
    nestedRepositories: "disallow",
    submodules: "disallow",
    worktrees: "allow",
    neverCommitPatterns: [...baselineNeverCommitPatterns],
  };
}

function parseGitRuleConfig(source: string): GitRuleConfig {
  const config = defaultGitRuleConfig();
  const neverCommitPatterns = [...config.neverCommitPatterns];
  const normalized = source.replace(/\r\n/g, "\n");

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("-")) {
      continue;
    }

    const body = line.slice(1).trim();
    const match = body.match(/^([A-Za-z0-9 ./_-]+?):\s*(.*)$/);
    if (match === null) {
      continue;
    }

    const key = match[1]?.trim().toLowerCase() ?? "";
    const value = match[2]?.trim() ?? "";

    switch (key) {
      case "auto-commit allowed":
        config.autoCommitAllowed = parseBoolean(value, config.autoCommitAllowed);
        break;
      case "human approval required":
        config.humanApprovalRequired = parseBoolean(value, config.humanApprovalRequired);
        break;
      case "commit message style":
        config.commitMessageStyle = parseStyle(value, config.commitMessageStyle);
        break;
      case "conventional commits required":
        config.conventionalCommitsRequired = parseBoolean(value, config.conventionalCommitsRequired);
        break;
      case "git add . forbidden":
        config.forbidGitAddDot = parseBoolean(value, config.forbidGitAddDot);
        break;
      case "git commit -a forbidden":
        config.forbidGitCommitA = parseBoolean(value, config.forbidGitCommitA);
        break;
      case "force push forbidden":
        config.forbidForcePush = parseBoolean(value, config.forbidForcePush);
        break;
      case "rebase forbidden":
        config.forbidRebase = parseBoolean(value, config.forbidRebase);
        break;
      case "reset --hard forbidden":
        config.forbidResetHard = parseBoolean(value, config.forbidResetHard);
        break;
      case "merge forbidden":
        config.forbidMerge = parseBoolean(value, config.forbidMerge);
        break;
      case "nested repositories":
        config.nestedRepositories = parseAllowDisallow(value, config.nestedRepositories);
        break;
      case "submodules":
        config.submodules = parseAllowDisallow(value, config.submodules);
        break;
      case "worktrees":
        config.worktrees = parseAllowDisallow(value, config.worktrees);
        break;
      case "path":
      case "prefix":
      case "suffix":
      case "contains":
      case "exact":
      case "never commit path":
      case "never commit prefix":
      case "never commit suffix":
      case "never commit contains":
      case "never commit exact": {
        const parsed = parseNeverCommitPattern(key, value);
        if (parsed !== null) {
          neverCommitPatterns.push(parsed);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    ...config,
    neverCommitPatterns,
  };
}

function matchesPattern(path: string, pattern: NeverCommitPattern): boolean {
  const normalized = normalizePath(path);
  switch (pattern.kind) {
    case "exact":
      return normalized === pattern.value;
    case "prefix":
      return normalized.startsWith(pattern.value);
    case "suffix":
      return normalized.endsWith(pattern.value);
    case "contains":
      return normalized.includes(pattern.value);
  }
}

function isUnsafeCommitPath(path: string, patterns: readonly NeverCommitPattern[]): boolean {
  const normalized = normalizePath(path);
  return normalized.length > 0 && patterns.some((pattern) => matchesPattern(normalized, pattern));
}

function isCodeLikePath(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|java|kt|rs|php|sh|sql|json|yml|yaml|toml|ini|cfg|c|cc|cpp|h|hpp)$/i.test(path);
}

function collectChangedFilesFromReviewReport(report: ParsedReviewReport): readonly string[] {
  return [...new Set(
    report.changedFiles
      .map((file) => normalizeRelativePath(file))
      .filter((file) => file.length > 0 && file !== "- None"),
  )];
}

function resolveChangedFilePaths(rootDir: string, changedFiles: readonly string[]): readonly string[] {
  return [...new Set(
    changedFiles
      .map((file) => resolvePath(rootDir, normalizeRelativePath(file)))
      .map((file) => normalizePath(file))
      .filter((file) => file.length > 0),
  )];
}

function parseReviewReportMarkdown(filePath: string, source: string): ParsedReviewReport {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let currentSection = "";
  let passed: boolean | null = null;
  let blockingRoles: string[] = [];
  let summary = "";
  const changedFiles: string[] = [];
  const commandEvidence: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
    if (sectionMatch !== null) {
      currentSection = sectionMatch[1]?.trim().toLowerCase() ?? "";
      continue;
    }

    if (line.startsWith("- Passed: ")) {
      const value = line.slice("- Passed: ".length).trim().toLowerCase();
      if (value === "yes") {
        passed = true;
      } else if (value === "no") {
        passed = false;
      }
      continue;
    }

    if (line.startsWith("- Blocking Roles: ")) {
      const value = line.slice("- Blocking Roles: ".length).trim();
      blockingRoles = value.length === 0 || value.toLowerCase() === "none"
        ? []
        : value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
      continue;
    }

    if (currentSection === "changed files") {
      const bullet = line.match(/^[-*+]\s+(.*)$/);
      if (bullet?.[1] !== undefined) {
        const value = bullet[1].trim();
        if (value.length > 0 && value.toLowerCase() !== "none") {
          changedFiles.push(value);
        }
      }
      continue;
    }

    if (currentSection === "commands / tests") {
      const bullet = line.match(/^[-*+]\s+(.*)$/);
      if (bullet?.[1] !== undefined) {
        const value = bullet[1].trim();
        if (value.length > 0 && value.toLowerCase() !== "none") {
          commandEvidence.push(value);
        }
      }
      continue;
    }

    if (currentSection === "summary" && line.length > 0) {
      summary = summary.length === 0 ? line : `${summary} ${line}`;
    }
  }

  if (passed === null) {
    throw new Error(`Review report is missing the Passed flag: ${filePath}`);
  }

  return {
    filePath,
    passed,
    blockingRoles,
    changedFiles,
    commandEvidence,
    summary: summary.trim(),
  };
}

async function loadIssueSnapshot(rootDir: string, issueId: string): Promise<IssueSnapshot> {
  const issuePaths = await resolveExistingIssuePaths(rootDir, issueId);
  if (!(await pathExists(issuePaths.issueJsonFile))) {
    throw new Error(`Issue workspace is missing issue.json: ${issuePaths.issueJsonFile}`);
  }

  if (!(await pathExists(issuePaths.workflowStateFile))) {
    throw new Error(`Issue workspace is missing workflow-state.json: ${issuePaths.workflowStateFile}`);
  }

  const issueJson = await readJsonFile<{
    readonly issue: IssueRecord;
    readonly description: string | null;
    readonly workflowState: WorkflowState;
  }>(issuePaths.issueJsonFile);
  const workflowState = await readJsonFile<WorkflowState>(issuePaths.workflowStateFile);

  return {
    issue: issueJson.issue,
    description: issueJson.description,
    workflowState,
    issuePaths,
  };
}

async function findGitRulesPath(rootDir: string): Promise<string | null> {
  const gitRulesPath = joinPaths(rootDir, ".flowness", "rules", "git.md");
  if (await pathExists(gitRulesPath)) {
    return gitRulesPath;
  }

  const legacyPath = joinPaths(rootDir, ".flowness", "rules", "commit-policy.md");
  if (await pathExists(legacyPath)) {
    return legacyPath;
  }

  return null;
}

function sanitizePreview(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return "none";
  }

  const singleLine = normalized.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 180) {
    return singleLine;
  }

  return `${singleLine.slice(0, 177)}...`;
}

function formatPathList(paths: readonly string[]): string {
  return paths.length === 0 ? "none" : paths.join(", ");
}

function extractMeaningfulText(value: string | undefined | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "");
  if (normalized.length === 0) {
    return null;
  }

  if (/^prompt\s+\d+/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function summarizeChangedFiles(files: readonly string[]): string {
  if (files.length === 0) {
    return "commit workflow";
  }

  const normalized = files.map((file) => normalizePath(file));
  if (normalized.every((file) => file.startsWith(".flowness/rules/"))) {
    return "git rules";
  }

  if (normalized.some((file) => /(^|\/)commit\.ts$/.test(file) || /(^|\/)runtime\.ts$/.test(file))) {
    return "commit workflow";
  }

  if (normalized.every((file) => /\.(md|mdx|txt)$/i.test(file))) {
    return "documentation";
  }

  if (normalized.some((file) => /\.(test|spec)\./i.test(file))) {
    return "workflow tests";
  }

  if (normalized.some((file) => /(^|\/)rules\//.test(file))) {
    return "workflow rules";
  }

  if (normalized.some((file) => /(^|\/)workflow(s)?\//.test(file))) {
    return "workflow steps";
  }

  return "commit workflow";
}

function buildCommitSubject(issue: IssueRecord, files: readonly string[]): string {
  const sourceText = extractMeaningfulText(issue.goal)
    ?? extractMeaningfulText(issue.title)
    ?? summarizeChangedFiles(files);

  const cleaned = (sourceText ?? "commit workflow")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[A-Z][A-Z\s-]+:\s*/i, "")
    .replace(/^[A-Z][A-Za-z0-9\s-]*-\s*/i, "")
    .replace(/^issue\s*\d+[:\s-]*/i, "")
    .replace(/^prompt\s*\d+[:\s-]*/i, "");

  if (cleaned.length === 0) {
    return "commit workflow";
  }

  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function chooseCommitType(issueType: IssueType, files: readonly string[]): string {
  const normalized = files.map((file) => normalizePath(file));
  if (normalized.every((file) => /\.(md|mdx|txt|adoc|rst)$/i.test(file))) {
    return "docs";
  }

  if (normalized.every((file) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file))) {
    return "test";
  }

  switch (issueType) {
    case "feature":
    case "mvp":
      return "feat";
    case "bugfix":
      return "fix";
    case "refactor":
      return "refactor";
    case "documentation":
      return "docs";
    case "review":
    case "research":
    case "investigation":
    case "planning":
    case "decision":
    case "harness":
      return "chore";
    default:
      return "chore";
  }
}

function buildCommitMessage(input: {
  readonly issue: IssueRecord;
  readonly issueType: IssueType;
  readonly files: readonly string[];
  readonly conventionalCommitsRequired: boolean;
  readonly commitMessageStyle: CommitMessageStyle;
}): string {
  const subject = buildCommitSubject(input.issue, input.files);
  if (input.commitMessageStyle === "imperative" && !input.conventionalCommitsRequired) {
    return subject;
  }

  const type = chooseCommitType(input.issueType, input.files);
  return `${type}: ${subject}`;
}

function createCommandOutputEvidence(title: string, detail: string): EvidenceRecord {
  return {
    kind: "command_output",
    title,
    detail,
  };
}

async function probeGitRepository(candidateDir: string): Promise<GitRepositoryProbe | null> {
  const inside = runGitCommand(candidateDir, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || normalizePath(inside.stdout).toLowerCase() !== "true") {
    return null;
  }

  const topLevelResult = runGitCommand(candidateDir, ["rev-parse", "--show-toplevel"]);
  const gitDirResult = runGitCommand(candidateDir, ["rev-parse", "--git-dir"]);
  const commonGitDirResult = runGitCommand(candidateDir, ["rev-parse", "--git-common-dir"]);
  const superprojectResult = runGitCommand(candidateDir, ["rev-parse", "--show-superproject-working-tree"]);

  const root = normalizePath(topLevelResult.stdout);
  const gitDir = normalizePath(gitDirResult.stdout);
  const commonGitDir = normalizePath(commonGitDirResult.stdout);
  if (root.length === 0 || gitDir.length === 0) {
    return null;
  }

  return {
    candidateDir: await canonicalizePath(candidateDir),
    root: await canonicalizePath(resolvePath(candidateDir, root)),
    gitDir: await canonicalizePath(resolvePath(candidateDir, gitDir)),
    commonGitDir: await canonicalizePath(resolvePath(candidateDir, commonGitDir.length === 0 ? gitDir : commonGitDir)),
    superprojectWorkingTree: normalizePath(superprojectResult.stdout).length === 0
      ? null
      : await canonicalizePath(resolvePath(candidateDir, normalizePath(superprojectResult.stdout))),
  };
}

async function detectSelectedRepositoryRoot(
  changedFilePaths: readonly string[],
): Promise<{
  readonly repo: GitRepositoryProbe | null;
  readonly allRepos: readonly GitRepositoryProbe[];
  readonly noRepoFiles: readonly string[];
}> {
  const repos: GitRepositoryProbe[] = [];
  const noRepoFiles: string[] = [];

  for (const changedFilePath of changedFilePaths) {
    const candidateDir = dirname(changedFilePath);
    const probe = await probeGitRepository(candidateDir);
    if (probe === null) {
      noRepoFiles.push(changedFilePath);
      continue;
    }

    repos.push(probe);
  }

  return {
    repo: repos[0] ?? null,
    allRepos: repos,
    noRepoFiles,
  };
}

async function detectOuterRepositoryRoot(repoRoot: string): Promise<string | null> {
  let currentDir = dirname(repoRoot);
  while (currentDir !== dirname(currentDir)) {
    const probe = await probeGitRepository(currentDir);
    if (probe !== null && probe.root !== repoRoot) {
      return probe.root;
    }

    currentDir = dirname(currentDir);
  }

  return null;
}

function classifyRepositoryRelationship(
  repo: GitRepositoryProbe | null,
  outerRepositoryRoot: string | null,
): RepoRelationship | null {
  if (repo === null) {
    return null;
  }

  if (repo.superprojectWorkingTree !== null) {
    return "submodule";
  }

  if (normalizePath(repo.commonGitDir) !== normalizePath(repo.gitDir)) {
    return "worktree";
  }

  if (outerRepositoryRoot !== null && outerRepositoryRoot !== repo.root) {
    return "nested-repo";
  }

  return "standalone";
}

function normalizeRepoRelativePath(repoRoot: string, path: string): string {
  return normalizePath(relative(repoRoot, path));
}

function filterChangedFilesForRepository(
  changedFiles: readonly string[],
  repoRoot: string,
  rules: GitRuleConfig,
): {
  readonly safeFiles: readonly string[];
  readonly excludedFiles: readonly string[];
  readonly outsideRepositoryFiles: readonly string[];
} {
  const safeFiles: string[] = [];
  const excludedFiles: string[] = [];
  const outsideRepositoryFiles: string[] = [];
  const seen = new Set<string>();

  for (const changedFile of changedFiles) {
    const repoRelativePath = normalizeRepoRelativePath(repoRoot, changedFile);
    if (repoRelativePath.length === 0 || repoRelativePath.startsWith("..")) {
      outsideRepositoryFiles.push(normalizePath(changedFile));
      continue;
    }

    if (isUnsafeCommitPath(repoRelativePath, rules.neverCommitPatterns)) {
      excludedFiles.push(repoRelativePath);
      continue;
    }

    if (seen.has(repoRelativePath)) {
      continue;
    }

    seen.add(repoRelativePath);
    safeFiles.push(repoRelativePath);
  }

  return {
    safeFiles,
    excludedFiles,
    outsideRepositoryFiles,
  };
}

function formatCommitRuleSummary(assessment: CommitAssessment): readonly string[] {
  const lines = [
    `Repo root: ${assessment.repoRoot ?? "none"}`,
    `Git dir: ${assessment.gitDir ?? "none"}`,
    `Repository relationship: ${assessment.repoRelationship ?? "none"}`,
    `Approval required: ${assessment.approvalRequired ? "yes" : "no"}`,
    `Auto-commit allowed: ${assessment.autoCommitAllowed ? "yes" : "no"}`,
    `Conventional commits required: ${assessment.conventionalCommitsRequired ? "yes" : "no"}`,
    `Evidence Review logged: ${assessment.evidenceReviewLogged ? "yes" : "no"}`,
    `Evidence Review passed: ${assessment.reviewReportPassed === null ? "unknown" : assessment.reviewReportPassed ? "yes" : "no"}`,
    `Changed files: ${formatPathList(assessment.changedFiles)}`,
    `Excluded files: ${formatPathList(assessment.excludedFiles)}`,
    `Staged files: ${formatPathList(assessment.stagedFiles)}`,
    `Proposed commit message: ${assessment.proposedCommitMessage ?? "none"}`,
    `git status preview: ${sanitizePreview(assessment.statusPreview)}`,
    `git diff preview: ${sanitizePreview(assessment.diffPreview)}`,
  ];

  if (assessment.blockingReason !== null) {
    lines.push(`Blocking reason: ${assessment.blockingReason}`);
  }

  return lines;
}

function buildCommitEvidence(assessment: CommitAssessment, finalCommitHash: string | null = null): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = [
    {
      kind: "file",
      title: ".flowness/rules/git.md",
      location: assessment.rulesPath,
      detail: "Git commit workflow rules",
    },
  ];

  if (assessment.reviewReportPath !== null) {
    evidence.push({
      kind: "file",
      title: "Evidence Review report",
      location: assessment.reviewReportPath,
      detail: assessment.reviewReportPassed === null
        ? "Review report parsed"
        : assessment.reviewReportPassed
          ? "Evidence Review passed"
          : "Evidence Review failed",
    });
  }

  evidence.push(createCommandOutputEvidence("git status --short --untracked-files=all", assessment.statusPreview));
  evidence.push(createCommandOutputEvidence("git diff --stat", assessment.diffPreview));

  if (finalCommitHash !== null) {
    evidence.push(createCommandOutputEvidence("git commit", `${finalCommitHash} ${assessment.proposedCommitMessage ?? ""}`.trim()));
    evidence.push(createCommandOutputEvidence("git rev-parse HEAD", finalCommitHash));
  }

  return evidence;
}

async function readLatestReviewReport(
  rootDir: string,
  snapshot: IssueSnapshot,
): Promise<ParsedReviewReport | null> {
  const evidence = [...snapshot.workflowState.evidence].reverse();
  const reviewEvidence = evidence.find((item) => item.kind === "review" && typeof item.location === "string" && item.location.trim().length > 0);
  if (reviewEvidence?.location !== undefined) {
    const reviewPath = resolvePath(rootDir, reviewEvidence.location);
    if (await pathExists(reviewPath)) {
      return parseReviewReportMarkdown(reviewPath, await readTextFile(reviewPath));
    }
  }

  if (!(await pathExists(snapshot.issuePaths.reviewsDir))) {
    return null;
  }

  const reports = (await readdir(snapshot.issuePaths.reviewsDir))
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .sort();

  const last = reports.at(-1);
  if (last === undefined) {
    return null;
  }

  const reviewPath = joinPaths(snapshot.issuePaths.reviewsDir, last);
  if (!(await pathExists(reviewPath))) {
    return null;
  }

  return parseReviewReportMarkdown(reviewPath, await readTextFile(reviewPath));
}

async function buildCommitAssessment(
  context: WorkflowStepContext,
  workflowName: string,
): Promise<CommitAssessment> {
  const workspaceRoot = await canonicalizePath(context.rootDir);
  const snapshot = await loadIssueSnapshot(workspaceRoot, context.issueId);
  const rulesPath = await findGitRulesPath(workspaceRoot);
  if (rulesPath === null) {
    throw new Error([
      `Git rules file is missing under ${joinPaths(workspaceRoot, ".flowness", "rules")}.`,
      "Recovery: create `.flowness/rules/git.md` with the repository rules before retrying the commit step.",
    ].join("\n"));
  }

  const rules = parseGitRuleConfig(await readTextFile(rulesPath));
  const reviewReport = await readLatestReviewReport(workspaceRoot, snapshot);
  const evidenceReviewLogged = snapshot.workflowState.completedSteps.includes("Evidence Review");

  if (!evidenceReviewLogged) {
    const blockingReason = "Evidence Review has not completed in the workflow state.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: [],
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "No commit plan was built because Evidence Review is missing.",
      diffPreview: "No commit plan was built because Evidence Review is missing.",
      reviewReportPath: reviewReport?.filePath ?? null,
      reviewReportPassed: reviewReport?.passed ?? null,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: [
        {
          kind: "file",
          title: ".flowness/rules/git.md",
          location: rulesPath,
          detail: "Git commit workflow rules",
        },
      ],
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  if (reviewReport === null) {
    const blockingReason = "No Evidence Review report was found.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: [],
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "No review report is available.",
      diffPreview: "No review report is available.",
      reviewReportPath: null,
      reviewReportPassed: null,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: [
        {
          kind: "file",
          title: ".flowness/rules/git.md",
          location: rulesPath,
          detail: "Git commit workflow rules",
        },
      ],
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  if (!reviewReport.passed) {
    const blockingReason = reviewReport.blockingRoles.length === 0
      ? "Evidence Review did not pass."
      : `Evidence Review is blocked by: ${reviewReport.blockingRoles.join(", ")}`;
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: `Evidence Review failed: ${reviewReport.summary || blockingReason}`,
      diffPreview: reviewReport.summary || blockingReason,
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: null,
        gitDir: null,
        repoRelationship: null,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: reviewReport.summary || blockingReason,
        diffPreview: reviewReport.summary || blockingReason,
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Evidence Review report: ${reviewReport.filePath}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  if (reviewReport.changedFiles.length === 0) {
    const blockingReason = "Evidence Review did not record any changed files.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: [],
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "Evidence Review passed without changed files.",
      diffPreview: "Evidence Review passed without changed files.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: null,
        gitDir: null,
        repoRelationship: null,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: [],
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: "Evidence Review passed without changed files.",
        diffPreview: "Evidence Review passed without changed files.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Evidence Review report: ${reviewReport.filePath}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const changedFilePaths = resolveChangedFilePaths(workspaceRoot, collectChangedFilesFromReviewReport(reviewReport));
  const candidateRepo = await detectSelectedRepositoryRoot(changedFilePaths);
  if (candidateRepo.allRepos.length === 0) {
    const blockingReason = candidateRepo.noRepoFiles.length > 0
      ? `No Git repository was found for: ${candidateRepo.noRepoFiles.join(", ")}`
      : "No Git repository was found for the changed files.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "No Git repository could be resolved from the changed files.",
      diffPreview: "No Git repository could be resolved from the changed files.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: null,
        gitDir: null,
        repoRelationship: null,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: "No Git repository could be resolved from the changed files.",
        diffPreview: "No Git repository could be resolved from the changed files.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const uniqueRoots = [...new Set(candidateRepo.allRepos.map((repo) => repo.root))];
  if (uniqueRoots.length > 1) {
    const blockingReason = `Changed files span multiple Git repositories: ${uniqueRoots.join(", ")}`;
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "Changed files span multiple repositories.",
      diffPreview: "Changed files span multiple repositories.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: null,
        gitDir: null,
        repoRelationship: null,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: "Changed files span multiple repositories.",
        diffPreview: "Changed files span multiple repositories.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const repo = candidateRepo.allRepos[0] ?? null;
  if (repo === null) {
    const blockingReason = "Unable to resolve a single repository from the changed files.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: null,
      gitDir: null,
      repoRelationship: null,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "Unable to resolve a repository.",
      diffPreview: "Unable to resolve a repository.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: null,
        gitDir: null,
        repoRelationship: null,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: "Unable to resolve a repository.",
        diffPreview: "Unable to resolve a repository.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const outerRepositoryRoot = await detectOuterRepositoryRoot(repo.root);
  const repoRelationship = classifyRepositoryRelationship(repo, outerRepositoryRoot);
  if (repoRelationship === "nested-repo" && rules.nestedRepositories === "disallow") {
    const blockingReason = `Nested repository commits are disallowed by ${rulesPath}.`;
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "Nested repository commit is blocked by git rules.",
      diffPreview: "Nested repository commit is blocked by git rules.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: repo.root,
        gitDir: repo.gitDir,
        repoRelationship,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: "Nested repository commit is blocked by git rules.",
        diffPreview: "Nested repository commit is blocked by git rules.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Repo root: ${repo.root}`,
        `Git dir: ${repo.gitDir}`,
        `Repository relationship: ${repoRelationship}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  if (repoRelationship === "submodule" && rules.submodules === "disallow") {
    const blockingReason = `Submodule commits are disallowed by ${rulesPath}.`;
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: [],
      stagedFiles: [],
      statusPreview: "Submodule commit is blocked by git rules.",
      diffPreview: "Submodule commit is blocked by git rules.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: repo.root,
        gitDir: repo.gitDir,
        repoRelationship,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: [],
        stagedFiles: [],
        statusPreview: "Submodule commit is blocked by git rules.",
        diffPreview: "Submodule commit is blocked by git rules.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Repo root: ${repo.root}`,
        `Git dir: ${repo.gitDir}`,
        `Repository relationship: ${repoRelationship}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const filtered = filterChangedFilesForRepository(changedFilePaths, repo.root, rules);
  if (filtered.outsideRepositoryFiles.length > 0) {
    const blockingReason = `Changed files escaped the selected repository root: ${filtered.outsideRepositoryFiles.join(", ")}`;
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: filtered.excludedFiles,
      stagedFiles: [],
      statusPreview: "Some changed files are outside the resolved repository root.",
      diffPreview: "Some changed files are outside the resolved repository root.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: repo.root,
        gitDir: repo.gitDir,
        repoRelationship,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: filtered.excludedFiles,
        stagedFiles: [],
        statusPreview: "Some changed files are outside the resolved repository root.",
        diffPreview: "Some changed files are outside the resolved repository root.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Repo root: ${repo.root}`,
        `Git dir: ${repo.gitDir}`,
        `Repository relationship: ${repoRelationship}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Excluded files: ${formatPathList(filtered.excludedFiles)}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  if (filtered.safeFiles.length === 0) {
    const blockingReason = filtered.excludedFiles.length > 0
      ? `No safe files remain after filtering: ${filtered.excludedFiles.join(", ")}`
      : "No safe files were available to stage.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage: null,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: filtered.excludedFiles,
      stagedFiles: [],
      statusPreview: "No safe files remain after filtering.",
      diffPreview: "No safe files remain after filtering.",
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: repo.root,
        gitDir: repo.gitDir,
        repoRelationship,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage: null,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: filtered.excludedFiles,
        stagedFiles: [],
        statusPreview: "No safe files remain after filtering.",
        diffPreview: "No safe files remain after filtering.",
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Repo root: ${repo.root}`,
        `Git dir: ${repo.gitDir}`,
        `Repository relationship: ${repoRelationship}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Changed files: ${formatPathList(reviewReport.changedFiles)}`,
        `Excluded files: ${formatPathList(filtered.excludedFiles)}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const proposedCommitMessage = buildCommitMessage({
    issue: snapshot.issue,
    issueType: snapshot.issue.type,
    files: filtered.safeFiles,
    conventionalCommitsRequired: rules.conventionalCommitsRequired,
    commitMessageStyle: rules.commitMessageStyle,
  });

  const statusPreviewResult = runGitCommand(repo.root, [
    "status",
    "--short",
    "--untracked-files=all",
    "--",
    ...filtered.safeFiles,
  ]);
  const diffPreviewResult = runGitCommand(repo.root, [
    "diff",
    "--stat",
    "--",
    ...filtered.safeFiles,
  ]);
  const conflictResult = runGitCommand(repo.root, ["diff", "--name-only", "--diff-filter=U"]);
  if (conflictResult.stdout.trim().length > 0) {
    const blockingReason = `Unresolved merge conflicts exist in the repository: ${conflictResult.stdout.trim()}`;
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: filtered.excludedFiles,
      stagedFiles: filtered.safeFiles,
      statusPreview: statusPreviewResult.stdout,
      diffPreview: diffPreviewResult.stdout,
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: repo.root,
        gitDir: repo.gitDir,
        repoRelationship,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: filtered.excludedFiles,
        stagedFiles: filtered.safeFiles,
        statusPreview: statusPreviewResult.stdout,
        diffPreview: diffPreviewResult.stdout,
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Repo root: ${repo.root}`,
        `Git dir: ${repo.gitDir}`,
        `Repository relationship: ${repoRelationship}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Changed files: ${formatPathList(reviewReport.changedFiles)}`,
        `Excluded files: ${formatPathList(filtered.excludedFiles)}`,
        `Staged files: ${formatPathList(filtered.safeFiles)}`,
        `Proposed commit message: ${proposedCommitMessage}`,
        `git status preview: ${sanitizePreview(statusPreviewResult.stdout)}`,
        `git diff preview: ${sanitizePreview(diffPreviewResult.stdout)}`,
      `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  const requiresRecordedChecks = filtered.safeFiles.some((file) => isCodeLikePath(file));
  const recordedChecksSatisfied = !requiresRecordedChecks || reviewReport.commandEvidence.length > 0;
  if (!recordedChecksSatisfied) {
    const blockingReason = "Required checks were not recorded in the Evidence Review report.";
    return {
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: filtered.excludedFiles,
      stagedFiles: filtered.safeFiles,
      statusPreview: statusPreviewResult.stdout,
      diffPreview: diffPreviewResult.stdout,
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason,
      rulesPath,
      evidence: buildCommitEvidence({
        issueId: context.issueId,
        workflowName,
        issueTitle: snapshot.issue.title,
        repoRoot: repo.root,
        gitDir: repo.gitDir,
        repoRelationship,
        approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
        autoCommitAllowed: rules.autoCommitAllowed,
        conventionalCommitsRequired: rules.conventionalCommitsRequired,
        commitMessageStyle: rules.commitMessageStyle,
        proposedCommitMessage,
        changedFiles: reviewReport.changedFiles,
        excludedFiles: filtered.excludedFiles,
        stagedFiles: filtered.safeFiles,
        statusPreview: statusPreviewResult.stdout,
        diffPreview: diffPreviewResult.stdout,
        reviewReportPath: reviewReport.filePath,
        reviewReportPassed: reviewReport.passed,
        evidenceReviewLogged,
        blockingReason,
        rulesPath,
        evidence: [],
        actions: [],
      }),
      actions: [
        `Git rules: ${rulesPath}`,
        `Repo root: ${repo.root}`,
        `Git dir: ${repo.gitDir}`,
        `Repository relationship: ${repoRelationship}`,
        `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
        `Changed files: ${formatPathList(reviewReport.changedFiles)}`,
        `Excluded files: ${formatPathList(filtered.excludedFiles)}`,
        `Staged files: ${formatPathList(filtered.safeFiles)}`,
        `Proposed commit message: ${proposedCommitMessage}`,
        `Required checks recorded: ${recordedChecksSatisfied ? "yes" : "no"}`,
        `Command evidence: ${formatPathList(reviewReport.commandEvidence)}`,
        `git status preview: ${sanitizePreview(statusPreviewResult.stdout)}`,
        `git diff preview: ${sanitizePreview(diffPreviewResult.stdout)}`,
        `Blocking reason: ${blockingReason}`,
      ],
    };
  }

  return {
    issueId: context.issueId,
    workflowName,
    issueTitle: snapshot.issue.title,
    repoRoot: repo.root,
    gitDir: repo.gitDir,
    repoRelationship,
    approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
    autoCommitAllowed: rules.autoCommitAllowed,
    conventionalCommitsRequired: rules.conventionalCommitsRequired,
    commitMessageStyle: rules.commitMessageStyle,
    proposedCommitMessage,
    changedFiles: reviewReport.changedFiles,
    excludedFiles: filtered.excludedFiles,
    stagedFiles: filtered.safeFiles,
    statusPreview: statusPreviewResult.stdout,
    diffPreview: diffPreviewResult.stdout,
    reviewReportPath: reviewReport.filePath,
    reviewReportPassed: reviewReport.passed,
    evidenceReviewLogged,
    blockingReason: null,
    rulesPath,
    evidence: buildCommitEvidence({
      issueId: context.issueId,
      workflowName,
      issueTitle: snapshot.issue.title,
      repoRoot: repo.root,
      gitDir: repo.gitDir,
      repoRelationship,
      approvalRequired: !rules.autoCommitAllowed && rules.humanApprovalRequired,
      autoCommitAllowed: rules.autoCommitAllowed,
      conventionalCommitsRequired: rules.conventionalCommitsRequired,
      commitMessageStyle: rules.commitMessageStyle,
      proposedCommitMessage,
      changedFiles: reviewReport.changedFiles,
      excludedFiles: filtered.excludedFiles,
      stagedFiles: filtered.safeFiles,
      statusPreview: statusPreviewResult.stdout,
      diffPreview: diffPreviewResult.stdout,
      reviewReportPath: reviewReport.filePath,
      reviewReportPassed: reviewReport.passed,
      evidenceReviewLogged,
      blockingReason: null,
      rulesPath,
      evidence: [],
      actions: [],
    }),
    actions: [
      `Git rules: ${rulesPath}`,
      `Repo root: ${repo.root}`,
      `Git dir: ${repo.gitDir}`,
      `Repository relationship: ${repoRelationship}`,
      `Approval required: ${(!rules.autoCommitAllowed && rules.humanApprovalRequired) ? "yes" : "no"}`,
      `Changed files: ${formatPathList(reviewReport.changedFiles)}`,
      `Excluded files: ${formatPathList(filtered.excludedFiles)}`,
      `Staged files: ${formatPathList(filtered.safeFiles)}`,
      `Proposed commit message: ${proposedCommitMessage}`,
      `Required checks recorded: ${recordedChecksSatisfied ? "yes" : "no"}`,
      `Command evidence: ${formatPathList(reviewReport.commandEvidence)}`,
      `git status preview: ${sanitizePreview(statusPreviewResult.stdout)}`,
      `git diff preview: ${sanitizePreview(diffPreviewResult.stdout)}`,
    ],
  };
}

async function executeCommitWorkflowStep(
  assessment: CommitAssessment,
): Promise<WorkflowStepResult> {
  if (assessment.blockingReason !== null) {
    throw new Error(assessment.blockingReason);
  }

  if (assessment.repoRoot === null) {
    throw new Error("Repository root is missing.");
  }

  if (assessment.stagedFiles.length === 0) {
    throw new Error("No staged files were provided for commit.");
  }

  const addResult = runGitCommand(assessment.repoRoot, ["add", "--", ...assessment.stagedFiles]);
  if (addResult.status !== 0) {
    throw new Error(addResult.stderr.trim() || addResult.stdout.trim() || "Failed to stage commit files.");
  }

  const stagedDiffStat = runGitCommand(assessment.repoRoot, ["diff", "--stat", "--cached", "--", ...assessment.stagedFiles]);
  const commitResult = runGitCommand(assessment.repoRoot, ["commit", "-m", assessment.proposedCommitMessage ?? "commit workflow"]);
  if (commitResult.status !== 0) {
    throw new Error(commitResult.stderr.trim() || commitResult.stdout.trim() || "Git commit failed.");
  }

  const hashResult = runGitCommand(assessment.repoRoot, ["rev-parse", "HEAD"]);
  const commitHash = hashResult.stdout.trim();
  if (commitHash.length === 0) {
    throw new Error("Git commit completed but HEAD hash could not be resolved.");
  }

  const finalEvidence = [
    ...buildCommitEvidence(assessment, commitHash),
    createCommandOutputEvidence(
      "git diff --stat --cached",
      stagedDiffStat.stdout.trim().length === 0 ? "No staged diff stat output." : stagedDiffStat.stdout.trim(),
    ),
  ];

  return {
    summary: [
      `Committed ${commitHash} in ${assessment.repoRoot}.`,
      `Message: ${assessment.proposedCommitMessage ?? "commit workflow"}`,
      `Staged files: ${assessment.stagedFiles.join(", ")}`,
      `Excluded files: ${formatPathList(assessment.excludedFiles)}`,
    ].join("\n"),
    evidence: finalEvidence,
  };
}

function buildWaitingApprovalResult(assessment: CommitAssessment): WorkflowStepResult {
  return {
    summary: [
      `Waiting for approval before committing in ${assessment.repoRoot ?? "unknown repository"}.`,
      `Proposed commit message: ${assessment.proposedCommitMessage ?? "none"}`,
    ].join("\n"),
    evidence: assessment.evidence,
    nextStep: null,
  };
}

export async function prepareCommitWorkflowStep(
  context: WorkflowStepContext,
  workflowName: string,
): Promise<CommitAssessment> {
  return await buildCommitAssessment(context, workflowName);
}

export async function runCommitWorkflowStep(
  context: WorkflowStepContext,
  workflowName: string,
  approved = false,
  assessment?: CommitAssessment,
): Promise<WorkflowStepResult> {
  const prepared = assessment ?? await prepareCommitWorkflowStep(context, workflowName);
  if (prepared.blockingReason !== null) {
    throw new Error(prepared.blockingReason);
  }

  if (prepared.approvalRequired && !approved) {
    throw new CommitApprovalRequiredError(prepared);
  }

  return await executeCommitWorkflowStep(prepared);
}

export async function assessCommitWorkflowStep(
  context: WorkflowStepContext,
  workflowName: string,
): Promise<CommitAssessment> {
  return await prepareCommitWorkflowStep(context, workflowName);
}

export function createCommitWaitingApprovalResult(
  assessment: CommitAssessment,
): WorkflowStepResult {
  return buildWaitingApprovalResult(assessment);
}
