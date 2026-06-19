import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type {
  EvidenceRecord,
  GateMode,
  WorkflowDefinition,
  WorkflowStepContext,
  WorkflowStepDefinition,
} from "@flowness-labs/core";
import {
  createWorkflowDefinitionFromBlueprint,
  createGenericWorkflowDefinition,
  defineWorkflow,
  getBuiltinWorkflowDefinition,
  type WorkflowBlueprint,
} from "./index.js";
import {
  pathExists,
  readTextFile,
  resolveIssuePaths,
  resolveWorkflowScaffoldPaths,
} from "@flowness-labs/core";

async function importWorkflowModule(filePath: string): Promise<unknown> {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return import(pathToFileURL(filePath).href);
  }

  if (extension === ".py" || extension === ".sh") {
    const interpreters = extension === ".py" ? ["python3", "python"] : ["sh"];
    let lastError: Error | undefined;

    for (const interpreter of interpreters) {
      const result = spawnSync(interpreter, [filePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (result.error !== undefined) {
        lastError = result.error;
        continue;
      }

      if (result.status !== 0) {
        throw new Error(`Workflow script "${filePath}" failed: ${result.stderr.trim() || result.stdout.trim()}`);
      }

      const output = result.stdout.trim();
      if (output.length === 0) {
        throw new Error(`Workflow script "${filePath}" did not emit a workflow blueprint.`);
      }

      return JSON.parse(output) as unknown;
    }

    if (lastError !== undefined) {
      throw lastError;
    }

    throw new Error(`Unable to execute workflow script "${filePath}".`);
  }

  if (extension === ".ts" || extension === ".tsx") {
    const source = await readTextFile(filePath);
    const cacheKey = createHash("sha1").update(filePath).update("\0").update(source).digest("hex");
    const cacheDir = join(dirname(filePath), ".flowness-cache");
    const compiledPath = join(cacheDir, `${cacheKey}.mjs`);
    await mkdir(cacheDir, { recursive: true });
    const rewrittenSource = source.replace(
      /from\s+["'](@flowness-labs\/[^"']+)["']/g,
      (_match, specifier: string) => `from "${import.meta.resolve(specifier)}"`,
    );
    await writeFile(compiledPath, ts.transpileModule(rewrittenSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        sourceMap: false,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
      },
      fileName: filePath,
    }).outputText, "utf8");
    return import(pathToFileURL(compiledPath).href);
  }

  throw new Error(`Unsupported workflow source extension: ${extension || "(none)"}`);
}

function isWorkflowBlueprint(value: unknown): value is WorkflowBlueprint {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !Array.isArray(candidate.steps)) {
    return false;
  }

  return candidate.steps.every((step) => {
    if (step === null || typeof step !== "object") {
      return true;
    }

    return typeof (step as Record<string, unknown>).execute !== "function";
  });
}

function humanizeWorkflowId(workflowId: string): string {
  return workflowId
    .split(/[-_]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseMarkdownFrontmatter(source: string): Record<string, string> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const frontmatter: Record<string, string> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === "---") {
      break;
    }

    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match === null) {
      continue;
    }

    const key = match[1]?.trim();
    const rawValue = match[2]?.trim() ?? "";
    if (key !== undefined && key.length > 0) {
      frontmatter[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  return frontmatter;
}

function extractFirstHeading(source: string): string | undefined {
  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match !== null) {
      return match[1]?.trim();
    }
  }

  return undefined;
}

function collectMarkdownSectionLines(source: string, sectionTitle: string): readonly string[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const target = sectionTitle.trim().toLowerCase();
  const collected: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const heading = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading !== null) {
      if (inSection) {
        break;
      }

      const headingTitle = heading[2]?.trim().toLowerCase() ?? "";
      inSection = headingTitle === target;
      continue;
    }

    if (inSection) {
      collected.push(line);
    }
  }

  return collected.map((line) => line.trim()).filter((line) => line.length > 0);
}

