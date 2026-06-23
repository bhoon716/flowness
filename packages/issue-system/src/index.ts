import { readdir } from "node:fs/promises";
import type {
  EvidenceRecord,
  IssueDecomposition,
  IssueRecord,
  IssueState,
  IssueType,
  LogEntry,
  WorkflowDefinition,
  WorkflowState,
} from "@flowness-labs/core";
import {
  ensureDirectory,
  defaultWorkflowMapping,
  issueTypeValues,
  joinPaths,
  pathExists,
  readJsonFile,
  resolveExistingIssuePaths,
  resolveLegacyIssuePaths,
  resolveIssuePaths,
  resolveWorkspacePaths,
  slugifyReadable,
  toUpperSnake,
  writeJsonFile,
  writeTextFile,
} from "@flowness-labs/core";

export function selectWorkflowForIssueType(type: IssueType): string {
  return defaultWorkflowMapping[type];
}

export function formatIssueDirectoryName(issueId: string): string {
  return toUpperSnake(issueId);
}

export function createIssueId(sequence: number, title: string): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Issue sequence must be a positive integer.");
  }

  return createIssueIdFromSlug(sequence, createIssueSlugFromTitle(title));
}

export function createIssueSlugFromTitle(title: string): string {
  return slugifyReadable(title);
}

export function createIssueIdFromSlug(sequence: number, slug: string): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Issue sequence must be a positive integer.");
  }

  const sequencePart = String(sequence).padStart(3, "0");
  const titlePart = toUpperSnake(slug);
  return `ISSUE-${sequencePart}-${titlePart}`;
}

function extractIssueSequence(issueId: string): number | null {
  const match = issueId.match(/^ISSUE-(\d{3})-/);
  if (match?.[1] === undefined) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function collectIssueIdentityNames(rootDir: string): Promise<Set<string>> {
  const names = new Set<string>();
  const issueRoots = [
    resolveWorkspacePaths(rootDir).agentIssuesDir,
    joinPaths(rootDir, ".agent", "issues"),
  ];
  const logRoots = [
    resolveWorkspacePaths(rootDir).agentLogsDir,
    joinPaths(rootDir, ".agent", "logs"),
  ];

  for (const issueRoot of issueRoots) {
    if (!(await pathExists(issueRoot))) {
      continue;
    }

    const entries = await readdir(issueRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.add(entry.name);
      }
    }
  }

  for (const logRoot of logRoots) {
    if (!(await pathExists(logRoot))) {
      continue;
    }

    const entries = await readdir(logRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      names.add(entry.name.slice(0, -3));
    }
  }

  return names;
}

export interface IssueIdentityAllocation {
  readonly sequence: number;
  readonly slug: string;
  readonly issueId: string;
  readonly folderName: string;
  readonly issuePaths: ReturnType<typeof resolveIssuePaths>;
  readonly legacyIssuePaths: ReturnType<typeof resolveLegacyIssuePaths>;
  readonly collision: {
    readonly currentIssueDir: boolean;
    readonly legacyIssueDir: boolean;
    readonly currentLogFile: boolean;
    readonly legacyLogFile: boolean;
  };
  readonly safeToCreate: boolean;
}

export async function allocateIssueIdentity(
  rootDir: string,
  title: string,
  reservedIssueIds: readonly string[] = [],
): Promise<IssueIdentityAllocation> {
  const slug = createIssueSlugFromTitle(title);
  const reservedIds = new Set(reservedIssueIds);
  const reservedSequences = new Set(
    [...reservedIds]
      .map((issueId) => extractIssueSequence(issueId))
      .filter((sequence): sequence is number => sequence !== null),
  );
  const existingNames = await collectIssueIdentityNames(rootDir);
  const existingSequences = new Set(
    [...existingNames]
      .map((issueId) => extractIssueSequence(issueId))
      .filter((sequence): sequence is number => sequence !== null),
  );

  let sequence = findNextIssueSequenceFromNames([...existingNames, ...reservedIds]);
  while (existingSequences.has(sequence) || reservedSequences.has(sequence)) {
    sequence += 1;
  }

  while (true) {
    const issueId = createIssueIdFromSlug(sequence, slug);
    const issuePaths = resolveIssuePaths(rootDir, issueId);
    const legacyIssuePaths = resolveLegacyIssuePaths(rootDir, issueId);
    const collision = {
      currentIssueDir: await pathExists(issuePaths.issueDir),
      legacyIssueDir: await pathExists(legacyIssuePaths.issueDir),
      currentLogFile: await pathExists(issuePaths.logFile),
      legacyLogFile: await pathExists(legacyIssuePaths.logFile),
    };

    if (
      collision.currentIssueDir
      || collision.legacyIssueDir
      || collision.currentLogFile
      || collision.legacyLogFile
      || reservedIds.has(issueId)
      || existingNames.has(issueId)
    ) {
      sequence += 1;
      continue;
    }

    return {
      sequence,
      slug,
      issueId,
      folderName: formatIssueDirectoryName(issueId),
      issuePaths,
      legacyIssuePaths,
      collision,
      safeToCreate: true,
    };
  }
}

