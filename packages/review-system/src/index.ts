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
  pathExists,
  readTextFile,
  resolveExistingIssuePaths,
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
  readonly concernRoles: readonly ReviewRole[];
  readonly target: string;
  readonly changedFiles: readonly string[];
  readonly commandEvidence: readonly string[];
  readonly recommendedNextActions: readonly string[];
  readonly followUpIssueSuggestions: readonly string[];
  readonly limitations: readonly string[];
  readonly summary: string;
  readonly fileName: string;
  readonly filePath: string;
}

const reviewRolePrefixes: Record<ReviewRole, string> = {
  "Architecture Reviewer": "ARCH",
  "Correctness Reviewer": "CORR",
  "Security Reviewer": "SEC",
  "Test Coverage Reviewer": "TEST",
  "Maintainability Reviewer": "MAINT",
  "Performance Reviewer": "PERF",
  "Documentation Reviewer": "DOC",
};

const severityRank: Record<ReviewFinding["severity"], number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

function createFinding(
  role: ReviewRole,
  sequence: number,
  severity: ReviewFinding["severity"],
  problem: string,
  recommendation: string,
  evidence: readonly EvidenceRecord[] = [],
  filePath: string | null = inferFindingFilePath(evidence),
  rationale = problem,
): ReviewFinding {
  return {
    id: `${reviewRolePrefixes[role]}-${String(sequence).padStart(3, "0")}`,
    perspective: role,
    severity,
    filePath,
    evidence: [...evidence],
    problem,
    recommendation,
    requiresFollowUpIssue: severity === "critical" || severity === "high",
    rationale,
  };
}

function inferFindingFilePath(evidence: readonly EvidenceRecord[]): string | null {
  for (const item of evidence) {
    if (item.location !== undefined && item.location.trim().length > 0) {
      return item.location;
    }
  }

  return null;
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

function hasCodeFileEvidence(evidence: readonly EvidenceRecord[]): boolean {
  return evidence.some((item) => item.kind === "file" && /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|java|kt|sh|sql|rs|php)$/i.test(item.location ?? item.title));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").trim();
}

function classifyChangedFilePriority(filePath: string): number {
  const normalized = normalizePath(filePath).toLowerCase();
  const fileName = normalized.split("/").at(-1) ?? normalized;

  if (
    /(^|\/)(test|tests|__tests__)\//.test(normalized)
    || /\.(test|spec)\.[^.]+$/.test(fileName)
  ) {
    return 2;
  }

  if (
    /(^|\/)(src|app|server|service|services|controller|controllers|route|routes|api|lib|module|modules|feature|features|workflow|workflows|runtime|commit|review|security|auth|payment|checkout)\//.test(normalized)
    || /(request-routing|workflow|runtime|commit|review|security|auth|payment|checkout)/.test(normalized)
  ) {
    return 0;
  }

  if (
    /(^|\/)(docs?|documentation|config|configs|settings)\//.test(normalized)
    || /^readme(\.[^.]+)?$/.test(fileName)
    || /\.(md|mdx|rst|adoc|txt|json|ya?ml|toml|ini|cfg|lock)$/i.test(fileName)
  ) {
    return 3;
  }

  return 1;
}

function extractChangedFiles(evidence: readonly EvidenceRecord[]): string[] {
  const files = new Map<string, number>();
  for (const item of evidence) {
    if (item.kind !== "file") {
      continue;
    }

    const location = item.location ?? item.title;
    if (location.trim().length === 0) {
      continue;
    }

    if (location.startsWith(".flowness/")) {
      continue;
    }

    if (!files.has(location)) {
      files.set(location, files.size);
    }
  }

  return [...files.entries()]
    .map(([filePath, order]) => ({
      filePath,
      order,
      priority: classifyChangedFilePriority(filePath),
    }))
    .sort((left, right) => {
      const priorityDelta = left.priority - right.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const orderDelta = left.order - right.order;
      if (orderDelta !== 0) {
        return orderDelta;
      }

      return left.filePath.localeCompare(right.filePath);
    })
    .map((entry) => entry.filePath);
}

function extractCommandEvidence(evidence: readonly EvidenceRecord[]): string[] {
  const commands = new Set<string>();
  for (const item of evidence) {
    if (item.kind !== "command_output" && item.kind !== "test") {
      continue;
    }

    commands.add(item.title);
  }

  return [...commands].sort((left, right) => left.localeCompare(right));
}

