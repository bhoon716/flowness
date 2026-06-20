import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

export interface TestRunSummary {
  readonly command: string;
  readonly passed: boolean;
  readonly passCount: number | null;
  readonly failCount: number | null;
  readonly failedTests: readonly string[];
  readonly expected: string | null;
  readonly actual: string | null;
  readonly relevantFiles: readonly string[];
  readonly suggestedNextCommand: string;
  readonly rawOutputPath: string | null;
  readonly summary: string;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .trim();
}

function compactWhitespace(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function stripDecoration(value: string): string {
  return value
    .replace(/^['"`(<\[]+/, "")
    .replace(/['"`>)\],.;:!]+$/, "");
}

function normalizePathForProject(rootDir: string, candidate: string): string {
  let value = stripDecoration(candidate.trim());
  if (value.length === 0) {
    return "";
  }

  if (value.startsWith("file://")) {
    try {
      value = fileURLToPath(new URL(value));
    } catch {
      return "";
    }
  }

  value = value.replace(/\\/g, "/");
  const wasDistPath = value.includes("/dist/");

  if (/^[A-Za-z]:\//.test(value) || value.startsWith("/")) {
    value = relative(rootDir, resolve(value)).replace(/\\/g, "/");
  }

  value = value.replace(/:\d+(?::\d+)?$/, "");
  value = value.replace(/\/dist\//g, "/src/");

  if (wasDistPath && /\.test\.js$/i.test(value)) {
    value = value.replace(/\.js$/i, ".ts");
  } else if (wasDistPath && /\.spec\.js$/i.test(value)) {
    value = value.replace(/\.js$/i, ".ts");
  } else if (wasDistPath && /\.jsx$/i.test(value)) {
    value = value.replace(/\.jsx$/i, ".tsx");
  } else if (wasDistPath && /\.js$/i.test(value)) {
    value = value.replace(/\.js$/i, ".ts");
  }

  return value.replace(/^\.\//, "");
}

function extractFailedTests(output: string): string[] {
  const failedTests: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const tapMatch = line.match(/^not ok \d+ - (.+)$/);
    if (tapMatch?.[1] !== undefined) {
      const captured = tapMatch[1].trim();
      if (!captured.endsWith(":")) {
        const value = stripDecoration(compactWhitespace(captured));
        failedTests.push(value);
      }
      continue;
    }

    const nodeMatch = line.match(/^[✖✘]\s+(.+?)(?:\s+\([^)]*\))?$/);
    if (nodeMatch?.[1] !== undefined) {
      const captured = nodeMatch[1].trim();
      if (!captured.endsWith(":")) {
        const value = stripDecoration(compactWhitespace(captured));
        failedTests.push(value);
      }
    }
  }

  return [...new Set(failedTests.filter((value) => value.length > 0))];
}

function extractExpectedActual(output: string): { readonly expected: string | null; readonly actual: string | null } {
  let expected: string | null = null;
  let actual: string | null = null;

  for (const line of output.split(/\r?\n/)) {
    if (expected === null) {
      const expectedMatch = line.match(/^\s*expected:\s*(.+)$/i);
      if (expectedMatch?.[1] !== undefined) {
        expected = stripDecoration(compactWhitespace(expectedMatch[1]));
        continue;
      }
    }

    if (actual === null) {
      const actualMatch = line.match(/^\s*actual:\s*(.+)$/i);
      if (actualMatch?.[1] !== undefined) {
        actual = stripDecoration(compactWhitespace(actualMatch[1]));
      }
    }
  }

  return {
    expected,
    actual,
  };
}

function extractRelevantFiles(rootDir: string, output: string): string[] {
  const files = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const candidates = line.match(/(?:file:\/\/)?(?:[A-Za-z]:)?[^ \t"'`]+?\.(?:ts|tsx|js|jsx|mjs|cjs|py|md|json)(?::\d+(?::\d+)?)?(?![A-Za-z0-9_])/g) ?? [];

    for (const candidate of candidates) {
      const normalized = normalizePathForProject(rootDir, candidate);
      if (normalized.length === 0) {
        continue;
      }

      files.add(normalized);
    }
  }

  return [...files].sort((left, right) => left.localeCompare(right));
}

function extractCount(patterns: readonly RegExp[], output: string): number | null {
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1] === undefined) {
      continue;
    }

    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function buildSuggestedNextCommand(input: {
  readonly failedTests: readonly string[];
  readonly relevantFiles: readonly string[];
  readonly passed: boolean;
}): string {
  if (!input.passed) {
    const testFile = input.relevantFiles.find((file) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file));
    if (testFile !== undefined) {
      return `npm run build && node --test ${toNodeTestTarget(testFile)}`;
    }

    if (input.failedTests.length > 0) {
      return `npm run build && node --test <${input.failedTests[0]}>`;
    }

    return "npm test";
  }

  return "flowness step --issue ISSUE-ID";
}

function toNodeTestTarget(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/src/")) {
    return normalized
      .replace("/src/", "/dist/")
      .replace(/\.(ts|tsx|jsx)$/i, ".js");
  }

  return normalized.replace(/\.(ts|tsx|jsx)$/i, ".js");
}

export function summarizeTestRunOutput(input: {
  readonly rootDir: string;
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr?: string;
  readonly rawOutputPath?: string | null;
}): TestRunSummary {
  const output = [input.stdout, input.stderr ?? ""]
    .filter((chunk) => chunk.trim().length > 0)
    .join("\n");

  const failedTests = extractFailedTests(output);
  const { expected, actual } = extractExpectedActual(output);
  const passCount = extractCount([/^\s*# pass (\d+)\s*$/m, /^\s*ℹ pass (\d+)\s*$/m], output);
  const failCount = extractCount([/^\s*# fail (\d+)\s*$/m, /^\s*ℹ fail (\d+)\s*$/m], output);
  const totalCount = extractCount([/^\s*# tests (\d+)\s*$/m, /^\s*ℹ tests (\d+)\s*$/m], output);
  const relevantFiles = extractRelevantFiles(input.rootDir, output);
  const passed = input.exitCode === 0 && (failCount === null || failCount === 0);
  const resolvedPassCount = passCount ?? (totalCount !== null && failCount !== null ? Math.max(totalCount - failCount, 0) : null);
  const resolvedFailCount = failCount ?? (passed ? 0 : (failedTests.length > 0 ? failedTests.length : null));
  const suggestedNextCommand = buildSuggestedNextCommand({
    failedTests,
    relevantFiles,
    passed,
  });

  const summary = passed
    ? resolvedPassCount === null
      ? `Passed tests for ${input.command}.`
      : `Passed ${resolvedPassCount} test(s) for ${input.command}.`
    : resolvedFailCount === null
      ? `Failed tests for ${input.command}.`
      : `Failed ${resolvedFailCount} test(s) for ${input.command}.`;

  return {
    command: input.command,
    passed,
    passCount: resolvedPassCount,
    failCount: resolvedFailCount,
    failedTests,
    expected,
    actual,
    relevantFiles,
    suggestedNextCommand,
    rawOutputPath: input.rawOutputPath ?? null,
    summary,
  };
}
