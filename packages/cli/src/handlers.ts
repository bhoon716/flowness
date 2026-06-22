import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  analyzeRequest,
  type ClarificationQuestion,
  analyzeCommandRisk,
  applyHumanGateInstruction,
  appendTextFile,
  ensureDirectory,
  joinPaths,
  pathExists,
  readProjectConfig,
  readTextFile,
  resolveIssuePaths,
  resolveExistingIssuePaths,
  resolveWorkspacePaths,
  resolveRuleScaffoldPaths,
  resolveSkillScaffoldPaths,
  resolveWorkflowScaffoldPaths,
  isLikelyNaturalLanguageRequest,
  slugify,
  buildContextIndex,
  locateContextIndexArea,
  renderGeneratedConfigArtifacts,
  renderGeneratedHarnessManifestArtifact,
  renderGeneratedNavigationArtifacts,
  renderGeneratedPlanningDocArtifacts,
  renderProjectAnalysis,
  sha256Hex,
  type ActiveIssueNavigationContext,
  type ContextIndex,
  type ContextIndexArea,
  type LocateContextResult,
  type ProjectAnalysis,
  type EvidenceRecord,
  type EvidenceKind,
  type IssueRecord,
  type IssuePlan,
  type RequestAnalysis,
  type TestRunSummary,
  summarizeTestRunOutput,
  toUpperSnake,
  writeTextFile,
  writeProjectConfig,
  initializeProject,
  issueTypeValues,
} from "@flowness-labs/core";
import {
  createIssueWorkspace,
  createIssueId,
  findNextIssueSequence,
  readIssueWorkspace,
  writeIssueWorkspaceState,
} from "@flowness-labs/issue-system";
import {
  appendLogEntryToIssue,
  createLogEntry,
  readIssueLogEntries,
  readLatestIssueLogEntry,
} from "@flowness-labs/log-system";
import {
  listDecisionDocuments,
  writeDecisionDocumentToIssue,
} from "@flowness-labs/decision-system";
import {
  createEvidenceRecord,
  hasEvidenceKind,
  normalizeEvidenceKind,
  summarizeEvidence,
  validateEvidenceRecords,
} from "@flowness-labs/evidence-system";
import {
  createReviewCoordinatorResult,
  runStandardReviews,
  writeReviewReportToIssue,
} from "@flowness-labs/review-system";
import {
  createGenericWorkflowDefinition,
  getBuiltinWorkflowDefinition,
  loadWorkflowDefinitionFromWorkspace,
  renderWorkflowScaffoldSource,
  recoverWorkflowStep,
  runWorkflowStep,
  validateBuiltinWorkflowDefinitions,
  createWorkflowStepContext,
} from "@flowness-labs/workflow-engine";
import { runUpgradeCommand } from "./upgrade.js";

export function getPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version;
  } catch {
    return "0.2.7";
  }
}

export interface CliResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

export interface ParsedInitCommand {
  readonly kind: "init";
  readonly targetPath: string;
  readonly projectName?: string;
  readonly force: boolean;
}

export interface ParsedIssueCreateCommand {
  readonly kind: "issue:create";
  readonly title: string;
  readonly type: (typeof issueTypeValues)[number];
  readonly description?: string;
  readonly workflowId?: string;
  readonly parentIssueId?: string;
  readonly approvalNote?: string;
  readonly force: boolean;
}

export interface ParsedRequestCreateCommand {
  readonly kind: "request:create";
  readonly request: string;
  readonly type?: (typeof issueTypeValues)[number];
  readonly workflowId?: string;
  readonly force: boolean;
}

export interface ParsedSkillRunCommand {
  readonly kind: "skill:run";
  readonly skillId: string;
  readonly issueId?: string;
  readonly input?: string;
}

export interface ParsedWorkflowCreateCommand {
  readonly kind: "workflow:create";
  readonly workflowId: string;
  readonly name?: string;
  readonly force: boolean;
}

export interface ParsedWorkflowValidateCommand {
  readonly kind: "workflow:validate";
  readonly workflowId?: string;
}

export interface ParsedWorkflowStepCommand {
  readonly kind: "workflow:step";
  readonly issueId: string;
  readonly approve: boolean;
}

export interface ParsedWorkflowRecoverCommand {
  readonly kind: "workflow:recover";
  readonly issueId: string;
  readonly rootCause: string;
}

export interface ParsedStatusCommand {
  readonly kind: "status";
  readonly issueId: string;
}

export interface ParsedLocateCommand {
  readonly kind: "locate";
  readonly query: string;
}

export interface ParsedTestCommand {
  readonly kind: "test";
  readonly summary: boolean;
  readonly confirmRisk: boolean;
}

export interface ParsedAuditCommand {
  readonly kind: "audit";
  readonly scope: "changed" | "full";
  readonly confirmRisk: boolean;
}

export interface ParsedEvidenceAddCommand {
  readonly kind: "evidence:add";
  readonly issueId: string;
  readonly evidenceKind: EvidenceKind;
  readonly title: string;
  readonly detail?: string;
  readonly location?: string;
}

export interface ParsedDecisionCreateCommand {
  readonly kind: "decision:create";
  readonly issueId: string;
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly alternatives: readonly string[];
  readonly consequences: readonly string[];
  readonly force: boolean;
}

export interface ParsedReviewRunCommand {
  readonly kind: "review:run";
  readonly issueId: string;
}

export interface ParsedSkillCreateCommand {
  readonly kind: "skill:create";
  readonly skillId: string;
  readonly title: string;
  readonly description: string;
  readonly force: boolean;
}

export interface ParsedSkillListCommand {
  readonly kind: "skill:list";
}

export interface ParsedRuleCreateCommand {
  readonly kind: "rule:create";
  readonly ruleId: string;
  readonly title: string;
  readonly description: string;
  readonly force: boolean;
}

export interface ParsedRuleApplyCommand {
  readonly kind: "rule:apply";
  readonly ruleId: string;
  readonly issueId?: string;
  readonly input?: string;
}

export interface ParsedRuleUpdateCommand {
  readonly kind: "rule:update";
  readonly ruleId: string;
  readonly input: string;
  readonly issueId?: string;
}

export interface ParsedRuleListCommand {
  readonly kind: "rule:list";
}

export interface ParsedValidateCommand {
  readonly kind: "validate";
}

export interface ParsedUpgradeCommand {
  readonly kind: "upgrade";
  readonly mode: "dry-run" | "apply";
  readonly fromVersion: string | null;
  readonly toVersion: string | null;
  readonly explain: boolean;
  readonly force: boolean;
}

export interface ParsedConfigGateCommand {
  readonly kind: "config:gate";
  readonly instruction: string;
}

export interface ParsedVersionCommand {
  readonly kind: "version";
}

export interface ParsedCommandHelp {
  readonly kind: "help";
}

export interface ParsedUnsupportedCommand {
  readonly kind: "unsupported";
  readonly command: string;
}

export type ParsedCommand =
  | ParsedInitCommand
  | ParsedIssueCreateCommand
  | ParsedRequestCreateCommand
  | ParsedSkillRunCommand
  | ParsedWorkflowCreateCommand
  | ParsedWorkflowValidateCommand
  | ParsedWorkflowStepCommand
  | ParsedWorkflowRecoverCommand
  | ParsedStatusCommand
  | ParsedLocateCommand
  | ParsedTestCommand
  | ParsedAuditCommand
  | ParsedEvidenceAddCommand
  | ParsedDecisionCreateCommand
  | ParsedReviewRunCommand
  | ParsedSkillCreateCommand
  | ParsedSkillListCommand
  | ParsedRuleCreateCommand
  | ParsedRuleApplyCommand
  | ParsedRuleUpdateCommand
  | ParsedRuleListCommand
  | ParsedValidateCommand
  | ParsedUpgradeCommand
  | ParsedConfigGateCommand
  | ParsedVersionCommand
  | ParsedCommandHelp
  | ParsedUnsupportedCommand;

function isOptionToken(value: string | undefined): boolean {
  return value !== undefined && value.startsWith("-");
}

function parseBooleanFlag(token: string): boolean {
  return token === "--force" || token === "-f";
}

function normalizeIssueId(value: string): string {
  const normalized = toUpperSnake(value);
  if (!normalized) {
    throw new Error("Issue id must not be empty.");
  }

  return normalized;
}

function splitDelimitedList(value: string): readonly string[] {
  return value
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeIssueType(value: string): (typeof issueTypeValues)[number] {
  const normalized = slugify(value).replace(/-/g, "");
  if (!issueTypeValues.includes(normalized as (typeof issueTypeValues)[number])) {
    throw new Error(`Unsupported issue type: ${value}`);
  }

  return normalized as (typeof issueTypeValues)[number];
}

function normalizeWorkflowId(value: string): string {
  const normalized = slugify(value);
  if (!normalized) {
    throw new Error("Workflow id must not be empty.");
  }

  return normalized;
}

function normalizeRuleId(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/._-]+/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^[-/]+|[-/]+$/g, "");

  if (normalized.length === 0) {
    throw new Error("Rule id must not be empty.");
  }

  return normalized;
}

function humanizeWorkflowName(workflowId: string): string {
  return workflowId
    .split(/[-_]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseInitCommand(rest: readonly string[]): ParsedInitCommand {
  let targetPath = process.cwd();
  let projectName: string | undefined;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--name" || token === "--project-name") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error(`Missing value for ${token}.`);
      }
      projectName = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--name=")) {
      projectName = token.slice("--name=".length);
      continue;
    }

    if (token.startsWith("--project-name=")) {
      projectName = token.slice("--project-name=".length);
      continue;
    }

    positional.push(token);
  }

  if (positional.length > 1) {
    throw new Error(`Unexpected extra arguments: ${positional.slice(1).join(" ")}`);
  }

  if (positional[0] !== undefined) {
    targetPath = positional[0];
  }

  return {
    kind: "init",
    targetPath,
    force,
    ...(projectName === undefined ? {} : { projectName }),
  };
}

function parseIssueCreateCommand(rest: readonly string[]): ParsedIssueCreateCommand {
  let title: string | undefined;
  let type: (typeof issueTypeValues)[number] | undefined;
  let description: string | undefined;
  let workflowId: string | undefined;
  let parentIssueId: string | undefined;
  let approvalNote: string | undefined;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--title") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --title.");
      }
      title = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--title=")) {
      title = token.slice("--title=".length);
      continue;
    }

    if (token === "--type" || token === "-t") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --type.");
      }
      type = normalizeIssueType(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--type=")) {
      type = normalizeIssueType(token.slice("--type=".length));
      continue;
    }

    if (token === "--description" || token === "-d") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --description.");
      }
      description = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--description=")) {
      description = token.slice("--description=".length);
      continue;
    }

    if (token === "--workflow") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --workflow.");
      }
      workflowId = normalizeWorkflowId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--workflow=")) {
      workflowId = normalizeWorkflowId(token.slice("--workflow=".length));
      continue;
    }

    if (token === "--parent-issue" || token === "--parent") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error(`Missing value for ${token}.`);
      }
      parentIssueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--parent-issue=")) {
      parentIssueId = normalizeIssueId(token.slice("--parent-issue=".length));
      continue;
    }

    if (token.startsWith("--parent=")) {
      parentIssueId = normalizeIssueId(token.slice("--parent=".length));
      continue;
    }

    if (token === "--approval-note" || token === "--approval-text") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error(`Missing value for ${token}.`);
      }
      approvalNote = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--approval-note=")) {
      approvalNote = token.slice("--approval-note=".length);
      continue;
    }

    if (token.startsWith("--approval-text=")) {
      approvalNote = token.slice("--approval-text=".length);
      continue;
    }

    positional.push(token);
  }

  if (title === undefined && positional.length > 0) {
    title = positional.shift();
  }

  if (type === undefined && positional.length > 0) {
    type = normalizeIssueType(positional.shift() ?? "");
  }

  if (title === undefined || title.trim().length === 0) {
    throw new Error("Issue title is required.");
  }

  if (type === undefined) {
    throw new Error("Issue type is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "issue:create",
    title,
    type,
    force,
    ...(description === undefined ? {} : { description }),
    ...(workflowId === undefined ? {} : { workflowId }),
    ...(parentIssueId === undefined ? {} : { parentIssueId }),
    ...(approvalNote === undefined ? {} : { approvalNote }),
  };
}

function parseRequestCreateCommand(rest: readonly string[]): ParsedRequestCreateCommand {
  let type: (typeof issueTypeValues)[number] | undefined;
  let workflowId: string | undefined;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--type" || token === "-t") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --type.");
      }
      type = normalizeIssueType(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--type=")) {
      type = normalizeIssueType(token.slice("--type=".length));
      continue;
    }

    if (token === "--workflow") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --workflow.");
      }
      workflowId = normalizeWorkflowId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--workflow=")) {
      workflowId = normalizeWorkflowId(token.slice("--workflow=".length));
      continue;
    }

    positional.push(token);
  }

  const request = positional.join(" ").trim();
  if (request.length === 0) {
    throw new Error("Request text is required.");
  }

  return {
    kind: "request:create",
    request,
    force,
    ...(type === undefined ? {} : { type }),
    ...(workflowId === undefined ? {} : { workflowId }),
  };
}

function parseSkillRunCommand(rest: readonly string[]): ParsedSkillRunCommand {
  let skillId: string | undefined;
  let issueId: string | undefined;
  let input: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      skillId = slugify(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      skillId = slugify(token.slice("--id=".length));
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    if (token === "--input") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --input.");
      }
      input = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--input=")) {
      input = token.slice("--input=".length);
      continue;
    }

    positional.push(token);
  }

  if (skillId === undefined && positional.length > 0) {
    skillId = slugify(positional.shift() ?? "");
  }

  if (input === undefined && positional.length > 0) {
    input = positional.join(" ");
  }

  if (skillId === undefined || skillId.length === 0) {
    throw new Error("Skill id is required.");
  }

  return {
    kind: "skill:run",
    skillId,
    ...(issueId === undefined ? {} : { issueId }),
    ...(input === undefined ? {} : { input }),
  };
}

function parseWorkflowCreateCommand(rest: readonly string[]): ParsedWorkflowCreateCommand {
  let workflowId: string | undefined;
  let name: string | undefined;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      workflowId = normalizeWorkflowId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      workflowId = normalizeWorkflowId(token.slice("--id=".length));
      continue;
    }

    if (token === "--name") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --name.");
      }
      name = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--name=")) {
      name = token.slice("--name=".length);
      continue;
    }

    positional.push(token);
  }

  if (workflowId === undefined && positional.length > 0) {
    workflowId = normalizeWorkflowId(positional.shift() ?? "");
  }

  if (workflowId === undefined) {
    throw new Error("Workflow id is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "workflow:create",
    workflowId,
    force,
    ...(name === undefined ? {} : { name }),
  };
}

function parseWorkflowValidateCommand(rest: readonly string[]): ParsedWorkflowValidateCommand {
  let workflowId: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      workflowId = normalizeWorkflowId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      workflowId = normalizeWorkflowId(token.slice("--id=".length));
      continue;
    }

    positional.push(token);
  }

  if (workflowId === undefined && positional.length > 0) {
    workflowId = normalizeWorkflowId(positional.shift() ?? "");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "workflow:validate",
    ...(workflowId === undefined ? {} : { workflowId }),
  };
}

function parseWorkflowStepCommand(rest: readonly string[]): ParsedWorkflowStepCommand {
  let issueId: string | undefined;
  let approve = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--approve" || token === "-a") {
      approve = true;
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    positional.push(token);
  }

  if (issueId === undefined && positional.length > 0) {
    issueId = normalizeIssueId(positional.shift() ?? "");
  }

  if (issueId === undefined) {
    throw new Error("Issue id is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "workflow:step",
    issueId,
    approve,
  };
}

function parseWorkflowRecoverCommand(rest: readonly string[]): ParsedWorkflowRecoverCommand {
  let issueId: string | undefined;
  let rootCause: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    if (token === "--root-cause" || token === "--cause") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --root-cause.");
      }
      rootCause = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--root-cause=")) {
      rootCause = token.slice("--root-cause=".length);
      continue;
    }

    if (token.startsWith("--cause=")) {
      rootCause = token.slice("--cause=".length);
      continue;
    }

    positional.push(token);
  }

  if (issueId === undefined && positional.length > 0) {
    issueId = normalizeIssueId(positional.shift() ?? "");
  }

  if (rootCause === undefined && positional.length > 0) {
    rootCause = positional.join(" ");
    positional.length = 0;
  }

  if (issueId === undefined) {
    throw new Error("Issue id is required.");
  }

  if (rootCause === undefined || rootCause.trim().length === 0) {
    throw new Error("Root cause is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "workflow:recover",
    issueId,
    rootCause,
  };
}

function parseStatusCommand(rest: readonly string[]): ParsedStatusCommand {
  let issueId: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    positional.push(token);
  }

  if (issueId === undefined && positional.length > 0) {
    issueId = normalizeIssueId(positional.shift() ?? "");
  }

  if (issueId === undefined) {
    throw new Error("Issue id is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "status",
    issueId,
  };
}

function parseLocateCommand(rest: readonly string[]): ParsedLocateCommand {
  const query = rest.join(" ").trim();
  if (query.length === 0) {
    throw new Error("Locate query is required.");
  }

  return {
    kind: "locate",
    query,
  };
}

function parseTestCommand(rest: readonly string[]): ParsedTestCommand {
  let summary = true;
  let confirmRisk = false;

  for (const token of rest) {
    if (token === "--summary" || token === "-s") {
      summary = true;
      continue;
    }

    if (token === "--confirm-risk") {
      confirmRisk = true;
      continue;
    }

    throw new Error(`Unexpected extra arguments: ${token}`);
  }

  return {
    kind: "test",
    summary,
    confirmRisk,
  };
}

function parseAuditCommand(rest: readonly string[]): ParsedAuditCommand {
  let scope: "changed" | "full" = "changed";
  let confirmRisk = false;

  for (const token of rest) {
    if (token === "--changed") {
      scope = "changed";
      continue;
    }

    if (token === "--full") {
      scope = "full";
      continue;
    }

    if (token === "--confirm-risk") {
      confirmRisk = true;
      continue;
    }

    throw new Error(`Unexpected extra arguments: ${token}`);
  }

  return {
    kind: "audit",
    scope,
    confirmRisk,
  };
}

