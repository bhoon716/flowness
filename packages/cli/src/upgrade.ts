import { basename, relative, dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ensureDirectory,
  joinPaths,
  pathExists,
  readTextFile,
  writeTextFile,
  readProjectConfig,
  renderGeneratedAgentsMarkdown,
  renderGeneratedConfigArtifacts,
  renderGeneratedHarnessManifestArtifact,
  renderGeneratedNavigationArtifacts,
  renderGeneratedRuleArtifacts,
  renderGeneratedTemplateArtifacts,
  renderGeneratedWorkflowArtifacts,
  renderProjectAnalysis,
  sha256Hex,
  type ActiveIssueNavigationContext,
  type ProjectAnalysis,
  type ScaffoldArtifact,
} from "@flowness-labs/core";

export interface ParsedUpgradeCommand {
  readonly mode: "dry-run" | "apply";
  readonly fromVersion: string | null;
  readonly toVersion: string | null;
}

export interface CliResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

interface UpgradeWrite {
  readonly path: string;
  readonly content: string;
}

interface UpgradeConflict {
  readonly path: string;
  readonly reason: string;
}

interface UpgradePlan {
  readonly currentVersion: string;
  readonly targetVersion: string;
  readonly requestedFromVersion: string | null;
  readonly requestedToVersion: string | null;
  readonly regenerate: readonly UpgradeWrite[];
  readonly addIfMissing: readonly UpgradeWrite[];
  readonly patch: readonly UpgradeWrite[];
  readonly conflicts: readonly UpgradeConflict[];
  readonly willNotTouch: readonly string[];
  readonly manualActions: readonly string[];
  readonly nextCommands: readonly string[];
  readonly backupPath: string | null;
  readonly reportPath: string;
}

interface UpgradeBuildResult {
  readonly plan: UpgradePlan;
  readonly activeIssueStatus: "none" | "parsed" | "unparseable";
  readonly agentBlockMissingMarkers: boolean;
}

function getCliVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version;
  } catch {
    return "0.2.4";
  }
}

const targetHarnessVersion = getCliVersion();

function toDisplayVersion(value: string | null): string {
  return value === null || value.trim().length === 0 ? "legacy" : value;
}

function normalizePathForReport(path: string): string {
  return path.replace(/\\/g, "/");
}

function pathFromRoot(rootDir: string, relativePath: string): string {
  return joinPaths(rootDir, relativePath);
}

function stripDotDotPrefix(value: string): string {
  return value.replace(/^\.\.\//, "");
}

function parseMarkdownLink(line: string): { readonly label: string; readonly target: string } | null {
  const match = line.match(/^\s*-\s*\[(.+?)\]\((.+?)\)\s*$/);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  return {
    label: match[1],
    target: match[2],
  };
}

function parseFieldLine(content: string, label: string): string | null {
  const pattern = new RegExp(`^\\s*-\\s*${label}:\\s*(.+)$`, "m");
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function parseLinkField(content: string, label: string): { readonly label: string; readonly target: string } | null {
  const pattern = new RegExp(`^\\s*-\\s*${label}:\\s*\\[(.+?)\\]\\((.+?)\\)\\s*$`, "m");
  const match = content.match(pattern);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  return {
    label: match[1],
    target: match[2],
  };
}

function parseSectionPaths(content: string, heading: string): string[] {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    return [];
  }

  const paths: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || /^##\s+/.test(line)) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed === "- None yet." || trimmed === "- None") {
      continue;
    }

    const link = parseMarkdownLink(trimmed);
    if (link !== null) {
      paths.push(link.target);
    }
  }

  return paths;
}

function buildRelevantRulesFromLinks(rootRelativeRules: readonly string[]): readonly string[] {
  return rootRelativeRules.map((rulePath) => {
    if (rulePath.startsWith("../")) {
      return `.flowness/${stripDotDotPrefix(rulePath)}`;
    }

    return rulePath.startsWith(".flowness/")
      ? rulePath
      : `.flowness/rules/${rulePath.replace(/^rules\//, "")}`;
  });
}

interface CurrentManifestData {
  readonly version: string | null;
  readonly manifestHash: string | null;
  readonly generatedFileHashes: Record<string, string> | null;
}