function collectMarkdownBullets(lines: readonly string[]): readonly string[] {
  const bullets: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*[-*+]\s+(.*)$/);
    if (match !== null) {
      const value = match[1]?.trim();
      if (value !== undefined && value.length > 0) {
        bullets.push(value);
      }
    }
  }

  return bullets;
}

function normalizeWorkflowGate(value: string | undefined): "always" | "optional" | "never" | undefined {
  switch (value?.trim().toLowerCase()) {
    case "always":
      return "always";
    case "optional":
      return "optional";
    case "never":
      return "never";
    default:
      return undefined;
  }
}

function normalizeWorkflowNext(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (/^(none|null|complete|finish|finished)$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

async function collectMarkdownWorkflowEvidence(
  context: WorkflowStepContext,
  workflowName: string,
  stepName: string,
): Promise<readonly EvidenceRecord[]> {
  const issuePaths = resolveIssuePaths(context.rootDir, context.issueId);
  const candidates: Array<[string, string]> = [
    [issuePaths.issueFile, "issue.md"],
    [issuePaths.issueJsonFile, "issue.json"],
    [issuePaths.workflowStateFile, "workflow-state.json"],
    [issuePaths.logFile, `${context.issueId}.md`],
    [join(issuePaths.decisionsDir, "README.md"), "decisions/README.md"],
    [join(issuePaths.reviewsDir, "README.md"), "reviews/README.md"],
  ];

  const evidence: EvidenceRecord[] = [];
  for (const [location, title] of candidates) {
    if (await pathExists(location)) {
      evidence.push({
        kind: "file",
        title,
        location,
        detail: `${workflowName} step ${stepName}`,
      });
    }
  }

  return evidence;
}

interface MarkdownWorkflowStepBlueprint {
  readonly name: string;
  readonly preconditions: readonly string[];
  readonly successConditions: readonly string[];
  readonly humanGate?: GateMode;
  readonly next?: string | null;
}

function parseMarkdownWorkflowStep(
  source: string,
  workflowId: string,
  previousStepName: string | null,
): MarkdownWorkflowStepBlueprint {
  const frontmatter = parseMarkdownFrontmatter(source);
  const heading = extractFirstHeading(source) ?? frontmatter.name ?? humanizeWorkflowId(workflowId);
  const name = frontmatter.name?.trim() || heading;
  const preconditionLines = collectMarkdownBullets(collectMarkdownSectionLines(source, "Required Inputs"));
  const evidenceLines = collectMarkdownBullets(collectMarkdownSectionLines(source, "Evidence Required"));
  const exitLines = collectMarkdownBullets(collectMarkdownSectionLines(source, "Exit Criteria"));
  const explicitNext = normalizeWorkflowNext(frontmatter.next ?? collectMarkdownBullets(collectMarkdownSectionLines(source, "Next Step"))[0]);
  const humanGate = normalizeWorkflowGate(frontmatter.human_gate ?? frontmatter.humanGate);

  return {
    name,
    preconditions: preconditionLines.length > 0
      ? preconditionLines
      : previousStepName === null
        ? ["A request or issue exists."]
        : [`"${previousStepName}" has completed.`],
    successConditions: [...evidenceLines, ...exitLines].length > 0
      ? [...evidenceLines, ...exitLines]
      : [
        `The ${name.toLowerCase()} outcome is documented.`,
        "The next step is documented in the workflow.",
      ],
    ...(humanGate === undefined ? {} : { humanGate }),
    ...(explicitNext === undefined ? {} : { next: explicitNext }),
  };
}

async function readWorkflowTitle(
  workflowDir: string,
  workflowId: string,
): Promise<string> {
  const readmePath = join(workflowDir, "README.md");
  if (!(await pathExists(readmePath))) {
    return humanizeWorkflowId(workflowId);
  }

  const source = await readTextFile(readmePath);
  return extractFirstHeading(source) ?? humanizeWorkflowId(workflowId);
}

async function collectMarkdownWorkflowStepFiles(workflowDir: string): Promise<readonly string[]> {
  const entries = await readdir(workflowDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md")
    .map((entry) => entry.name)
    .sort();
}

async function loadMarkdownWorkflowDefinitionFromWorkspace(
  workflowDir: string,
  workflowId: string,
): Promise<WorkflowDefinition | undefined> {
  if (!(await pathExists(workflowDir))) {
    return undefined;
  }

  const stepFiles = await collectMarkdownWorkflowStepFiles(workflowDir);
  if (stepFiles.length === 0) {
    return undefined;
  }

  const workflowName = await readWorkflowTitle(workflowDir, workflowId);
  const stepSources = await Promise.all(stepFiles.map(async (fileName) => ({
    fileName,
    source: await readTextFile(join(workflowDir, fileName)),
  })));

  const stepBlueprints: MarkdownWorkflowStepBlueprint[] = [];
  for (let index = 0; index < stepSources.length; index += 1) {
    const previousStepName = index === 0 ? null : stepBlueprints[index - 1]?.name ?? null;
    const current = stepSources[index];
    if (current === undefined) {
      continue;
    }

    stepBlueprints.push(parseMarkdownWorkflowStep(
      current.source,
      workflowId,
      previousStepName,
    ));
  }

  const steps = stepBlueprints.map((blueprint, index) => {
    const resolvedNext = blueprint.next ?? stepBlueprints[index + 1]?.name ?? null;

    return {
      name: blueprint.name,
      preconditions: blueprint.preconditions,
      successConditions: blueprint.successConditions,
      ...(blueprint.humanGate === undefined ? {} : { humanGate: blueprint.humanGate }),
      next: resolvedNext,
      execute: async (context: WorkflowStepContext) => ({
        summary: `Prepared ${workflowName} step "${blueprint.name}".`,
        evidence: await collectMarkdownWorkflowEvidence(context, workflowName, blueprint.name),
        nextStep: resolvedNext,
      }),
    } satisfies WorkflowStepDefinition;
  });

  return defineWorkflow({
    id: workflowId,
    name: workflowName,
    steps,
  });
}

export async function loadWorkflowDefinitionFromFile(
  filePath: string,
): Promise<WorkflowDefinition> {
  const module = await importWorkflowModule(filePath);
  const candidate = module && typeof module === "object"
    ? (module as Record<string, unknown>).default ?? (module as Record<string, unknown>).workflow ?? module
    : module;

  if (candidate === null || typeof candidate !== "object") {
    throw new Error(`Workflow module "${filePath}" did not export a workflow definition.`);
  }

  if (isWorkflowBlueprint(candidate)) {
    return defineWorkflow(createWorkflowDefinitionFromBlueprint(candidate));
  }

  return defineWorkflow(candidate as WorkflowDefinition);
}

export async function loadWorkflowDefinitionFromWorkspace(
  rootDir: string,
  workflowId: string,
): Promise<WorkflowDefinition | undefined> {
  const workflowPaths = resolveWorkflowScaffoldPaths(rootDir, workflowId);
  const candidates = [
    workflowPaths.workflowFile,
    join(workflowPaths.workflowDir, "workflow.js"),
    join(workflowPaths.workflowDir, "workflow.mjs"),
    join(workflowPaths.workflowDir, "workflow.cjs"),
    join(workflowPaths.workflowDir, "workflow.tsx"),
    join(workflowPaths.workflowDir, "workflow.py"),
    join(workflowPaths.workflowDir, "workflow.sh"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return loadWorkflowDefinitionFromFile(candidate);
    }
  }

  const markdownWorkflow = await loadMarkdownWorkflowDefinitionFromWorkspace(
    workflowPaths.workflowDir,
    workflowId,
  );
  if (markdownWorkflow !== undefined) {
    return markdownWorkflow;
  }

  return undefined;
}

export async function loadWorkflowDefinition(
  rootDir: string,
  workflowId: string,
): Promise<WorkflowDefinition> {
  const loaded = await loadWorkflowDefinitionFromWorkspace(rootDir, workflowId);
  if (loaded !== undefined) {
    return loaded;
  }

  return getBuiltinWorkflowDefinition(workflowId)
    ?? createGenericWorkflowDefinition(workflowId, workflowId);
}