function parseEvidenceAddCommand(rest: readonly string[]): ParsedEvidenceAddCommand {
  let issueId: string | undefined;
  let evidenceKind: EvidenceKind | undefined;
  let title: string | undefined;
  let detail: string | undefined;
  let location: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    if (token === "--kind" || token === "-k") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --kind.");
      }
      evidenceKind = normalizeEvidenceKind(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--kind=")) {
      evidenceKind = normalizeEvidenceKind(token.slice("--kind=".length));
      continue;
    }

    if (token === "--title") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --title.");
      }
      title = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--title=")) {
      title = token.slice("--title=".length);
      continue;
    }

    if (token === "--detail") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --detail.");
      }
      detail = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--detail=")) {
      detail = token.slice("--detail=".length);
      continue;
    }

    if (token === "--location") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --location.");
      }
      location = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--location=")) {
      location = token.slice("--location=".length);
      continue;
    }

    positional.push(token);
  }

  if (issueId === undefined && positional.length > 0) {
    issueId = normalizeIssueId(positional.shift() ?? "");
  }

  if (evidenceKind === undefined && location !== undefined) {
    evidenceKind = "file";
  }

  if (evidenceKind === undefined) {
    evidenceKind = "command_output";
  }

  if (title === undefined && positional.length > 0) {
    title = positional.shift();
  }

  if (detail === undefined && positional.length > 0) {
    detail = positional.shift();
  }

  if (location === undefined && positional.length > 0) {
    location = positional.shift();
  }

  if (issueId === undefined) {
    throw new Error("Issue id is required.");
  }

  if (title === undefined || title.trim().length === 0) {
    throw new Error("Evidence title is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "evidence:add",
    issueId,
    evidenceKind,
    title,
    ...(detail === undefined ? {} : { detail }),
    ...(location === undefined ? {} : { location }),
  };
}

function parseDecisionCreateCommand(rest: readonly string[]): ParsedDecisionCreateCommand {
  let issueId: string | undefined;
  let title: string | undefined;
  let context: string | undefined;
  let decision: string | undefined;
  let alternatives: readonly string[] = [];
  let consequences: readonly string[] = [];
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    if (token === "--title") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --title.");
      }
      title = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--title=")) {
      title = token.slice("--title=".length);
      continue;
    }

    if (token === "--context") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --context.");
      }
      context = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--context=")) {
      context = token.slice("--context=".length);
      continue;
    }

    if (token === "--decision") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --decision.");
      }
      decision = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--decision=")) {
      decision = token.slice("--decision=".length);
      continue;
    }

    if (token === "--alternatives") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --alternatives.");
      }
      alternatives = splitDelimitedList(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--alternatives=")) {
      alternatives = splitDelimitedList(token.slice("--alternatives=".length));
      continue;
    }

    if (token === "--consequences") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --consequences.");
      }
      consequences = splitDelimitedList(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--consequences=")) {
      consequences = splitDelimitedList(token.slice("--consequences=".length));
      continue;
    }

    positional.push(token);
  }

  if (issueId === undefined && positional.length > 0) {
    issueId = normalizeIssueId(positional.shift() ?? "");
  }

  if (title === undefined && positional.length > 0) {
    title = positional.shift();
  }

  if (context === undefined && positional.length > 0) {
    context = positional.shift();
  }

  if (decision === undefined && positional.length > 0) {
    decision = positional.shift();
  }

  if (alternatives.length === 0 && positional.length > 0) {
    alternatives = splitDelimitedList(positional.shift() ?? "");
  }

  if (consequences.length === 0 && positional.length > 0) {
    consequences = splitDelimitedList(positional.join(" "));
    positional.length = 0;
  }

  if (issueId === undefined) {
    throw new Error("Issue id is required.");
  }

  if (title === undefined || title.trim().length === 0) {
    throw new Error("Decision title is required.");
  }

  if (context === undefined || context.trim().length === 0) {
    throw new Error("Decision context is required.");
  }

  if (decision === undefined || decision.trim().length === 0) {
    throw new Error("Decision text is required.");
  }

  if (alternatives.length === 0) {
    throw new Error("At least one alternative is required.");
  }

  if (consequences.length === 0) {
    throw new Error("At least one consequence is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "decision:create",
    issueId,
    title,
    context,
    decision,
    alternatives,
    consequences,
    force,
  };
}

function parseReviewRunCommand(rest: readonly string[]): ParsedReviewRunCommand {
  let issueId: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    positional.push(token);
  }

  if (issueId === undefined && positional.length > 0) {
    issueId = normalizeIssueId(positional.shift() ?? "");
  }

  if (issueId === undefined) {
    throw new Error("Issue id is required.");
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "review:run",
    issueId,
  };
}

function parseSkillCreateCommand(rest: readonly string[]): ParsedSkillCreateCommand {
  let skillId: string | undefined;
  let title: string | undefined;
  let description: string | undefined;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      skillId = slugify(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      skillId = slugify(token.slice("--id=".length));
      continue;
    }

    if (token === "--title") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --title.");
      }
      title = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--title=")) {
      title = token.slice("--title=".length);
      continue;
    }

    if (token === "--description") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --description.");
      }
      description = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--description=")) {
      description = token.slice("--description=".length);
      continue;
    }

    positional.push(token);
  }

  if (skillId === undefined && positional.length > 0) {
    skillId = slugify(positional.shift() ?? "");
  }

  if (title === undefined && positional.length > 0) {
    title = positional.shift();
  }

  if (description === undefined && positional.length > 0) {
    description = positional.join(" ");
    positional.length = 0;
  }

  if (skillId === undefined || skillId.length === 0) {
    throw new Error("Skill id is required.");
  }

  if (title === undefined || title.trim().length === 0) {
    throw new Error("Skill title is required.");
  }

  if (description === undefined || description.trim().length === 0) {
    description = `Reusable skill for ${title}.`;
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "skill:create",
    skillId,
    title,
    description,
    force,
  };
}

function parseSkillListCommand(rest: readonly string[]): ParsedSkillListCommand {
  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }

  return { kind: "skill:list" };
}

