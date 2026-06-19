import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { WorkflowDefinition } from "@flowness/core";
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
  resolveWorkflowScaffoldPaths,
} from "@flowness/core";

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
      /from\s+["'](@flowness\/[^"']+)["']/g,
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
