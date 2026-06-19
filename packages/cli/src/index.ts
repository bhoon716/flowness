import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  analyzeRequest,
  type ClarificationQuestion,
  applyHumanGateInstruction,
  ensureDirectory,
  joinPaths,
  pathExists,
  readProjectConfig,
  readTextFile,
  resolveIssuePaths,
  resolveWorkspacePaths,
  resolveRuleScaffoldPaths,
  resolveSkillScaffoldPaths,
  resolveWorkflowScaffoldPaths,
  isLikelyNaturalLanguageRequest,
  slugify,
  type EvidenceRecord,
  type IssueRecord,
  type IssuePlan,
  type RequestAnalysis,
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

export interface ParsedRuleListCommand {
  readonly kind: "rule:list";
}

export interface ParsedValidateCommand {
  readonly kind: "validate";
}

export interface ParsedUpgradeCommand {
  readonly kind: "upgrade";
}

export interface ParsedConfigGateCommand {
  readonly kind: "config:gate";
  readonly instruction: string;
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
  | ParsedDecisionCreateCommand
  | ParsedReviewRunCommand
  | ParsedSkillCreateCommand
  | ParsedSkillListCommand
  | ParsedRuleCreateCommand
  | ParsedRuleApplyCommand
  | ParsedRuleListCommand
  | ParsedValidateCommand
  | ParsedUpgradeCommand
  | ParsedConfigGateCommand
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
      ruleId = slugify(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      ruleId = slugify(token.slice("--id=".length));
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
    ruleId = slugify(positional.shift() ?? "");
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
    title = humanizeWorkflowName(ruleId);
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
      ruleId = slugify(next);
      index += 1;
      continue;
    }

    if (token.startsWith("--id=")) {
      ruleId = slugify(token.slice("--id=".length));
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
    ruleId = slugify(positional.shift() ?? "");
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
  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }

  return { kind: "upgrade" };
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

