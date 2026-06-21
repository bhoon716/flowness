import { readdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { ProjectAnalysis } from "./init-scaffold.js";
import {
  joinPaths,
  pathExists,
  readTextFile,
  slugify,
} from "./filesystem.js";

export interface ContextIndexArea {
  readonly area: string;
  readonly purpose: string;
  readonly entryFiles: readonly string[];
  readonly tests: readonly string[];
  readonly symbols: readonly string[];
  readonly aliases: readonly string[];
  readonly commands: readonly string[];
}

export interface ContextIndex {
  readonly projectName: string;
  readonly areas: readonly ContextIndexArea[];
}

export interface LocateContextResult {
  readonly area: string;
  readonly readFirst: readonly string[];
  readonly symbols: readonly string[];
  readonly tests: readonly string[];
  readonly commands: readonly string[];
  readonly doNotReadYet: readonly string[];
}

interface ScoredArea {
  readonly area: ContextIndexArea;
  readonly score: number;
}

const locateDoNotReadYet = [
  "closed issues",
  "all logs",
  "all workflows",
  "all rules",
  "generated archives",
] as const;

const moduleStopwords = new Set([
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
  "small",
  "read",
  "use",
  "useful",
  "current",
  "project",
  "file",
  "files",
]);

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value: string): readonly string[] {
  const normalized = normalizeSearchText(value);
  if (normalized.length === 0) {
    return [];
  }

  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !moduleStopwords.has(token));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function splitWords(value: string): string[] {
  return unique(
    normalizeSearchText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  );
}

function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/\.(test|spec)$/i, "");
}

function isTestFile(fileName: string): boolean {
  return /\.(test|spec)\.[^.]+$/i.test(fileName);
}

function isSourceFile(fileName: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|md|sh)$/i.test(fileName) && !fileName.endsWith(".d.ts");
}

function isReadableEntryFile(fileName: string): boolean {
  return isSourceFile(fileName) && !isTestFile(fileName) && !/^readme(\.[^.]+)?$/i.test(fileName);
}

function extractExportedSymbols(source: string): string[] {
  const symbols = new Set<string>();
  const capturePatterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  ];

  for (const pattern of capturePatterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) {
        symbols.add(match[1]);
      }
    }
  }

  for (const match of source.matchAll(/export\s*{\s*([^}]+)\s*}/g)) {
    const list = match[1];
    if (list === undefined) {
      continue;
    }

    for (const part of list.split(",")) {
      const cleaned = part.trim();
      if (cleaned.length === 0) {
        continue;
      }

      const alias = cleaned.split(/\s+as\s+/i).at(-1)?.trim();
      if (alias && alias.length > 0) {
        symbols.add(alias);
      }
    }
  }

  return [...symbols].sort((left, right) => left.localeCompare(right));
}

function detectPackageName(sourceDir: string): string | null {
  const match = sourceDir.match(/^packages\/([^/]+)\/src$/);
  if (match?.[1] !== undefined) {
    return match[1];
  }

  return null;
}

function deriveAreaName(sourceDir: string, candidateFileName: string, projectName: string): string {
  const stem = fileStem(candidateFileName);
  if (stem !== "index") {
    return slugify(stem);
  }

  const packageName = detectPackageName(sourceDir);
  if (packageName !== null) {
    return slugify(packageName);
  }

  const parent = basename(dirname(sourceDir));
  if (parent.length > 0 && parent !== "." && parent !== "/") {
    return slugify(parent);
  }

  return slugify(projectName || "app");
}

function buildPurpose(areaName: string, candidateFileName: string, symbols: readonly string[], sourceDir: string): string {
  const joined = normalizeSearchText([areaName, candidateFileName, ...symbols].join(" "));
  if (/\b(request|routing|analysis|analyze|issue)\b/.test(joined)) {
    return "Analyze requests and route work into the right issue path.";
  }

  if (/\b(cli|command|commands|parse|run|status|step|audit|test|locate)\b/.test(joined)) {
    return "Parse commands and dispatch CLI behavior.";
  }

  if (/\b(workflow|runtime|gate|state|step)\b/.test(joined)) {
    return "Execute workflow steps and manage workflow state.";
  }

  if (/\b(scaffold|init|bootstrap|setup)\b/.test(joined)) {
    return "Generate project scaffolding and bootstrap artifacts.";
  }

  if (/\b(log|logs|history|append)\b/.test(joined)) {
    return "Render and append append-only issue logs.";
  }

  if (/\b(review|findings|report)\b/.test(joined)) {
    return "Capture review output, separate hard blockers from deferrable blockers, and keep findings concise.";
  }

  if (/\b(decision|rationale|choice)\b/.test(joined)) {
    return "Record decision documents and supporting evidence.";
  }

  if (/\b(evidence|artifact|proof)\b/.test(joined)) {
    return "Normalize and validate evidence records.";
  }

  if (/\b(config|configuration|settings)\b/.test(joined)) {
    return "Load and write project configuration.";
  }

  if (/\b(template|templates|prompt|prompts)\b/.test(joined)) {
    return "Hold project templates and starter text.";
  }

  if (/\b(rule|rules|policy)\b/.test(joined)) {
    return "Store rules and workflow policies.";
  }

  if (/\b(skill|skills)\b/.test(joined)) {
    return "Store reusable skills and task helpers.";
  }

  return `Core files under ${sourceDir}.`;
}

