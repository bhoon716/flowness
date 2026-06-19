import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import type {
  EvidenceRecord,
  IssueType,
  ReviewFinding,
  ReviewResult,
  ReviewRole,
  WorkflowState,
} from "@flowness-labs/core";
import {
  ensureDirectory,
  issueTypeValues,
  pathExists,
  readTextFile,
  resolveIssuePaths,
  reviewRoleValues,
  slugify,
  writeTextFile,
} from "@flowness-labs/core";

export interface ReviewRunInput {
  readonly rootDir: string;
  readonly issueId: string;
  readonly issueTitle: string;
  readonly issueType: IssueType;
  readonly workflowId: string;
  readonly workflowState: WorkflowState;
  readonly evidence: readonly EvidenceRecord[];
  readonly reviewedAt?: string;
}

export interface ReviewReport {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly issueType: IssueType;
  readonly workflowId: string;
  readonly reviewedAt: string;
  readonly results: readonly ReviewResult[];
  readonly passed: boolean;
  readonly blockingRoles: readonly ReviewRole[];
  readonly summary: string;
  readonly fileName: string;
  readonly filePath: string;
}

function createFinding(
  severity: ReviewFinding["severity"],
  message: string,
  evidence: readonly EvidenceRecord[] = [],
): ReviewFinding {
  return {
    severity,
    message,
    ...(evidence.length === 0 ? {} : { evidence }),
  };
}

function hasEvidenceKind(
  evidence: readonly EvidenceRecord[],
  kind: EvidenceRecord["kind"],
): boolean {
  return evidence.some((item) => item.kind === kind);
}

function evidenceContains(
  evidence: readonly EvidenceRecord[],
  pattern: RegExp,
): boolean {
  return evidence.some((item) => pattern.test(item.title) || pattern.test(item.detail ?? ""));
}

function reviewArchitecture(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (input.workflowId.trim().length === 0) {
    findings.push(createFinding("blocking", "Workflow id is missing."));
  }

  if (input.workflowState.currentStep.trim().length === 0 && input.workflowState.completedSteps.length === 0) {
    findings.push(createFinding("blocking", "Workflow state does not point to a current step."));
  }

  return {
    role: "Architecture Reviewer",
    status: findings.length === 0 ? "pass" : "fail",
    summary: findings.length === 0
      ? "Workflow wiring is structurally consistent."
      : "Workflow wiring has structural gaps.",
    findings,
  };
}

function reviewSecurity(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (evidenceContains(input.evidence, /(secret|token|password|credential)/i)) {
    findings.push(createFinding("blocking", "Potential secret-related evidence was recorded.", input.evidence));
  }

  if (input.workflowState.blocked && input.workflowState.failedSteps.length > 0 && !hasEvidenceKind(input.evidence, "command_output")) {
    findings.push(createFinding("warning", "Blocked workflow state is missing command output evidence."));
  }

  return {
    role: "Security Reviewer",
    status: findings.some((finding) => finding.severity === "blocking") ? "fail" : "pass",
    summary: findings.length === 0
      ? "No obvious security blockers were detected."
      : "Security review requires attention.",
    findings,
  };
}

function reviewTesting(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  const testEvidence = input.evidence.filter((item) => item.kind === "test");
  const requiresTests = ["feature", "bugfix", "refactor", "mvp", "harness"].includes(input.issueType);

  if (requiresTests && testEvidence.length === 0) {
    findings.push(createFinding("blocking", "No test evidence was recorded.", input.evidence));
  }

  if (!requiresTests && testEvidence.length === 0) {
    findings.push(createFinding("info", "No test evidence is expected for this issue type."));
  }

  return {
    role: "Testing Reviewer",
    status: findings.some((finding) => finding.severity === "blocking") ? "fail" : "pass",
    summary: findings.length === 0
      ? "Test evidence is present."
      : "Testing evidence is incomplete.",
    findings,
  };
}

