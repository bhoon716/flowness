import { mkdir, readdir } from "node:fs/promises";
import type { DecisionDocument, EvidenceRecord } from "@flowness-labs/core";
import {
  joinPaths,
  pathExists,
  readTextFile,
  slugify,
  writeTextFile,
} from "@flowness-labs/core";
import { resolveIssuePaths } from "@flowness-labs/core";

export function formatDecisionFileName(
  sequence: number,
  issueSlug: string,
  topic: string,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Decision sequence must be a positive integer.");
  }

  const sequencePart = String(sequence).padStart(3, "0");
  const issuePart = slugify(issueSlug).toUpperCase();
  const topicPart = slugify(topic).toUpperCase();
  return `DEC-${sequencePart}-${issuePart}-${topicPart}.md`;
}

export function createDecisionDocument(
  input: Omit<DecisionDocument, "fileName"> & { readonly sequence: number },
): DecisionDocument {
  if (input.context.trim().length === 0) {
    throw new Error("Decision context must not be empty.");
  }

  if (input.decision.trim().length === 0) {
    throw new Error("Decision text must not be empty.");
  }

  if (input.alternatives.length === 0) {
    throw new Error("Decision alternatives must not be empty.");
  }

  if (input.consequences.length === 0) {
    throw new Error("Decision consequences must not be empty.");
  }

  if (input.evidence.length === 0) {
    throw new Error("Decision evidence must not be empty.");
  }

  return {
    ...input,
    fileName: formatDecisionFileName(input.sequence, input.issueId, input.title),
  };
}

function renderListItems(items: readonly string[]): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.map((item) => `- ${item}`);
}

function renderEvidenceItems(items: readonly EvidenceRecord[]): string[] {
  if (items.length === 0) {
    return ["- None"];
  }

  return items.map((item) => {
    const location = item.location ? ` (${item.location})` : "";
    const detail = item.detail ? ` - ${item.detail}` : "";
    return `- [${item.kind}] ${item.title}${location}${detail}`;
  });
}

export function renderDecisionMarkdown(document: DecisionDocument): string {
  return [
    `# ${document.fileName}`,
    "",
    "## Context",
    document.context,
    "",
    "## Decision",
    document.decision,
    "",
    "## Alternatives",
    ...renderListItems(document.alternatives),
    "",
    "## Consequences",
    ...renderListItems(document.consequences),
    "",
    "## Evidence",
    ...renderEvidenceItems(document.evidence),
    "",
  ].join("\n");
}

function extractSequence(fileName: string): number | null {
  const match = fileName.match(/^DEC-(\d{3})-/);
  if (!match) {
    return null;
  }

  const sequence = match[1];
  if (sequence === undefined) {
    return null;
  }

  return Number.parseInt(sequence, 10);
}

export async function findNextDecisionSequence(
  rootDir: string,
  issueId: string,
): Promise<number> {
  const paths = resolveIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.decisionsDir))) {
    return 1;
  }

  const entries = await readdir(paths.decisionsDir);
  const sequences = entries
    .map((entry) => extractSequence(entry))
    .filter((value): value is number => value !== null);

  return (sequences.length === 0 ? 0 : Math.max(...sequences)) + 1;
}

export async function writeDecisionDocumentToIssue(
  rootDir: string,
  document: Omit<DecisionDocument, "fileName"> & { readonly sequence?: number },
  force = false,
): Promise<DecisionDocument & { readonly filePath: string }> {
  const paths = resolveIssuePaths(rootDir, document.issueId);
  await mkdir(paths.decisionsDir, { recursive: true });
  const sequence = document.sequence ?? await findNextDecisionSequence(rootDir, document.issueId);
  const fullDocument = createDecisionDocument({
    ...document,
    sequence,
  });
  const filePath = joinPaths(paths.decisionsDir, fullDocument.fileName);
  await writeTextFile(filePath, renderDecisionMarkdown(fullDocument), force);
  return {
    ...fullDocument,
    filePath,
  };
}

export async function readDecisionDocument(
  rootDir: string,
  issueId: string,
  fileName: string,
): Promise<string | null> {
  const paths = resolveIssuePaths(rootDir, issueId);
  const filePath = joinPaths(paths.decisionsDir, fileName);
  if (!(await pathExists(filePath))) {
    return null;
  }

  return readTextFile(filePath);
}

export async function listDecisionDocuments(
  rootDir: string,
  issueId: string,
): Promise<readonly string[]> {
  const paths = resolveIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.decisionsDir))) {
    return [];
  }

  const entries = await readdir(paths.decisionsDir);
  return entries
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .sort();
}