function renderSeverityLabel(severity: ReviewFinding["severity"]): string {
  return severity.toUpperCase();
}

function sortFindings(findings: readonly ReviewFinding[]): ReviewFinding[] {
  return [...findings].sort((left, right) => {
    const severityDelta = severityRank[right.severity] - severityRank[left.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function resultStatusFromFindings(findings: readonly ReviewFinding[]): ReviewResult["status"] {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "fail";
  }

  if (findings.length > 0) {
    return "concern";
  }

  return "pass";
}

function summarizeResult(role: ReviewRole, findings: readonly ReviewFinding[]): string {
  if (findings.length === 0) {
    return `${role} found no blocking concerns.`;
  }

  const blockingCount = findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length;
  const concernCount = findings.length - blockingCount;

  if (blockingCount > 0) {
    return `${role} found ${blockingCount} blocking issue(s) and ${concernCount} additional concern(s).`;
  }

  return `${role} found ${concernCount} concern(s).`;
}

function reviewArchitecture(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];

  if (input.workflowId.trim().length === 0) {
    findings.push(createFinding(
      "Architecture Reviewer",
      1,
      "critical",
      "Workflow id is missing, so the review cannot be traced to a concrete workflow.",
      "Record the workflow id before continuing the review.",
    ));
  }

  if (input.issueType === "review" && input.workflowId !== "code-review") {
    findings.push(createFinding(
      "Architecture Reviewer",
      findings.length + 1,
      "high",
      `Review issues should route through code-review, but this issue is using ${input.workflowId}.`,
      "Move the review onto the code-review workflow so the review path stays lightweight and diff-focused.",
    ));
  }

  if (input.workflowState.currentStep.trim().length === 0 && input.workflowState.completedSteps.length === 0) {
    findings.push(createFinding(
      "Architecture Reviewer",
      findings.length + 1,
      "medium",
      "Workflow state does not point to a current step.",
      "Rebuild the workflow state before treating the review as authoritative.",
    ));
  }

  return {
    role: "Architecture Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Architecture Reviewer", findings),
    findings,
  };
}

function reviewCorrectness(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  const hasFileEvidence = hasEvidenceKind(input.evidence, "file");
  const hasValidationEvidence = hasEvidenceKind(input.evidence, "test") || hasEvidenceKind(input.evidence, "command_output");

  if (!hasFileEvidence && input.evidence.length === 0) {
    findings.push(createFinding(
      "Correctness Reviewer",
      1,
      "critical",
      "No review evidence was recorded, so correctness cannot be assessed.",
      "Attach the target diff, the relevant issue log, or the files under review before asking for a final decision.",
      input.evidence,
    ));
  } else if (hasCodeFileEvidence(input.evidence) && !hasValidationEvidence) {
    findings.push(createFinding(
      "Correctness Reviewer",
      1,
      "medium",
      "Code files are present, but no validation evidence was attached.",
      "Run the relevant verification commands and attach the command output before merging.",
      input.evidence,
    ));
  }

  if (input.workflowState.blocked && input.workflowState.failedSteps.length > 0 && !hasEvidenceKind(input.evidence, "command_output")) {
    findings.push(createFinding(
      "Correctness Reviewer",
      findings.length + 1,
      "low",
      "The workflow is blocked, but the review evidence does not explain the failure path.",
      "Attach the command output that triggered the block so the correctness review can be reproduced.",
      input.evidence,
    ));
  }

  return {
    role: "Correctness Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Correctness Reviewer", findings),
    findings,
  };
}

function reviewSecurity(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (evidenceContains(input.evidence, /(secret|token|password|credential|api key|private key)/i)) {
    findings.push(createFinding(
      "Security Reviewer",
      1,
      "critical",
      "The attached evidence mentions a potential secret or credential.",
      "Remove the secret from the workspace, rotate it if needed, and attach a sanitized proof instead.",
      input.evidence,
    ));
  }

  if (hasCodeFileEvidence(input.evidence) && !hasEvidenceKind(input.evidence, "command_output") && !hasEvidenceKind(input.evidence, "test")) {
    findings.push(createFinding(
      "Security Reviewer",
      findings.length + 1,
      "medium",
      "Code changes were attached without any validation output.",
      "Re-run the relevant checks and attach the exact command output so the security review can confirm the surface area.",
      input.evidence,
    ));
  }

  return {
    role: "Security Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Security Reviewer", findings),
    findings,
  };
}