  switch (command) {
    case "init":
      return parseInitCommand(rest);
    case "issue:create":
      return parseIssueCreateCommand(rest);
    case "request:create":
      return parseRequestCreateCommand(rest);
    case "skill:run":
      return parseSkillRunCommand(rest);
    case "workflow:create":
      return parseWorkflowCreateCommand(rest);
    case "workflow:validate":
      return parseWorkflowValidateCommand(rest);
    case "workflow:step":
      return parseWorkflowStepCommand(rest);
    case "workflow:recover":
      return parseWorkflowRecoverCommand(rest);
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
): string {
  const lines = [
    alreadyInitialized
      ? `Flowness project already existed at ${targetPath}.`
      : `Initialized Flowness project at ${targetPath}.`,
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

  lines.push("Next: review .flowness/config.yaml and the .agent/ workspace before adding workflows.");
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
  const issueRoot = join(rootDir, ".agent", "issues");
  if (!(await pathExists(issueRoot))) {
    return null;
  }

  const entries = await readdir(issueRoot, { withFileTypes: true });
  let bestMatch: {
    readonly workspace: NonNullable<Awaited<ReturnType<typeof readIssueWorkspace>>>;
    readonly score: number;
  } | null = null;

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
    `Reason: ${analysis.reason}`,
    `Workflow: ${analysis.workflowId ?? "none"}`,
    `Issue type: ${analysis.issueType ?? "none"}`,
    `Clarification required: ${analysis.needsClarification ? "yes" : "no"}`,
  ];

  if (analysis.clarificationQuestions.length > 0) {
    lines.push("");
    lines.push("Clarifying questions:");
    lines.push(...renderClarificationQuestions(analysis.clarificationQuestions));
  }

  if (analysis.issuePlan !== undefined) {
    lines.push(`Primary issue: ${analysis.issuePlan.primaryIssue.title}`);
    lines.push(`Primary workflow: ${analysis.issuePlan.primaryIssue.workflowId}`);
    lines.push(`Child issues planned: ${analysis.issuePlan.childIssues.length}`);
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
    `Workflow: ${input.issue.workflowId}`,
    `Type: ${input.issue.type}`,
    `Log: ${input.issue.logPath}`,
    "Start with 01-intake.md / clarification before implementation.",
  ];

  if (input.issue.parentIssueId !== undefined && input.issue.parentIssueId !== null) {
    lines.push(`Parent: ${input.issue.parentIssueId}`);
  }

  if (input.issue.childIssueIds !== undefined && input.issue.childIssueIds.length > 0) {
    lines.push(`Children: ${input.issue.childIssueIds.join(", ")}`);
  }

  if (input.analysis.needsClarification) {
    lines.push("Implementation is blocked until clarification questions are answered.");
  }

  return lines.join("\n");
}

function formatQuestionOrCasualSummary(analysis: RequestAnalysis): string {
  const lines = [
    "No issue created.",
    `Category: ${analysis.category}`,
    `Reason: ${analysis.reason}`,
    `Request: ${analysis.request}`,
    "Normal response can continue.",
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

function formatWorkflowStepSummary(
  issueId: string,
  status: string,
  nextStep: string | null,
  logPath: string,
): string {
  return [
    `Workflow step ${status} for ${issueId}.`,
    `Next step: ${nextStep ?? "complete"}`,
    `Log: ${logPath}`,
  ].join("\n");
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

async function persistWorkflowOutcome(input: {
  readonly rootDir: string;
  readonly workspace: Awaited<ReturnType<typeof loadIssueWorkspaceOrThrow>>;
  readonly workflow: Awaited<ReturnType<typeof buildWorkflowDefinition>>;
  readonly stepName: string;
  readonly outcome: Awaited<ReturnType<typeof runWorkflowStep>>;
}): Promise<CliResult> {
  const { rootDir, workspace, workflow, stepName, outcome } = input;

  if (outcome.nextStep === null) {
    const currentEvidence = [
      ...(await collectIssueEvidence(rootDir, workspace.issue.id)),
      ...outcome.state.evidence,
    ];

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
        await writeIssueWorkspaceState(rootDir, workspace.issue, blockedState, workspace.description);

        return {
          exitCode: 1,
          output: [
            `Workflow close blocked for ${workspace.issue.id}.`,
            message,
          ].join("\n"),
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

      await writeIssueWorkspaceState(rootDir, workspace.issue, blockedState, workspace.description);
      await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, blockedLogEntry);

      return {
        exitCode: 1,
        output: [
          `Workflow close blocked for ${workspace.issue.id}.`,
          `Review summary: ${reviewReport.summary}`,
          `Blocking roles: ${reviewCoordinator.blockingRoles.length === 0 ? "none" : reviewCoordinator.blockingRoles.join(", ")}`,
        ].join("\n"),
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
    await writeIssueWorkspaceState(rootDir, workspace.issue, outcome.state, workspace.description);
  } else {
    await appendLogEntryToIssue(rootDir, workspace.issue.id, workspace.issue.title, outcome.logEntry);
    await writeIssueWorkspaceState(rootDir, workspace.issue, outcome.state, workspace.description);
  }

  return {
    exitCode: outcome.status === "completed" ? 0 : 1,
    output: formatWorkflowStepSummary(workspace.issue.id, outcome.status, outcome.nextStep, workspace.issue.logPath),
  };
}

async function collectIssueEvidence(rootDir: string, issueId: string): Promise<readonly EvidenceRecord[]> {
  const issuePaths = resolveIssuePaths(rootDir, issueId);
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
  if (!(await pathExists(paths.configPath))) {
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

function renderRuleMarkdown(
  ruleId: string,
  title: string,
  description: string,
): string {
  return [
    `# ${title}`,
    "",
    `- Id: ${ruleId}`,
    "",
    "## Description",
    description,
    "",
  ].join("\n");
}

function createDecisionEvidenceSummary(evidence: readonly EvidenceRecord[]): string {
  return summarizeEvidence(evidence);
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
    ),
  };
}

async function runIssueCreateCommand(command: ParsedIssueCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const config = await readProjectConfig(rootDir);
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
  });

  return {
    exitCode: 0,
    output: formatIssueSummary(result),
  };
}

async function runRequestCreateCommand(command: ParsedRequestCreateCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  const analysis = analyzeRequest(command.request);

  if (!analysis.requiresIssue) {
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
    const childIssueIds = analysis.category === "multi_issue_project" && analysis.issuePlan !== undefined
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

    if (analysis.category === "multi_issue_project" && analysis.issuePlan !== undefined) {
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
    ],
    summary: reusedExistingIssue
      ? `Reused ${activeWorkspace.issue.id} for the analyzed request.`
      : `Created ${activeWorkspace.issue.id} for the analyzed request.`,
    nextStep: issueWorkflow.steps[0]?.name ?? null,
  });

  await appendLogEntryToIssue(rootDir, activeWorkspace.issue.id, activeWorkspace.issue.title, analysisLogEntry);

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
    createdDirectories.push(".agent/skills");
  }
  if (await ensureDirectory(paths.skillDir)) {
    createdDirectories.push(`.agent/skills/${command.skillId}`);
  }

  const skillMarkdown = renderSkillMarkdown(command.skillId, command.title, command.description);
  const skillWriteResult = await writeTextFile(paths.skillFile, skillMarkdown, command.force);
  if (skillWriteResult === "written") {
    createdFiles.push(`.agent/skills/${command.skillId}/SKILL.md`);
  } else {
    skippedFiles.push(`.agent/skills/${command.skillId}/SKILL.md`);
  }

  const readmeWriteResult = await writeTextFile(
    paths.readmeFile,
    `# ${command.title}\n\n${command.description}\n`,
    command.force,
  );
  if (readmeWriteResult === "written") {
    createdFiles.push(`.agent/skills/${command.skillId}/README.md`);
  } else {
    skippedFiles.push(`.agent/skills/${command.skillId}/README.md`);
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
  const paths = resolveRuleScaffoldPaths(rootDir, command.ruleId);
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];

  if (await ensureDirectory(paths.rulesDir)) {
    createdDirectories.push(".agent/rules");
  }

  const ruleWriteResult = await writeTextFile(
    paths.ruleFile,
    renderRuleMarkdown(command.ruleId, command.title, command.description),
    command.force,
  );
  if (ruleWriteResult === "written") {
    createdFiles.push(`.agent/rules/${command.ruleId}.md`);
  } else {
    skippedFiles.push(`.agent/rules/${command.ruleId}.md`);
  }

  return {
    exitCode: 0,
    output: formatRuleSummary(command.ruleId, command.title, paths.ruleFile, createdFiles, skippedFiles),
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
  }

  return {
    exitCode: 0,
    output: summary,
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

  const entries = await readdir(rulesDir, { withFileTypes: true });
  const rows: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const ruleId = entry.name.slice(0, -3);
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
  const workflow = await buildWorkflowDefinition(rootDir, workspace.issue.workflowId);
  const stepName = workspace.workflowState.currentStep || workflow.steps[0]?.name || "";
  if (stepName.length === 0) {
    return {
      exitCode: 1,
      output: `Workflow "${workflow.id}" does not contain any steps.`,
    };
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
  });
}

async function runWorkflowRecoverCommand(command: ParsedWorkflowRecoverCommand): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const workspace = await loadIssueWorkspaceOrThrow(rootDir, command.issueId);
  const workflow = await buildWorkflowDefinition(rootDir, workspace.issue.workflowId);
  const stepName = workspace.workflowState.currentStep || workflow.steps[0]?.name || "";
  if (stepName.length === 0) {
    return {
      exitCode: 1,
      output: `Workflow "${workflow.id}" does not contain any steps.`,
    };
  }

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
  });

  return {
    exitCode: retryResult.exitCode,
    output: [
      formatWorkflowRecoverSummary(workspace.issue.id, command.rootCause, workspace.issue.logPath),
      retryResult.output,
    ].join("\n"),
  };
}