export function createIssueRecord(
  issue: Pick<IssueRecord, "id" | "type" | "title" | "createdAt" | "updatedAt"> & {
    readonly state?: IssueState;
    readonly workflowId?: string;
    readonly directory?: string;
    readonly logPath?: string;
    readonly parentIssueId?: string | null;
    readonly childIssueIds?: readonly string[];
    readonly goal?: string;
    readonly acceptanceCriteria?: readonly string[];
    readonly dependencies?: readonly string[];
    readonly evidenceRequired?: readonly string[];
    readonly decompositionFile?: string | null;
  },
): IssueRecord {
  const state = issue.state ?? "open";
  const workflowId = issue.workflowId ?? selectWorkflowForIssueType(issue.type);
  const directory = issue.directory ?? formatIssueDirectoryName(issue.id);
  const logPath = issue.logPath ?? `.flowness/logs/${issue.id}.md`;

  return {
    id: issue.id,
    type: issue.type,
    title: issue.title,
    state,
    workflowId,
    directory,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    logPath,
    ...(issue.parentIssueId === undefined ? {} : { parentIssueId: issue.parentIssueId }),
    ...(issue.childIssueIds === undefined ? {} : { childIssueIds: [...issue.childIssueIds] }),
    ...(issue.goal === undefined ? {} : { goal: issue.goal }),
    ...(issue.acceptanceCriteria === undefined ? {} : { acceptanceCriteria: [...issue.acceptanceCriteria] }),
    ...(issue.dependencies === undefined ? {} : { dependencies: [...issue.dependencies] }),
    ...(issue.evidenceRequired === undefined ? {} : { evidenceRequired: [...issue.evidenceRequired] }),
    ...(issue.decompositionFile === undefined ? {} : { decompositionFile: issue.decompositionFile }),
  };
}

function createInitialWorkflowState(
  workflow: WorkflowDefinition,
  startedAt: string,
  blocked = false,
): WorkflowState {
  return {
    workflowId: workflow.id,
    currentStep: workflow.steps[0]?.name ?? "",
    completedSteps: [],
    failedSteps: [],
    blocked,
    updatedAt: startedAt,
    evidence: [],
  };
}

export function findNextIssueSequenceFromNames(names: readonly string[]): number {
  const sequences = names
    .map((name) => {
      const match = name.match(/^ISSUE-(\d{3})-/);
      const sequence = match?.[1];
      return sequence === undefined ? null : Number.parseInt(sequence, 10);
    })
    .filter((value): value is number => value !== null);

  return (sequences.length === 0 ? 0 : Math.max(...sequences)) + 1;
}

export async function findNextIssueSequence(rootDir: string): Promise<number> {
  const issueDirs = [
    resolveWorkspacePaths(rootDir).agentIssuesDir,
    joinPaths(rootDir, ".agent", "issues"),
  ];

  const names = new Set<string>();
  for (const issueDir of issueDirs) {
    if (!(await pathExists(issueDir))) {
      continue;
    }

    const entries = await readdir(issueDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.add(entry.name);
      }
    }
  }

  return findNextIssueSequenceFromNames([...names]);
}