function parseRuleCreateCommand(rest: readonly string[]): ParsedRuleCreateCommand {
  let ruleId: string | undefined;
  let title: string | undefined;
  let description: string | undefined;
  let force = false;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (parseBooleanFlag(token)) {
      force = true;
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      ruleId = normalizeRuleId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      ruleId = normalizeRuleId(token.slice("--id=".length));
      continue;
    }

    if (token === "--title") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --title.");
      }
      title = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--title=")) {
      title = token.slice("--title=".length);
      continue;
    }

    if (token === "--description") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --description.");
      }
      description = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--description=")) {
      description = token.slice("--description=".length);
      continue;
    }

    positional.push(token);
  }

  if (ruleId === undefined && positional.length > 0) {
    ruleId = normalizeRuleId(positional.shift() ?? "");
  }

  if (title === undefined && positional.length > 0) {
    title = positional.shift();
  }

  if (description === undefined && positional.length > 0) {
    description = positional.join(" ");
    positional.length = 0;
  }

  if (ruleId === undefined || ruleId.length === 0) {
    throw new Error("Rule id is required.");
  }

  if (title === undefined || title.trim().length === 0) {
    title = humanizeRuleId(ruleId);
  }

  if (description === undefined || description.trim().length === 0) {
    description = `Reusable rule for ${title}.`;
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected extra arguments: ${positional.join(" ")}`);
  }

  return {
    kind: "rule:create",
    ruleId,
    title,
    description,
    force,
  };
}

function parseRuleApplyCommand(rest: readonly string[]): ParsedRuleApplyCommand {
  let ruleId: string | undefined;
  let issueId: string | undefined;
  let input: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      ruleId = normalizeRuleId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      ruleId = normalizeRuleId(token.slice("--id=".length));
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    if (token === "--input") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --input.");
      }
      input = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--input=")) {
      input = token.slice("--input=".length);
      continue;
    }

    positional.push(token);
  }

  if (ruleId === undefined && positional.length > 0) {
    ruleId = normalizeRuleId(positional.shift() ?? "");
  }

  if (input === undefined && positional.length > 0) {
    input = positional.join(" ");
  }

  if (ruleId === undefined || ruleId.length === 0) {
    throw new Error("Rule id is required.");
  }

  return {
    kind: "rule:apply",
    ruleId,
    ...(issueId === undefined ? {} : { issueId }),
    ...(input === undefined ? {} : { input }),
  };
}

function parseRuleUpdateCommand(rest: readonly string[]): ParsedRuleUpdateCommand {
  let ruleId: string | undefined;
  let issueId: string | undefined;
  let input: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--id") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --id.");
      }
      ruleId = normalizeRuleId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      ruleId = normalizeRuleId(token.slice("--id=".length));
      continue;
    }

    if (token === "--issue") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --issue.");
      }
      issueId = normalizeIssueId(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--issue=")) {
      issueId = normalizeIssueId(token.slice("--issue=".length));
      continue;
    }

    if (token === "--input") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error("Missing value for --input.");
      }
      input = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--input=")) {
      input = token.slice("--input=".length);
      continue;
    }

    positional.push(token);
  }

  if (ruleId === undefined && positional.length > 0) {
    ruleId = normalizeRuleId(positional.shift() ?? "");
  }

  if (input === undefined && positional.length > 0) {
    input = positional.join(" ");
  }

  if (ruleId === undefined || ruleId.length === 0) {
    throw new Error("Rule id is required.");
  }

  if (input === undefined || input.trim().length === 0) {
    throw new Error("Rule update input is required.");
  }

  return {
    kind: "rule:update",
    ruleId,
    input,
    ...(issueId === undefined ? {} : { issueId }),
  };
}

function parseRuleListCommand(rest: readonly string[]): ParsedRuleListCommand {
  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }

  return { kind: "rule:list" };
}

function parseValidateCommand(rest: readonly string[]): ParsedValidateCommand {
  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }

  return { kind: "validate" };
}

function parseUpgradeCommand(rest: readonly string[]): ParsedUpgradeCommand {
  let mode: "dry-run" | "apply" = "dry-run";
  let seenModeFlag: "dry-run" | "apply" | null = null;
  let fromVersion: string | null = null;
  let toVersion: string | null = null;
  let explain = false;
  let force = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--dry-run" || token === "--apply") {
      const requestedMode = token === "--apply" ? "apply" : "dry-run";
      if (seenModeFlag !== null && seenModeFlag !== requestedMode) {
        throw new Error("Use only one of --dry-run or --apply.");
      }
      mode = requestedMode;
      seenModeFlag = requestedMode;
      continue;
    }

    if (token === "--explain") {
      explain = true;
      continue;
    }

    if (token === "--force") {
      force = true;
      continue;
    }

    if (token === "--from" || token.startsWith("--from=")) {
      const value = token.includes("=")
        ? token.slice("--from=".length)
        : rest[index + 1];
      if (value === undefined || value.length === 0 || isOptionToken(value)) {
        throw new Error("Missing value for --from.");
      }
      fromVersion = value;
      if (!token.includes("=")) {
        index += 1;
      }
      continue;
    }

    if (token === "--to" || token.startsWith("--to=")) {
      const value = token.includes("=")
        ? token.slice("--to=".length)
        : rest[index + 1];
      if (value === undefined || value.length === 0 || isOptionToken(value)) {
        throw new Error("Missing value for --to.");
      }
      toVersion = value;
      if (!token.includes("=")) {
        index += 1;
      }
      continue;
    }

    throw new Error(`Unexpected argument: ${token}`);
  }

  return {
    kind: "upgrade",
    mode,
    fromVersion,
    toVersion,
    explain,
    force,
  };
}

function parseConfigGateCommand(rest: readonly string[]): ParsedConfigGateCommand {
  let instruction: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--set" || token === "--instruction") {
      const next = rest[index + 1];
      if (next === undefined || isOptionToken(next)) {
        throw new Error(`Missing value for ${token}.`);
      }
      instruction = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--set=")) {
      instruction = token.slice("--set=".length);
      continue;
    }

    if (token.startsWith("--instruction=")) {
      instruction = token.slice("--instruction=".length);
      continue;
    }

    positional.push(token);
  }

  if (instruction === undefined && positional.length > 0) {
    instruction = positional.join(" ");
  }

  if (instruction === undefined || instruction.trim().length === 0) {
    throw new Error("Human gate instruction is required.");
  }

  return {
    kind: "config:gate",
    instruction,
  };
}

export function parseCommand(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    return { kind: "help" };
  }

  if (command === "--version" || command === "-v") {
    return { kind: "version" };
  }

  switch (command) {
    case "init":
      return parseInitCommand(rest);
    case "run":
    case "request:create":
      return parseRequestCreateCommand(rest);
    case "issue:create":
      return parseIssueCreateCommand(rest);
    case "skill:run":
      return parseSkillRunCommand(rest);
    case "workflow:create":
      return parseWorkflowCreateCommand(rest);
    case "workflow:validate":
      return parseWorkflowValidateCommand(rest);
    case "step":
    case "workflow:step":
      return parseWorkflowStepCommand(rest);
    case "workflow:recover":
      return parseWorkflowRecoverCommand(rest);
    case "status":
      return parseStatusCommand(rest);
    case "locate":
      return parseLocateCommand(rest);
    case "test":
      return parseTestCommand(rest);
    case "audit":
      return parseAuditCommand(rest);
    case "evidence:add":
      return parseEvidenceAddCommand(rest);
    case "decision:create":
      return parseDecisionCreateCommand(rest);
    case "review:run":
      return parseReviewRunCommand(rest);
    case "skill:create":
      return parseSkillCreateCommand(rest);
    case "skill:list":
      return parseSkillListCommand(rest);
    case "rule:create":
      return parseRuleCreateCommand(rest);
    case "rule:apply":
      return parseRuleApplyCommand(rest);
    case "rule:update":
      return parseRuleUpdateCommand(rest);
    case "rule:list":
      return parseRuleListCommand(rest);
    case "validate":
      return parseValidateCommand(rest);
    case "upgrade":
      return parseUpgradeCommand(rest);
    case "config:gate":
      return parseConfigGateCommand(rest);
    default:
      return { kind: "unsupported", command };
  }
}

function formatInitSummary(
  targetPath: string,
  createdFiles: readonly string[],
  createdDirectories: readonly string[],
  skippedFiles: readonly string[],
  alreadyInitialized: boolean,
  gitInitialized: boolean,
  warnings: readonly string[],
): string {
  const lines = [
    alreadyInitialized
      ? `Flowness project already existed at ${targetPath}.`
      : `Initialized Flowness project at ${targetPath}.`,
  ];

  if (gitInitialized) {
    lines.push("Initialized a git repository for the workspace.");
  }

  if (warnings.length > 0) {
    lines.push("Warnings:");
    lines.push(...warnings.map((warning) => `- ${warning}`));
  }

  if (createdDirectories.length > 0) {
    lines.push(`Created directories: ${createdDirectories.join(", ")}`);
  }

  if (createdFiles.length > 0) {
    lines.push(`Created files: ${createdFiles.join(", ")}`);
  }

  if (skippedFiles.length > 0) {
    lines.push(`Skipped existing files: ${skippedFiles.join(", ")}`);
  }

  lines.push("Next: review .flowness/project-profile.md, .flowness/context-index.json, .flowness/commands.json, and .flowness/harness-manifest.json.");
  return lines.join("\n");
}

function formatWorkflowCreateSummary(
  workflowId: string,
  workflowName: string,
  createdFiles: readonly string[],
  createdDirectories: readonly string[],
  skippedFiles: readonly string[],
): string {
  const lines = [
    `Created workflow scaffold ${workflowId} (${workflowName}).`,
  ];

  if (createdDirectories.length > 0) {
    lines.push(`Created directories: ${createdDirectories.join(", ")}`);
  }

  if (createdFiles.length > 0) {
    lines.push(`Created files: ${createdFiles.join(", ")}`);
  }

  if (skippedFiles.length > 0) {
    lines.push(`Skipped existing files: ${skippedFiles.join(", ")}`);
  }

  lines.push("Next: fill in the workflow implementation and validate it.");
  return lines.join("\n");
}

function formatWorkflowValidationSummary(
  scope: string,
  errors: readonly string[],
): string {
  if (errors.length === 0) {
    return `Workflow validation passed for ${scope}.`;
  }

  return [
    `Workflow validation failed for ${scope}.`,
    ...errors.map((error) => `- ${error}`),
  ].join("\n");
}

function formatRequestCategoryLabel(category: RequestAnalysis["category"]): string {
  switch (category) {
    case "casual_or_question":
      return "a casual message or question";
    case "single_development_task":
      return "a development task";
    case "mvp_or_product_planning":
      return "an MVP planning request";
    case "multi_issue_project":
      return "a multi-issue project";
    case "review_task":
      return "a review task";
    case "bugfix_task":
      return "a bug fix request";
    case "refactor_task":
      return "a refactor task";
    case "performance_improvement_task":
      return "a performance improvement request";
    case "rule_change_candidate":
      return "a rule change candidate";
    default:
      return "a request";
  }
}

function normalizeComparisonText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeComparisonText(value: string): readonly string[] {
  const normalized = normalizeComparisonText(value);
  if (normalized.length === 0) {
    return [];
  }

  return normalized.split(" ").filter((token) => token.length > 0);
}

function calculateRequestSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeComparisonText(left);
  const normalizedRight = normalizeComparisonText(right);
  if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.95;
  }

  const leftTokens = new Set(tokenizeComparisonText(left));
  const rightTokens = new Set(tokenizeComparisonText(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

async function findReusableIssueWorkspace(
  rootDir: string,
  analysis: RequestAnalysis,
  workflowId: string,
): Promise<Awaited<ReturnType<typeof readIssueWorkspace>> | null> {
  let bestMatch: {
    readonly workspace: NonNullable<Awaited<ReturnType<typeof readIssueWorkspace>>>;
    readonly score: number;
  } | null = null;

  const issueRoots = [
    resolveWorkspacePaths(rootDir).agentIssuesDir,
    join(rootDir, ".agent", "issues"),
  ];

  for (const issueRoot of issueRoots) {
    if (!(await pathExists(issueRoot))) {
      continue;
    }

    const entries = await readdir(issueRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const workspace = await readIssueWorkspace(rootDir, entry.name);
      if (workspace === null || workspace.issue.workflowId !== workflowId) {
        continue;
      }

      if (workspace.issue.state === "closed") {
        continue;
      }

      const score = Math.max(
        calculateRequestSimilarity(analysis.request, workspace.description ?? ""),
        calculateRequestSimilarity(analysis.request, workspace.issue.title),
        workspace.issue.goal === undefined ? 0 : calculateRequestSimilarity(analysis.request, workspace.issue.goal),
      );

      if (score >= 0.75 && (bestMatch === null || score > bestMatch.score)) {
        bestMatch = {
          workspace,
          score,
        };
      }
    }
  }

  if (bestMatch === null) {
    return null;
  }

  await assertIssueWorkspaceLogAlignment(rootDir, bestMatch.workspace);
  return bestMatch.workspace;
}

function formatRequestAnalysisSummary(analysis: RequestAnalysis): string {
  const lines = [
    `Request: ${analysis.request}`,
    `Category: ${analysis.category}`,
    `Intent: ${analysis.intent}`,
    `Execution mode: ${analysis.executionMode}`,
    `Issue count: ${analysis.issueCount}`,
    `Confidence: ${analysis.confidence.toFixed(2)}`,
    `Safe to proceed: ${analysis.safeToProceed ? "yes" : "no"}`,
    `Next action: ${analysis.nextAction}`,
    `Requires issue: ${analysis.requiresIssue ? "yes" : "no"}`,
    `Reason: ${analysis.reason}`,
    `Workflow: ${analysis.workflowId ?? "none"}`,
    `Issue type: ${analysis.issueType ?? "none"}`,
    `Clarification required: ${analysis.needsClarification ? "yes" : "no"}`,
    `Performance improvement: ${analysis.category === "performance_improvement_task" ? "yes" : "no"}`,
    `Rule change candidate: ${analysis.ruleChangeCandidate ? "yes" : "no"}`,
    `Requires user approval: ${analysis.requiresUserApproval ? "yes" : "no"}`,
  ];

  if (analysis.reviewTarget !== undefined) {
    const reviewTargetFiles = analysis.reviewTarget.files.length === 0 ? "" : ` (${analysis.reviewTarget.files.join(", ")})`;
    lines.push(`Review target: ${analysis.reviewTarget.label}${reviewTargetFiles}`);
  } else if (analysis.category === "review_task") {
    lines.push("Review target: needs clarification.");
  }

  if (analysis.clarificationQuestions.length > 0) {
    lines.push("");
    lines.push("Clarifying questions:");
    lines.push(...renderClarificationQuestions(analysis.clarificationQuestions));
  }

  if (analysis.issuePlan !== undefined) {
    lines.push(`Primary issue: ${analysis.issuePlan.primaryIssue.title}`);
    lines.push(`Primary workflow: ${analysis.issuePlan.primaryIssue.workflowId}`);
    lines.push(`Child issues planned: ${analysis.issuePlan.childIssues.length}`);
    if (analysis.issuePlan.childIssues.length > 0) {
      lines.push("Proposed decomposition:");
      for (const child of analysis.issuePlan.childIssues) {
        lines.push(`- ${child.title} (${child.workflowId})`);
      }
    }
  }

  if (analysis.ruleChangeRuleId !== undefined) {
    lines.push(`Rule id: ${analysis.ruleChangeRuleId}`);
  }

  if (analysis.existingRule !== undefined) {
    lines.push(`Existing rule: ${analysis.existingRule}`);
  }

  if (analysis.proposedRule !== undefined) {
    lines.push(`Proposed rule: ${analysis.proposedRule}`);
  }

  return lines.join("\n");
}

function renderClarificationQuestion(
  question: ClarificationQuestion,
  index: number,
): string[] {
  const lines = [
    `${index}. ${question.question}`,
  ];

  for (const option of question.options) {
    lines.push(`   ${option.label}: ${option.summary}`);
    lines.push("     Pros:");
    for (const pro of option.pros) {
      lines.push(`     - ${pro}`);
    }
    lines.push("     Cons:");
    for (const con of option.cons) {
      lines.push(`     - ${con}`);
    }
  }

  lines.push(`   Recommended default: ${question.recommendedDefault}`);
  lines.push(`   What I need from you: ${question.whatINeedFromYou}`);
  return lines;
}

function renderClarificationQuestions(
  questions: readonly ClarificationQuestion[],
): string[] {
  const lines: string[] = [];
  for (const [index, question] of questions.entries()) {
    if (index > 0) {
      lines.push("");
    }
    lines.push(...renderClarificationQuestion(question, index + 1));
  }
  return lines;
}

function formatIssueSummary(result: Awaited<ReturnType<typeof createIssueWorkspace>>): string {
  const lines = [
    `Created issue ${result.issue.id}.`,
    `Type: ${result.issue.type}`,
    `Workflow: ${result.issue.workflowId}`,
    `Created files: ${result.createdFiles.join(", ")}`,
    `Log: ${result.issue.logPath}`,
  ];

  if (result.issue.parentIssueId !== undefined && result.issue.parentIssueId !== null) {
    lines.push(`Parent: ${result.issue.parentIssueId}`);
  }

  if (result.issue.childIssueIds !== undefined && result.issue.childIssueIds.length > 0) {
    lines.push(`Children: ${result.issue.childIssueIds.join(", ")}`);
  }

  if (result.issue.goal !== undefined) {
    lines.push(`Goal: ${result.issue.goal}`);
  }

  lines.push("Next: add issue context or move the issue through the workflow.");
  return lines.join("\n");
}

function formatRequestCreateSummary(input: {
  readonly analysis: RequestAnalysis;
  readonly issue: IssueRecord;
  readonly reused: boolean;
}): string {
  const lines = [
    `Flowness analyzed this as ${formatRequestCategoryLabel(input.analysis.category)}.`,
    `${input.reused ? "Reused existing issue" : "Created issue"} ${input.issue.id} and routed it to ${input.issue.workflowId}.`,
    `Execution mode: ${input.analysis.executionMode}`,
    `Issue count: ${input.analysis.issueCount}`,
    `Confidence: ${input.analysis.confidence.toFixed(2)}`,
    `Safe to proceed: ${input.analysis.safeToProceed ? "yes" : "no"}`,
    `Next action: ${input.analysis.nextAction}`,
    `Workflow: ${input.issue.workflowId}`,
    `Type: ${input.issue.type}`,
    `Log: ${input.issue.logPath}`,
  ];

  lines.push(
    input.analysis.category === "review_task"
      ? "Start with 01-intake.md / clarification before review."
      : "Start with 01-intake.md / clarification before implementation.",
  );

  if (input.analysis.reviewTarget !== undefined) {
    const reviewTargetFiles = input.analysis.reviewTarget.files.length === 0 ? "" : ` (${input.analysis.reviewTarget.files.join(", ")})`;
    lines.push(`Review target: ${input.analysis.reviewTarget.label}${reviewTargetFiles}`);
  } else if (input.analysis.category === "review_task") {
    lines.push("Review target: needs clarification.");
  }

  if (input.issue.parentIssueId !== undefined && input.issue.parentIssueId !== null) {
    lines.push(`Parent: ${input.issue.parentIssueId}`);
  }

  if (input.issue.childIssueIds !== undefined && input.issue.childIssueIds.length > 0) {
    lines.push(`Children: ${input.issue.childIssueIds.join(", ")}`);
  }

  if (input.analysis.issuePlan !== undefined && input.analysis.issuePlan.childIssues.length > 0) {
    lines.push("Proposed decomposition:");
    for (const child of input.analysis.issuePlan.childIssues) {
      lines.push(`- ${child.title} (${child.workflowId})`);
    }
    if (input.issue.childIssueIds !== undefined && input.issue.childIssueIds.length > 0) {
      lines.push("Decomposition approval was granted, so child issues were created.");
    } else if (!input.reused) {
      lines.push("Child issues were not created yet. Re-run with --force to approve the proposed decomposition.");
    }
  }

  if (input.analysis.needsClarification) {
    lines.push("Implementation is blocked until clarification questions are answered.");
  }

  return lines.join("\n");
}

function formatRuleApprovalSummary(analysis: RequestAnalysis): string {
  const lines = [
    "Rule change candidate detected.",
    `현재 rule은 "${analysis.existingRule ?? "none"}"입니다. 앞으로는 "${analysis.proposedRule ?? "none"}"로 바꿀까요?`,
    `Request: ${analysis.request}`,
    `Rule id: ${analysis.ruleChangeRuleId ?? "unknown"}`,
    `Existing rule: ${analysis.existingRule ?? "none"}`,
    `Proposed rule: ${analysis.proposedRule ?? "none"}`,
    `Reason: ${analysis.reason}`,
    `Approval required: ${analysis.requiresUserApproval ? "yes" : "no"}`,
    `Next action: ${analysis.requiresUserApproval ? "Review the existing rule and approve or revise the proposed change." : analysis.nextAction}`,
    `Use: ${analysis.ruleChangeRuleId === undefined ? "flowness rule:update --id RULE-ID --input \"...\"" : `flowness rule:update --id ${analysis.ruleChangeRuleId} --input \"...\"`}`,
  ];

  return lines.join("\n");
}

function formatQuestionOrCasualSummary(analysis: RequestAnalysis): string {
  const lines = [
    "No issue created.",
    `Category: ${analysis.category}`,
    `Intent: ${analysis.intent}`,
    `Execution mode: ${analysis.executionMode}`,
    `Issue count: ${analysis.issueCount}`,
    `Confidence: ${analysis.confidence.toFixed(2)}`,
    `Safe to proceed: ${analysis.safeToProceed ? "yes" : "no"}`,
    `Next action: ${analysis.nextAction}`,
    `Reason: ${analysis.reason}`,
    `Request: ${analysis.request}`,
    analysis.executionMode === "answer"
      ? "Normal response can continue."
      : "Clarification is required before implementation can continue.",
  ];

  if (analysis.clarificationQuestions.length > 0) {
    lines.push("");
    lines.push("Clarifying questions:");
    lines.push(...renderClarificationQuestions(analysis.clarificationQuestions));
  }

  return lines.join("\n");
}

function buildFallbackIssuePlan(
  analysis: RequestAnalysis,
  issueType: (typeof issueTypeValues)[number],
  workflowId: string,
): IssuePlan {
  return {
    title: analysis.suggestedTitle,
    type: issueType,
    workflowId,
    goal: analysis.reason,
    acceptanceCriteria: [
      `The request "${analysis.request}" is resolved.`,
      "Evidence is recorded.",
    ],
    dependencies: [],
    evidenceRequired: [
      "Implementation or review evidence",
      "Verification output",
    ],
  };
}

function formatDecisionSummary(input: {
  readonly fileName: string;
  readonly issueId: string;
  readonly filePath: string;
  readonly evidenceCount: number;
}): string {
  return [
    `Created decision ${input.fileName}.`,
    `Issue: ${input.issueId}`,
    `Path: ${input.filePath}`,
    `Evidence items: ${input.evidenceCount}`,
  ].join("\n");
}

function formatReviewSummary(report: Awaited<ReturnType<typeof writeReviewReportToIssue>>): string {
  return [
    `Created review report ${report.fileName}.`,
    `Issue: ${report.issueId}`,
    `Path: ${report.filePath}`,
    `Passed: ${report.passed ? "yes" : "no"}`,
    `Blocking roles: ${report.blockingRoles.length === 0 ? "none" : report.blockingRoles.join(", ")}`,
  ].join("\n");
}

function formatSkillSummary(skillId: string, title: string, filePath: string, createdFiles: readonly string[], skippedFiles: readonly string[]): string {
  return [
    `Created skill scaffold ${skillId} (${title}).`,
    `Path: ${filePath}`,
    `Created files: ${createdFiles.length === 0 ? "none" : createdFiles.join(", ")}`,
    `Skipped files: ${skippedFiles.length === 0 ? "none" : skippedFiles.join(", ")}`,
  ].join("\n");
}

function formatRuleSummary(ruleId: string, title: string, filePath: string, createdFiles: readonly string[], skippedFiles: readonly string[]): string {
  return [
    `Created rule ${ruleId} (${title}).`,
    `Path: ${filePath}`,
    `Created files: ${createdFiles.length === 0 ? "none" : createdFiles.join(", ")}`,
    `Skipped files: ${skippedFiles.length === 0 ? "none" : skippedFiles.join(", ")}`,
  ].join("\n");
}

function formatRuleUpdateSummary(input: {
  readonly ruleId: string;
  readonly filePath: string;
  readonly logPath: string | null;
  readonly action: "created" | "updated";
  readonly resolvedRuleId?: string;
  readonly requestedRuleId?: string;
  readonly ruleUpdateLogPath: string;
  readonly matchedExistingRule?: boolean;
}): string {
  return [
    `${input.action === "created" ? "Created" : "Updated"} rule ${input.ruleId}.`,
    input.requestedRuleId !== undefined && input.requestedRuleId !== input.ruleId
      ? `Requested rule: ${input.requestedRuleId}`
      : null,
    input.requestedRuleId !== undefined
      && input.resolvedRuleId !== undefined
      && input.requestedRuleId !== input.resolvedRuleId
      ? `Resolved rule: ${input.resolvedRuleId}`
      : null,
    `Path: ${input.filePath}`,
    input.logPath === null ? null : `Issue log: ${input.logPath}`,
    `Rule update log: ${input.ruleUpdateLogPath}`,
    input.matchedExistingRule === true ? "Matched an existing rule instead of creating a duplicate." : null,
  ].filter((line): line is string => line !== null).join("\n");
}

function formatWorkflowStepSummary(input: {
  readonly issueId: string;
  readonly stepName: string;
  readonly status: "completed" | "blocked" | "waiting_approval";
  readonly issueState: string;
  readonly gateStatus: string;
  readonly actions: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
  readonly nextStep: string | null;
  readonly nextStepFile: string | null;
  readonly logPath: string;
}): string {
  const evidenceLines = input.evidence.length === 0
    ? ["- None"]
    : input.evidence.map((item) => {
        const location = item.location === undefined ? "" : ` (${item.location})`;
        const detail = item.detail === undefined ? "" : ` - ${item.detail}`;
        return `- ${item.title}${location}${detail}`;
      });

  return [
    `Issue: ${input.issueId}`,
    `Completed step: ${input.stepName}`,
    `Status: ${input.status}`,
    input.status === "waiting_approval"
      ? "Current issue state: blocked"
      : `Current issue state: ${input.issueState}`,
    `What was done:`,
    ...input.actions.map((action) => `- ${action}`),
    `Evidence created:`,
    ...evidenceLines,
    `Gate/review: ${input.gateStatus}`,
    `Next step: ${input.nextStep ?? "complete"}`,
    `Next step file: ${input.nextStepFile ?? "none"}`,
    `Log: ${input.logPath}`,
  ].join("\n");
}

function humanizeRuleId(ruleId: string): string {
  const leaf = ruleId.split("/").filter((segment) => segment.length > 0).at(-1) ?? ruleId;
  return leaf
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveRelevantRuleFilesForAnalysis(analysis: ProjectAnalysis): readonly string[] {
  const files = new Set<string>();

  switch (analysis.language) {
    case "Java":
      files.add(".flowness/rules/tech/java.md");
      break;
    case "Python":
      files.add(".flowness/rules/tech/python.md");
      break;
    case "JavaScript":
      files.add(".flowness/rules/tech/javascript.md");
      break;
    case "TypeScript":
      files.add(".flowness/rules/tech/typescript.md");
      files.add(".flowness/rules/tech/javascript.md");
      break;
  }

  switch (analysis.framework) {
    case "React":
      files.add(".flowness/rules/tech/react.md");
      break;
    case "Next.js":
      files.add(".flowness/rules/tech/nextjs.md");
      files.add(".flowness/rules/tech/react.md");
      break;
    case "NestJS":
      files.add(".flowness/rules/tech/nestjs.md");
      break;
    case "Spring":
      files.add(".flowness/rules/tech/spring.md");
      break;
    case "Django":
      files.add(".flowness/rules/tech/django.md");
      break;
  }

  return [...files].sort();
}

async function loadWorkflowStepMetadataMap(
  rootDir: string,
  workflowId: string,
): Promise<Map<string, { readonly fileName: string; readonly nextStep: string | null }>> {
  const workflowDir = join(rootDir, ".flowness", "workflows", workflowId);
  const metadata = new Map<string, { readonly fileName: string; readonly nextStep: string | null }>();

  if (!(await pathExists(workflowDir))) {
    return metadata;
  }

  const entries = await readdir(workflowDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") {
      continue;
    }

    const content = await readTextFile(join(workflowDir, entry.name));
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    if (nameMatch?.[1] === undefined) {
      continue;
    }

    const nextMatch = content.match(/^next:\s*(.+)$/m);
    const rawNext = nextMatch?.[1]?.trim() ?? "";
    metadata.set(nameMatch[1].trim(), {
      fileName: entry.name,
      nextStep: rawNext.length === 0 || rawNext.toLowerCase() === "none" ? null : rawNext,
    });
  }

  return metadata;
}

function extractEvidenceFilePaths(evidenceRecords: readonly EvidenceRecord[]): string[] {
  const paths: string[] = [];
  for (const record of evidenceRecords) {
    if (record.location !== undefined) {
      paths.push(record.location);
    }
  }

  return paths;
}

function normalizeEvidenceFilePaths(evidenceFiles: readonly string[] | readonly EvidenceRecord[]): string[] {
  if (evidenceFiles.length === 0) {
    return [];
  }

  const first = evidenceFiles[0];
  if (typeof first === "string") {
    return [...(evidenceFiles as readonly string[])];
  }

  return extractEvidenceFilePaths(evidenceFiles as readonly EvidenceRecord[]);
}

async function buildActiveIssueNavigationContext(input: {
  readonly rootDir: string;
  readonly analysis: ProjectAnalysis;
  readonly issue: IssueRecord;
  readonly workflowState: { readonly currentStep: string; readonly completedSteps: readonly string[] };
  readonly issuePaths: { readonly issueFile: string; readonly workflowStateFile: string; readonly logFile: string };
  readonly nextStep: string | null;
  readonly blocked?: boolean;
  readonly blockReason?: string | null;
  readonly pendingStep?: string | null;
  readonly requiredAction?: string | null;
  readonly evidenceFiles: readonly string[] | readonly EvidenceRecord[];
  readonly stepMetadataMap?: Map<string, { readonly fileName: string; readonly nextStep: string | null }>;
}): Promise<ActiveIssueNavigationContext> {
  const stepMetadata = input.stepMetadataMap ?? await loadWorkflowStepMetadataMap(input.rootDir, input.issue.workflowId);
  const currentStepName = input.workflowState.currentStep.length > 0
    ? input.workflowState.currentStep
    : input.workflowState.completedSteps.at(-1) ?? "";
  const currentMetadata = stepMetadata.get(currentStepName) ?? null;
  const currentStepFile = currentMetadata?.fileName ?? "README.md";
  const resolvedNextStep = input.nextStep ?? currentMetadata?.nextStep ?? null;
  const nextMetadata = resolvedNextStep === null ? null : stepMetadata.get(resolvedNextStep) ?? null;
  const relevantRules = deriveRelevantRuleFilesForAnalysis(input.analysis);
  const evidenceFiles = normalizeEvidenceFilePaths(input.evidenceFiles);
  const blocked = input.blocked ?? input.issue.state === "blocked";
  const pendingStep = input.pendingStep ?? (blocked ? currentStepName : resolvedNextStep);

  return {
    issueId: input.issue.id,
    issueTitle: input.issue.title,
    issueState: input.issue.state,
    workflowId: input.issue.workflowId,
    currentStep: currentStepName.length === 0 ? "complete" : currentStepName,
    nextStep: resolvedNextStep,
    blocked,
    blockReason: input.blockReason ?? null,
    pendingStep,
    requiredAction: input.requiredAction ?? null,
    issueFile: input.issuePaths.issueFile,
    workflowStateFile: input.issuePaths.workflowStateFile,
    issueLogFile: input.issuePaths.logFile,
    currentStepFile,
    nextStepFile: nextMetadata?.fileName ?? null,
    evidenceFiles,
    relevantRules,
  };
}

async function refreshWorkspaceArtifacts(
  rootDir: string,
  activeIssue: ActiveIssueNavigationContext | null,
): Promise<void> {
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const configArtifacts = await renderGeneratedConfigArtifacts(analysis, activeIssue, rootDir);
  const navigationArtifacts = renderGeneratedNavigationArtifacts(analysis, activeIssue);
  const generatedFileHashes = Object.fromEntries([
    ...configArtifacts,
    ...navigationArtifacts,
  ].map((artifact) => [artifact.path, sha256Hex(artifact.content)] as const));
  const manifestArtifact = renderGeneratedHarnessManifestArtifact(analysis, activeIssue, generatedFileHashes);

  for (const artifact of [
    ...configArtifacts,
    ...navigationArtifacts,
    manifestArtifact,
  ]) {
    await writeTextFile(join(rootDir, artifact.path), artifact.content, true);
  }
}

async function refreshIssueNavigationArtifacts(input: {
  readonly rootDir: string;
  readonly analysis: ProjectAnalysis;
  readonly issue: IssueRecord;
  readonly workflowState: { readonly currentStep: string; readonly completedSteps: readonly string[] };
  readonly nextStep?: string | null;
  readonly blocked?: boolean;
  readonly blockReason?: string | null;
  readonly pendingStep?: string | null;
  readonly requiredAction?: string | null;
  readonly evidenceFiles?: readonly string[] | readonly EvidenceRecord[];
  readonly issuePaths?: { readonly issueFile: string; readonly workflowStateFile: string; readonly logFile: string };
  readonly stepMetadataMap?: Map<string, { readonly fileName: string; readonly nextStep: string | null }>;
}): Promise<void> {
  const issuePaths = input.issuePaths ?? resolveIssuePaths(input.rootDir, input.issue.id);
  const evidenceFiles = input.evidenceFiles === undefined
    ? extractEvidenceFilePaths(await collectIssueEvidence(input.rootDir, input.issue.id))
    : normalizeEvidenceFilePaths(input.evidenceFiles);
  const activeIssue = await buildActiveIssueNavigationContext({
    rootDir: input.rootDir,
    analysis: input.analysis,
    issue: input.issue,
    workflowState: input.workflowState,
    issuePaths,
    nextStep: input.nextStep ?? (input.workflowState.currentStep.length === 0 ? null : input.workflowState.currentStep),
    ...(input.blocked === undefined ? {} : { blocked: input.blocked }),
    ...(input.blockReason === undefined ? {} : { blockReason: input.blockReason }),
    ...(input.pendingStep === undefined ? {} : { pendingStep: input.pendingStep }),
    ...(input.requiredAction === undefined ? {} : { requiredAction: input.requiredAction }),
    evidenceFiles,
    ...(input.stepMetadataMap === undefined ? {} : { stepMetadataMap: input.stepMetadataMap }),
  });
  await refreshWorkspaceArtifacts(input.rootDir, activeIssue);
}

async function ensurePlanningDocs(rootDir: string, analysis: ProjectAnalysis): Promise<{
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
}> {
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];
  const evidence: EvidenceRecord[] = [];

  for (const artifact of renderGeneratedPlanningDocArtifacts(analysis)) {
    const writeResult = await writeTextFile(join(rootDir, artifact.path), artifact.content, false);
    if (writeResult === "written") {
      createdFiles.push(artifact.path);
      evidence.push(createEvidenceRecord({
        kind: "file",
        title: artifact.path,
        location: join(rootDir, artifact.path),
      }));
    } else {
      skippedFiles.push(artifact.path);
    }
  }

  return {
    createdFiles,
    skippedFiles,
    evidence,
  };
}

function formatWorkflowRecoverSummary(
  issueId: string,
  rootCause: string,
  logPath: string,
): string {
  return [
    `Recorded recovery loop for ${issueId}.`,
    `Root cause: ${rootCause}`,
    `Log: ${logPath}`,
  ].join("\n");
}

function formatStatusSummary(input: {
  readonly issueId: string;
  readonly workflowId: string;
  readonly layout: "flowness" | "legacy";
  readonly currentStep: string;
  readonly completedSteps: readonly string[];
  readonly blocked: boolean;
  readonly blockReason: string | null;
  readonly pendingStep: string | null;
  readonly requiredAction: string | null;
  readonly latestLogStep: string | null;
  readonly evidenceCount: number;
  readonly logPath: string;
}): string {
  return [
    `Issue: ${input.issueId}`,
    `Workflow: ${input.workflowId}`,
    `Layout: ${input.layout}`,
    `Current step: ${input.currentStep.length === 0 ? "complete" : input.currentStep}`,
    `Completed steps: ${input.completedSteps.length === 0 ? "none" : input.completedSteps.join(", ")}`,
    `Blocked: ${input.blocked ? "yes" : "no"}`,
    ...(input.blocked
      ? [
          `Block reason: ${input.blockReason ?? "blocked"}`,
          `Pending step: ${input.pendingStep ?? input.currentStep}`,
          `Required action: ${input.requiredAction ?? "Resolve the block before continuing."}`,
        ]
      : []),
    `Latest log step: ${input.latestLogStep ?? "none"}`,
    `Evidence items: ${input.evidenceCount}`,
    `Log: ${input.logPath}`,
  ].join("\n");
}

function formatEvidenceAddSummary(input: {
  readonly issueId: string;
  readonly evidence: EvidenceRecord;
  readonly logPath: string;
}): string {
  return [
    `Recorded evidence for ${input.issueId}.`,
    `Kind: ${input.evidence.kind}`,
    `Title: ${input.evidence.title}`,
    input.evidence.detail === undefined ? null : `Detail: ${input.evidence.detail}`,
    input.evidence.location === undefined ? null : `Location: ${input.evidence.location}`,
    `Log: ${input.logPath}`,
  ].filter((line): line is string => line !== null).join("\n");
}

async function persistWorkflowOutcome(input: {
  readonly rootDir: string;
  readonly workspace: Awaited<ReturnType<typeof loadIssueWorkspaceOrThrow>>;
  readonly workflow: Awaited<ReturnType<typeof buildWorkflowDefinition>>;
  readonly stepName: string;
  readonly outcome: Awaited<ReturnType<typeof runWorkflowStep>>;
  readonly analysis: ProjectAnalysis;
  readonly stepMetadataMap: Map<string, { readonly fileName: string; readonly nextStep: string | null }>;
}): Promise<CliResult> {
  const {
    rootDir,
    workspace,
    workflow,
    stepName,
    outcome,
    analysis,
    stepMetadataMap,
  } = input;
  const issuePaths = workspace.issuePaths;
  const currentStepFile = stepMetadataMap.get(stepName)?.fileName ?? "README.md";
  const summaryNextStepFile = outcome.nextStep === null
    ? null
    : stepMetadataMap.get(outcome.nextStep)?.fileName ?? null;
  const workflowOutcomeBlockContext = outcome.status === "waiting_approval"
    ? {
        blocked: true,
        blockReason: "waiting_human_approval",
        pendingStep: stepName,
        requiredAction: `Approve the ${stepName} gate before continuing.`,
      }
    : outcome.status === "blocked"
      ? {
          blocked: true,
          blockReason: "workflow_failure",
          pendingStep: stepName,
          requiredAction: outcome.rootCause === undefined
            ? `Run flowness workflow:recover --issue ${workspace.issue.id} --root-cause "<cause>" before retrying.`
            : `Run flowness workflow:recover --issue ${workspace.issue.id} --root-cause "${outcome.rootCause}" before retrying.`,
        }
      : {
          blocked: false,
          blockReason: null,
          pendingStep: null,
          requiredAction: null,
        };
  let summaryIssueState = workspace.issue.state;

  if (outcome.nextStep === null) {
    const currentEvidence = [...(await collectIssueEvidence(rootDir, workspace.issue.id)), ...outcome.state.evidence];

    const requiresEvidenceReview = workflow.steps.some((step) => step.name === "Evidence Review")
      || workflow.steps.some((step) => step.name === "Implementation");

    if (requiresEvidenceReview) {
      try {
        await assertEvidenceReviewLoggedBeforeClose(rootDir, workspace.issue.id);
      } catch (error) {
        const blockedAt = new Date().toISOString();
        const message = error instanceof Error ? error.message : String(error);
        const blockedEvidence = createEvidenceRecord({
          kind: "command_output",
          title: "Evidence Review gate",
          detail: message,
        });
        const blockedState = {
          ...outcome.state,
          currentStep: stepName,
          failedSteps: outcome.state.failedSteps.includes(stepName)
            ? [...outcome.state.failedSteps]
            : [...outcome.state.failedSteps, stepName],
          blocked: true,
          updatedAt: blockedAt,
          evidence: [
            ...currentEvidence,
            blockedEvidence,
          ],
        };
        const blockedLogEntry = createLogEntry({
          timestamp: blockedAt,
          step: "Close Blocked",
          actions: [
            `Close is blocked for "${workspace.issue.id}" because Evidence Review is missing from the log.`,
            "Recovery: record an Evidence Review log entry before retrying close.",
          ],
          evidence: [
            ...currentEvidence,
            blockedEvidence,
          ],
          summary: "Close is blocked until Evidence Review is logged.",
          nextStep: stepName,
        });

        await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, blockedLogEntry);
        const blockedWorkspace = await writeIssueWorkspaceState(rootDir, workspace.issue, blockedState, workspace.description);
        summaryIssueState = blockedWorkspace.issue.state;
        await refreshIssueNavigationArtifacts({
          rootDir,
          analysis,
          issue: blockedWorkspace.issue,
          workflowState: blockedWorkspace.workflowState,
          issuePaths,
          nextStep: stepName,
          blocked: true,
          blockReason: "missing_evidence_review",
          pendingStep: stepName,
          requiredAction: "Record an Evidence Review log entry before retrying close.",
          evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
          stepMetadataMap,
        });

        return {
          exitCode: 1,
          output: formatWorkflowStepSummary({
            issueId: workspace.issue.id,
            stepName,
            status: "blocked",
            issueState: summaryIssueState,
            gateStatus: "blocked: Evidence Review missing",
            actions: blockedLogEntry.actions,
            evidence: blockedLogEntry.evidence,
            nextStep: stepName,
            nextStepFile: currentStepFile,
            logPath: workspace.issue.logPath,
          }),
        };
      }
    }

    const reviewResults = runStandardReviews({
      rootDir,
      issueId: workspace.issue.id,
      issueTitle: workspace.issue.title,
      issueType: workspace.issue.type,
      workflowId: workspace.issue.workflowId,
      workflowState: outcome.state,
      evidence: currentEvidence,
    });
    const reviewCoordinator = createReviewCoordinatorResult(reviewResults);
    const reviewReport = await writeReviewReportToIssue({
      rootDir,
      issueId: workspace.issue.id,
      issueTitle: workspace.issue.title,
      issueType: workspace.issue.type,
      workflowId: workspace.issue.workflowId,
      workflowState: outcome.state,
      evidence: currentEvidence,
    }, reviewResults);
    const reviewEvidence = createEvidenceRecord({
      kind: "review",
      title: reviewReport.fileName,
      location: reviewReport.filePath,
      detail: reviewReport.summary,
    });

    if (!reviewCoordinator.passed) {
      const blockedState = {
        ...outcome.state,
        currentStep: stepName,
        failedSteps: outcome.state.failedSteps.includes(stepName)
          ? [...outcome.state.failedSteps]
          : [...outcome.state.failedSteps, stepName],
        blocked: true,
        updatedAt: reviewReport.reviewedAt,
        evidence: [
          ...outcome.state.evidence,
          reviewEvidence,
        ],
      };
      const blockedLogEntry = createLogEntry({
        timestamp: reviewReport.reviewedAt,
        step: "Close Blocked",
        actions: [
          `Review gate blocked completion for "${workspace.issue.id}".`,
          `Blocking roles: ${reviewCoordinator.blockingRoles.join(", ")}`,
        ],
        evidence: [
          ...currentEvidence,
          reviewEvidence,
        ],
        summary: reviewReport.summary,
        nextStep: stepName,
      });

      await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, blockedLogEntry);
      const blockedWorkspace = await writeIssueWorkspaceState(rootDir, workspace.issue, blockedState, workspace.description);
      summaryIssueState = blockedWorkspace.issue.state;
      await refreshIssueNavigationArtifacts({
        rootDir,
        analysis,
        issue: blockedWorkspace.issue,
        workflowState: blockedWorkspace.workflowState,
        issuePaths,
        nextStep: stepName,
        blocked: true,
        blockReason: "review_gate_blocked",
        pendingStep: stepName,
        requiredAction: "Address the blocking review findings before retrying.",
        evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
        stepMetadataMap,
      });

      return {
        exitCode: 1,
        output: formatWorkflowStepSummary({
          issueId: workspace.issue.id,
          stepName,
          status: "blocked",
          issueState: summaryIssueState,
          gateStatus: `blocked: ${reviewCoordinator.blockingRoles.length === 0 ? "review failed" : reviewCoordinator.blockingRoles.join(", ")}`,
          actions: blockedLogEntry.actions,
          evidence: blockedLogEntry.evidence,
          nextStep: stepName,
          nextStepFile: currentStepFile,
          logPath: workspace.issue.logPath,
        }),
      };
    }

    const reviewLogEntry = createLogEntry({
      timestamp: reviewReport.reviewedAt,
      step: "Review Gate",
      actions: [
        `Recorded automatic review report ${reviewReport.fileName}.`,
        "Completion gate passed.",
      ],
      evidence: [
        ...currentEvidence,
        reviewEvidence,
      ],
      summary: reviewReport.summary,
      nextStep: null,
    });

    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, outcome.logEntry);
    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, reviewLogEntry);
    const updatedWorkspace = await writeIssueWorkspaceState(rootDir, workspace.issue, outcome.state, workspace.description);
    summaryIssueState = updatedWorkspace.issue.state;
    await refreshIssueNavigationArtifacts({
      rootDir,
      analysis,
      issue: updatedWorkspace.issue,
      workflowState: updatedWorkspace.workflowState,
      issuePaths,
      nextStep: null,
      ...workflowOutcomeBlockContext,
      evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
      stepMetadataMap,
    });
  } else {
    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, outcome.logEntry);
    const updatedWorkspace = await writeIssueWorkspaceState(rootDir, workspace.issue, outcome.state, workspace.description);
    summaryIssueState = updatedWorkspace.issue.state;
    await refreshIssueNavigationArtifacts({
      rootDir,
      analysis,
      issue: updatedWorkspace.issue,
      workflowState: updatedWorkspace.workflowState,
      issuePaths,
      nextStep: outcome.nextStep,
      ...workflowOutcomeBlockContext,
      evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
      stepMetadataMap,
    });
  }

  return {
    exitCode: outcome.status === "completed" ? 0 : 1,
    output: formatWorkflowStepSummary({
      issueId: workspace.issue.id,
      stepName,
      status: outcome.status,
      issueState: summaryIssueState,
      gateStatus: outcome.status === "waiting_approval"
        ? "blocked: waiting_human_approval"
        : outcome.nextStep === null
          ? "passed"
          : outcome.status === "completed"
            ? "passed"
            : "blocked",
      actions: outcome.logEntry.actions,
      evidence: outcome.logEntry.evidence,
      nextStep: outcome.nextStep,
      nextStepFile: summaryNextStepFile,
      logPath: workspace.issue.logPath,
    }),
  };
}

async function collectIssueEvidence(rootDir: string, issueId: string): Promise<readonly EvidenceRecord[]> {
  const issuePaths = await resolveExistingIssuePaths(rootDir, issueId);
  const candidates: Array<[string, string]> = [
    [issuePaths.issueFile, "issue.md"],
    [issuePaths.issueJsonFile, "issue.json"],
    [issuePaths.workflowStateFile, "workflow-state.json"],
    [issuePaths.logFile, `${issueId}.md`],
    [joinPaths(issuePaths.decisionsDir, "README.md"), "decisions/README.md"],
    [joinPaths(issuePaths.reviewsDir, "README.md"), "reviews/README.md"],
  ];

  const evidence: EvidenceRecord[] = [];
  for (const [location, title] of candidates) {
    if (await pathExists(location)) {
      evidence.push(createEvidenceRecord({
        kind: "file",
        title,
        location,
      }));
    }
  }

  if (await pathExists(issuePaths.decisionsDir)) {
    for (const entry of await readdir(issuePaths.decisionsDir)) {
      if (!entry.endsWith(".md") || entry === "README.md") {
        continue;
      }
      const location = joinPaths(issuePaths.decisionsDir, entry);
      evidence.push(createEvidenceRecord({
        kind: "file",
        title: `decisions/${entry}`,
        location,
        detail: `Decision artifact for ${issueId}`,
      }));
    }
  }

  if (await pathExists(issuePaths.reviewsDir)) {
    for (const entry of await readdir(issuePaths.reviewsDir)) {
      if (!entry.endsWith(".md") || entry === "README.md") {
        continue;
      }
      const location = joinPaths(issuePaths.reviewsDir, entry);
      evidence.push(createEvidenceRecord({
        kind: "file",
        title: `reviews/${entry}`,
        location,
        detail: `Review artifact for ${issueId}`,
      }));
    }
  }

  return evidence;
}

async function buildWorkflowDefinition(rootDir: string, workflowId: string) {
  const loaded = await loadWorkflowDefinitionFromWorkspace(rootDir, workflowId);
  if (loaded !== undefined) {
    return loaded;
  }

  return getBuiltinWorkflowDefinition(workflowId)
    ?? createGenericWorkflowDefinition(workflowId, humanizeWorkflowName(workflowId));
}

async function ensureInitializedProject(rootDir: string): Promise<void> {
  const paths = resolveWorkspacePaths(rootDir);
  const isInitialized = await pathExists(paths.configPath)
    || await pathExists(paths.legacyConfigPath)
    || await pathExists(join(rootDir, ".agent", "config", "project.yaml"));
  if (!isInitialized) {
    throw new Error("Flowness project is not initialized. Run `flowness init` first.");
  }
}

function normalizeWorkflowStateStep(step: string): string | null {
  const trimmed = step.trim();
  if (trimmed.length === 0 || /^(complete|completed|finish|finished|null)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

async function assertIssueWorkspaceLogAlignment(
  rootDir: string,
  workspace: Awaited<ReturnType<typeof readIssueWorkspace>>,
): Promise<void> {
  if (workspace === null) {
    throw new Error("Issue workspace is missing.");
  }

  const latestLogEntry = await readLatestIssueLogEntry(rootDir, workspace.issue.id);
  if (latestLogEntry === null) {
    throw new Error([
      `State/log mismatch detected for ${workspace.issue.id}.`,
      `workflow-state.json currentStep: ${workspace.workflowState.currentStep || "complete"}`,
      "Latest log entry: none",
      "Recovery: restore the missing append-only issue log entry, then rerun the workflow step.",
    ].join("\n"));
  }

  const normalizedCurrentStep = normalizeWorkflowStateStep(workspace.workflowState.currentStep);
  if (normalizedCurrentStep !== latestLogEntry.nextStep) {
    throw new Error([
      `State/log mismatch detected for ${workspace.issue.id}.`,
      `workflow-state.json currentStep: ${workspace.workflowState.currentStep || "complete"}`,
      `Latest log entry: ${latestLogEntry.step} -> ${latestLogEntry.nextStep ?? "complete"}`,
      "Recovery: repair the last append-only log/state transition so the state matches the latest log entry before continuing.",
    ].join("\n"));
  }
}

async function assertEvidenceReviewLoggedBeforeClose(
  rootDir: string,
  issueId: string,
): Promise<void> {
  const logEntries = await readIssueLogEntries(rootDir, issueId);
  if (logEntries.some((entry) => entry.step === "Evidence Review")) {
    return;
  }

  throw new Error([
    `Evidence Review is required before Close for ${issueId}.`,
    "Recovery: return to the implementation flow, record an Evidence Review log entry with changed files, commands, documentation updates, and unresolved risks, then retry close.",
  ].join("\n"));
}

async function loadIssueWorkspaceOrThrow(
  rootDir: string,
  issueId: string,
) {
  const workspace = await readIssueWorkspace(rootDir, issueId);
  if (workspace === null) {
    throw new Error(`Issue workspace not found: ${issueId}`);
  }

  await assertIssueWorkspaceLogAlignment(rootDir, workspace);
  return workspace;
}

function renderSkillMarkdown(
  skillId: string,
  title: string,
  description: string,
): string {
  return [
    `# ${title}`,
    "",
    `- Id: ${skillId}`,
    "",
    "## Description",
    description,
    "",
    "## Workflow",
    "- Clarify the request.",
    "- Apply the reusable skill steps.",
    "- Record evidence in the issue log.",
    "",
  ].join("\n");
}