function reviewDocumentation(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  const hasDocumentationEvidence = hasEvidenceKind(input.evidence, "documentation");
  const hasIssueDocument = hasEvidenceKind(input.evidence, "file");
  const needsDocumentedOutput = ["feature", "bugfix", "refactor", "planning", "mvp", "harness"].includes(input.issueType);

  if (needsDocumentedOutput && !hasDocumentationEvidence && !hasIssueDocument) {
    findings.push(createFinding("blocking", "Documentation evidence is missing.", input.evidence));
  }

  return {
    role: "Documentation Reviewer",
    status: findings.some((finding) => finding.severity === "blocking") ? "fail" : "pass",
    summary: findings.length === 0
      ? "Documentation evidence is present."
      : "Documentation evidence is incomplete.",
    findings,
  };
}

function reviewMaintainability(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (input.workflowState.completedSteps.length > 0 && input.workflowState.completedSteps.length < input.workflowState.failedSteps.length) {
    findings.push(createFinding("warning", "Failed steps outnumber completed steps."));
  }

  if (input.workflowState.updatedAt.trim().length === 0) {
    findings.push(createFinding("blocking", "Workflow state is missing an updatedAt timestamp."));
  }

  return {
    role: "Maintainability Reviewer",
    status: findings.some((finding) => finding.severity === "blocking") ? "fail" : "pass",
    summary: findings.length === 0
      ? "State structure is maintainable."
      : "Maintainability concerns were detected.",
    findings,
  };
}

function reviewPerformance(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (input.evidence.length > 25) {
    findings.push(createFinding("warning", "Evidence volume is large for a single workflow step."));
  }

  if (evidenceContains(input.evidence, /(slow|timeout|performance)/i)) {
    findings.push(createFinding("blocking", "Performance-related evidence suggests a regression.", input.evidence));
  }

  return {
    role: "Performance Reviewer",
    status: findings.some((finding) => finding.severity === "blocking") ? "fail" : "pass",
    summary: findings.length === 0
      ? "No performance blockers were detected."
      : "Performance concerns were detected.",
    findings,
  };
}

export function evaluateReviewRole(
  role: ReviewRole,
  input: ReviewRunInput,
): ReviewResult {
  switch (role) {
    case "Architecture Reviewer":
      return reviewArchitecture(input);
    case "Security Reviewer":
      return reviewSecurity(input);
    case "Testing Reviewer":
      return reviewTesting(input);
    case "Documentation Reviewer":
      return reviewDocumentation(input);
    case "Maintainability Reviewer":
      return reviewMaintainability(input);
    case "Performance Reviewer":
      return reviewPerformance(input);
  }

  throw new Error(`Unsupported review role: ${role}`);
}

export function createReviewCoordinatorResult(
  results: readonly ReviewResult[],
): {
  readonly passed: boolean;
  readonly results: readonly ReviewResult[];
  readonly blockingRoles: readonly ReviewRole[];
} {
  const blockingRoles = results
    .filter((result) => result.status === "fail")
    .map((result) => result.role);
  return {
    passed: blockingRoles.length === 0,
    results: [...results],
    blockingRoles,
  };
}

export function listReviewRoles(): readonly ReviewRole[] {
  return [...reviewRoleValues];
}

export function runStandardReviews(input: ReviewRunInput): readonly ReviewResult[] {
  return reviewRoleValues.map((role) => runReviewRoleInSubprocess(role, input));
}