function reviewTestCoverage(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  const testEvidence = input.evidence.filter((item) => item.kind === "test");
  const codeEvidence = hasCodeFileEvidence(input.evidence);
  const requiresTestCoverage = codeEvidence || ["feature", "bugfix", "refactor", "mvp", "harness", "review"].includes(input.issueType);

  if (requiresTestCoverage && testEvidence.length === 0) {
    findings.push(createFinding(
      "Test Coverage Reviewer",
      1,
      codeEvidence ? "high" : "medium",
      "No test evidence was recorded for a code-facing review.",
      "Attach the smallest relevant regression test or verification command output before merging.",
      input.evidence,
    ));
  }

  return {
    role: "Test Coverage Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Test Coverage Reviewer", findings),
    findings,
  };
}

function reviewMaintainability(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];

  if (input.workflowState.updatedAt.trim().length === 0) {
    findings.push(createFinding(
      "Maintainability Reviewer",
      1,
      "high",
      "Workflow state is missing an updatedAt timestamp.",
      "Repair the workflow state before depending on this review as a durable record.",
      input.evidence,
    ));
  }

  if (input.workflowState.completedSteps.length > 0 && input.workflowState.failedSteps.length > input.workflowState.completedSteps.length) {
    findings.push(createFinding(
      "Maintainability Reviewer",
      findings.length + 1,
      "low",
      "The workflow has more failed steps than completed steps.",
      "Trim the failed-step noise and record the smallest useful recovery path.",
      input.evidence,
    ));
  }

  return {
    role: "Maintainability Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Maintainability Reviewer", findings),
    findings,
  };
}

function reviewPerformance(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  if (input.evidence.length > 25) {
    findings.push(createFinding(
      "Performance Reviewer",
      1,
      "low",
      "Evidence volume is large for a lightweight review.",
      "Trim the evidence to the smallest reproducible subset before requesting another pass.",
      input.evidence,
    ));
  }

  if (evidenceContains(input.evidence, /(slow|timeout|performance|latency)/i)) {
    findings.push(createFinding(
      "Performance Reviewer",
      findings.length + 1,
      "high",
      "The review evidence suggests a possible performance regression.",
      "Measure the hot path directly and attach the benchmark or profiling output.",
      input.evidence,
    ));
  }

  return {
    role: "Performance Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Performance Reviewer", findings),
    findings,
  };
}

function reviewDocumentation(input: ReviewRunInput): ReviewResult {
  const findings: ReviewFinding[] = [];
  const hasDocumentationEvidence = hasEvidenceKind(input.evidence, "documentation");
  const hasFileEvidence = hasEvidenceKind(input.evidence, "file");
  const needsDocumentedOutput = ["feature", "bugfix", "refactor", "planning", "mvp", "harness", "review"].includes(input.issueType);

  if (needsDocumentedOutput && !hasDocumentationEvidence && !hasFileEvidence) {
    findings.push(createFinding(
      "Documentation Reviewer",
      1,
      "medium",
      "The review does not include any documentation or file evidence.",
      "Attach the relevant diff, note, or rendered artifact so the review can be re-run later.",
      input.evidence,
    ));
  }

  return {
    role: "Documentation Reviewer",
    status: resultStatusFromFindings(findings),
    summary: summarizeResult("Documentation Reviewer", findings),
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
    case "Correctness Reviewer":
      return reviewCorrectness(input);
    case "Security Reviewer":
      return reviewSecurity(input);
    case "Test Coverage Reviewer":
      return reviewTestCoverage(input);
    case "Maintainability Reviewer":
      return reviewMaintainability(input);
    case "Performance Reviewer":
      return reviewPerformance(input);
    case "Documentation Reviewer":
      return reviewDocumentation(input);
  }

  throw new Error(`Unsupported review role: ${role}`);
}