function createDecisionEvidenceSummary(evidence: readonly EvidenceRecord[]): string {
  return summarizeEvidence(evidence);
}

function renderJsonOutput(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderCommandRiskOutput(
  analysis: Awaited<ReturnType<typeof analyzeCommandRisk>>,
  action: "blocked" | "approved",
): Record<string, unknown> {
  return {
    commandRisk: {
      command: analysis.command,
      category: analysis.category,
      riskLevel: analysis.riskLevel,
      warning: analysis.warning,
      dryRunImpact: analysis.dryRunImpact,
      safeAlternative: analysis.safeAlternative,
      requiresExplicitConfirmation: analysis.requiresExplicitConfirmation,
      intentClarification: analysis.intentClarification,
      action,
    },
  };
}

function detectScriptCommand(packageManager: ProjectAnalysis["packageManager"], scriptName: string): string {
  switch (packageManager) {
    case "npm":
      return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
    case "pnpm":
      return scriptName === "test" ? "pnpm test" : `pnpm ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    case "unknown":
      return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
  }
}

function isLargeCommandOutput(output: string): boolean {
  return output.length > 5000 || output.split(/\r?\n/).length > 200;
}

async function loadContextIndex(rootDir: string, analysis: ProjectAnalysis): Promise<ContextIndex> {
  const contextIndexPath = resolveWorkspacePaths(rootDir).contextIndexPath;
  if (await pathExists(contextIndexPath)) {
    try {
      const text = await readTextFile(contextIndexPath);
      const parsed = JSON.parse(text) as { projectName?: unknown; areas?: unknown };
      if (Array.isArray(parsed.areas)) {
        return {
          projectName: typeof parsed.projectName === "string" && parsed.projectName.trim().length > 0
            ? parsed.projectName
            : analysis.projectName,
          areas: parsed.areas as readonly ContextIndexArea[],
        };
      }
    } catch {
      // Fall back to rebuilding the context index below.
    }
  }

  return await buildContextIndex(rootDir, analysis);
}

function runShellCommand(command: string, cwd: string): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(command, [], {
    cwd,
    encoding: "utf8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error instanceof Error) {
    return {
      exitCode: 1,
      stdout: result.stdout ?? "",
      stderr: result.error.message,
    };
  }

  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function collectGitChangedFiles(rootDir: string): { readonly files: readonly string[]; readonly available: boolean } {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.error instanceof Error || result.status === 128) {
    return {
      files: [],
      available: false,
    };
  }

  const files = new Set<string>();
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) {
      continue;
    }

    const pathText = trimmed.replace(/^[ MADRCU?!]{1,3}/, "").trim();
    if (pathText.length === 0) {
      continue;
    }

    const renamed = pathText.includes(" -> ") ? pathText.split(" -> ").at(-1) ?? pathText : pathText;
    files.add(renamed.trim());
  }

  return {
    files: [...files].sort((left, right) => left.localeCompare(right)),
    available: true,
  };
}

async function storeLargeTestOutput(rootDir: string, output: string): Promise<string | null> {
  const workspacePaths = resolveWorkspacePaths(rootDir);
  if (!(await pathExists(workspacePaths.flownessDir))) {
    return null;
  }

  const rawDir = joinPaths(rootDir, ".flowness", "logs", "raw");
  await ensureDirectory(rawDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `test-${timestamp}.log`;
  const outputPath = joinPaths(".flowness", "logs", "raw", fileName);
  await writeTextFile(joinPaths(rawDir, fileName), output, true);
  return outputPath;
}

async function runInitCommand(command: ParsedInitCommand): Promise<CliResult> {
  const result = await initializeProject({
    rootDir: join(command.targetPath),
    force: command.force,
    ...(command.projectName === undefined ? {} : { projectName: command.projectName }),
  });

  return {
    exitCode: 0,
    output: formatInitSummary(
      result.rootDir,
      result.createdFiles,
      result.createdDirectories,
      result.skippedFiles,
      result.alreadyInitialized,
      result.gitInitialized,
      result.warnings,
    ),
  };
}

async function runLocateCommand(command: ParsedLocateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const contextIndex = await loadContextIndex(rootDir, analysis);
  const locateResult = locateContextIndexArea(contextIndex, command.query);

  return {
    exitCode: 0,
    output: renderJsonOutput({
      query: command.query,
      projectName: contextIndex.projectName,
      ...locateResult,
    }),
  };
}

async function runTestCommand(command: ParsedTestCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const testCommand = analysis.testCommand ?? detectScriptCommand(analysis.packageManager, "test");
  let rawTestScript: string | null = null;
  try {
    const packageJson = JSON.parse(await readTextFile(join(rootDir, "package.json"))) as {
      readonly scripts?: Record<string, unknown>;
    };
    const testScript = packageJson.scripts?.test;
    if (typeof testScript === "string" && testScript.trim().length > 0) {
      rawTestScript = testScript;
    }
  } catch {
    rawTestScript = null;
  }

  const riskCommand = rawTestScript ?? testCommand;
  const riskAnalysis = await analyzeCommandRisk(riskCommand, rootDir);
  if (riskAnalysis.requiresExplicitConfirmation && !command.confirmRisk) {
    return {
      exitCode: 1,
      output: renderJsonOutput({
        requestedSummary: command.summary,
        ...renderCommandRiskOutput(riskAnalysis, "blocked"),
      }),
    };
  }

  const execution = runShellCommand(testCommand, rootDir);
  const combinedOutput = [execution.stdout, execution.stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join("\n");
  const rawOutputPath = isLargeCommandOutput(combinedOutput)
    ? await storeLargeTestOutput(rootDir, combinedOutput)
    : null;
  const summary: TestRunSummary = summarizeTestRunOutput({
    rootDir,
    command: testCommand,
    exitCode: execution.exitCode,
    stdout: execution.stdout,
    stderr: execution.stderr,
    rawOutputPath,
  });

  return {
    exitCode: summary.passed ? 0 : 1,
    output: renderJsonOutput({
      requestedSummary: command.summary,
      ...renderCommandRiskOutput(riskAnalysis, "approved"),
      confirmationRecorded: riskAnalysis.requiresExplicitConfirmation ? command.confirmRisk : false,
      ...summary,
    }),
  };
}

function summarizeAuditChecks(input: {
  readonly file: string;
  readonly locateResult: LocateContextResult;
}): {
  readonly file: string;
  readonly area: string;
  readonly readFirst: readonly string[];
  readonly symbols: readonly string[];
  readonly tests: readonly string[];
  readonly commands: readonly string[];
  readonly doNotReadYet: readonly string[];
} {
  return {
    file: input.file,
    area: input.locateResult.area,
    readFirst: input.locateResult.readFirst,
    symbols: input.locateResult.symbols,
    tests: input.locateResult.tests,
    commands: input.locateResult.commands,
    doNotReadYet: input.locateResult.doNotReadYet,
  };
}

async function runAuditCommand(command: ParsedAuditCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);

  if (command.scope === "full") {
    const auditCommand = detectScriptCommand(analysis.packageManager, "audit");
    const riskAnalysis = await analyzeCommandRisk(auditCommand, rootDir);
    if (!riskAnalysis.requiresExplicitConfirmation) {
      const execution = runShellCommand(auditCommand, rootDir);
      const output = [execution.stdout, execution.stderr]
        .filter((chunk) => chunk.trim().length > 0)
        .join("\n");

      return {
        exitCode: execution.exitCode === 0 ? 0 : 1,
        output: output.length > 0 ? output : `${auditCommand} exited with code ${execution.exitCode}.`,
      };
    }

    if (riskAnalysis.requiresExplicitConfirmation && !command.confirmRisk) {
      return {
        exitCode: 1,
        output: renderJsonOutput({
          scope: command.scope,
          ...renderCommandRiskOutput(riskAnalysis, "blocked"),
        }),
      };
    }

    const execution = runShellCommand(auditCommand, rootDir);
    const output = [execution.stdout, execution.stderr]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n");

    return {
      exitCode: execution.exitCode === 0 ? 0 : 1,
      output: renderJsonOutput({
        scope: command.scope,
        ...renderCommandRiskOutput(riskAnalysis, "approved"),
        confirmationRecorded: riskAnalysis.requiresExplicitConfirmation ? command.confirmRisk : false,
        exitCode: execution.exitCode,
        output: output.length > 0 ? output : `${auditCommand} exited with code ${execution.exitCode}.`,
      }),
    };
  }

  const contextIndex = await loadContextIndex(rootDir, analysis);
  const changed = collectGitChangedFiles(rootDir);
  const checks = changed.files.map((file) => summarizeAuditChecks({
    file,
    locateResult: locateContextIndexArea(contextIndex, file),
  }));
  const relevantAreas = [...new Set(checks.map((check) => check.area))].sort((left, right) => left.localeCompare(right));
  const suggestedCommands = [...new Set(checks.flatMap((check) => check.commands))].sort((left, right) => left.localeCompare(right));
  const summary = changed.available
    ? `Scanned ${changed.files.length} changed file(s) across ${relevantAreas.length} area(s).`
    : "Git status was unavailable, so no changed-file audit was produced.";

  return {
    exitCode: 0,
    output: renderJsonOutput({
      mode: "changed",
      projectName: contextIndex.projectName,
      gitAvailable: changed.available,
      changedFiles: changed.files,
      relevantAreas,
      checks,
      suggestedCommands,
      summary,
    }),
  };
}

async function runIssueCreateCommand(command: ParsedIssueCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const workflowId = command.workflowId ?? config.defaultWorkflows[command.type];
  const workflow = await buildWorkflowDefinition(rootDir, workflowId);
  const result = await createIssueWorkspace({
    rootDir,
    title: command.title,
    type: command.type,
    workflow,
    force: command.force,
    ...(command.description === undefined ? {} : { description: command.description }),
    goal: command.description ?? command.title,
    acceptanceCriteria: [
      `The issue "${command.title}" is resolved.`,
      "Verification evidence is recorded.",
    ],
    dependencies: [],
    evidenceRequired: [
      "Implementation or review evidence",
      "Verification output",
    ],
    ...(command.parentIssueId === undefined ? {} : { parentIssueId: command.parentIssueId }),
  });

  let parentIssueLinked = false;
  if (command.parentIssueId !== undefined) {
    const parentWorkspace = await readIssueWorkspace(rootDir, command.parentIssueId);
    if (parentWorkspace === null) {
      throw new Error(`Parent issue not found: ${command.parentIssueId}`);
    }

    const childIssueIds = new Set(parentWorkspace.issue.childIssueIds ?? []);
    childIssueIds.add(result.issue.id);
    const parentUpdatedAt = result.issue.createdAt;
    const updatedParentIssue = {
      ...parentWorkspace.issue,
      childIssueIds: [...childIssueIds],
    };
    const updatedParentWorkspace = await writeIssueWorkspaceState(
      rootDir,
      updatedParentIssue,
      {
        ...parentWorkspace.workflowState,
        updatedAt: parentUpdatedAt,
      },
      parentWorkspace.description,
    );

    const approvalActions = [
      `Linked follow-up issue ${result.issue.id} to parent ${command.parentIssueId}.`,
    ];
    if (command.approvalNote !== undefined && command.approvalNote.trim().length > 0) {
      approvalActions.push(`Approval note: ${command.approvalNote}`);
    }

    await appendLogEntryToIssue(rootDir, command.parentIssueId, updatedParentWorkspace.issue.title, createLogEntry({
      timestamp: result.issue.createdAt,
      step: "Follow-up Issue Linked",
      actions: approvalActions,
      evidence: [
        createEvidenceRecord({
          kind: "file",
          title: `issues/${result.issue.id}/issue.md`,
          location: result.issuePaths.issueFile,
          detail: result.issue.title,
        }),
      ],
      summary: `Follow-up issue ${result.issue.id} was linked to ${command.parentIssueId}.`,
      nextStep: updatedParentWorkspace.workflowState.currentStep || null,
    }));

    if (command.approvalNote !== undefined && command.approvalNote.trim().length > 0) {
      const childLogEntry = createLogEntry({
        timestamp: result.issue.createdAt,
        step: "Approval Note Recorded",
        actions: [
          `Parent issue: ${command.parentIssueId}`,
          `Approval note: ${command.approvalNote}`,
        ],
        evidence: [
          createEvidenceRecord({
            kind: "command_output",
            title: "Approval note",
            detail: command.approvalNote,
          }),
        ],
        summary: "Approval text was recorded for the follow-up issue.",
        nextStep: result.workflowState.currentStep || null,
      });
      await appendLogEntryToIssue(rootDir, result.issue.id, result.issue.title, childLogEntry);
    }

    parentIssueLinked = true;
  }

  const planningDocs = await ensurePlanningDocs(rootDir, analysis);
  if (planningDocs.createdFiles.length > 0) {
    const planningLogEntry = createLogEntry({
      timestamp: new Date().toISOString(),
      step: "Planning Docs Prepared",
      actions: [
        "Created missing PRD/ARD planning docs before workflow execution.",
        ...planningDocs.createdFiles.map((file) => `Created ${file}.`),
      ],
      evidence: [...planningDocs.evidence],
      summary: "Planning docs were prepared for the issue workspace.",
      nextStep: result.initialLogEntry.nextStep,
    });
    await appendLogEntryToIssue(rootDir, result.issue.id, result.issue.title, planningLogEntry);
  }

  const activeIssue = await buildActiveIssueNavigationContext({
    rootDir,
    analysis,
    issue: result.issue,
    workflowState: result.workflowState,
    issuePaths: result.issuePaths,
    nextStep: result.initialLogEntry.nextStep,
    evidenceFiles: await collectIssueEvidence(rootDir, result.issue.id),
  });
  await refreshWorkspaceArtifacts(rootDir, activeIssue);

  return {
    exitCode: 0,
    output: [
      formatIssueSummary(result),
      ...(parentIssueLinked && command.approvalNote !== undefined && command.approvalNote.trim().length > 0
        ? ["", `Approval note: ${command.approvalNote}`]
        : []),
    ].join("\n"),
  };
}

async function runRequestCreateCommand(command: ParsedRequestCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  const analysis = analyzeRequest(command.request);

  if (analysis.category === "rule_change_candidate") {
    return {
      exitCode: 0,
      output: [
        formatRuleApprovalSummary(analysis),
        "",
        formatRequestAnalysisSummary(analysis),
      ].join("\n"),
    };
  }

  const issueCreatingModes: readonly RequestAnalysis["executionMode"][] = [
    "create_issue",
    "plan_mvp",
    "decompose_project",
    "run_review",
  ];

  if (!issueCreatingModes.includes(analysis.executionMode)) {
    return {
      exitCode: 0,
      output: [
        formatQuestionOrCasualSummary(analysis),
        "",
        formatRequestAnalysisSummary(analysis),
      ].join("\n"),
    };
  }

  await ensureInitializedProject(rootDir);
  const config = await readProjectConfig(rootDir);
  const projectAnalysis = await renderProjectAnalysis(rootDir, config.projectName);
  const issueType = command.type ?? analysis.issueType ?? "feature";
  const workflowId = command.workflowId ?? analysis.workflowId ?? config.defaultWorkflows[issueType];
  const reusableWorkspace = await findReusableIssueWorkspace(rootDir, analysis, workflowId);

  let activeWorkspace: Awaited<ReturnType<typeof createIssueWorkspace>> | NonNullable<Awaited<ReturnType<typeof readIssueWorkspace>>>;
  let reusedExistingIssue = false;

  if (reusableWorkspace !== null) {
    activeWorkspace = reusableWorkspace;
    reusedExistingIssue = true;
  } else {
    const effectiveWorkflow = await buildWorkflowDefinition(rootDir, workflowId);
    const effectivePlan = analysis.issuePlan?.primaryIssue ?? buildFallbackIssuePlan(analysis, issueType, workflowId);
    const primaryPlan: IssuePlan = {
      ...effectivePlan,
      type: issueType,
      workflowId,
    };
    const nextSequence = await findNextIssueSequence(rootDir);
    const childIssueIds = analysis.category === "multi_issue_project" && analysis.issuePlan !== undefined && command.force
      ? analysis.issuePlan.childIssues.map((child, index) => createIssueId(nextSequence + index + 1, child.title))
      : [];
    const decomposition = analysis.issuePlan === undefined
      ? undefined
      : {
          parentIssueId: null,
          parentIssueTitle: primaryPlan.title,
          childIssues: analysis.issuePlan.childIssues,
        };

    const parentResult = await createIssueWorkspace({
      rootDir,
      title: primaryPlan.title,
      intent: analysis.intentSlug,
      type: primaryPlan.type,
      workflow: effectiveWorkflow,
      force: command.force,
      sequence: nextSequence,
      description: command.request,
      goal: primaryPlan.goal,
      acceptanceCriteria: primaryPlan.acceptanceCriteria,
      dependencies: primaryPlan.dependencies,
      evidenceRequired: primaryPlan.evidenceRequired,
      childIssueIds,
      ...(decomposition === undefined ? {} : { decomposition }),
    });

    activeWorkspace = parentResult;

    if (analysis.category === "multi_issue_project" && analysis.issuePlan !== undefined && command.force) {
      for (let index = 0; index < analysis.issuePlan.childIssues.length; index += 1) {
        const childPlan = analysis.issuePlan.childIssues[index];
        if (childPlan === undefined) {
          continue;
        }

        const childSequence = nextSequence + index + 1;
        const childWorkflow = await buildWorkflowDefinition(rootDir, childPlan.workflowId);
        await createIssueWorkspace({
          rootDir,
          title: childPlan.title,
          type: childPlan.type,
          workflow: childWorkflow,
          force: command.force,
          sequence: childSequence,
          description: childPlan.goal,
          parentIssueId: parentResult.issue.id,
          goal: childPlan.goal,
          acceptanceCriteria: childPlan.acceptanceCriteria,
          dependencies: [parentResult.issue.id, ...childPlan.dependencies],
          evidenceRequired: childPlan.evidenceRequired,
          initialState: "blocked",
        });
      }
    }
  }

  const planningDocs = analysis.category === "review_task"
    ? { createdFiles: [] as string[], skippedFiles: [] as string[], evidence: [] as EvidenceRecord[] }
    : await ensurePlanningDocs(rootDir, projectAnalysis);
  const issueWorkflow = await buildWorkflowDefinition(rootDir, activeWorkspace.issue.workflowId);
  const analysisLogEntry = createLogEntry({
    timestamp: new Date().toISOString(),
    step: "Request Analysis",
    actions: [
      `Request: ${analysis.request}`,
      `Classified request as ${analysis.category}.`,
      `Reason: ${analysis.reason}`,
      `${reusedExistingIssue ? "Reused existing issue" : "Created issue"} ${activeWorkspace.issue.id}.`,
      `Routed to ${activeWorkspace.issue.workflowId}.`,
      "Start with 01-intake.md / clarification before implementation.",
      ...(planningDocs.createdFiles.length === 0
        ? []
        : [
            "Planning docs were created or refreshed before implementation.",
            ...planningDocs.createdFiles.map((file) => `Created ${file}.`),
          ]),
      ...(analysis.needsClarification ? ["Implementation is blocked until clarification questions are answered."] : []),
      ...(analysis.clarificationQuestions.length === 0
        ? []
        : [`Clarifying questions: ${analysis.clarificationQuestions.map((question) => question.question).join(" | ")}`]),
      ...(analysis.issuePlan === undefined ? [] : [`Child issues planned: ${analysis.issuePlan.childIssues.length}`]),
    ],
    evidence: [
      createEvidenceRecord({
        kind: "command_output",
        title: "Request analysis",
        detail: analysis.reason,
        location: activeWorkspace.issue.logPath,
      }),
      ...planningDocs.evidence,
    ],
    summary: reusedExistingIssue
      ? `Reused ${activeWorkspace.issue.id} for the analyzed request.`
      : `Created ${activeWorkspace.issue.id} for the analyzed request.`,
    nextStep: issueWorkflow.steps[0]?.name ?? null,
  });

  await appendLogEntryToIssue(rootDir, activeWorkspace.issue.id, activeWorkspace.issue.title, analysisLogEntry);

  const activeIssue = await buildActiveIssueNavigationContext({
    rootDir,
    analysis: projectAnalysis,
    issue: activeWorkspace.issue,
    workflowState: activeWorkspace.workflowState,
    issuePaths: activeWorkspace.issuePaths,
    nextStep: analysisLogEntry.nextStep,
    evidenceFiles: await collectIssueEvidence(rootDir, activeWorkspace.issue.id),
  });
  await refreshWorkspaceArtifacts(rootDir, activeIssue);

  return {
    exitCode: 0,
    output: [
      formatRequestCreateSummary({
        analysis,
        issue: activeWorkspace.issue,
        reused: reusedExistingIssue,
      }),
      "",
      formatRequestAnalysisSummary(analysis),
    ].join("\n"),
  };
}

async function runDecisionCreateCommand(command: ParsedDecisionCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const evidence = [
    ...(await collectIssueEvidence(rootDir, workspace.issue.id)),
    ...workspace.workflowState.evidence,
  ];
  const evidenceErrors = validateEvidenceRecords(evidence, ["file"]);
  if (evidenceErrors.length > 0) {
    return {
      exitCode: 1,
      output: [
        `Decision evidence validation failed for ${workspace.issue.id}.`,
        ...evidenceErrors.map((error) => `- ${error}`),
      ].join("\n"),
    };
  }

  const decision = await writeDecisionDocumentToIssue(rootDir, {
    id: `${workspace.issue.id}:${slugify(command.title)}`,
    issueId: workspace.issue.id,
    title: command.title,
    context: command.context,
    decision: command.decision,
    alternatives: command.alternatives,
    consequences: command.consequences,
    evidence,
  }, command.force);

  const logEntry = createLogEntry({
    timestamp: new Date().toISOString(),
    step: "Decision Recorded",
    actions: [
      `Recorded decision ${decision.fileName}.`,
      `Context: ${command.context}`,
    ],
    evidence: [
      ...evidence,
      createEvidenceRecord({
        kind: "decision",
        title: decision.fileName,
        location: decision.filePath,
      }),
    ],
    summary: `Decision ${command.title} was recorded.`,
    nextStep: workspace.workflowState.currentStep || null,
  });
  await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, logEntry);
  await refreshIssueNavigationArtifacts({
    rootDir,
    analysis,
    issue: workspace.issue,
    workflowState: workspace.workflowState,
    issuePaths: workspace.issuePaths,
    nextStep: workspace.workflowState.currentStep || null,
    evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
  });

  return {
    exitCode: 0,
    output: formatDecisionSummary({
      fileName: decision.fileName,
      issueId: decision.issueId,
      filePath: decision.filePath,
      evidenceCount: evidence.length,
    }),
  };
}

async function runReviewRunCommand(command: ParsedReviewRunCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const evidence = [
    ...(await collectIssueEvidence(rootDir, workspace.issue.id)),
    ...workspace.workflowState.evidence,
  ];
  const results = runStandardReviews({
    rootDir,
    issueId: workspace.issue.id,
    issueTitle: workspace.issue.title,
    issueType: workspace.issue.type,
    workflowId: workspace.issue.workflowId,
    workflowState: workspace.workflowState,
    evidence,
  });
  const report = await writeReviewReportToIssue({
    rootDir,
    issueId: workspace.issue.id,
    issueTitle: workspace.issue.title,
    issueType: workspace.issue.type,
    workflowId: workspace.issue.workflowId,
    workflowState: workspace.workflowState,
    evidence,
  }, results);

  const logEntry = createLogEntry({
    timestamp: report.reviewedAt,
    step: "Review Completed",
    actions: [
      `Recorded review report ${report.fileName}.`,
      `Passed: ${report.passed ? "yes" : "no"}`,
    ],
    evidence: [
      ...evidence,
      createEvidenceRecord({
        kind: "review",
        title: report.fileName,
        location: report.filePath,
        detail: report.summary,
      }),
    ],
    summary: report.summary,
    nextStep: workspace.workflowState.currentStep || null,
  });
  await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, logEntry);
  await refreshIssueNavigationArtifacts({
    rootDir,
    analysis,
    issue: workspace.issue,
    workflowState: workspace.workflowState,
    issuePaths: workspace.issuePaths,
    nextStep: workspace.workflowState.currentStep || null,
    evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
  });

  return {
    exitCode: report.passed ? 0 : 1,
    output: formatReviewSummary(report),
  };
}

async function runConfigGateCommand(command: ParsedConfigGateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const config = await readProjectConfig(rootDir);
  const nextConfig = applyHumanGateInstruction(config, command.instruction);
  await writeProjectConfig(rootDir, nextConfig, true);

  return {
    exitCode: 0,
    output: [
      "Updated human gate configuration.",
      `Instruction: ${command.instruction}`,
      `Project: ${nextConfig.projectName}`,
    ].join("\n"),
  };
}

async function runSkillCreateCommand(command: ParsedSkillCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const paths = resolveSkillScaffoldPaths(rootDir, command.skillId);
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];

  if (await ensureDirectory(paths.skillsDir)) {
    createdDirectories.push(".flowness/skills");
  }
  if (await ensureDirectory(paths.skillDir)) {
    createdDirectories.push(`.flowness/skills/${command.skillId}`);
  }

  const skillMarkdown = renderSkillMarkdown(command.skillId, command.title, command.description);
  const skillWriteResult = await writeTextFile(paths.skillFile, skillMarkdown, command.force);
  if (skillWriteResult === "written") {
    createdFiles.push(`.flowness/skills/${command.skillId}/SKILL.md`);
  } else {
    skippedFiles.push(`.flowness/skills/${command.skillId}/SKILL.md`);
  }

  const readmeWriteResult = await writeTextFile(
    paths.readmeFile,
    `# ${command.title}\n\n${command.description}\n`,
    command.force,
  );
  if (readmeWriteResult === "written") {
    createdFiles.push(`.flowness/skills/${command.skillId}/README.md`);
  } else {
    skippedFiles.push(`.flowness/skills/${command.skillId}/README.md`);
  }

  return {
    exitCode: 0,
    output: formatSkillSummary(command.skillId, command.title, paths.skillFile, createdFiles, skippedFiles),
  };
}

async function runSkillRunCommand(command: ParsedSkillRunCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const paths = resolveSkillScaffoldPaths(rootDir, command.skillId);
  if (!(await pathExists(paths.skillFile))) {
    return {
      exitCode: 1,
      output: `Skill scaffold not found: ${paths.skillFile}`,
    };
  }

  const content = await readTextFile(paths.skillFile);
  const title = extractMarkdownHeading(content) ?? command.skillId;
  const summary = [
    `Executed skill ${command.skillId} (${title}).`,
    command.input === undefined ? "Input: none" : `Input: ${command.input}`,
    `Path: ${paths.skillFile}`,
  ].join("\n");

  if (command.issueId !== undefined) {
    const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
    const config = await readProjectConfig(rootDir);
    const analysis = await renderProjectAnalysis(rootDir, config.projectName);
    const logEntry = createLogEntry({
      timestamp: new Date().toISOString(),
      step: "Skill Executed",
      actions: [
        `Executed skill ${command.skillId} (${title}).`,
        command.input === undefined ? "No input was supplied." : `Input: ${command.input}`,
      ],
      evidence: [
        createEvidenceRecord({
          kind: "file",
          title: `skills/${command.skillId}/SKILL.md`,
          location: paths.skillFile,
          detail: title,
        }),
      ],
      summary: `Skill ${title} executed.`,
      nextStep: workspace.workflowState.currentStep || null,
    });
    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, logEntry);
    await refreshIssueNavigationArtifacts({
      rootDir,
      analysis,
      issue: workspace.issue,
      workflowState: workspace.workflowState,
      issuePaths: workspace.issuePaths,
      nextStep: workspace.workflowState.currentStep || null,
      evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
    });
  }

  return {
    exitCode: 0,
    output: summary,
  };
}