function runReviewRoleInSubprocess(
  role: ReviewRole,
  input: ReviewRunInput,
): ReviewResult {
  const payload = Buffer.from(JSON.stringify(input), "utf8").toString("base64");
  const runnerUrl = new URL("./index.js", import.meta.url).href;
  const script = [
    `import { evaluateReviewRole } from ${JSON.stringify(runnerUrl)};`,
    "const [role, encoded] = process.argv.slice(1);",
    "const input = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));",
    "const result = evaluateReviewRole(role, input);",
    "process.stdout.write(JSON.stringify(result));",
  ].join("\n");
  const outcome = spawnSync(process.execPath, ["--input-type=module", "-e", script, role, payload], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (outcome.error !== undefined) {
    throw outcome.error;
  }

  if (outcome.status !== 0) {
    throw new Error(`Review agent "${role}" failed: ${outcome.stderr.trim() || outcome.stdout.trim()}`);
  }

  return JSON.parse(outcome.stdout) as ReviewResult;
}

function renderFinding(finding: ReviewFinding): string {
  const evidence = finding.evidence ?? [];
  const evidenceLines = evidence.length === 0
    ? []
    : [
      "  - Evidence:",
      ...evidence.map((item) => `    - [${item.kind}] ${item.title}${item.detail ? ` - ${item.detail}` : ""}${item.location ? ` (${item.location})` : ""}`),
    ];

  return [
    `- Severity: ${finding.severity}`,
    `- Message: ${finding.message}`,
    ...evidenceLines,
  ].join("\n");
}

function renderReviewResult(result: ReviewResult): string {
  const findingLines = result.findings.length === 0
    ? ["- None"]
    : result.findings.map((finding) => renderFinding(finding));

  return [
    `### ${result.role}`,
    "",
    `- Status: ${result.status}`,
    `- Summary: ${result.summary}`,
    "- Findings:",
    ...findingLines.map((line) => `  ${line}`),
    "",
  ].join("\n");
}

function formatReviewFileName(sequence: number, issueId: string): string {
  const sequencePart = String(sequence).padStart(3, "0");
  const issuePart = slugify(issueId).toUpperCase();
  return `REVIEW-${sequencePart}-${issuePart}.md`;
}

function renderReviewReportMarkdown(report: ReviewReport): string {
  return [
    `# ${report.fileName}`,
    "",
    `- Issue: ${report.issueId}`,
    `- Issue Title: ${report.issueTitle}`,
    `- Issue Type: ${report.issueType}`,
    `- Workflow: ${report.workflowId}`,
    `- Reviewed At: ${report.reviewedAt}`,
    `- Passed: ${report.passed ? "yes" : "no"}`,
    `- Blocking Roles: ${report.blockingRoles.length === 0 ? "none" : report.blockingRoles.join(", ")}`,
    "",
    "## Summary",
    report.summary,
    "",
    ...report.results.map((result) => renderReviewResult(result)),
  ].join("\n");
}

async function findNextReviewSequence(rootDir: string, issueId: string): Promise<number> {
  const paths = resolveIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.reviewsDir))) {
    return 1;
  }

  const entries = await readdir(paths.reviewsDir);
  const sequences = entries
    .map((entry) => entry.match(/^REVIEW-(\d{3})-/)?.[1])
    .filter((sequence): sequence is string => sequence !== undefined)
    .map((sequence) => Number.parseInt(sequence, 10));

  return (sequences.length === 0 ? 0 : Math.max(...sequences)) + 1;
}

export async function writeReviewReportToIssue(
  input: ReviewRunInput,
  results: readonly ReviewResult[],
  force = false,
): Promise<ReviewReport> {
  const paths = resolveIssuePaths(input.rootDir, input.issueId);
  await ensureDirectory(paths.reviewsDir);
  const coordinator = createReviewCoordinatorResult(results);
  const sequence = await findNextReviewSequence(input.rootDir, input.issueId);
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const fileName = formatReviewFileName(sequence, input.issueId);
  const report: ReviewReport = {
    issueId: input.issueId,
    issueTitle: input.issueTitle,
    issueType: input.issueType,
    workflowId: input.workflowId,
    reviewedAt,
    results: coordinator.results,
    passed: coordinator.passed,
    blockingRoles: coordinator.blockingRoles,
    summary: coordinator.passed
      ? "All review agents passed."
      : `Blocking review agents: ${coordinator.blockingRoles.join(", ")}`,
    fileName,
    filePath: `${paths.reviewsDir}/${fileName}`,
  };

  await writeTextFile(report.filePath, renderReviewReportMarkdown(report), force);
  return report;
}

export async function readReviewReports(
  rootDir: string,
  issueId: string,
): Promise<readonly string[]> {
  const paths = resolveIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.reviewsDir))) {
    return [];
  }

  return (await readdir(paths.reviewsDir))
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .sort();
}

export async function readReviewReport(
  rootDir: string,
  issueId: string,
  fileName: string,
): Promise<string | null> {
  const paths = resolveIssuePaths(rootDir, issueId);
  const reviewPath = `${paths.reviewsDir}/${fileName}`;
  if (!(await pathExists(reviewPath))) {
    return null;
  }

  return readTextFile(reviewPath);
}