function renderIssueMarkdown(
  issue: IssueRecord,
  description: string | undefined,
  workflowStatePath: string,
): string {
  const renderList = (title: string, items: readonly string[] | undefined, fallback: string): string[] => {
    if (items === undefined) {
      return [];
    }

    if (items.length === 0) {
      return [title, fallback, ""];
    }

    return [title, ...items.map((item) => `- ${item}`), ""];
  };

  return [
    `# ${issue.id}`,
    "",
    `- Type: ${issue.type}`,
    `- State: ${issue.state}`,
    `- Workflow: ${issue.workflowId}`,
    `- Created At: ${issue.createdAt}`,
    `- Updated At: ${issue.updatedAt}`,
    `- Log: ${issue.logPath}`,
    `- Workflow State: ${workflowStatePath}`,
    ...(issue.parentIssueId === undefined || issue.parentIssueId === null ? [] : [`- Parent Issue: ${issue.parentIssueId}`]),
    ...(issue.childIssueIds === undefined || issue.childIssueIds.length === 0 ? [] : [`- Child Issues: ${issue.childIssueIds.join(", ")}`]),
    ...(issue.decompositionFile === undefined || issue.decompositionFile === null ? [] : [`- Decomposition: ${issue.decompositionFile}`]),
    "",
    "## Goal",
    issue.goal && issue.goal.trim().length > 0 ? issue.goal : (description && description.trim().length > 0 ? description : "No goal provided."),
    "",
    ...renderList("## Acceptance Criteria", issue.acceptanceCriteria, "No acceptance criteria provided."),
    ...renderList("## Dependencies", issue.dependencies, "No dependencies provided."),
    ...renderList("## Evidence Required", issue.evidenceRequired, "No evidence requirements provided."),
    "## Description",
    description && description.trim().length > 0 ? description : "No description provided.",
    "",
    "## Decisions",
    "- Decisions are stored under `decisions/`.",
    "",
  ].join("\n");
}

function createInitialIssueLogEntry(
  issue: IssueRecord,
  workflow: WorkflowDefinition,
  createdFiles: readonly string[],
): LogEntry {
  const evidence: EvidenceRecord[] = createdFiles.map((file) => ({
    kind: "file",
    title: file,
    location: file,
  }));

  return {
    timestamp: issue.createdAt,
    step: "Issue Created",
    actions: [
      `Created issue workspace for ${issue.id}`,
      `Selected workflow ${issue.workflowId}`,
      ...(issue.parentIssueId === undefined || issue.parentIssueId === null ? [] : [`Parent issue: ${issue.parentIssueId}`]),
      ...(issue.childIssueIds === undefined || issue.childIssueIds.length === 0 ? [] : [`Child issues: ${issue.childIssueIds.join(", ")}`]),
    ],
    evidence,
    summary: `Issue ${issue.id} was initialized with append-only log and workflow state.`,
    nextStep: workflow.steps[0]?.name ?? null,
  };
}

function issueWorkspaceMatchesInput(
  workspace: ReadIssueWorkspaceResult,
  input: CreateIssueWorkspaceInput,
): boolean {
  const issue = workspace.issue;
  return issue.title === input.title
    && issue.type === input.type
    && issue.workflowId === input.workflow.id
    && (issue.parentIssueId ?? null) === (input.parentIssueId ?? null)
    && (workspace.description ?? null) === (input.description ?? null);
}

async function findReusableIssueWorkspaceForInput(
  rootDir: string,
  input: CreateIssueWorkspaceInput,
): Promise<ReadIssueWorkspaceResult | null> {
  if (input.force === true || input.issueId !== undefined || input.sequence !== undefined) {
    return null;
  }

  const issueRoots = [
    resolveWorkspacePaths(rootDir).agentIssuesDir,
    joinPaths(rootDir, ".agent", "issues"),
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
      if (workspace !== null && issueWorkspaceMatchesInput(workspace, input)) {
        return workspace;
      }
    }
  }

  return null;
}

function deriveIssueState(workflowState: WorkflowState): IssueState {
  if (workflowState.blocked) {
    return "blocked";
  }

  if (workflowState.currentStep.length === 0 || workflowState.currentStep === "complete") {
    return "closed";
  }

  if (workflowState.completedSteps.length === 0) {
    return "open";
  }

  return "in_progress";
}

function renderEvidenceLines(evidence: readonly EvidenceRecord[]): string[] {
  if (evidence.length === 0) {
    return ["- None"];
  }

  return evidence.map((item) => {
    const location = item.location ? ` (${item.location})` : "";
    const detail = item.detail === undefined ? "" : ` - ${renderEvidenceDetailPreview(item.detail)}`;
    return `- [${item.kind}] ${item.title}${location}${detail}`;
  });
}

function renderEvidenceDetailPreview(detail: string): string {
  const normalized = detail.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return "";
  }

  const lines = normalized.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "";
  }

  if (lines.length === 1 && lines[0]!.length <= 240) {
    return lines[0]!;
  }

  const preview = lines.slice(0, 3).join(" | ");
  return `${preview.slice(0, 240)}… (${lines.length} lines, trimmed)`;
}