function extractMarkdownHeading(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }

  return null;
}

async function runSkillListCommand(): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const skillsDir = resolveWorkspacePaths(rootDir).agentSkillsDir;
  if (!(await pathExists(skillsDir))) {
    return {
      exitCode: 0,
      output: "No skills have been created yet.",
    };
  }

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const rows: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const paths = resolveSkillScaffoldPaths(rootDir, entry.name);
    if (!(await pathExists(paths.skillFile))) {
      continue;
    }

    const content = await readTextFile(paths.skillFile);
    const title = extractMarkdownHeading(content) ?? entry.name;
    rows.push(`- ${entry.name}: ${title}`);
  }

  rows.sort();
  return {
    exitCode: 0,
    output: rows.length === 0
      ? "No skills have been created yet."
      : ["Skills:", ...rows].join("\n"),
  };
}

async function runRuleCreateCommand(command: ParsedRuleCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const resolution = await resolveRuleTarget(rootDir, {
    requestedRuleId: command.ruleId,
    title: command.title,
    description: command.description,
  });

  if (resolution.status === "ambiguous") {
    return {
      exitCode: 1,
      output: [
        "Multiple matching rules were found. Specify the rule you want to update:",
        `Reason: ${resolution.reason}`,
        ...resolution.ambiguousMatches.map((candidate) => `- ${candidate.ruleId}: ${candidate.title} (${candidate.path})`),
      ].join("\n"),
    };
  }

  const targetRuleId = resolution.targetRuleId;
  const targetPath = resolution.targetPath;
  await ensureDirectory(dirname(targetPath));

  const title = resolution.matchedRule?.title ?? command.title;
  const document = renderRuleDocumentMarkdown({
    title,
    ruleId: targetRuleId,
    scope: command.description,
    policy: [
      command.description,
      `Keep ${targetRuleId} current-state only for ${analysis.projectName}.`,
      "Record future history in rule-update-log.md.",
    ],
    examples: [
      `Use ${targetRuleId} when the request matches ${title}.`,
      resolution.matchedRule === null
        ? `Create or refresh the rule file at ${targetPath}.`
        : `Refresh the existing rule at ${resolution.matchedRule.path} instead of creating a duplicate.`,
    ],
    lastUpdated: new Date().toISOString(),
    notes: [
      resolution.status === "matched"
        ? "Matched an existing rule and refreshed it instead of creating a duplicate."
        : "Created a new current-state rule file.",
    ],
  });

  await writeTextFile(targetPath, document, true);
  const ruleUpdateLogPath = await ensureRuleUpdateLog(rootDir);
  await appendTextFile(
    ruleUpdateLogPath,
    renderRuleUpdateLogEntry({
      timestamp: new Date().toISOString(),
      source: "rule:create",
      action: resolution.status === "matched" ? "updated" : "created",
      requestedRuleId: command.ruleId,
      resolvedRuleId: targetRuleId,
      targetPath,
      instruction: command.description,
    }),
  );

  return {
    exitCode: 0,
    output: formatRuleUpdateSummary({
      ruleId: targetRuleId,
      filePath: targetPath,
      logPath: null,
      action: resolution.status === "matched" ? "updated" : "created",
      requestedRuleId: command.ruleId,
      resolvedRuleId: targetRuleId,
      ruleUpdateLogPath,
      matchedExistingRule: resolution.status === "matched",
    }),
  };
}