function buildAliases(areaName: string, candidateFileName: string, purpose: string, symbols: readonly string[]): string[] {
  const aliases = new Set<string>([
    areaName,
    ...splitWords(areaName),
    fileStem(candidateFileName),
    ...splitWords(fileStem(candidateFileName)),
    ...splitWords(candidateFileName),
  ]);

  if (areaName === "request-routing" || /\brequest\b|\brouting\b/i.test(purpose)) {
    ["request", "routing", "analysis", "issue routing", "request analysis", "request create", "issue create"].forEach((alias) => aliases.add(alias));
  }

  if (/\bcli\b|\bcommand\b/i.test(purpose)) {
    ["cli", "command", "commands", "parse", "run", "status", "step", "audit", "test", "locate"].forEach((alias) => aliases.add(alias));
  }

  if (/\bworkflow\b/i.test(purpose)) {
    ["workflow", "state", "step", "gate"].forEach((alias) => aliases.add(alias));
  }

  if (/\blog\b/i.test(purpose)) {
    ["log", "logs", "history", "append-only"].forEach((alias) => aliases.add(alias));
  }

  if (/\breview\b|\bfinding\b/i.test(purpose)) {
    ["review", "findings", "report", "blocking finding"].forEach((alias) => aliases.add(alias));
  }

  if (/\bscaffold\b/i.test(purpose)) {
    ["scaffold", "init", "bootstrap", "setup"].forEach((alias) => aliases.add(alias));
  }

  if (/\bevidence\b/i.test(purpose)) {
    ["evidence", "artifact", "proof"].forEach((alias) => aliases.add(alias));
  }

  for (const symbol of symbols) {
    aliases.add(symbol);
    for (const word of splitWords(symbol)) {
      aliases.add(word);
    }
  }

  return [...aliases].filter((alias) => alias.trim().length > 0).sort((left, right) => left.localeCompare(right));
}

function buildCommands(analysis: ProjectAnalysis, purpose: string): string[] {
  const commands: string[] = [];

  if (/\brequest\b|\brouting\b/i.test(purpose)) {
    if (analysis.buildCommand !== null) {
      commands.push(analysis.buildCommand);
    }
    if (analysis.testCommand !== null) {
      commands.push(analysis.testCommand);
    }
    if (analysis.lintCommand !== null) {
      commands.push(analysis.lintCommand);
    }
  } else if (/\bworkflow\b|\bstate\b|\bgate\b/i.test(purpose)) {
    commands.push("flowness status --issue ISSUE-ID");
    commands.push("flowness step --issue ISSUE-ID");
    commands.push("flowness audit --changed");
  } else if (/\breview\b|\bfinding\b/i.test(purpose)) {
    commands.push("flowness review:run --issue ISSUE-ID");
    commands.push("flowness evidence:add --issue ISSUE-ID --kind file --title \"...\" --location path");
  } else if (/\blog\b/i.test(purpose)) {
    commands.push("flowness evidence:add --issue ISSUE-ID --kind command_output --title \"...\"");
    commands.push("flowness status --issue ISSUE-ID");
  } else if (/\bscaffold\b|\bconfig\b|\brule\b|\btemplate\b|\bskill\b/i.test(purpose)) {
    commands.push("flowness validate");
    commands.push("flowness locate \"<task description>\"");
  } else {
    if (analysis.buildCommand !== null) {
      commands.push(analysis.buildCommand);
    }
    if (analysis.testCommand !== null) {
      commands.push(analysis.testCommand);
    }
    if (analysis.lintCommand !== null) {
      commands.push(analysis.lintCommand);
    }
  }

  if (commands.length === 0) {
    commands.push("flowness locate \"<task description>\"");
  }

  return unique(commands);
}