function renderIssueLogMarkdown(
  issueId: string,
  issueTitle: string,
  entry: LogEntry,
): string {
  return [
    `# ${issueId} Log`,
    "",
    `- Issue: ${issueTitle}`,
    `- Log File: .flowness/logs/${issueId}.md`,
    "",
    `## ${entry.timestamp}`,
    "",
    `- Step: ${entry.step}`,
    "- Actions:",
    ...entry.actions.map((action) => `  - ${action}`),
    "- Evidence:",
    ...renderEvidenceLines(entry.evidence).map((line) => `  ${line}`),
    `- Summary: ${entry.summary}`,
    `- Next Step: ${entry.nextStep ?? "none"}`,
    "",
  ].join("\n");
}

function renderReviewsReadme(issueId: string) {
  return [
    "# Reviews",
    "",
    `Review reports for ${issueId} live here.`,
    "",
  ].join("\n");
}

export interface CreateIssueWorkspaceInput {
  readonly rootDir: string;
  readonly title: string;
  readonly intent?: string;
  readonly type: IssueType;
  readonly workflow: WorkflowDefinition;
  readonly description?: string;
  readonly force?: boolean;
  readonly issueId?: string;
  readonly sequence?: number;
  readonly createdAt?: string;
  readonly initialState?: IssueState;
  readonly parentIssueId?: string | null;
  readonly childIssueIds?: readonly string[];
  readonly goal?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly dependencies?: readonly string[];
  readonly evidenceRequired?: readonly string[];
  readonly decomposition?: IssueDecomposition;
}

export interface CreateIssueWorkspaceResult {
  readonly issue: IssueRecord;
  readonly workflowState: WorkflowState;
  readonly initialLogEntry: LogEntry;
  readonly createdFiles: readonly string[];
  readonly issuePaths: ReturnType<typeof resolveIssuePaths>;
  readonly reusedExisting: boolean;
}

export interface ReadIssueWorkspaceResult {
  readonly issue: IssueRecord;
  readonly workflowState: WorkflowState;
  readonly description: string | null;
  readonly issuePaths: ReturnType<typeof resolveIssuePaths> & { readonly isLegacy: boolean };
}