async function runRuleApplyCommand(command: ParsedRuleApplyCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const paths = resolveRuleScaffoldPaths(rootDir, command.ruleId);
  if (!(await pathExists(paths.ruleFile))) {
    return {
      exitCode: 1,
      output: `Rule scaffold not found: ${paths.ruleFile}`,
    };
  }

  const content = await readTextFile(paths.ruleFile);
  const title = extractMarkdownHeading(content) ?? command.ruleId;
  const summary = [
    `Applied rule ${command.ruleId} (${title}).`,
    command.input === undefined ? "Input: none" : `Input: ${command.input}`,
    `Path: ${paths.ruleFile}`,
  ].join("\n");

  if (command.issueId !== undefined) {
    const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
    const config = await readProjectConfig(rootDir);
    const analysis = await renderProjectAnalysis(rootDir, config.projectName);
    const logEntry = createLogEntry({
      timestamp: new Date().toISOString(),
      step: "Rule Applied",
      actions: [
        `Applied rule ${command.ruleId} (${title}).`,
        command.input === undefined ? "No input was supplied." : `Input: ${command.input}`,
      ],
      evidence: [
        createEvidenceRecord({
          kind: "file",
          title: `rules/${command.ruleId}.md`,
          location: paths.ruleFile,
          detail: title,
        }),
      ],
      summary: `Rule ${title} applied.`,
      nextStep: workspace.workflowState.currentStep || null,
    });
    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, logEntry);
    await refreshIssueNavigationArtifacts({
      rootDir,
      analysis,
      issue: workspace.issue,
      workflowState: workspace.workflowState,
      issuePaths: workspace.issuePaths,
      nextStep: workspace.workflowState.currentStep || null,
      evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
    });
  }

  return {
    exitCode: 0,
    output: summary,
  };
}

async function collectRuleMarkdownIds(directory: string, relativePrefix = ""): Promise<string[]> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const ruleIds: string[] = [];
  for (const entry of entries) {
    const relativePath = relativePrefix.length === 0 ? entry.name : `${relativePrefix}/${entry.name}`;
    const absolutePath = joinPaths(directory, entry.name);

    if (entry.isDirectory()) {
      ruleIds.push(...await collectRuleMarkdownIds(absolutePath, relativePath));
      continue;
    }

    if (
      !entry.isFile()
      || !entry.name.endsWith(".md")
      || entry.name === "README.md"
      || entry.name === "rule-update-log.md"
    ) {
      continue;
    }

    ruleIds.push(relativePath.slice(0, -3));
  }

  return ruleIds;
}