async function loadCurrentManifestData(rootDir: string): Promise<CurrentManifestData | null> {
  const manifestPath = pathFromRoot(rootDir, ".flowness/harness-manifest.json");
  if (!(await pathExists(manifestPath))) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readTextFile(manifestPath)) as {
      readonly version?: unknown;
      readonly manifestHash?: unknown;
      readonly generatedFileHashes?: unknown;
    };
    const generatedFileHashes = parsed.generatedFileHashes !== null && typeof parsed.generatedFileHashes === "object"
      ? Object.fromEntries(
          Object.entries(parsed.generatedFileHashes as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
          ),
        )
      : null;

    return {
      version: typeof parsed.version === "string" && parsed.version.trim().length > 0
        ? parsed.version
        : null,
      manifestHash: typeof parsed.manifestHash === "string" && parsed.manifestHash.trim().length > 0
        ? parsed.manifestHash
        : null,
      generatedFileHashes,
    };
  } catch {
    return null;
  }
}

async function loadCurrentManifestVersion(rootDir: string): Promise<string | null> {
  const manifest = await loadCurrentManifestData(rootDir);
  return manifest?.version ?? null;
}

async function readGeneratedTextIfPresent(path: string): Promise<string | null> {
  if (!(await pathExists(path))) {
    return null;
  }

  return await readTextFile(path);
}

function buildActiveIssueContextFromMarkdown(rootDir: string, content: string): ActiveIssueNavigationContext | null {
  if (/No active issue exists yet\./i.test(content)) {
    return null;
  }

  const issueLink = parseLinkField(content, "Issue");
  const title = parseFieldLine(content, "Title");
  const state = parseFieldLine(content, "State");
  const workflow = parseFieldLine(content, "Workflow");
  const issueFileLink = parseLinkField(content, "Issue file");
  const workflowStateLink = parseLinkField(content, "Workflow state");
  const issueLogLink = parseLinkField(content, "Issue log");
  const blockReason = parseFieldLine(content, "Block reason");
  const requiredAction = parseFieldLine(content, "Required action");
  const currentStepLink = parseLinkField(content, "Current step");
  const pendingStepLink = parseLinkField(content, "Pending step");
  const nextStepLink = parseLinkField(content, "Next step");

  if (
    issueLink === null
    || title === null
    || state === null
    || workflow === null
    || issueFileLink === null
    || workflowStateLink === null
    || issueLogLink === null
  ) {
    return null;
  }

  const evidenceFiles = parseSectionPaths(content, "Evidence Files");
  const relevantRules = buildRelevantRulesFromLinks(parseSectionPaths(content, "Relevant Rules"));
  const blocked = blockReason !== null || state === "blocked";
  const currentStep = blocked
    ? (pendingStepLink?.label ?? currentStepLink?.label ?? "complete")
    : (currentStepLink?.label ?? pendingStepLink?.label ?? "complete");
  const pendingStep = blocked
    ? (pendingStepLink?.label ?? currentStep)
    : null;
  const nextStep = blocked
    ? null
    : (nextStepLink?.label ?? null);
  const currentStepFile = blocked
    ? basename(pendingStepLink?.target ?? currentStepLink?.target ?? "README.md")
    : basename(currentStepLink?.target ?? pendingStepLink?.target ?? "README.md");
  const nextStepFile = nextStepLink === null ? null : basename(nextStepLink.target);

  return {
    issueId: issueLink.label,
    issueTitle: title,
    issueState: state,
    workflowId: workflow,
    currentStep,
    nextStep,
    blocked,
    blockReason,
    pendingStep,
    requiredAction,
    issueFile: pathFromRoot(rootDir, stripDotDotPrefix(issueFileLink.target)),
    workflowStateFile: pathFromRoot(rootDir, stripDotDotPrefix(workflowStateLink.target)),
    issueLogFile: pathFromRoot(rootDir, stripDotDotPrefix(issueLogLink.target)),
    currentStepFile,
    nextStepFile,
    evidenceFiles,
    relevantRules,
  };
}