export function createReviewCoordinatorResult(
  results: readonly ReviewResult[],
): {
  readonly passed: boolean;
  readonly results: readonly ReviewResult[];
  readonly blockingRoles: readonly ReviewRole[];
  readonly concernRoles: readonly ReviewRole[];
} {
  const blockingRoles = results.filter((result) => result.status === "fail").map((result) => result.role);
  const concernRoles = results.filter((result) => result.status === "concern").map((result) => result.role);
  return {
    passed: blockingRoles.length === 0,
    results: [...results],
    blockingRoles,
    concernRoles,
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

function renderEvidenceLine(evidence: EvidenceRecord): string {
  const location = evidence.location === undefined ? "" : ` (${evidence.location})`;
  const detail = evidence.detail === undefined ? "" : ` - ${evidence.detail}`;
  return `[${evidence.kind}] ${evidence.title}${location}${detail}`;
}

function renderFindingMarkdown(finding: ReviewFinding): string {
  const evidenceLines = finding.evidence === undefined || finding.evidence.length === 0
    ? ["    - None"]
    : finding.evidence.map((item) => `    - ${renderEvidenceLine(item)}`);

  return [
    `#### ${finding.id}`,
    `- Perspective: ${finding.perspective}`,
    `- Severity: ${renderSeverityLabel(finding.severity)}`,
    `- File/path: ${finding.filePath ?? "none"}`,
    "- Evidence:",
    ...evidenceLines,
    `- Problem: ${finding.problem}`,
    `- Recommendation: ${finding.recommendation}`,
    `- Requires follow-up issue: ${finding.requiresFollowUpIssue ? "yes" : "no"}`,
    `- Rationale: ${finding.rationale}`,
  ].join("\n");
}

function renderReviewResult(result: ReviewResult): string {
  const findings = sortFindings(result.findings);
  const findingLines = findings.length === 0
    ? ["- None"]
    : findings.map((finding) => renderFindingMarkdown(finding));

  return [
    `### ${result.role}`,
    "",
    `- Status: ${result.status}`,
    `- Summary: ${result.summary}`,
    "- Findings:",
    ...findingLines.map((line) => `  ${line}`),
  ].join("\n");
}

function formatReviewFileName(sequence: number, issueId: string): string {
  const sequencePart = String(sequence).padStart(3, "0");
  const issuePart = slugify(issueId).toUpperCase();
  return `REVIEW-${sequencePart}-${issuePart}.md`;
}

function renderReviewReportMarkdown(report: ReviewReport): string {
  const changedFiles = report.changedFiles.length === 0
    ? ["- None"]
    : report.changedFiles.map((file) => `- ${file}`);
  const commandEvidence = report.commandEvidence.length === 0
    ? ["- None"]
    : report.commandEvidence.map((command) => `- ${command}`);
  const recommendedNextActions = report.recommendedNextActions.length === 0
    ? ["- None"]
    : report.recommendedNextActions.map((item) => `- ${item}`);
  const followUpIssueSuggestions = report.followUpIssueSuggestions.length === 0
    ? ["- None"]
    : report.followUpIssueSuggestions.map((item) => `- ${item}`);
  const limitations = report.limitations.length === 0
    ? ["- None"]
    : report.limitations.map((item) => `- ${item}`);
  const allFindings = sortFindings(report.results.flatMap((result) => result.findings));

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
    `- Concern Roles: ${report.concernRoles.length === 0 ? "none" : report.concernRoles.join(", ")}`,
    "",
    "## Target",
    report.target,
    "## Diff Summary",
    ...formatDiffSummary(report.changedFiles),
    "## Changed Files",
    ...changedFiles,
    "",
    "## Commands / Tests",
    ...commandEvidence,
    "",
    "## Summary",
    report.summary,
    "",
    "## Perspective Results",
    report.results.map((result) => renderReviewResult(result)).join("\n\n"),
    "## Findings",
    ...(allFindings.length === 0 ? ["- None"] : allFindings.map((finding) => renderFindingMarkdown(finding))),
    "",
    "## Recommended Next Actions",
    ...recommendedNextActions,
    "",
    "## Follow-up Issue Suggestions",
    ...followUpIssueSuggestions,
    "",
    "## Limitations",
    ...limitations,
  ].join("\n");
}

function findNextReviewSequence(rootDir: string, issueId: string): Promise<number> {
  return (async () => {
    const paths = await resolveExistingIssuePaths(rootDir, issueId);
    if (!(await pathExists(paths.reviewsDir))) {
      return 1;
    }

    const entries = await readdir(paths.reviewsDir);
    const sequences = entries
      .map((entry) => entry.match(/^REVIEW-(\d{3})-/)?.[1])
      .filter((sequence): sequence is string => sequence !== undefined)
      .map((sequence) => Number.parseInt(sequence, 10));

    return (sequences.length === 0 ? 0 : Math.max(...sequences)) + 1;
  })();
}

function inferReviewTarget(input: ReviewRunInput): string {
  const changedFiles = extractChangedFiles(input.evidence);
  if (changedFiles.length > 0) {
    return `Changed files: ${changedFiles.join(", ")}`;
  }

  const commandEvidence = extractCommandEvidence(input.evidence);
  if (commandEvidence.length > 0) {
    return `Command evidence: ${commandEvidence.join(", ")}`;
  }

  if (input.issueType === "review") {
    return "Review issue evidence and workflow state.";
  }

  return "Issue evidence and workflow state.";
}

function formatDiffSummary(files: readonly string[]): string[] {
  if (files.length === 0) {
    return ["- No changed files were attached."];
  }

  const productionFiles = files.filter((file) => classifyChangedFilePriority(file) === 0);
  const testFiles = files.filter((file) => classifyChangedFilePriority(file) === 2);
  const docsAndConfigFiles = files.filter((file) => classifyChangedFilePriority(file) === 3);
  const otherFiles = files.filter((file) => classifyChangedFilePriority(file) === 1);

  const summarizeGroup = (label: string, group: readonly string[]): string | null => {
    if (group.length === 0) {
      return null;
    }

    const previewLimit = 3;
    const preview = group.slice(0, previewLimit).join(", ");
    const remainder = group.length > previewLimit ? `, ... +${group.length - previewLimit} more` : "";
    return `- ${label}: ${group.length} (${preview}${remainder})`;
  };

  return [
    summarizeGroup("Production files", productionFiles),
    summarizeGroup("Test files", testFiles),
    summarizeGroup("Docs/config files", docsAndConfigFiles),
    summarizeGroup("Other files", otherFiles),
  ].filter((line): line is string => line !== null);
}

function collectRecommendedNextActions(results: readonly ReviewResult[]): string[] {
  const actions = new Set<string>();
  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.recommendation.trim().length > 0 && (finding.severity === "critical" || finding.severity === "high" || finding.severity === "medium")) {
        actions.add(finding.recommendation);
      }
    }
  }

  return [...actions];
}