interface RuleDocumentSpec {
  readonly title: string;
  readonly ruleId: string;
  readonly scope: string;
  readonly policy: readonly string[];
  readonly examples: readonly string[];
  readonly lastUpdated: string;
  readonly notes?: readonly string[];
}

interface RuleMetadata {
  readonly ruleId: string;
  readonly title: string;
  readonly path: string;
  readonly searchText: string;
  readonly tokens: readonly string[];
}

interface RuleTargetResolution {
  readonly status: "matched" | "new" | "ambiguous";
  readonly requestedRuleId: string;
  readonly targetRuleId: string;
  readonly targetPath: string;
  readonly matchedRule: RuleMetadata | null;
  readonly ambiguousMatches: readonly RuleMetadata[];
  readonly reason: string;
}

const ruleMatchStopwords = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "then",
  "only",
  "keep",
  "use",
  "current",
  "project",
  "file",
  "files",
  "rule",
  "rules",
  "policy",
  "update",
  "updated",
  "create",
  "created",
  "change",
  "changes",
  "instruction",
  "guidance",
  "existing",
  "new",
  "manual",
  "approval",
  "approved",
]);

function normalizeRuleSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeRuleSearchText(value: string): readonly string[] {
  const normalized = normalizeRuleSearchText(value);
  if (normalized.length === 0) {
    return [];
  }

  return [...new Set(
    normalized
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && !ruleMatchStopwords.has(token)),
  )];
}

function parseRuleMetadata(rulePath: string, content: string): RuleMetadata {
  const ruleId = rulePath.replace(/\.md$/, "");
  const title = extractMarkdownHeading(content) ?? humanizeRuleId(ruleId);
  const searchText = normalizeRuleSearchText([ruleId, title, content].join(" "));
  return {
    ruleId,
    title,
    path: rulePath,
    searchText,
    tokens: tokenizeRuleSearchText(searchText),
  };
}

async function collectRuleMetadata(directory: string, relativePrefix = ""): Promise<RuleMetadata[]> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const metadata: RuleMetadata[] = [];
  for (const entry of entries) {
    const relativePath = relativePrefix.length === 0 ? entry.name : `${relativePrefix}/${entry.name}`;
    const absolutePath = joinPaths(directory, entry.name);

    if (entry.isDirectory()) {
      metadata.push(...await collectRuleMetadata(absolutePath, relativePath));
      continue;
    }

    if (
      !entry.isFile()
      || !entry.name.endsWith(".md")
      || entry.name === "README.md"
      || entry.name === "rule-update-log.md"
    ) {
      continue;
    }

    const content = await readTextFile(absolutePath);
    metadata.push(parseRuleMetadata(relativePath, content));
  }

  return metadata;
}

function scoreRuleCandidate(query: string, candidate: RuleMetadata, requestedRuleId: string): number {
  const normalizedQuery = normalizeRuleSearchText(query);
  if (normalizedQuery.length === 0) {
    return 0;
  }

  const queryTokens = tokenizeRuleSearchText(normalizedQuery);
  if (queryTokens.length === 0) {
    return 0;
  }

  const queryTokenSet = new Set(queryTokens);
  const candidateTokenSet = new Set(candidate.tokens);
  const intersection = [...queryTokenSet].filter((token) => candidateTokenSet.has(token));
  const normalizedCandidateRuleId = normalizeRuleId(candidate.ruleId);
  const normalizedRequestedRuleId = normalizeRuleId(requestedRuleId);
  const normalizedCandidateTitle = normalizeRuleSearchText(candidate.title);

  let score = 0;
  if (candidate.ruleId === normalizedRequestedRuleId) {
    score += 100;
  }
  if (normalizedQuery === normalizedCandidateRuleId || normalizedQuery === normalizedCandidateTitle) {
    score += 80;
  }
  if (normalizedQuery.includes(normalizedCandidateRuleId) || normalizedCandidateRuleId.includes(normalizedQuery)) {
    score += 35;
  }
  if (normalizedQuery.includes(normalizedCandidateTitle) || normalizedCandidateTitle.includes(normalizedQuery)) {
    score += 30;
  }
  if (intersection.length > 0) {
    score += (intersection.length / queryTokens.length) * 50;
    score += (intersection.length / Math.max(candidate.tokens.length, 1)) * 20;
  }

  return score;
}

async function resolveRuleTarget(rootDir: string, input: {
  readonly requestedRuleId: string;
  readonly title: string;
  readonly description: string;
}): Promise<RuleTargetResolution> {
  const requestedRuleId = normalizeRuleId(input.requestedRuleId);
  const directPath = resolveRuleScaffoldPaths(rootDir, requestedRuleId).ruleFile;
  if (await pathExists(directPath)) {
    const content = await readTextFile(directPath);
    const metadata = parseRuleMetadata(`${requestedRuleId}.md`, content);
    return {
      status: "matched",
      requestedRuleId,
      targetRuleId: requestedRuleId,
      targetPath: directPath,
      matchedRule: metadata,
      ambiguousMatches: [],
      reason: "Matched the requested rule id exactly.",
    };
  }

  const candidates = await collectRuleMetadata(resolveWorkspacePaths(rootDir).agentRulesDir);
  const query = [input.requestedRuleId, input.title, input.description].filter((value) => value.trim().length > 0).join(" ");
  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreRuleCandidate(query, candidate, requestedRuleId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.ruleId.localeCompare(right.candidate.ruleId));

  const bestMatch = scoredCandidates[0];
  const secondBest = scoredCandidates[1];
  if (bestMatch !== undefined && bestMatch.score >= 60 && (secondBest === undefined || bestMatch.score - secondBest.score >= 8)) {
    const targetPath = joinPaths(rootDir, ".flowness", "rules", `${bestMatch.candidate.ruleId}.md`);
    return {
      status: "matched",
      requestedRuleId,
      targetRuleId: bestMatch.candidate.ruleId,
      targetPath,
      matchedRule: bestMatch.candidate,
      ambiguousMatches: [],
      reason: "Matched an existing rule with a strong similarity score.",
    };
  }

  if (bestMatch !== undefined && secondBest !== undefined && bestMatch.score >= 45 && bestMatch.score - secondBest.score < 8) {
    return {
      status: "ambiguous",
      requestedRuleId,
      targetRuleId: requestedRuleId,
      targetPath: directPath,
      matchedRule: null,
      ambiguousMatches: scoredCandidates.slice(0, 3).map((entry) => entry.candidate),
      reason: "Multiple existing rules matched this request closely.",
    };
  }

  return {
    status: "new",
    requestedRuleId,
    targetRuleId: requestedRuleId,
    targetPath: directPath,
    matchedRule: null,
    ambiguousMatches: [],
    reason: "No existing rule matched strongly enough to reuse.",
  };
}

function renderRuleDocumentMarkdown(spec: RuleDocumentSpec): string {
  return [
    `# ${spec.title}`,
    "",
    `- Rule ID: ${spec.ruleId}`,
    "",
    "## Scope",
    spec.scope,
    "",
    "## Policy",
    ...spec.policy.map((item) => `- ${item}`),
    "",
    "## Examples",
    ...spec.examples.map((item) => `- ${item}`),
    "",
    "## Last Updated",
    `- ${spec.lastUpdated}`,
    ...(spec.notes === undefined || spec.notes.length === 0
      ? []
      : [
          "",
          "## Notes",
          ...spec.notes.map((item) => `- ${item}`),
        ]),
    "",
  ].join("\n");
}

function renderRuleUpdateLogMarkdown(): string {
  return [
    "# Rule Update Log",
    "",
    "- Rule ID: rule-update-log",
    "",
    "## Scope",
    "Append-only history for approved rule changes and rule file creation.",
    "",
    "## Policy",
    "- Record the rule id, source request, approval path, and target file for each change.",
    "- Keep this log append-only.",
    "- Do not add history blocks inside individual rule files.",
    "- Use the current-state rule file as the single source of truth for each rule.",
    "",
    "## Examples",
    "- Approved `tech/react` convention update.",
    "- Added `performance-improvement.md` after init.",
    "",
    "## Entries",
    "- None yet.",
    "",
    "## Last Updated",
    `- ${new Date().toISOString()}`,
    "",
  ].join("\n");
}

function renderRuleUpdateLogEntry(input: {
  readonly timestamp: string;
  readonly source: string;
  readonly action: "created" | "updated";
  readonly requestedRuleId: string;
  readonly resolvedRuleId: string;
  readonly targetPath: string;
  readonly instruction: string;
}): string {
  return [
    "",
    `## ${input.timestamp}`,
    "",
    `- Source: ${input.source}`,
    `- Action: ${input.action}`,
    `- Requested rule: ${input.requestedRuleId}`,
    `- Resolved rule: ${input.resolvedRuleId}`,
    `- Target file: ${input.targetPath}`,
    `- Instruction: ${input.instruction}`,
    "",
  ].join("\n");
}

async function ensureRuleUpdateLog(rootDir: string): Promise<string> {
  const logPath = joinPaths(rootDir, ".flowness", "rules", "rule-update-log.md");
  if (!(await pathExists(logPath))) {
    await writeTextFile(logPath, renderRuleUpdateLogMarkdown(), false);
  }

  return logPath;
}

async function runRuleUpdateCommand(command: ParsedRuleUpdateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);

  const timestamp = new Date().toISOString();
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const resolution = await resolveRuleTarget(rootDir, {
    requestedRuleId: command.ruleId,
    title: humanizeRuleId(command.ruleId),
    description: command.input,
  });

  if (resolution.status === "ambiguous") {
    return {
      exitCode: 1,
      output: [
        "Multiple matching rules were found. Specify the rule you want to update:",
        `Reason: ${resolution.reason}`,
        ...resolution.ambiguousMatches.map((candidate) => `- ${candidate.ruleId}: ${candidate.title} (${candidate.path})`),
      ].join("\n"),
    };
  }

  const targetRuleId = resolution.targetRuleId;
  const targetPath = resolution.targetPath;
  await ensureDirectory(dirname(targetPath));

  const documentTitle = resolution.matchedRule?.title ?? humanizeRuleId(targetRuleId);
  const document = renderRuleDocumentMarkdown({
    title: documentTitle,
    ruleId: targetRuleId,
    scope: `Current guidance for ${documentTitle}.`,
    policy: [
      command.input,
      "Keep this file current-state only.",
      "Record future changes in rule-update-log.md.",
    ],
    examples: [
      `Apply ${documentTitle} when the request matches ${targetRuleId}.`,
      resolution.matchedRule === null
        ? `Create or refresh ${targetRuleId} directly from the approved update request.`
        : `Refresh the existing rule at ${resolution.matchedRule.path} instead of creating a duplicate.`,
    ],
    lastUpdated: timestamp,
    notes: [
      resolution.status === "matched"
        ? "Matched an existing rule and refreshed it in place."
        : "Created a new current-state rule file from the approved update request.",
    ],
  });

  await writeTextFile(targetPath, document, true);

  const ruleUpdateLogPath = await ensureRuleUpdateLog(rootDir);
  await appendTextFile(
    ruleUpdateLogPath,
    renderRuleUpdateLogEntry({
      timestamp,
      source: command.issueId ?? "rule:update",
      action: resolution.status === "matched" ? "updated" : "created",
      requestedRuleId: command.ruleId,
      resolvedRuleId: targetRuleId,
      targetPath,
      instruction: command.input,
    }),
  );

  let issueLogPath: string | null = null;
  if (command.issueId !== undefined) {
    const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
    const logEntry = createLogEntry({
      timestamp,
      step: "Rule Updated",
      actions: [
        `Updated rule ${targetRuleId}.`,
        `Instruction: ${command.input}`,
        `Rule update log: ${ruleUpdateLogPath}`,
      ],
      evidence: [
        createEvidenceRecord({
          kind: "file",
          title: `rules/${targetRuleId}.md`,
          location: targetPath,
          detail: command.input,
        }),
        createEvidenceRecord({
          kind: "file",
          title: "rules/rule-update-log.md",
          location: ruleUpdateLogPath,
          detail: command.input,
        }),
      ],
      summary: `Rule ${targetRuleId} was updated.`,
      nextStep: workspace.workflowState.currentStep || null,
    });

    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, logEntry);
    issueLogPath = workspace.issue.logPath;
    await refreshIssueNavigationArtifacts({
      rootDir,
      analysis,
      issue: workspace.issue,
      workflowState: workspace.workflowState,
      issuePaths: workspace.issuePaths,
      nextStep: workspace.workflowState.currentStep || null,
      evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
    });
  }

  return {
    exitCode: 0,
    output: formatRuleUpdateSummary({
      ruleId: targetRuleId,
      filePath: targetPath,
      logPath: issueLogPath,
      action: resolution.status === "matched" ? "updated" : "created",
      requestedRuleId: command.ruleId,
      resolvedRuleId: targetRuleId,
      ruleUpdateLogPath,
      matchedExistingRule: resolution.status === "matched",
    }),
  };
}

async function runRuleListCommand(): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const rulesDir = resolveWorkspacePaths(rootDir).agentRulesDir;
  if (!(await pathExists(rulesDir))) {
    return {
      exitCode: 0,
      output: "No rules have been created yet.",
    };
  }

  const ruleIds = (await collectRuleMarkdownIds(rulesDir)).sort((left, right) => left.localeCompare(right));
  const rows: string[] = [];
  for (const ruleId of ruleIds) {
    const filePath = resolveRuleScaffoldPaths(rootDir, ruleId).ruleFile;
    if (!(await pathExists(filePath))) {
      continue;
    }

    const content = await readTextFile(filePath);
    const title = extractMarkdownHeading(content) ?? ruleId;
    rows.push(`- ${ruleId}: ${title}`);
  }

  rows.sort();
  return {
    exitCode: 0,
    output: rows.length === 0
      ? "No rules have been created yet."
      : ["Rules:", ...rows].join("\n"),
  };
}

async function runWorkflowStepCommand(command: ParsedWorkflowStepCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
  const config = await readProjectConfig(rootDir);
  const projectAnalysis = await renderProjectAnalysis(rootDir, config.projectName);
  const workflow = await buildWorkflowDefinition(rootDir, workspace.issue.workflowId);
  const stepName = workspace.workflowState.currentStep || workflow.steps[0]?.name || "";
  if (stepName.length === 0) {
    return {
      exitCode: 1,
      output: `Workflow "${workflow.id}" does not contain any steps.`,
    };
  }

  const stepMetadataMap = await loadWorkflowStepMetadataMap(rootDir, workflow.id);
  const currentStepMetadata = stepMetadataMap.get(stepName) ?? null;
  const currentStepFile = currentStepMetadata?.fileName ?? "README.md";

  if (workspace.workflowState.completedSteps.length > 0 && (workflow.id === "feature-development" || workflow.id === "mvp-planning")) {
    const missingDocs: string[] = [];
    if (!(await pathExists(join(rootDir, "docs", "PRD.md")))) {
      missingDocs.push("docs/PRD.md");
    }
    if (!(await pathExists(join(rootDir, "docs", "ARD.md")))) {
      missingDocs.push("docs/ARD.md");
    }

    if (missingDocs.length > 0) {
      const blockedAt = new Date().toISOString();
      const blockedState = {
        ...workspace.workflowState,
        blocked: true,
        updatedAt: blockedAt,
      };
      const updatedWorkspace = await writeIssueWorkspaceState(rootDir, workspace.issue, blockedState, workspace.description);
      const blockedLogEntry = createLogEntry({
        timestamp: blockedAt,
        step: "Planning Docs Blocked",
        actions: [
          `Missing planning docs before running "${stepName}".`,
          `Missing files: ${missingDocs.join(", ")}`,
          "Restore or create the planning docs before retrying the workflow step.",
        ],
        evidence: [
          createEvidenceRecord({
            kind: "command_output",
            title: "Missing planning docs",
            detail: missingDocs.join(", "),
          }),
        ],
        summary: "Workflow step blocked until PRD/ARD exist.",
        nextStep: stepName,
      });

      await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, blockedLogEntry);
      const blockedActiveIssue = await buildActiveIssueNavigationContext({
        rootDir,
        analysis: projectAnalysis,
        issue: updatedWorkspace.issue,
        workflowState: updatedWorkspace.workflowState,
        issuePaths: workspace.issuePaths,
        nextStep: stepName,
        blocked: true,
        blockReason: "missing_planning_docs",
        pendingStep: stepName,
        requiredAction: "Restore docs/PRD.md and docs/ARD.md, then retry the workflow step.",
        evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
      });
      await refreshWorkspaceArtifacts(rootDir, blockedActiveIssue);

      return {
        exitCode: 1,
        output: formatWorkflowStepSummary({
          issueId: workspace.issue.id,
          stepName,
          status: "blocked",
          issueState: updatedWorkspace.issue.state,
          gateStatus: "blocked: missing planning docs",
          actions: blockedLogEntry.actions,
          evidence: blockedLogEntry.evidence,
          nextStep: stepName,
          nextStepFile: currentStepFile,
          logPath: workspace.issue.logPath,
        }),
      };
    }
  }

  const context = createWorkflowStepContext({
    issueId: workspace.issue.id,
    issueType: workspace.issue.type,
    workflowId: workspace.issue.workflowId,
    stepName,
    rootDir,
    state: workspace.workflowState,
  });
  const outcome = await runWorkflowStep({
    workflow,
    state: workspace.workflowState,
    context,
    timestamp: new Date().toISOString(),
    approved: command.approve,
  });
  return persistWorkflowOutcome({
    rootDir,
    workspace,
    workflow,
    stepName,
    outcome,
    analysis: projectAnalysis,
    stepMetadataMap,
  });
}