async function loadActiveIssueContext(rootDir: string, analysis: ProjectAnalysis): Promise<{
  readonly activeIssue: ActiveIssueNavigationContext | null;
  readonly status: "none" | "parsed" | "unparseable";
}> {
  const activeIssuePath = pathFromRoot(rootDir, ".flowness/state/active-issue.md");
  const content = await readGeneratedTextIfPresent(activeIssuePath);
  if (content === null) {
    return {
      activeIssue: null,
      status: "none",
    };
  }

  const activeIssue = buildActiveIssueContextFromMarkdown(rootDir, content);
  if (activeIssue === null) {
    return {
      activeIssue: null,
      status: "unparseable",
    };
  }

  return {
    activeIssue,
    status: "parsed",
  };
}

function patchGeneratedAgentsBlock(existing: string, analysis: ProjectAnalysis): string | null {
  const begin = "<!-- FLOWNESS:BEGIN -->";
  const end = "<!-- FLOWNESS:END -->";
  if (!existing.includes(begin) || !existing.includes(end)) {
    return null;
  }

  return existing.replace(
    new RegExp(`${begin}[\\s\\S]*?${end}`),
    renderGeneratedAgentsMarkdown(analysis).trimEnd(),
  );
}

function buildWillNotTouchPaths(): readonly string[] {
  return [
    ".flowness/issues/",
    ".flowness/logs/",
    ".flowness/evidence/",
    ".flowness/decisions/",
    ".flowness/rules/",
    ".flowness/workflows/",
    ".flowness/templates/",
    ".flowness/scripts/",
    ".flowness/skills/",
    ".flowness/findings/",
    "docs/PRD.md",
    "docs/ARD.md",
  ];
}

function renderList(title: string, values: readonly string[]): string[] {
  return values.length === 0
    ? [title, "- none", ""]
    : [title, ...values.map((value) => `- ${value}`), ""];
}

function renderConflicts(conflicts: readonly UpgradeConflict[]): string[] {
  if (conflicts.length === 0) {
    return ["Conflicts:", "- none", ""];
  }

  const lines: string[] = ["Conflicts:"];
  for (const conflict of conflicts) {
    lines.push(`- ${conflict.path}`);
    lines.push(`  Reason: ${conflict.reason}`);
  }
  lines.push("");
  return lines;
}

