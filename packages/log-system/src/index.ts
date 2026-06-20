import { appendTextFile, pathExists, readTextFile, writeTextFile } from "@flowness-labs/core";
import type { EvidenceRecord, LogEntry } from "@flowness-labs/core";
import { resolveExistingIssuePaths } from "@flowness-labs/core";

export interface ParsedIssueLogEntry {
  readonly timestamp: string;
  readonly step: string;
  readonly summary: string;
  readonly nextStep: string | null;
}

const maxEvidenceDetailLines = 3;
const maxEvidenceDetailChars = 240;

export function createLogEntry(input: {
  readonly timestamp: string;
  readonly step: string;
  readonly actions: readonly string[];
  readonly evidence: readonly EvidenceRecord[];
  readonly summary: string;
  readonly nextStep: string | null;
}): LogEntry {
  return {
    timestamp: input.timestamp,
    step: input.step,
    actions: [...input.actions],
    evidence: [...input.evidence],
    summary: input.summary,
    nextStep: input.nextStep,
  };
}

export function appendLogEntry(
  existing: readonly LogEntry[],
  entry: LogEntry,
): readonly LogEntry[] {
  return [...existing, entry];
}

export function formatLogFileName(issueId: string): string {
  return `${issueId}.md`;
}

function renderEvidenceLines(evidence: readonly EvidenceRecord[]): string[] {
  if (evidence.length === 0) {
    return ["- None"];
  }

  const lines: string[] = [];
  for (const item of evidence) {
    const location = item.location ? ` (${item.location})` : "";
    const detail = item.detail === undefined ? "" : ` - ${renderEvidenceDetailPreview(item.detail)}`;
    lines.push(`- [${item.kind}] ${item.title}${location}${detail}`);
  }
  return lines;
}

function renderEvidenceDetailPreview(detail: string): string {
  const normalized = detail.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return "";
  }

  const detailLines = normalized.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (detailLines.length === 0) {
    return "";
  }

  const firstLine = detailLines[0];
  if (detailLines.length === 1 && firstLine !== undefined && firstLine.length <= maxEvidenceDetailChars) {
    return firstLine;
  }

  const previewLines = detailLines.slice(0, maxEvidenceDetailLines);
  const preview = previewLines.join(" | ");
  if (preview.length <= maxEvidenceDetailChars && detailLines.length <= maxEvidenceDetailLines) {
    return preview;
  }

  return `${preview.slice(0, maxEvidenceDetailChars)}… (${detailLines.length} lines, trimmed)`;
}

export function renderLogEntryMarkdown(entry: LogEntry): string {
  return [
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

export function renderIssueLogMarkdown(
  issueId: string,
  issueTitle: string,
  entries: readonly LogEntry[],
): string {
  return [
    `# ${issueId} Log`,
    "",
    `- Issue: ${issueTitle}`,
    `- Log File: ${formatLogFileName(issueId)}`,
    "",
    ...entries.map((entry) => renderLogEntryMarkdown(entry)),
  ].join("\n");
}

function normalizeParsedNextStep(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || /^(none|null|complete|finish|finished)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function parseIssueLogEntryBlock(block: string): ParsedIssueLogEntry {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  const heading = lines[0]?.trim();
  if (heading === undefined || !heading.startsWith("## ")) {
    throw new Error("Malformed issue log entry: missing timestamp heading.");
  }

  const timestamp = heading.slice(3).trim();
  if (timestamp.length === 0) {
    throw new Error("Malformed issue log entry: missing timestamp.");
  }

  let step: string | undefined;
  let summary: string | undefined;
  let nextStep: string | null | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- Step: ")) {
      step = trimmed.slice(8).trim();
      continue;
    }

    if (trimmed.startsWith("- Summary: ")) {
      summary = trimmed.slice(11).trim();
      continue;
    }

    if (trimmed.startsWith("- Next Step: ")) {
      nextStep = normalizeParsedNextStep(trimmed.slice(13));
    }
  }

  if (step === undefined || step.length === 0) {
    throw new Error(`Malformed issue log entry at "${timestamp}": missing step.`);
  }

  if (summary === undefined || summary.length === 0) {
    throw new Error(`Malformed issue log entry at "${timestamp}": missing summary.`);
  }

  return {
    timestamp,
    step,
    summary,
    nextStep: nextStep ?? null,
  };
}

export function parseIssueLogMarkdown(source: string): readonly ParsedIssueLogEntry[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const blocks: string[] = [];
  const lines = normalized.split("\n");
  let currentBlock: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentBlock !== null) {
        blocks.push(currentBlock.join("\n"));
      }
      currentBlock = [line];
      continue;
    }

    if (currentBlock !== null) {
      currentBlock.push(line);
    }
  }

  if (currentBlock !== null) {
    blocks.push(currentBlock.join("\n"));
  }

  return blocks.map((block) => parseIssueLogEntryBlock(block));
}

export async function readIssueLogEntries(
  rootDir: string,
  issueId: string,
): Promise<readonly ParsedIssueLogEntry[]> {
  const paths = await resolveExistingIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.logFile))) {
    return [];
  }

  const markdown = await readTextFile(paths.logFile);
  return parseIssueLogMarkdown(markdown);
}

export async function readLatestIssueLogEntry(
  rootDir: string,
  issueId: string,
): Promise<ParsedIssueLogEntry | null> {
  const entries = await readIssueLogEntries(rootDir, issueId);
  return entries.at(-1) ?? null;
}

export async function appendLogEntryToIssue(
  rootDir: string,
  issueId: string,
  issueTitle: string,
  entry: LogEntry,
): Promise<string> {
  const paths = await resolveExistingIssuePaths(rootDir, issueId);
  const exists = await pathExists(paths.logFile);
  const rendered = renderLogEntryMarkdown(entry);

  if (!exists) {
    await writeTextFile(
      paths.logFile,
      renderIssueLogMarkdown(issueId, issueTitle, [entry]),
      true,
    );
    return paths.logFile;
  }

  await appendTextFile(paths.logFile, `\n${rendered}`);
  return paths.logFile;
}

export async function readIssueLogMarkdown(
  rootDir: string,
  issueId: string,
): Promise<string | null> {
  const paths = await resolveExistingIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.logFile))) {
    return null;
  }

  return readTextFile(paths.logFile);
}