function collectTestFiles(sourceFiles: readonly string[], allFiles: readonly string[]): string[] {
  const tests = allFiles.filter((fileName) => isTestFile(fileName));
  if (tests.length === 0) {
    return [];
  }

  const sourceStems = sourceFiles.map((fileName) => fileStem(fileName));
  const selected = tests.filter((testFileName) => {
    const testStem = fileStem(testFileName);
    return sourceStems.some((sourceStem) => testStem === sourceStem || testStem.startsWith(sourceStem) || sourceStem.startsWith(testStem));
  });

  if (selected.length > 0) {
    return selected;
  }

  if (sourceFiles.length === 1) {
    return [...tests];
  }

  return [];
}

function buildSourceAreas(analysis: ProjectAnalysis, sourceDir: string, rootDir: string): Promise<ContextIndexArea[]> {
  return (async () => {
    if (!(await pathExists(joinPaths(rootDir, sourceDir)))) {
      return [];
    }

    const entries = await readdir(joinPaths(rootDir, sourceDir), { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && isSourceFile(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const areas: ContextIndexArea[] = [];
    for (const fileName of files) {
      if (!isReadableEntryFile(fileName)) {
        continue;
      }

      const filePath = joinPaths(sourceDir, fileName);
      const fileText = await readTextFile(joinPaths(rootDir, filePath));
      const symbols = extractExportedSymbols(fileText);
      const areaName = deriveAreaName(sourceDir, fileName, analysis.projectName);
      const purpose = buildPurpose(areaName, fileName, symbols, sourceDir);
      const aliases = buildAliases(areaName, fileName, purpose, symbols);
      const sourceFiles = [fileName];
      const tests = collectTestFiles(sourceFiles, files).map((testFileName) => joinPaths(sourceDir, testFileName));
      const commands = buildCommands(analysis, purpose);

      areas.push({
        area: areaName,
        purpose,
        entryFiles: [filePath],
        tests,
        symbols: symbols.length === 0 ? [areaName] : symbols,
        aliases,
        commands,
      });
    }

    return areas;
  })();
}

function buildWorkspaceAreas(
  analysis: ProjectAnalysis,
  sourceEntryFiles: readonly string[],
): readonly ContextIndexArea[] {
  const projectCommands = [
    analysis.buildCommand,
    analysis.testCommand,
    analysis.lintCommand,
  ].filter((command): command is string => command !== null);

  return [
    {
      area: "navigation",
      purpose: "Read the current issue, workflow step, and read order before broad searching.",
      entryFiles: [".flowness/navigation.md", ".flowness/state/active-issue.md"],
      tests: [],
      symbols: ["current issue", "current step", "next step"],
      aliases: ["navigation", "current state", "read order"],
      commands: [
        "flowness status --issue ISSUE-ID",
        "flowness step --issue ISSUE-ID",
        "flowness locate \"<task description>\"",
      ],
    },
    {
      area: "context-index",
      purpose: "Use the lightweight repo map to find files, symbols, tests, and commands.",
      entryFiles: [".flowness/context-index.json"],
      tests: [],
      symbols: ["areas", "entryFiles", "tests", "symbols", "aliases", "commands"],
      aliases: ["context index", "repo map", "file map"],
      commands: ["flowness locate \"<task description>\""],
    },
    {
      area: "commands",
      purpose: "Use the generated command map for project and Flowness commands.",
      entryFiles: [".flowness/commands.json"],
      tests: [],
      symbols: ["run", "step", "status", "locate", "test", "audit"],
      aliases: ["commands", "cli commands", "command map"],
      commands: [
        "flowness locate \"<task description>\"",
        "flowness test --summary",
        "flowness audit --changed",
      ],
    },
    {
      area: "project-profile",
      purpose: "Inspect the detected language, package manager, commands, and source directories.",
      entryFiles: [".flowness/project-profile.md"],
      tests: [],
      symbols: ["project", "language", "package manager", "source directories"],
      aliases: ["profile", "project profile"],
      commands: ["flowness locate \"<task description>\""],
    },
    {
      area: "harness-manifest",
      purpose: "Inspect generated workspace expectations and key paths.",
      entryFiles: [".flowness/harness-manifest.json"],
      tests: [],
      symbols: ["version", "workspace", "contextFiles", "commands"],
      aliases: ["manifest", "harness manifest"],
      commands: ["flowness validate"],
    },
    {
      area: "issues",
      purpose: "Inspect active issue workspaces and issue-specific artifacts only when needed.",
      entryFiles: [".flowness/issues/README.md"],
      tests: [],
      symbols: ["issue", "state", "goal", "evidence"],
      aliases: ["issues", "issue workspace", "issue files"],
      commands: ["flowness status --issue ISSUE-ID"],
    },
    {
      area: "logs",
      purpose: "Read append-only issue logs and summary evidence pointers.",
      entryFiles: [".flowness/logs/README.md"],
      tests: [],
      symbols: ["summary", "evidence", "next step"],
      aliases: ["log", "logs", "issue log"],
      commands: ["flowness status --issue ISSUE-ID"],
    },
    {
      area: "findings",
      purpose: "Record real findings with lifecycle statuses, blocker kind, and compact evidence.",
      entryFiles: [".flowness/findings/README.md", ".flowness/templates/finding-template.md"],
      tests: [],
      symbols: ["Problem", "Status", "Blocker kind", "Evidence", "Fix", "Regression test"],
      aliases: ["finding", "findings", "blocking finding", "deferred finding", "accepted-risk finding"],
      commands: ["flowness review:run --issue ISSUE-ID"],
    },
    {
      area: "rules",
      purpose: "Read only the current rules that apply to the current issue or step.",
      entryFiles: [
        ".flowness/rules/README.md",
        ".flowness/rules/project-overrides.md",
        ".flowness/rules/git.md",
        ".flowness/rules/commit-policy.md",
        ".flowness/rules/performance-improvement.md",
        ".flowness/rules/rule-update-log.md",
      ],
      tests: [],
      symbols: ["policy", "override", "change log"],
      aliases: ["rules", "policy", "commit policy"],
      commands: ["flowness validate"],
    },
    {
      area: "workflows",
      purpose: "Inspect workflow definitions and step files without reading every workflow at once.",
      entryFiles: [".flowness/workflows/README.md"],
      tests: [],
      symbols: ["workflow", "step", "gate", "next"],
      aliases: ["workflow", "workflows", "step files"],
      commands: ["flowness workflow:validate [workflow-id]"],
    },
    {
      area: "templates",
      purpose: "Inspect starter templates and templates only when a file needs one.",
      entryFiles: [".flowness/templates/README.md"],
      tests: [],
      symbols: ["issue template", "review template", "finding template"],
      aliases: ["templates", "template", "starter text"],
      commands: ["flowness locate \"<task description>\""],
    },
    {
      area: "skills",
      purpose: "Inspect reusable skills only when a task needs one.",
      entryFiles: [".flowness/skills/README.md"],
      tests: [],
      symbols: ["skill", "root cause analysis", "code review", "test planning"],
      aliases: ["skills", "skill", "reusable skill"],
      commands: ["flowness skill:list"],
    },
    {
      area: "scripts",
      purpose: "Inspect workspace helper scripts only when a command or automation needs them.",
      entryFiles: [".flowness/scripts/README.md", ".flowness/scripts/flowness-runner.ts", ".flowness/scripts/workflow-guard.ts"],
      tests: [],
      symbols: ["runner", "workflow guard", "size check"],
      aliases: ["scripts", "automation", "helpers"],
      commands: ["flowness validate"],
    },
    {
      area: "docs",
      purpose: "Inspect planning docs and architecture docs when the task is about scope or design.",
      entryFiles: analysis.documentationPaths.length === 0 ? [] : [...analysis.documentationPaths],
      tests: [],
      symbols: ["PRD", "ARD"],
      aliases: ["docs", "documentation", "planning docs"],
      commands: ["flowness locate \"<task description>\""],
    },
    {
      area: "source",
      purpose: "Review the main source files detected for this project.",
      entryFiles: [...sourceEntryFiles],
      tests: [],
      symbols: [],
      aliases: ["source", "code", "implementation"],
      commands: projectCommands,
    },
  ];
}

async function buildSourceIndexAreas(analysis: ProjectAnalysis, rootDir: string): Promise<readonly ContextIndexArea[]> {
  const areas: ContextIndexArea[] = [];
  for (const sourceDir of analysis.sourceDirectories) {
    const sourceAreas = await buildSourceAreas(analysis, sourceDir, rootDir);
    areas.push(...sourceAreas);
  }

  return areas;
}

export async function buildContextIndex(
  rootDir: string,
  analysis: ProjectAnalysis,
): Promise<ContextIndex> {
  const sourceAreas = await buildSourceIndexAreas(analysis, rootDir);
  const sourceEntryFiles = unique(sourceAreas.flatMap((area) => area.entryFiles)).slice(0, 6);
  const areas = [
    ...buildWorkspaceAreas(analysis, sourceEntryFiles),
    ...sourceAreas,
  ];

  const dedupedAreas = new Map<string, ContextIndexArea>();
  for (const area of areas) {
    const existing = dedupedAreas.get(area.area);
    if (existing === undefined) {
      dedupedAreas.set(area.area, area);
      continue;
    }

    dedupedAreas.set(area.area, {
      area: existing.area,
      purpose: existing.purpose,
      entryFiles: unique([...existing.entryFiles, ...area.entryFiles]),
      tests: unique([...existing.tests, ...area.tests]),
      symbols: unique([...existing.symbols, ...area.symbols]),
      aliases: unique([...existing.aliases, ...area.aliases]),
      commands: unique([...existing.commands, ...area.commands]),
    });
  }

  return {
    projectName: analysis.projectName,
    areas: [...dedupedAreas.values()].sort((left, right) => left.area.localeCompare(right.area)),
  };
}

function scoreField(value: string, queryText: string, queryTokens: readonly string[]): number {
  const normalizedValue = normalizeSearchText(value);
  if (normalizedValue.length === 0) {
    return 0;
  }

  const normalizedQuery = normalizeSearchText(queryText);
  let score = 0;

  if (normalizedQuery.length > 0) {
    if (normalizedValue === normalizedQuery) {
      score += 20;
    }

    if (normalizedValue.includes(normalizedQuery) || normalizedQuery.includes(normalizedValue)) {
      score += 10;
    }
  }

  const valueTokens = new Set(tokenizeSearchText(value));
  for (const token of queryTokens) {
    if (valueTokens.has(token)) {
      score += 3;
    }
  }

  return score;
}

function scoreArea(area: ContextIndexArea, query: string): number {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  let score = 0;
  score += scoreField(area.area, query, queryTokens) * 4;
  score += scoreField(area.purpose, query, queryTokens) * 2;

  for (const alias of area.aliases) {
    score += scoreField(alias, query, queryTokens) * 2;
  }

  for (const symbol of area.symbols) {
    score += scoreField(symbol, query, queryTokens) * 2;
  }

  for (const filePath of [...area.entryFiles, ...area.tests]) {
    score += scoreField(filePath, query, queryTokens) * 2;
    score += scoreField(basename(filePath), query, queryTokens);
  }

  for (const command of area.commands) {
    score += scoreField(command, query, queryTokens);
  }

  return score;
}

export function locateContextIndexArea(
  contextIndex: ContextIndex,
  query: string,
): LocateContextResult {
  const scoredAreas = contextIndex.areas
    .map((area) => ({
      area,
      score: scoreArea(area, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.area.area.localeCompare(right.area.area));

  const selectedAreas = scoredAreas.length === 0
    ? [contextIndex.areas[0]].filter((area): area is ContextIndexArea => area !== undefined)
    : scoredAreas.slice(0, 3).map((entry) => entry.area);

  const primary = selectedAreas[0] ?? contextIndex.areas[0];
  if (primary === undefined) {
    return {
      area: "unknown",
      readFirst: [],
      symbols: [],
      tests: [],
      commands: [],
      doNotReadYet: [...locateDoNotReadYet],
    };
  }

  const readFirst = unique(
    [
      ...primary.entryFiles,
      ...primary.tests,
      ...selectedAreas.slice(1).flatMap((area) => area.entryFiles.slice(0, 1)),
    ].slice(0, 4),
  );

  const symbols = unique([
    ...primary.symbols,
    ...selectedAreas.slice(1).flatMap((area) => area.symbols.slice(0, 2)),
  ]).slice(0, 6);

  const tests = unique([
    ...primary.tests,
    ...selectedAreas.slice(1).flatMap((area) => area.tests.slice(0, 1)),
  ]).slice(0, 4);

  const commands = unique([
    ...primary.commands,
    ...selectedAreas.slice(1).flatMap((area) => area.commands.slice(0, 2)),
  ]).slice(0, 4);

  return {
    area: primary.area,
    readFirst,
    symbols,
    tests,
    commands,
    doNotReadYet: [...locateDoNotReadYet],
  };
}
