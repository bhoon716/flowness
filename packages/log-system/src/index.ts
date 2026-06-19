import { appendTextFile, pathExists, readTextFile, writeTextFile } from "@flowness/core";
import type { EvidenceRecord, LogEntry } from "@flowness/core";
import { resolveIssuePaths } from "@flowness/core";

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
    const detail = item.detail ? ` - ${item.detail}` : "";
    lines.push(`- [${item.kind}] ${item.title}${location}${detail}`);
  }
  return lines;
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

export async function appendLogEntryToIssue(
  rootDir: string,
  issueId: string,
  issueTitle: string,
  entry: LogEntry,
): Promise<string> {
  const paths = resolveIssuePaths(rootDir, issueId);
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
  const paths = resolveIssuePaths(rootDir, issueId);
  if (!(await pathExists(paths.logFile))) {
    return null;
  }

  return readTextFile(paths.logFile);
}