async function runWorkflowRecoverCommand(command: ParsedWorkflowRecoverCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
  const config = await readProjectConfig(rootDir);
  const projectAnalysis = await renderProjectAnalysis(rootDir, config.projectName);
  const workflow = await buildWorkflowDefinition(rootDir, workspace.issue.workflowId);
  const stepName = workspace.workflowState.currentStep || workflow.steps[0]?.name || "";
  if (stepName.length === 0) {
    return {
      exitCode: 1,
      output: `Workflow "${workflow.id}" does not contain any steps.`,
    };
  }
  const stepMetadataMap = await loadWorkflowStepMetadataMap(rootDir, workflow.id);

  const context = createWorkflowStepContext({
    issueId: workspace.issue.id,
    issueType: workspace.issue.type,
    workflowId: workspace.issue.workflowId,
    stepName,
    rootDir,
    state: workspace.workflowState,
  });
  const outcome = await recoverWorkflowStep({
    workflow,
    state: workspace.workflowState,
    context,
    timestamp: new Date().toISOString(),
    rootCause: command.rootCause,
  });

  await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, outcome.logEntry);
  await writeIssueWorkspaceState(rootDir, workspace.issue, outcome.state, workspace.description);

  const retryContext = createWorkflowStepContext({
    issueId: workspace.issue.id,
    issueType: workspace.issue.type,
    workflowId: workspace.issue.workflowId,
    stepName,
    rootDir,
    state: outcome.state,
  });
  const retryOutcome = await runWorkflowStep({
    workflow,
    state: outcome.state,
    context: retryContext,
    timestamp: new Date().toISOString(),
    approved: true,
  });

  const retryResult = await persistWorkflowOutcome({
    rootDir,
    workspace: {
      ...workspace,
      workflowState: outcome.state,
    },
    workflow,
    stepName,
    outcome: retryOutcome,
    analysis: projectAnalysis,
    stepMetadataMap,
  });

  return {
    exitCode: retryResult.exitCode,
    output: [
      formatWorkflowRecoverSummary(workspace.issue.id, command.rootCause, workspace.issue.logPath),
      retryResult.output,
    ].join("\n"),
  };
}

async function runStatusCommand(command: ParsedStatusCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await readIssueWorkspace(rootDir, command.issueId);
  if (workspace === null) {
    return {
      exitCode: 1,
      output: `Issue workspace not found: ${command.issueId}`,
    };
  }

  try {
    await assertIssueWorkspaceLogAlignment(rootDir, workspace);
  } catch (error) {
    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error),
    };
  }

  const latestLogEntry = await readLatestIssueLogEntry(rootDir, workspace.issue.id);
  const evidence = await collectIssueEvidence(rootDir, workspace.issue.id);
  const currentStep = workspace.workflowState.currentStep.length === 0 ? null : workspace.workflowState.currentStep;
  const latestLogText = latestLogEntry === null
    ? ""
    : [
        latestLogEntry.step,
        latestLogEntry.summary,
      ].join("\n");
  const derivedBlockContext = workspace.workflowState.blocked
    ? (() => {
        if (/Awaiting human approval/i.test(latestLogText) || /Human gate/i.test(latestLogText)) {
          return {
            blockReason: "waiting_human_approval",
            pendingStep: currentStep,
            requiredAction: `Approve the ${currentStep ?? "current"} gate before continuing.`,
          };
        }

        if (/Planning Docs Blocked/i.test(latestLogText) || /planning docs/i.test(latestLogText)) {
          return {
            blockReason: "missing_planning_docs",
            pendingStep: currentStep,
            requiredAction: "Restore docs/PRD.md and docs/ARD.md, then retry the step.",
          };
        }

        if (/Close Blocked/i.test(latestLogText) && /Evidence Review/i.test(latestLogText)) {
          return {
            blockReason: "missing_evidence_review",
            pendingStep: currentStep,
            requiredAction: "Record an Evidence Review log entry before retrying close.",
          };
        }

        if (currentStep !== null && workspace.workflowState.failedSteps.includes(currentStep)) {
          return {
            blockReason: "workflow_failure",
            pendingStep: currentStep,
            requiredAction: `Run flowness workflow:recover --issue ${workspace.issue.id} --root-cause "<cause>" before retrying.`,
          };
        }

        return {
          blockReason: "blocked",
          pendingStep: currentStep,
          requiredAction: "Resolve the block before continuing.",
        };
      })()
    : {
        blockReason: null,
        pendingStep: null,
        requiredAction: null,
      };

  return {
    exitCode: 0,
    output: formatStatusSummary({
      issueId: workspace.issue.id,
      workflowId: workspace.issue.workflowId,
      layout: workspace.issuePaths.isLegacy ? "legacy" : "flowness",
      currentStep: workspace.workflowState.currentStep,
      completedSteps: workspace.workflowState.completedSteps,
      blocked: workspace.workflowState.blocked,
      blockReason: derivedBlockContext.blockReason,
      pendingStep: derivedBlockContext.pendingStep,
      requiredAction: derivedBlockContext.requiredAction,
      latestLogStep: latestLogEntry === null ? null : latestLogEntry.step,
      evidenceCount: evidence.length,
      logPath: workspace.issue.logPath,
    }),
  };
}

async function runEvidenceAddCommand(command: ParsedEvidenceAddCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const evidence = createEvidenceRecord({
    kind: command.evidenceKind,
    title: command.title,
    ...(command.detail === undefined ? {} : { detail: command.detail }),
    ...(command.location === undefined ? {} : { location: command.location }),
  });

  if (command.location !== undefined && !(await pathExists(command.location))) {
    return {
      exitCode: 1,
      output: `Evidence location does not exist: ${command.location}`,
    };
  }

  const nextState = {
    ...workspace.workflowState,
    evidence: [
      ...workspace.workflowState.evidence,
      evidence,
    ],
    updatedAt: new Date().toISOString(),
  };

  const updatedWorkspace = await writeIssueWorkspaceState(rootDir, workspace.issue, nextState, workspace.description);
  const logEntry = createLogEntry({
    timestamp: nextState.updatedAt,
    step: "Evidence Added",
    actions: [
      `Recorded evidence ${command.title}.`,
      `Kind: ${command.evidenceKind}`,
      ...(command.detail === undefined ? [] : [`Detail: ${command.detail}`]),
      ...(command.location === undefined ? [] : [`Location: ${command.location}`]),
    ],
    evidence: [
      evidence,
    ],
    summary: `Evidence ${command.title} was recorded.`,
    nextStep: updatedWorkspace.workflowState.currentStep || null,
  });
  await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, logEntry);
  await refreshIssueNavigationArtifacts({
    rootDir,
    analysis,
    issue: updatedWorkspace.issue,
    workflowState: updatedWorkspace.workflowState,
    issuePaths: updatedWorkspace.issuePaths,
    nextStep: updatedWorkspace.workflowState.currentStep || null,
    evidenceFiles: await collectIssueEvidence(rootDir, workspace.issue.id),
  });

  return {
    exitCode: 0,
    output: formatEvidenceAddSummary({
      issueId: workspace.issue.id,
      evidence,
      logPath: workspace.issue.logPath,
    }),
  };
}

async function runValidateCommand(): Promise<CliResult> {
  const rootDir = process.cwd();
  const errors: string[] = [];

  const paths = resolveWorkspacePaths(rootDir);
  const isInitialized = await pathExists(paths.configPath)
    || await pathExists(paths.legacyConfigPath)
    || await pathExists(join(rootDir, ".agent", "config", "project.yaml"));
  if (!isInitialized) {
    return {
      exitCode: 1,
      output: "Flowness project is not initialized. Run `flowness init` first.",
    };
  }

  try {
    await readProjectConfig(rootDir);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  errors.push(...validateBuiltinWorkflowDefinitions());

  const requiredDirectories = [
    ".flowness",
    ".flowness/config",
    ".flowness/issues",
    ".flowness/logs",
    ".flowness/workflows",
    ".flowness/rules",
    ".flowness/rules/tech",
    ".flowness/skills",
    ".flowness/scripts",
    ".flowness/templates",
    ".flowness/prompts",
    ".flowness/settings",
    ".flowness/state",
    "docs",
  ];

  for (const directory of requiredDirectories) {
    if (!(await pathExists(join(rootDir, directory)))) {
      errors.push(`Missing required directory: ${directory}`);
    }
  }

  const requiredFiles = [
    "AGENTS.md",
    ".flowness/config/project.yaml",
    ".flowness/project-profile.md",
    ".flowness/context-index.json",
    ".flowness/commands.json",
    ".flowness/harness-manifest.json",
    ".flowness/navigation.md",
    ".flowness/state/active-issue.md",
    ".flowness/rules/README.md",
    ".flowness/rules/git.md",
    ".flowness/rules/commit-policy.md",
    ".flowness/rules/project-overrides.md",
    ".flowness/rules/performance-improvement.md",
    ".flowness/rules/rule-update-log.md",
    ".flowness/rules/tech/README.md",
    ".flowness/rules/tech/java.md",
    ".flowness/rules/tech/javascript.md",
    ".flowness/rules/tech/typescript.md",
    ".flowness/rules/tech/python.md",
    ".flowness/rules/tech/spring.md",
    ".flowness/rules/tech/react.md",
    ".flowness/rules/tech/nextjs.md",
    ".flowness/rules/tech/nestjs.md",
    ".flowness/rules/tech/django.md",
    ".flowness/scripts/README.md",
    ".flowness/scripts/flowness-runner.ts",
    ".flowness/scripts/workflow-guard.ts",
    ".flowness/scripts/find-fqcn.py",
    ".flowness/scripts/search-reference.py",
    ".flowness/scripts/check-md-size.py",
    ".flowness/workflows/README.md",
    ".flowness/skills/README.md",
    ".flowness/templates/README.md",
    "docs/troubleshooting/performance-improvements.md",
    "docs/PRD.md",
    "docs/ARD.md",
  ];

  for (const file of requiredFiles) {
    if (!(await pathExists(join(rootDir, file)))) {
      errors.push(`Missing required file: ${file}`);
    }
  }

  return {
    exitCode: errors.length === 0 ? 0 : 1,
    output: formatWorkflowValidationSummary("workspace", errors),
  };
}

async function runWorkflowCreateCommand(command: ParsedWorkflowCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);

  const builtin = getBuiltinWorkflowDefinition(command.workflowId);
  const workflow = builtin === undefined
    ? createGenericWorkflowDefinition(command.workflowId, command.name ?? humanizeWorkflowName(command.workflowId))
    : {
      ...builtin,
      name: command.name ?? builtin.name,
    };

  const workflowPaths = resolveWorkflowScaffoldPaths(rootDir, workflow.id);
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];

  if (await ensureDirectory(workflowPaths.workflowDir)) {
    createdDirectories.push(`.flowness/workflows/${workflow.id}`);
  }
  if (await ensureDirectory(workflowPaths.stepsDir)) {
    createdDirectories.push(`.flowness/workflows/${workflow.id}/steps`);
  }

  const workflowSource = renderWorkflowScaffoldSource(workflow);
  const workflowWriteResult = await writeTextFile(
    workflowPaths.workflowFile,
    workflowSource,
    command.force,
  );
  if (workflowWriteResult === "written") {
    createdFiles.push(`.flowness/workflows/${workflow.id}/workflow.ts`);
  } else {
    skippedFiles.push(`.flowness/workflows/${workflow.id}/workflow.ts`);
  }

  const readmeWriteResult = await writeTextFile(
    workflowPaths.workflowReadme,
    `# ${workflow.name}\n\nWorkflow scaffold generated by Flowness.\n\n- Id: ${workflow.id}\n- Step count: ${workflow.steps.length}\n`,
    command.force,
  );
  if (readmeWriteResult === "written") {
    createdFiles.push(`.flowness/workflows/${workflow.id}/README.md`);
  } else {
    skippedFiles.push(`.flowness/workflows/${workflow.id}/README.md`);
  }

  const stepsReadmeWriteResult = await writeTextFile(
    joinPaths(workflowPaths.stepsDir, "README.md"),
    "# Steps\n\nAdd step modules or supporting notes here.\n",
    command.force,
  );
  if (stepsReadmeWriteResult === "written") {
    createdFiles.push(`.flowness/workflows/${workflow.id}/steps/README.md`);
  } else {
    skippedFiles.push(`.flowness/workflows/${workflow.id}/steps/README.md`);
  }

  return {
    exitCode: 0,
    output: formatWorkflowCreateSummary(
      workflow.id,
      workflow.name,
      createdFiles,
      createdDirectories,
      skippedFiles,
    ),
  };
}

async function runWorkflowValidateCommand(
  command: ParsedWorkflowValidateCommand,
): Promise<CliResult> {
  if (command.workflowId === undefined) {
    const errors = validateBuiltinWorkflowDefinitions();
    return {
      exitCode: errors.length === 0 ? 0 : 1,
      output: formatWorkflowValidationSummary("built-in workflows", errors),
    };
  }

  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  try {
    const workflow = await buildWorkflowDefinition(rootDir, command.workflowId);
    return {
      exitCode: 0,
      output: formatWorkflowValidationSummary(command.workflowId, workflow.steps.length === 0
        ? [`Workflow "${command.workflowId}" has no steps.`]
        : []),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      output: formatWorkflowValidationSummary(
        command.workflowId,
        [message],
      ),
    };
  }
}

export function usage(): string {
  return [
    "Flowness CLI",
    "",
    "Usage:",
    "  flowness init [path] [--name <project-name>] [--force]",
    "  flowness run <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]",
    "  flowness issue:create [--title <title>] --type <issue-type> [--workflow <workflow-id>] [--description <text>] [--parent-issue <issue-id>] [--approval-note <text>] [--force]",
    "  flowness request:create <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]",
    "  flowness skill:run --id <skill-id> [--issue <issue-id>] [--input <text>]",
    "  flowness workflow:create [workflow-id] [--name <display-name>] [--force]",
    "  flowness workflow:validate [workflow-id]",
    "  flowness step --issue <issue-id> [--approve]",
    "  flowness status --issue <issue-id>",
    "  flowness locate <task description>",
    "  flowness test [--summary] [--confirm-risk]",
    "  flowness audit [--changed|--full] [--confirm-risk]",
    "  flowness evidence:add --issue <issue-id> --kind <kind> --title <title> [--detail <text>] [--location <path>]",
    "  flowness workflow:step --issue <issue-id> [--approve]",
    "  flowness workflow:recover --issue <issue-id> --root-cause <text>",
    "  flowness decision:create --issue <issue-id> --title <title> --context <text> --decision <text> --alternatives <a,b> --consequences <x,y>",
    "  flowness review:run --issue <issue-id>",
    "  flowness skill:create [--id <skill-id>] --title <title> [--description <text>] [--force]",
    "  flowness skill:list",
    "  flowness rule:create [--id <rule-id>] [--title <title>] [--description <text>] [--force]",
    "  flowness rule:apply --id <rule-id> [--issue <issue-id>] [--input <text>]",
    "  flowness rule:update --id <rule-id> [--issue <issue-id>] --input <text>",
    "  flowness rule:list",
    "  flowness config:gate [--set <instruction>]",
    "  flowness validate",
    "  flowness upgrade [--dry-run|--apply] [--from <version>] [--to <version>] [--explain] [--force]",
    "",
    "Implemented commands:",
    "  init",
    "  run",
    "  issue:create",
    "  request:create",
    "  skill:run",
    "  workflow:create",
    "  workflow:validate",
    "  step",
    "  status",
    "  locate",
    "  test",
    "  audit",
    "  evidence:add",
    "  workflow:step",
    "  workflow:recover",
    "  decision:create",
    "  review:run",
    "  skill:create",
    "  skill:list",
    "  rule:create",
    "  rule:apply",
    "  rule:update",
    "  rule:list",
    "  config:gate",
    "  validate",
    "  upgrade",
    "",
    "Issue types:",
    `  ${issueTypeValues.join(", ")}`,
  ].join("\n");
}

export async function runCli(argv: readonly string[]): Promise<CliResult> {
  try {
    const parsed = parseCommand(argv);

    if (parsed.kind === "help") {
      return {
        exitCode: 0,
        output: usage(),
      };
    }

    if (parsed.kind === "version") {
      return {
        exitCode: 0,
        output: getPackageVersion(),
      };
    }

    if (parsed.kind === "unsupported") {
      if (!parsed.command.startsWith("-")) {
        const request = [parsed.command, ...argv.slice(1)].join(" ").trim();
        if (request.length > 0 && isLikelyNaturalLanguageRequest(request)) {
          return await runRequestCreateCommand({
            kind: "request:create",
            request,
            force: false,
          });
        }
      }

      return {
        exitCode: 1,
        output: `${usage()}\n\nCommand "${parsed.command}" is not implemented yet.`,
      };
    }

    if (parsed.kind === "init") {
      return await runInitCommand(parsed);
    }

    if (parsed.kind === "issue:create") {
      return await runIssueCreateCommand(parsed);
    }

    if (parsed.kind === "request:create") {
      return await runRequestCreateCommand(parsed);
    }

    if (parsed.kind === "skill:run") {
      return await runSkillRunCommand(parsed);
    }

    if (parsed.kind === "workflow:create") {
      return await runWorkflowCreateCommand(parsed);
    }

    if (parsed.kind === "workflow:validate") {
      return await runWorkflowValidateCommand(parsed);
    }

    if (parsed.kind === "workflow:step") {
      return await runWorkflowStepCommand(parsed);
    }

    if (parsed.kind === "workflow:recover") {
      return await runWorkflowRecoverCommand(parsed);
    }

    if (parsed.kind === "status") {
      return await runStatusCommand(parsed);
    }

    if (parsed.kind === "locate") {
      return await runLocateCommand(parsed);
    }

    if (parsed.kind === "test") {
      return await runTestCommand(parsed);
    }

    if (parsed.kind === "audit") {
      return await runAuditCommand(parsed);
    }

    if (parsed.kind === "evidence:add") {
      return await runEvidenceAddCommand(parsed);
    }

    if (parsed.kind === "decision:create") {
      return await runDecisionCreateCommand(parsed);
    }

    if (parsed.kind === "review:run") {
      return await runReviewRunCommand(parsed);
    }

    if (parsed.kind === "skill:create") {
      return await runSkillCreateCommand(parsed);
    }

    if (parsed.kind === "skill:list") {
      return await runSkillListCommand();
    }

    if (parsed.kind === "rule:create") {
      return await runRuleCreateCommand(parsed);
    }

    if (parsed.kind === "rule:apply") {
      return await runRuleApplyCommand(parsed);
    }

    if (parsed.kind === "rule:update") {
      return await runRuleUpdateCommand(parsed);
    }

    if (parsed.kind === "rule:list") {
      return await runRuleListCommand();
    }

    if (parsed.kind === "config:gate") {
      return await runConfigGateCommand(parsed);
    }

    if (parsed.kind === "validate") {
      return await runValidateCommand();
    }

    if (parsed.kind === "upgrade") {
      return await runUpgradeCommand(process.cwd(), parsed);
    }

    return {
      exitCode: 1,
      output: usage(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      output: `${usage()}\n\n${message}`,
    };
  }
}