async function runValidateCommand(): Promise<CliResult> {
  const rootDir = process.cwd();
  const errors: string[] = [];

  if (!(await pathExists(resolveWorkspacePaths(rootDir).configPath))) {
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
    ".agent",
    ".agent/issues",
    ".agent/logs",
    ".agent/workflows",
    ".agent/rules",
    ".agent/skills",
    ".agent/scripts",
    ".agent/templates",
    ".agent/prompts",
    ".agent/settings",
    ".flowness",
  ];

  for (const directory of requiredDirectories) {
    if (!(await pathExists(join(rootDir, directory)))) {
      errors.push(`Missing required directory: ${directory}`);
    }
  }

  const requiredPromptFiles = [
    ".agent/prompts/core-agent.md",
    ".agent/prompts/planning-agent.md",
    ".agent/prompts/review-agent.md",
    ".agent/prompts/research-agent.md",
    ".agent/prompts/architecture-agent.md",
  ];

  for (const file of requiredPromptFiles) {
    if (!(await pathExists(join(rootDir, file)))) {
      errors.push(`Missing required prompt file: ${file}`);
    }
  }

  const requiredScriptFiles = [
    ".agent/scripts/find-fqcn.py",
    ".agent/scripts/search-reference.py",
    ".agent/scripts/check-md-size.py",
  ];

  for (const file of requiredScriptFiles) {
    if (!(await pathExists(join(rootDir, file)))) {
      errors.push(`Missing required script file: ${file}`);
    }
  }

  return {
    exitCode: errors.length === 0 ? 0 : 1,
    output: formatWorkflowValidationSummary("workspace", errors),
  };
}