function renderUpgradePlanMarkdown(plan: UpgradePlan, activeIssueStatus: "none" | "parsed" | "unparseable", applied: boolean): string {
  const title = applied ? "# Flowness Upgrade Applied" : "# Flowness Upgrade Plan";
  const lines: string[] = [
    title,
    "",
    `Current version: ${plan.currentVersion}`,
    `Target version: ${plan.targetVersion}`,
  ];

  if (plan.requestedFromVersion !== null || plan.requestedToVersion !== null) {
    lines.push(
      `Requested range: ${plan.requestedFromVersion ?? "auto"} -> ${plan.requestedToVersion ?? targetHarnessVersion}`,
    );
  }

  lines.push("");
  lines.push(...renderList("Will regenerate:", plan.regenerate.map((entry) => entry.path)));
  lines.push(...renderList("Will add if missing:", plan.addIfMissing.map((entry) => entry.path)));
  lines.push(...renderList("Will patch:", plan.patch.map((entry) => entry.path)));
  lines.push(...renderConflicts(plan.conflicts));
  lines.push("Will not touch:");
  for (const path of plan.willNotTouch) {
    lines.push(`- ${path}`);
  }
  lines.push("");

  if (activeIssueStatus === "unparseable") {
    lines.push("Manual actions:");
    lines.push("- Could not safely parse .flowness/state/active-issue.md.");
    lines.push("");
  }

  if (plan.manualActions.length > 0) {
    lines.push("Manual actions:");
    for (const action of plan.manualActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  lines.push("Recommended next commands:");
  for (const command of plan.nextCommands) {
    lines.push(`- ${command}`);
  }
  if (!applied) {
    lines.push("- flowness upgrade --apply");
  }
  lines.push("");

  if (applied) {
    lines.push(`Backup path: ${plan.backupPath ?? "none"}`);
    lines.push(`Report path: ${plan.reportPath}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildGeneratedFileHashMap(artifacts: readonly ScaffoldArtifact[]): Record<string, string> {
  return Object.fromEntries(artifacts.map((artifact) => [artifact.path, sha256Hex(artifact.content)] as const));
}

function toUpgradeWrite(artifact: ScaffoldArtifact): UpgradeWrite {
  return {
    path: artifact.path,
    content: artifact.content,
  };
}

function computeManifestPayloadHash(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { readonly manifestHash?: unknown };
    if (typeof parsed.manifestHash !== "string" || parsed.manifestHash.trim().length === 0) {
      return null;
    }

    const payload = { ...(parsed as Record<string, unknown>) };
    delete payload.manifestHash;
    return sha256Hex(`${JSON.stringify(payload, null, 2)}\n`);
  } catch {
    return null;
  }
}

function buildCompareOnlyArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    ...renderGeneratedRuleArtifacts(analysis),
    ...renderGeneratedWorkflowArtifacts(analysis),
  ];
}

async function compareExistingArtifacts(
  rootDir: string,
  artifacts: readonly ScaffoldArtifact[],
): Promise<UpgradeConflict[]> {
  const conflicts: UpgradeConflict[] = [];
  for (const artifact of artifacts) {
    const absolutePath = pathFromRoot(rootDir, artifact.path);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const existing = await readTextFile(absolutePath);
    if (existing !== artifact.content) {
      conflicts.push({
        path: artifact.path,
        reason: "Existing file differs from the current generated default and will not be overwritten.",
      });
    }
  }

  return conflicts;
}

async function buildUpgradePlan(
  rootDir: string,
  input: ParsedUpgradeCommand,
): Promise<UpgradeBuildResult> {
  const workspaceDir = pathFromRoot(rootDir, ".flowness");
  if (!(await pathExists(workspaceDir))) {
    throw new Error("Flowness project is not initialized. Run `flowness init` first.");
  }

  const config = await readProjectConfig(rootDir);
  const analysis = await renderProjectAnalysis(rootDir, config.projectName);
  const currentManifest = await loadCurrentManifestData(rootDir);
  const { activeIssue, status: activeIssueStatus } = await loadActiveIssueContext(rootDir, analysis);
  const currentVersionLabel = toDisplayVersion(currentManifest?.version ?? null);
  const manualActions: string[] = [];
  const currentManifestPath = pathFromRoot(rootDir, ".flowness/harness-manifest.json");
  const currentManifestContent = await readGeneratedTextIfPresent(currentManifestPath);
  if (currentManifestContent === null) {
    manualActions.push(".flowness/harness-manifest.json is missing and will be regenerated.");
  }
  const configArtifacts = await renderGeneratedConfigArtifacts(
    analysis,
    activeIssueStatus === "unparseable" ? null : activeIssue,
    analysis.rootDir,
  );
  const navigationArtifacts = activeIssueStatus === "unparseable"
    ? []
    : renderGeneratedNavigationArtifacts(analysis, activeIssue);
  const generatedFileHashes = buildGeneratedFileHashMap([...configArtifacts, ...navigationArtifacts]);
  const manifestArtifact = renderGeneratedHarnessManifestArtifact(
    analysis,
    activeIssueStatus === "unparseable" ? null : activeIssue,
    generatedFileHashes,
  );
  const regenerate: UpgradeWrite[] = [];
  const addIfMissing: UpgradeWrite[] = [];
  const conflicts: UpgradeConflict[] = [];
  const recordedGeneratedHashes = currentManifest?.generatedFileHashes ?? null;
  const recordedManifestHash = currentManifest?.manifestHash ?? null;
  for (const artifact of [...configArtifacts, ...navigationArtifacts]) {
    const absolutePath = pathFromRoot(rootDir, artifact.path);
    if (!(await pathExists(absolutePath))) {
      addIfMissing.push(toUpgradeWrite(artifact));
      continue;
    }

    const existing = await readTextFile(absolutePath);
    if (existing === artifact.content) {
      continue;
    }

    const recordedHash = recordedGeneratedHashes?.[artifact.path] ?? null;
    if (recordedHash !== null && sha256Hex(existing) === recordedHash) {
      regenerate.push(toUpgradeWrite(artifact));
      continue;
    }

    conflicts.push({
      path: artifact.path,
      reason: "Existing file differs from the recorded generated hash and will not be overwritten.",
    });
  }

  if (!(await pathExists(currentManifestPath))) {
    addIfMissing.push(toUpgradeWrite(manifestArtifact));
  } else if (currentManifestContent !== null && currentManifestContent !== manifestArtifact.content) {
    const currentManifestPayloadHash = computeManifestPayloadHash(currentManifestContent);
    if (recordedManifestHash !== null && currentManifestPayloadHash === recordedManifestHash) {
      regenerate.push(toUpgradeWrite(manifestArtifact));
    } else {
      conflicts.push({
        path: manifestArtifact.path,
        reason: "Existing file differs from the recorded manifest hash and will not be overwritten.",
      });
    }
  }

  const addIfMissingCandidates: UpgradeWrite[] = [
    ...renderGeneratedTemplateArtifacts(analysis).map(toUpgradeWrite),
  ];
  const findingsReadme = configArtifacts.find((artifact) => artifact.path === ".flowness/findings/README.md");
  if (findingsReadme === undefined) {
    throw new Error("Missing generated artifact: .flowness/findings/README.md");
  }
  if (!(await pathExists(pathFromRoot(rootDir, findingsReadme.path)))) {
    addIfMissingCandidates.push({
      path: findingsReadme.path,
      content: findingsReadme.content,
    });
  } else {
    const existingFindings = await readTextFile(pathFromRoot(rootDir, findingsReadme.path));
    const recordedHash = recordedGeneratedHashes?.[findingsReadme.path] ?? null;
    if (existingFindings !== findingsReadme.content) {
      if (recordedHash !== null && sha256Hex(existingFindings) === recordedHash) {
        regenerate.push({
          path: findingsReadme.path,
          content: findingsReadme.content,
        });
      } else {
        conflicts.push({
          path: findingsReadme.path,
          reason: "Existing file differs from the recorded generated hash and will not be overwritten.",
        });
      }
    }
  }

  const agentsPath = pathFromRoot(rootDir, "AGENTS.md");
  const agentsContent = await readGeneratedTextIfPresent(agentsPath);
  const agentsHasMarkers = agentsContent !== null
    && agentsContent.includes("<!-- FLOWNESS:BEGIN -->")
    && agentsContent.includes("<!-- FLOWNESS:END -->");

  const patch: UpgradeWrite[] = [];
  if (agentsContent !== null && agentsHasMarkers) {
    const patchedAgents = patchGeneratedAgentsBlock(agentsContent, analysis);
    if (patchedAgents !== null && patchedAgents !== agentsContent) {
      patch.push({
        path: "AGENTS.md",
        content: patchedAgents,
      });
    }
  } else if (agentsContent !== null) {
    manualActions.push("AGENTS.md does not contain FLOWNESS markers, so it must be patched manually.");
  } else {
    manualActions.push("AGENTS.md is missing, so it must be created manually if desired.");
  }

  if (activeIssueStatus === "unparseable") {
    manualActions.push(".flowness/state/active-issue.md could not be parsed safely, so it was left untouched.");
  }
  if (input.fromVersion !== null && currentVersionLabel !== input.fromVersion) {
    manualActions.push(`Requested from-version ${input.fromVersion} does not match detected current version ${currentVersionLabel}.`);
  }

  const compareOnlyArtifacts = buildCompareOnlyArtifacts(analysis);
  const compareConflicts = await compareExistingArtifacts(rootDir, compareOnlyArtifacts);
  
  for (const artifact of compareOnlyArtifacts) {
    const absolutePath = pathFromRoot(rootDir, artifact.path);
    if (!(await pathExists(absolutePath))) {
      addIfMissing.push(toUpgradeWrite(artifact));
    }
  }
  for (const artifact of addIfMissingCandidates) {
    const absolutePath = pathFromRoot(rootDir, artifact.path);
    if (!(await pathExists(absolutePath))) {
      addIfMissing.push(artifact);
      continue;
    }

    const existing = await readTextFile(absolutePath);
    if (existing !== artifact.content) {
      conflicts.push({
        path: artifact.path,
        reason: "Existing file differs from the current generated default and will not be overwritten.",
      });
    }
  }

  conflicts.push(...compareConflicts);

  const deduplicatedAddIfMissing: UpgradeWrite[] = [];
  const seenPaths = new Set<string>();
  for (const item of addIfMissing) {
    if (!seenPaths.has(item.path)) {
      seenPaths.add(item.path);
      deduplicatedAddIfMissing.push(item);
    }
  }

  const plan: UpgradePlan = {
    currentVersion: currentVersionLabel,
    targetVersion: input.toVersion ?? targetHarnessVersion,
    requestedFromVersion: input.fromVersion,
    requestedToVersion: input.toVersion,
    regenerate,
    addIfMissing: deduplicatedAddIfMissing,
    patch,
    conflicts,
    willNotTouch: buildWillNotTouchPaths(),
    manualActions,
    nextCommands: [
      "flowness validate",
      'flowness locate "request routing"',
      "flowness status",
    ],
    backupPath: null,
    reportPath: ".flowness/upgrade/upgrade-report.md",
  };

  return {
    plan,
    activeIssueStatus,
    agentBlockMissingMarkers: !agentsHasMarkers,
  };
}

async function applyUpgradePlan(
  rootDir: string,
  buildResult: UpgradeBuildResult,
): Promise<{
  readonly backupPath: string | null;
  readonly writtenFiles: readonly string[];
  readonly reportPath: string;
}> {
  const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = pathFromRoot(rootDir, `.flowness/backups/upgrade-${backupTimestamp}`);
  const writtenFiles: string[] = [];
  const writeQueue = [
    ...buildResult.plan.regenerate,
    ...buildResult.plan.addIfMissing.filter((artifact) => !buildResult.plan.conflicts.some((conflict) => conflict.path === artifact.path)),
    ...buildResult.plan.patch,
  ];

  const reportPath = pathFromRoot(rootDir, buildResult.plan.reportPath);
  const reportAlreadyExists = await pathExists(reportPath);
  if (writeQueue.length > 0 || reportAlreadyExists) {
    await ensureDirectory(backupRoot);
  }

  for (const artifact of writeQueue) {
    const absolutePath = pathFromRoot(rootDir, artifact.path);
    if (await pathExists(absolutePath)) {
      const backupPath = pathFromRoot(backupRoot, artifact.path);
      await writeTextFile(backupPath, await readTextFile(absolutePath), true);
    }

    await writeTextFile(absolutePath, artifact.content, true);
    writtenFiles.push(artifact.path);
  }

  await ensureDirectory(pathFromRoot(rootDir, ".flowness/upgrade"));
  if (reportAlreadyExists) {
    const reportBackupPath = pathFromRoot(backupRoot, buildResult.plan.reportPath);
    await writeTextFile(reportBackupPath, await readTextFile(reportPath), true);
  }
  await writeTextFile(
    reportPath,
    renderUpgradePlanMarkdown(buildResult.plan, buildResult.activeIssueStatus, true),
    true,
  );

  return {
    backupPath: writeQueue.length > 0 || reportAlreadyExists ? relative(rootDir, backupRoot) : null,
    writtenFiles,
    reportPath: buildResult.plan.reportPath,
  };
}

export async function runUpgradeCommand(
  rootDir: string,
  input: ParsedUpgradeCommand,
): Promise<CliResult> {
  const buildResult = await buildUpgradePlan(rootDir, input);

  if (input.mode === "dry-run") {
    return {
      exitCode: 0,
      output: renderUpgradePlanMarkdown(buildResult.plan, buildResult.activeIssueStatus, false),
    };
  }

  const applyResult = await applyUpgradePlan(rootDir, buildResult);
  const output = [
    renderUpgradePlanMarkdown(
      {
        ...buildResult.plan,
        backupPath: applyResult.backupPath,
      },
      buildResult.activeIssueStatus,
      true,
    ),
    "",
    applyResult.writtenFiles.length === 0
      ? "No files needed updating."
      : `Updated files: ${applyResult.writtenFiles.join(", ")}`,
    "",
  ].join("\n");

  return {
    exitCode: 0,
    output,
  };
}