function collectFollowUpIssueSuggestions(results: readonly ReviewResult[]): string[] {
  const suggestions = new Set<string>();
  for (const result of results) {
    for (const finding of result.findings) {
      if (!finding.requiresFollowUpIssue) {
        continue;
      }

      suggestions.add(`${finding.id}: ${finding.problem}`);
    }
  }

  return [...suggestions];
}

function collectLimitations(input: ReviewRunInput, results: readonly ReviewResult[]): string[] {
  const limitations = new Set<string>();
  if (extractChangedFiles(input.evidence).length === 0) {
    limitations.add("No explicit source diff evidence was attached.");
  }

  if (extractCommandEvidence(input.evidence).length === 0) {
    limitations.add("No command output or test evidence was attached.");
  }

  if (results.some((result) => result.status === "concern")) {
    limitations.add("Some perspectives raised concerns that should be reviewed before merge.");
  }

  return [...limitations];
}

export async function writeReviewReportToIssue(
  input: ReviewRunInput,
  results: readonly ReviewResult[],
  force = false,
): Promise<ReviewReport> {
  const paths = await resolveExistingIssuePaths(input.rootDir, input.issueId);
  await ensureDirectory(paths.reviewsDir);
  const coordinator = createReviewCoordinatorResult(results);
  const sequence = await findNextReviewSequence(input.rootDir, input.issueId);
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const fileName = formatReviewFileName(sequence, input.issueId);
  const changedFiles = extractChangedFiles(input.evidence);
  const commandEvidence = extractCommandEvidence(input.evidence);
  const report: ReviewReport = {
    issueId: input.issueId,
    issueTitle: input.issueTitle,
    issueType: input.issueType,
    workflowId: input.workflowId,
    reviewedAt,
    results: coordinator.results,
    passed: coordinator.passed,
    blockingRoles: coordinator.blockingRoles,
    concernRoles: coordinator.concernRoles,
    target: inferReviewTarget(input),
    changedFiles,
    commandEvidence,
    recommendedNextActions: collectRecommendedNextActions(results),
    followUpIssueSuggestions: collectFollowUpIssueSuggestions(results),
    limitations: collectLimitations(input, results),
    summary: coordinator.passed
      ? coordinator.concernRoles.length === 0
        ? "All review agents passed."
        : `No blocking findings, but concern roles were recorded: ${coordinator.concernRoles.join(", ")}`
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
  const paths = await resolveExistingIssuePaths(rootDir, issueId);
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
  const paths = await resolveExistingIssuePaths(rootDir, issueId);
  const reviewPath = `${paths.reviewsDir}/${fileName}`;
  if (!(await pathExists(reviewPath))) {
    return null;
  }

  return readTextFile(reviewPath);
}