async function runUpgradeCommand(): Promise<CliResult> {
  const rootDir = process.cwd();
  await ensureInitializedProject(rootDir);
  const config = await readProjectConfig(rootDir);
  const result = await initializeProject({
    rootDir,
    projectName: config.projectName,
    force: false,
  });

  return {
    exitCode: 0,
    output: [
      `Upgraded Flowness project at ${result.rootDir}.`,
      `Created files: ${result.createdFiles.length === 0 ? "none" : result.createdFiles.join(", ")}`,
      `Skipped files: ${result.skippedFiles.length === 0 ? "none" : result.skippedFiles.join(", ")}`,
    ].join("\n"),
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
    createdDirectories.push(`.agent/workflows/${workflow.id}`);
  }
  if (await ensureDirectory(workflowPaths.stepsDir)) {
    createdDirectories.push(`.agent/workflows/${workflow.id}/steps`);
  }

  const workflowSource = renderWorkflowScaffoldSource(workflow);
  const workflowWriteResult = await writeTextFile(
    workflowPaths.workflowFile,
    workflowSource,
    command.force,
  );
  if (workflowWriteResult === "written") {
    createdFiles.push(`.agent/workflows/${workflow.id}/workflow.ts`);
  } else {
    skippedFiles.push(`.agent/workflows/${workflow.id}/workflow.ts`);
  }

  const readmeWriteResult = await writeTextFile(
    workflowPaths.workflowReadme,
    `# ${workflow.name}\n\nWorkflow scaffold generated by Flowness.\n\n- Id: ${workflow.id}\n- Step count: ${workflow.steps.length}\n`,
    command.force,
  );
  if (readmeWriteResult === "written") {
    createdFiles.push(`.agent/workflows/${workflow.id}/README.md`);
  } else {
    skippedFiles.push(`.agent/workflows/${workflow.id}/README.md`);
  }

  const stepsReadmeWriteResult = await writeTextFile(
    joinPaths(workflowPaths.stepsDir, "README.md"),
    "# Steps\n\nAdd step modules or supporting notes here.\n",
    command.force,
  );
  if (stepsReadmeWriteResult === "written") {
    createdFiles.push(`.agent/workflows/${workflow.id}/steps/README.md`);
  } else {
    skippedFiles.push(`.agent/workflows/${workflow.id}/steps/README.md`);
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

function usage(): string {
  return [
    "Flowness CLI",
    "",
    "Usage:",
    "  flowness init [path] [--name <project-name>] [--force]",
    "  flowness issue:create [--title <title>] --type <issue-type> [--workflow <workflow-id>] [--description <text>] [--force]",
    "  flowness request:create <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]",
    "  flowness skill:run --id <skill-id> [--issue <issue-id>] [--input <text>]",
    "  flowness workflow:create [workflow-id] [--name <display-name>] [--force]",
    "  flowness workflow:validate [workflow-id]",
    "  flowness workflow:step --issue <issue-id> [--approve]",
    "  flowness workflow:recover --issue <issue-id> --root-cause <text>",
    "  flowness decision:create --issue <issue-id> --title <title> --context <text> --decision <text> --alternatives <a,b> --consequences <x,y>",
    "  flowness review:run --issue <issue-id>",
    "  flowness skill:create [--id <skill-id>] --title <title> [--description <text>] [--force]",
    "  flowness skill:list",
    "  flowness rule:create [--id <rule-id>] [--title <title>] [--description <text>] [--force]",
    "  flowness rule:apply --id <rule-id> [--issue <issue-id>] [--input <text>]",
    "  flowness rule:list",
    "  flowness config:gate [--set <instruction>]",
    "  flowness validate",
    "  flowness upgrade",
    "",
    "Implemented commands:",
    "  init",
    "  issue:create",
    "  request:create",
    "  skill:run",
    "  workflow:create",
    "  workflow:validate",
    "  workflow:step",
    "  workflow:recover",
    "  decision:create",
    "  review:run",
    "  skill:create",
    "  skill:list",
    "  rule:create",
    "  rule:apply",
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
      return await runUpgradeCommand();
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