export async function createIssueWorkspace(
  input: CreateIssueWorkspaceInput,
): Promise<CreateIssueWorkspaceResult> {
  if (!issueTypeValues.includes(input.type)) {
    throw new Error(`Unsupported issue type: ${input.type}`);
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const force = input.force ?? false;
  if (!force) {
    const reusableWorkspace = await findReusableIssueWorkspaceForInput(input.rootDir, input);
    if (reusableWorkspace !== null) {
      return {
        issue: reusableWorkspace.issue,
        workflowState: reusableWorkspace.workflowState,
        initialLogEntry: createInitialIssueLogEntry(reusableWorkspace.issue, input.workflow, []),
        createdFiles: [],
        issuePaths: reusableWorkspace.issuePaths,
        reusedExisting: true,
      };
    }
  }

  const issueId = input.issueId ?? (
    input.sequence === undefined
      ? (await allocateIssueIdentity(input.rootDir, input.title)).issueId
      : createIssueId(input.sequence, input.title)
  );
  const issuePaths = resolveIssuePaths(input.rootDir, issueId);
  const legacyIssuePaths = resolveLegacyIssuePaths(input.rootDir, issueId);
  const createdFiles: string[] = [];

  if (!force && (await pathExists(issuePaths.issueDir) || await pathExists(legacyIssuePaths.issueDir))) {
    throw new Error(`Issue already exists: ${issueId}`);
  }

  await ensureDirectory(issuePaths.issueDir);
  await ensureDirectory(issuePaths.decisionsDir);
  await ensureDirectory(issuePaths.reviewsDir);

  const issue = createIssueRecord({
    id: issueId,
    type: input.type,
    title: input.title,
    state: input.initialState ?? "open",
    workflowId: input.workflow.id,
    directory: formatIssueDirectoryName(issueId),
    logPath: `.flowness/logs/${issueId}.md`,
    createdAt,
    updatedAt: createdAt,
    ...(input.parentIssueId === undefined ? {} : { parentIssueId: input.parentIssueId }),
    ...(input.childIssueIds === undefined ? {} : { childIssueIds: [...input.childIssueIds] }),
    ...(input.goal === undefined ? {} : { goal: input.goal }),
    ...(input.acceptanceCriteria === undefined ? {} : { acceptanceCriteria: [...input.acceptanceCriteria] }),
    ...(input.dependencies === undefined ? {} : { dependencies: [...input.dependencies] }),
    ...(input.evidenceRequired === undefined ? {} : { evidenceRequired: [...input.evidenceRequired] }),
    ...(input.decomposition === undefined ? {} : { decompositionFile: issuePaths.decompositionFile }),
  });

  const workflowState = createInitialWorkflowState(
    input.workflow,
    createdAt,
    input.initialState === "blocked",
  );
  const issueJson = {
    issue,
    description: input.description ?? null,
    workflowState,
    workflowStatePath: issuePaths.workflowStateFile,
    logPath: issue.logPath,
    ...(input.decomposition === undefined ? {} : { decomposition: input.decomposition }),
  };

  await writeTextFile(
    issuePaths.issueFile,
    renderIssueMarkdown(issue, input.description, issuePaths.workflowStateFile),
    force,
  );
  createdFiles.push("issue.md");

  await writeJsonFile(issuePaths.issueJsonFile, issueJson, force);
  createdFiles.push("issue.json");

  await writeJsonFile(issuePaths.workflowStateFile, workflowState, force);
  createdFiles.push("workflow-state.json");

  if (input.decomposition !== undefined) {
    await writeJsonFile(issuePaths.decompositionFile, input.decomposition, force);
    createdFiles.push("decomposition.json");
  }

  await writeTextFile(
    `${issuePaths.decisionsDir}/README.md`,
    "# Decisions\n\nDecision documents for this issue live in this directory.\n",
    force,
  );
  createdFiles.push("decisions/README.md");

  await writeTextFile(
    `${issuePaths.reviewsDir}/README.md`,
    renderReviewsReadme(issue.id),
    force,
  );
  createdFiles.push("reviews/README.md");

  const initialLogEntry = createInitialIssueLogEntry(issue, input.workflow, createdFiles);
  const logWriteResult = await writeTextFile(
    issuePaths.logFile,
    renderIssueLogMarkdown(issue.id, issue.title, initialLogEntry),
    false,
  );
  if (logWriteResult === "written") {
    createdFiles.push(`.flowness/logs/${issue.id}.md`);
  }

  return {
    issue,
    workflowState,
    initialLogEntry,
    createdFiles,
    issuePaths,
    reusedExisting: false,
  };
}

export async function readIssueWorkspace(
  rootDir: string,
  issueId: string,
): Promise<ReadIssueWorkspaceResult | null> {
  const issuePaths = await resolveExistingIssuePaths(rootDir, issueId);
  if (!(await pathExists(issuePaths.issueJsonFile)) || !(await pathExists(issuePaths.workflowStateFile))) {
    return null;
  }

  const issueJson = await readJsonFile<{
    issue: IssueRecord;
    description: string | null;
    workflowState: WorkflowState;
  }>(issuePaths.issueJsonFile);
  const workflowState = await readJsonFile<WorkflowState>(issuePaths.workflowStateFile);

  return {
    issue: issueJson.issue,
    workflowState,
    description: issueJson.description,
    issuePaths,
  };
}

export async function writeIssueWorkspaceState(
  rootDir: string,
  issue: IssueRecord,
  workflowState: WorkflowState,
  description: string | null,
): Promise<ReadIssueWorkspaceResult> {
  const issuePaths = await resolveExistingIssuePaths(rootDir, issue.id);
  const nextIssue: IssueRecord = {
    ...issue,
    state: deriveIssueState(workflowState),
    updatedAt: workflowState.updatedAt,
  };

  await writeJsonFile(
    issuePaths.issueJsonFile,
    {
      issue: nextIssue,
      description,
      workflowState,
      workflowStatePath: issuePaths.workflowStateFile,
      logPath: nextIssue.logPath,
    },
    true,
  );
  await writeJsonFile(issuePaths.workflowStateFile, workflowState, true);
  await writeTextFile(
    issuePaths.issueFile,
    renderIssueMarkdown(nextIssue, description ?? undefined, issuePaths.workflowStateFile),
    true,
  );

  return {
    issue: nextIssue,
    workflowState,
    description,
    issuePaths,
  };
}
