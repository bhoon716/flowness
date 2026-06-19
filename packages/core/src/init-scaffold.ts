import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  pathExists,
  readJsonFile,
} from "./filesystem.js";

export interface ScaffoldArtifact {
  readonly path: string;
  readonly content: string;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

export interface ProjectAnalysis {
  readonly rootDir: string;
  readonly projectName: string;
  readonly packageManager: PackageManager;
  readonly language: string;
  readonly framework: string;
  readonly buildCommand: string | null;
  readonly testCommand: string | null;
  readonly lintCommand: string | null;
  readonly sourceDirectories: readonly string[];
  readonly documentationPaths: readonly string[];
  readonly gitStatus: string;
  readonly packageJsonPath: string | null;
  readonly notes: readonly string[];
}

interface PackageJsonShape {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface WorkflowStepSpec {
  readonly fileName: string;
  readonly title: string;
  readonly purpose: string;
  readonly humanGate: "always" | "optional" | "never";
  readonly next?: string | null;
}

interface WorkflowSpec {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly focus: string;
  readonly steps: readonly WorkflowStepSpec[];
}

const workflowSpecs: readonly WorkflowSpec[] = [
  {
    id: "feature-development",
    title: "Feature Development",
    summary: "Ship a feature with explicit clarification, implementation, evidence, review, and closure.",
    focus: "feature work",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the request, the project context, and whether the work should become an issue.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask for the missing requirements and log assumptions before implementation starts.", humanGate: "always", next: "Requirement Analysis" },
      { fileName: "03-requirement-analysis.md", title: "Requirement Analysis", purpose: "Identify the users, problem, goals, constraints, and risks behind the request.", humanGate: "always", next: "Scope Definition" },
      { fileName: "04-scope-definition.md", title: "Scope Definition", purpose: "Draw the line around the requested work and call out the non-goals.", humanGate: "always", next: "Implementation" },
      { fileName: "05-implementation.md", title: "Implementation", purpose: "Make the code or documentation change using the confirmed plan.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Run the relevant commands and collect proof that the change works.", humanGate: "optional", next: "Close" },
      { fileName: "07-close.md", title: "Close", purpose: "Summarize the final state, remaining risks, and any follow-up work.", humanGate: "never", next: null },
    ],
  },
  {
    id: "code-review",
    title: "Code Review",
    summary: "Review changes, clarify scope, record findings, and route follow-up work back through Flowness.",
    focus: "review work",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the review request and the change set under review.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask for the review bar, expected scope, and any missing context before reviewing.", humanGate: "always", next: "Scope Definition" },
      { fileName: "03-scope-definition.md", title: "Scope Definition", purpose: "Define what is in scope, what is out of scope, and what evidence matters.", humanGate: "always", next: "Diff Review" },
      { fileName: "04-diff-review.md", title: "Diff Review", purpose: "Inspect the diff against the request and look for regressions or missing tests.", humanGate: "always", next: "Findings Synthesis" },
      { fileName: "05-findings-synthesis.md", title: "Findings Synthesis", purpose: "Turn raw observations into blocking and non-blocking findings.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Check that every finding points to concrete evidence.", humanGate: "optional", next: "Close" },
      { fileName: "07-close.md", title: "Close", purpose: "Close the review with a clear recommendation or follow-up issue list.", humanGate: "never", next: null },
    ],
  },
  {
    id: "bug-fix",
    title: "Bug Fix",
    summary: "Diagnose a defect, clarify the failure, fix it, and verify the result.",
    focus: "bug fixes and regressions",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the bug report, environment, and user impact.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask for reproduction steps, expected behavior, and affected scope.", humanGate: "always", next: "Reproduction" },
      { fileName: "03-reproduction.md", title: "Reproduction", purpose: "Reproduce the failure and log the exact conditions that trigger it.", humanGate: "always", next: "Root Cause Analysis" },
      { fileName: "04-root-cause-analysis.md", title: "Root Cause Analysis", purpose: "Identify the source of the failure and document the supporting evidence.", humanGate: "always", next: "Fix" },
      { fileName: "05-fix.md", title: "Fix", purpose: "Implement the smallest safe change that resolves the bug.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Verify the fix with tests or other concrete evidence.", humanGate: "optional", next: "Close" },
      { fileName: "07-close.md", title: "Close", purpose: "Summarize the fix, the verification, and any residual risk.", humanGate: "never", next: null },
    ],
  },
  {
    id: "refactoring",
    title: "Refactoring",
    summary: "Improve structure and maintainability without widening the scope.",
    focus: "refactoring work",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the refactoring request and the code area to change.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "02-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask about behavioral constraints, risk tolerance, and success criteria.", humanGate: "always", next: "Impact Analysis" },
      { fileName: "03-impact-analysis.md", title: "Impact Analysis", purpose: "Identify the modules, dependencies, and risks that the refactor will touch.", humanGate: "always", next: "Scope Definition" },
      { fileName: "04-scope-definition.md", title: "Scope Definition", purpose: "Define the smallest refactor that still delivers the improvement.", humanGate: "always", next: "Refactor Plan" },
      { fileName: "05-refactor-plan.md", title: "Refactor Plan", purpose: "Lay out the steps and file boundaries for the refactor.", humanGate: "never", next: "Evidence Review" },
      { fileName: "06-evidence-review.md", title: "Evidence Review", purpose: "Verify that behavior remains stable after the refactor.", humanGate: "optional", next: "Close" },
      { fileName: "07-close.md", title: "Close", purpose: "Summarize the maintainability improvement and any follow-up work.", humanGate: "never", next: null },
    ],
  },
  {
    id: "mvp-planning",
    title: "MVP Planning",
    summary: "Identify the problem, clarify the requirements, review the plan, and only then break out development issues.",
    focus: "MVP planning",
    steps: [
      { fileName: "01-intake.md", title: "Intake", purpose: "Capture the product request, the users, and the problem statement.", humanGate: "always", next: "Requirement Analysis" },
      { fileName: "02-requirement-analysis.md", title: "Requirement Analysis", purpose: "Identify the users, problem, goals, constraints, and risks.", humanGate: "always", next: "Clarifying Questions" },
      { fileName: "03-clarifying-questions.md", title: "Clarifying Questions", purpose: "Ask the missing questions and log assumptions before the plan is written.", humanGate: "always", next: "Scope Definition" },
      { fileName: "04-scope-definition.md", title: "Scope Definition", purpose: "Define the MVP scope, the non-goals, and the acceptance criteria.", humanGate: "always", next: "MVP Plan" },
      { fileName: "05-mvp-plan.md", title: "MVP Plan", purpose: "Write the minimal plan that aligns the team on the first version.", humanGate: "always", next: "Plan Review" },
      { fileName: "06-plan-review.md", title: "Plan Review", purpose: "Review the plan before any development issues are generated.", humanGate: "always", next: "Issue Breakdown" },
      { fileName: "07-issue-breakdown.md", title: "Issue Breakdown", purpose: "Split the reviewed plan into child issues with clear goals and evidence requirements.", humanGate: "always", next: "Close" },
      { fileName: "08-close.md", title: "Close", purpose: "Record the final plan state, risks, and the next delivery step.", humanGate: "never", next: null },
    ],
  },
];

function artifact(path: string, content: string): ScaffoldArtifact {
  return { path, content };
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeScriptCommand(packageManager: PackageManager, scriptName: string): string | null {
  switch (packageManager) {
    case "npm":
      return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
    case "pnpm":
      return scriptName === "test" ? "pnpm test" : `pnpm ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    case "unknown":
      return null;
  }
}

function detectPackageManager(files: readonly string[]): PackageManager {
  if (files.includes("bun.lockb") || files.includes("bun.lock")) {
    return "bun";
  }
  if (files.includes("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (files.includes("yarn.lock")) {
    return "yarn";
  }
  if (files.includes("package-lock.json")) {
    return "npm";
  }
  if (files.includes("package.json")) {
    return "npm";
  }
  return "unknown";
}

function detectLanguage(packageJson: PackageJsonShape | null, files: readonly string[]): string {
  if (files.includes("pyproject.toml") || files.includes("requirements.txt")) {
    return "Python";
  }

  if (files.includes("go.mod")) {
    return "Go";
  }

  if (files.includes("pom.xml") || files.includes("build.gradle") || files.includes("build.gradle.kts")) {
    return "Java";
  }

  if (files.includes("Cargo.toml")) {
    return "Rust";
  }

  if (packageJson !== null) {
    if (files.includes("tsconfig.json") || hasDependency(packageJson, "typescript")) {
      return "TypeScript";
    }

    return "JavaScript";
  }

  if (files.some((file) => /\.(ts|tsx)$/.test(file))) {
    return "TypeScript";
  }

  if (files.some((file) => /\.(js|jsx|mjs|cjs)$/.test(file))) {
    return "JavaScript";
  }

  return "Unknown";
}

function hasDependency(packageJson: PackageJsonShape, dependencyName: string): boolean {
  const dependencyGroups = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
  ];

  return dependencyGroups.some((group) => group !== undefined && dependencyName in group);
}

function detectFramework(packageJson: PackageJsonShape | null, files: readonly string[]): string {
  const dependencyNames = new Set<string>();
  if (packageJson !== null) {
    for (const group of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
      for (const name of Object.keys(group ?? {})) {
        dependencyNames.add(name);
      }
    }
  }

  if (dependencyNames.has("next") || files.some((file) => /^next\.config\./.test(file))) {
    return "Next.js";
  }

  if (dependencyNames.has("react") || dependencyNames.has("react-dom")) {
    return "React";
  }

  if (dependencyNames.has("vue")) {
    return "Vue";
  }

  if (dependencyNames.has("svelte")) {
    return "Svelte";
  }

  if (dependencyNames.has("@nestjs/core")) {
    return "NestJS";
  }

  if (dependencyNames.has("express")) {
    return "Express";
  }

  if (files.includes("pyproject.toml")) {
    return "Python";
  }

  if (files.includes("Cargo.toml")) {
    return "Rust";
  }

  return packageJson === null ? "Unknown" : "Node.js";
}

function renderCommandLine(label: string, command: string | null): string {
  return command === null ? `${label}: TODO: detect a command.` : `${label}: \`${command}\``;
}

function renderList(label: string, values: readonly string[]): string {
  if (values.length === 0) {
    return `${label}: TODO: detect`;
  }

  return [
    `${label}:`,
    ...values.map((value) => `- ${value}`),
  ].join("\n");
}

function renderProjectNotes(notes: readonly string[]): string {
  if (notes.length === 0) {
    return "- No major uncertainty detected.";
  }

  return notes.map((note) => `- ${note}`).join("\n");
}

async function collectRootFiles(rootDir: string): Promise<readonly string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  return entries.map((entry) => entry.name).sort();
}

async function readPackageJson(rootDir: string): Promise<PackageJsonShape | null> {
  const packageJsonPath = join(rootDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    return null;
  }

  try {
    return await readJsonFile<PackageJsonShape>(packageJsonPath);
  } catch {
    return null;
  }
}

async function collectSourceDirectories(rootDir: string, rootFiles: readonly string[]): Promise<readonly string[]> {
  const discovered = new Set<string>();
  for (const candidate of ["src", "app", "apps", "lib"]) {
    if (rootFiles.includes(candidate) && await pathExists(join(rootDir, candidate))) {
      discovered.add(candidate);
    }
  }

  if (rootFiles.includes("packages") && await pathExists(join(rootDir, "packages"))) {
    const packageEntries = await readdir(join(rootDir, "packages"), { withFileTypes: true });
    for (const entry of packageEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageSrc = join(rootDir, "packages", entry.name, "src");
      if (await pathExists(packageSrc)) {
        discovered.add(`packages/${entry.name}/src`);
      }
    }
  }

  return [...discovered].sort();
}

async function collectDocumentationPaths(rootDir: string, rootFiles: readonly string[]): Promise<readonly string[]> {
  const discovered = new Set<string>();
  for (const file of rootFiles) {
    if (/^readme(\.[a-z0-9]+)?$/i.test(file)) {
      discovered.add(file);
    }
  }

  if (rootFiles.includes("docs") && await pathExists(join(rootDir, "docs"))) {
    discovered.add("docs");
    const docsEntries = await readdir(join(rootDir, "docs"), { withFileTypes: true });
    for (const entry of docsEntries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        discovered.add(`docs/${entry.name}`);
      }
    }
  }

  return [...discovered].sort();
}

async function collectGitStatus(rootDir: string): Promise<string> {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.error instanceof Error) {
    return "Git status unavailable.";
  }

  if (result.status === 128 && /not a git repository/i.test(result.stderr ?? "")) {
    return "Not a git repository.";
  }

  const output = result.stdout?.trim() ?? "";
  return output.length === 0 ? "Clean working tree." : output;
}

function renderWorkflowStepMarkdown(
  workflow: WorkflowSpec,
  step: WorkflowStepSpec,
  nextStep: WorkflowStepSpec | null,
  analysis: ProjectAnalysis,
): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";
  const nextStepTitle = nextStep === null ? "none" : nextStep.title;

  const requiredInputs = [
    "The current request or issue summary.",
    "The project profile from `.agent/config/project-profile.md`.",
    "The commands summary from `.agent/config/commands.md`.",
    analysis.sourceDirectories.length > 0
      ? `Relevant source directories: ${analysis.sourceDirectories.join(", ")}.`
      : "TODO: detect the source directories before starting the step.",
  ];

  const actions = [
    `Keep the ${workflow.title.toLowerCase()} flow focused on ${workflow.focus}.`,
    `Use \`${buildCommand}\`, \`${testCommand}\`, and \`${lintCommand}\` when they are relevant to the step.`,
    "Append evidence to the issue log instead of rewriting prior work.",
  ];

  const evidenceRequired = [
    "The step note itself and the related issue log entry.",
    analysis.testCommand === null
      ? "TODO: add a project test command to make evidence stronger."
      : `Output from \`${analysis.testCommand}\` when this step changes code.`,
    analysis.buildCommand === null
      ? "TODO: add a project build command if the project ships code."
      : `Output from \`${analysis.buildCommand}\` when the step reaches a delivery point.`,
  ];

  const exitCriteria = [
    `The ${step.title.toLowerCase()} outcome is documented.`,
    `The next step is \`${nextStepTitle}\`.`,
  ];

  if (workflow.id === "mvp-planning") {
    if (step.title === "Requirement Analysis") {
      requiredInputs.push(
        "The users and stakeholders behind the request.",
        "The problem being solved and the desired outcome.",
        "Known risks, constraints, and deadlines.",
      );
      actions.push("Capture assumptions, missing information, and anything that must be clarified before the plan is written.");
    }

    if (step.title === "Clarifying Questions") {
      requiredInputs.push(
        "The current list of missing questions.",
        "Any assumptions already captured in the analysis step.",
      );
      actions.push("Write the missing questions that block the plan and note any assumptions explicitly.");
    }

    if (step.title === "Scope Definition") {
      requiredInputs.push(
        "The users, goals, constraints, risks, MVP scope, non-goals, and acceptance criteria.",
      );
      actions.push("Draw the line around the MVP and call out what is deliberately out of scope.");
    }

    if (step.title === "MVP Plan") {
      requiredInputs.push(
        "A scoped MVP, the risk notes, and the list of open questions.",
      );
      actions.push("Write the reviewed plan in a form that can be checked before any development issues are generated.");
      evidenceRequired.push("The reviewed plan text and the recorded review outcome.");
      exitCriteria.push("The plan can be handed off for review without further ambiguity.");
    }

    if (step.title === "Plan Review") {
      requiredInputs.push(
        "The written MVP plan and any open questions.",
      );
      actions.push("Review the plan against the goals, constraints, and non-goals before child issues are generated.");
      evidenceRequired.push("The review result and any blocking follow-up items.");
      exitCriteria.push("The plan is approved or the blocking changes are recorded.");
    }

    if (step.title === "Issue Breakdown") {
      requiredInputs.push(
        "The reviewed MVP plan.",
        "The accepted scope and the list of out-of-scope items.",
      );
      actions.push("Split the reviewed plan into child issues with titles, types, workflows, goals, acceptance criteria, dependencies, and evidence requirements.");
      evidenceRequired.push("The issue breakdown list and parent/child relation notes.");
      exitCriteria.push("Every development issue is grounded in the reviewed plan.");
    }
  }

  if (step.title === "Clarifying Questions") {
    actions.push("Log assumptions when the request is incomplete and stop short of implementation until the missing information is captured.");
  }

  return [
    "---",
    `workflow: ${workflow.id}`,
    `name: ${step.title}`,
    `human_gate: ${step.humanGate}`,
    `next: ${nextStepTitle}`,
    "---",
    "",
    `# ${step.title}`,
    "",
    "## Purpose",
    step.purpose,
    "",
    "## Human Gate",
    `- ${step.humanGate}`,
    "",
    "## Project Context",
    `- Project: ${analysis.projectName}`,
    `- Package manager: ${analysis.packageManager}`,
    `- Language: ${analysis.language}`,
    `- Framework: ${analysis.framework}`,
    "",
    "## Required Inputs",
    ...requiredInputs.map((item) => `- ${item}`),
    "",
    "## Actions",
    ...actions.map((item) => `- ${item}`),
    "",
    "## Evidence Required",
    ...evidenceRequired.map((item) => `- ${item}`),
    "",
    "## Exit Criteria",
    ...exitCriteria.map((item) => `- ${item}`),
    "",
    "## Next Step",
    `- ${nextStepTitle}`,
    "",
  ].join("\n");
}

function renderWorkflowReadme(workflow: WorkflowSpec, analysis: ProjectAnalysis): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";

  return [
    `# ${workflow.title}`,
    "",
    workflow.summary,
    "",
    "## Step Files",
    ...workflow.steps.map((step) => `- ${step.fileName}: ${step.title}`),
    "",
    "## Commands",
    `- Build: ${buildCommand}`,
    `- Test: ${testCommand}`,
    `- Lint: ${lintCommand}`,
    "",
    "## Notes",
    `- Focus: ${workflow.focus}.`,
    "- Each step file is ordered and should be read from top to bottom.",
    "- Each step file includes frontmatter that the workflow loader can parse.",
    "",
  ].join("\n");
}

function renderSkillMarkdown(title: string, analysis: ProjectAnalysis, bullets: readonly string[]): string {
  return [
    `# ${title}`,
    "",
    "## Purpose",
    bullets[0] ?? "Support the current project workflow.",
    "",
    "## When to Use",
    ...bullets.slice(1, 3).map((line) => `- ${line}`),
    "",
    "## Inputs",
    "- Project profile",
    analysis.sourceDirectories.length === 0
      ? "- TODO: detect source directories."
      : `- Source directories: ${analysis.sourceDirectories.join(", ")}`,
    analysis.testCommand === null
      ? "- TODO: detect a test command."
      : `- Test command: \`${analysis.testCommand}\``,
    analysis.buildCommand === null
      ? "- TODO: detect a build command."
      : `- Build command: \`${analysis.buildCommand}\``,
    "",
    "## Actions",
    ...bullets.slice(3, 6).map((line) => `- ${line}`),
    "",
    "## Evidence Required",
    "- Relevant files or diffs.",
    analysis.testCommand === null ? "- TODO: add a project test command." : `- Output from \`${analysis.testCommand}\`.`,
    "",
    "## Exit Criteria",
    bullets[6] ?? "A next action is clear and the issue log can be updated.",
    "",
  ].join("\n");
}

export function renderProjectAnalysis(rootDir: string, projectName?: string): Promise<ProjectAnalysis> {
  return (async () => {
    const rootFiles = await collectRootFiles(rootDir);
    const packageJson = await readPackageJson(rootDir);
    const packageManager = detectPackageManager(rootFiles);
    const language = detectLanguage(packageJson, rootFiles);
    const framework = detectFramework(packageJson, rootFiles);
    const sourceDirectories = await collectSourceDirectories(rootDir, rootFiles);
    const documentationPaths = await collectDocumentationPaths(rootDir, rootFiles);
    const gitStatus = await collectGitStatus(rootDir);
    const scripts = packageJson?.scripts ?? {};
    const buildCommand = scripts.build !== undefined ? normalizeScriptCommand(packageManager, "build") : null;
    const testCommand = scripts.test !== undefined ? normalizeScriptCommand(packageManager, "test") : null;
    const lintCommand = scripts.lint !== undefined ? normalizeScriptCommand(packageManager, "lint") : null;

    const notes: string[] = [];
    if (packageJson === null) {
      notes.push("No package.json file was detected.");
    } else {
      notes.push(`package.json name: ${packageJson.name ?? "TODO: detect a project name"}.`);
    }
    if (buildCommand === null) {
      notes.push("Build command was not detected.");
    }
    if (testCommand === null) {
      notes.push("Test command was not detected.");
    }
    if (lintCommand === null) {
      notes.push("Lint command was not detected.");
    }
    if (sourceDirectories.length === 0) {
      notes.push("No source directories were detected.");
    }
    if (documentationPaths.length === 0) {
      notes.push("No README or docs paths were detected.");
    }

    const fallbackName = rootDir.split(/[/\\]/).filter(Boolean).at(-1) ?? "flowness";
    const resolvedProjectName = projectName ?? packageJson?.name ?? fallbackName;

    return {
      rootDir,
      projectName: resolvedProjectName,
      packageManager,
      language,
      framework,
      buildCommand,
      testCommand,
      lintCommand,
      sourceDirectories,
      documentationPaths,
      gitStatus,
      packageJsonPath: packageJson === null ? null : join(rootDir, "package.json"),
      notes,
    };
  })();
}

export function renderGeneratedAgentsMarkdown(analysis: ProjectAnalysis): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";

  return [
    "# AGENTS",
    "",
    "If `.agent/` exists, use Flowness for all development work.",
    "First analyze the request before creating an issue.",
    "Do not create issues for greetings, thanks, casual conversation, or simple Q&A.",
    "Use the MVP planning workflow for product and MVP requests.",
    "Ask clarification questions when requirements are incomplete.",
    "Reuse an existing open issue when the request matches the same work item.",
    "Split large work into issues instead of forcing it into one ticket.",
    "",
    "## Start Here",
    '- Run `flowness request:create "<request>"` for real work requests.',
    "- If a request is already analyzed, route it through the matching workflow and issue decomposition path.",
    "- Reuse an existing open issue when the request matches the same work item.",
    '- If you need the local TypeScript helper, run `npx tsx .agent/scripts/flowness-runner.ts "<request>"`.',
    "- If the request is casual or question-only, answer directly and do not open an issue.",
    "- Follow `.agent/rules/request-analysis.md`, `.agent/rules/clarification-policy.md`, `.agent/rules/issue-decomposition.md`, `.agent/rules/fail-closed-workflow.md`, and the workflow step files.",
    "",
    "## Project Context",
    `- Project: ${analysis.projectName}`,
    `- Package manager: ${analysis.packageManager}`,
    `- Language: ${analysis.language}`,
    `- Framework: ${analysis.framework}`,
    renderCommandLine("Build command", analysis.buildCommand),
    renderCommandLine("Test command", analysis.testCommand),
    renderCommandLine("Lint command", analysis.lintCommand),
    analysis.sourceDirectories.length === 0
      ? "- Source directories: TODO: detect source directories."
      : `- Source directories: ${analysis.sourceDirectories.join(", ")}`,
    analysis.documentationPaths.length === 0
      ? "- Documentation paths: TODO: detect README/docs paths."
      : `- Documentation paths: ${analysis.documentationPaths.join(", ")}`,
    `- Git status: ${analysis.gitStatus}`,
    "",
    "## Workflow Files",
    "- `.agent/rules/flowness-activation.md`",
    "- `.agent/rules/request-analysis.md`",
    "- `.agent/rules/clarification-policy.md`",
    "- `.agent/rules/issue-decomposition.md`",
    "- `.agent/rules/fail-closed-workflow.md`",
    "- `.agent/rules/workflow-routing.md`",
    "- `.agent/rules/definition-of-done.md`",
    "- `.agent/rules/evidence-policy.md`",
    "- `.agent/rules/*.md`",
    "- `.agent/config/project-profile.md`",
    "- `.agent/config/commands.md`",
    "- `.agent/scripts/README.md`",
    "- `.agent/scripts/flowness-runner.ts`",
    "- `.agent/scripts/workflow-guard.ts`",
    "- `.agent/workflows/feature-development/`",
    "- `.agent/workflows/code-review/`",
    "- `.agent/workflows/bug-fix/`",
    "- `.agent/workflows/refactoring/`",
    "- `.agent/workflows/mvp-planning/`",
    "",
    "## Verification",
    `- Build: ${buildCommand}`,
    `- Test: ${testCommand}`,
    `- Lint: ${lintCommand}`,
    "",
    "## Notes",
    "- Do not rely on `master-plan.md` unless you are working on Flowness itself.",
    renderProjectNotes(analysis.notes),
    "",
  ].join("\n");
}

export function renderGeneratedProjectProfileMarkdown(analysis: ProjectAnalysis): string {
  return [
    "# Project Profile",
    "",
    `- Project: ${analysis.projectName}`,
    `- Package manager: ${analysis.packageManager}`,
    `- Language: ${analysis.language}`,
    `- Framework: ${analysis.framework}`,
    "",
    "## Commands",
    renderCommandLine("Build", analysis.buildCommand),
    renderCommandLine("Test", analysis.testCommand),
    renderCommandLine("Lint", analysis.lintCommand),
    "",
    "## Source Directories",
    renderList("Detected source directories", analysis.sourceDirectories),
    "",
    "## Documentation",
    renderList("Detected README/docs paths", analysis.documentationPaths),
    "",
    "## Git Status",
    analysis.gitStatus,
    "",
    "## Notes",
    renderProjectNotes(analysis.notes),
    "",
  ].join("\n");
}

export function renderGeneratedProjectCommandsMarkdown(analysis: ProjectAnalysis): string {
  return [
    "# Commands",
    "",
    "## Build",
    analysis.buildCommand ?? "TODO: detect build command.",
    "",
    "## Test",
    analysis.testCommand ?? "TODO: detect test command.",
    "",
    "## Lint",
    analysis.lintCommand ?? "TODO: detect lint command.",
    "",
    "## Package Manager",
    analysis.packageManager,
    "",
    "## Source Directories",
    analysis.sourceDirectories.length === 0 ? "TODO: detect source directories." : analysis.sourceDirectories.join("\n"),
    "",
  ].join("\n");
}

export function renderGeneratedConfigArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".agent/config/project-profile.md", renderGeneratedProjectProfileMarkdown(analysis)),
    artifact(".agent/config/commands.md", renderGeneratedProjectCommandsMarkdown(analysis)),
  ];
}

export function renderGeneratedRuleArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".agent/rules/README.md", [
      "# Rules",
      "",
      "- `request-analysis.md`",
      "- `clarification-policy.md`",
      "- `issue-decomposition.md`",
      "- `fail-closed-workflow.md`",
      "- `flowness-activation.md`",
      "- `workflow-routing.md`",
      "- `definition-of-done.md`",
      "- `evidence-policy.md`",
      "- `workflow-step-contract.md`",
      "",
      "These rules keep the project-specific workflow disciplined and evidence-backed.",
      "",
    ].join("\n")),
    artifact(".agent/rules/request-analysis.md", [
      "# Request Analysis",
      "",
      "- First classify the request before creating any issue.",
      "- Use `casual_or_question` for greetings and simple Q&A; do not create an issue.",
      "- Use `single_development_task` for a one-off implementation task.",
      "- Use `mvp_or_product_planning` for MVP or product planning requests and route them to `mvp-planning`.",
      "- Use `multi_issue_project` when the request should be split into multiple child issues.",
      "- Route review, bug fix, and refactor requests to their matching workflows.",
      "- Reuse an existing open issue when the request matches the same work item.",
      "",
    ].join("\n")),
    artifact(".agent/rules/clarification-policy.md", [
      "# Clarification Policy",
      "",
      "- Ask clarification questions early in every workflow.",
      "- Log assumptions whenever requirements are incomplete.",
      "- Stop before implementation if a required answer is still missing.",
      "- Make missing users, goals, constraints, risks, and acceptance criteria explicit.",
      "",
    ].join("\n")),
    artifact(".agent/rules/issue-decomposition.md", [
      "# Issue Decomposition",
      "",
      "- Split large requests into 1..N issues when the work is too broad for one issue.",
      "- Each issue must include title, type, workflow, goal, acceptance criteria, dependencies, and evidence required.",
      "- Persist parent/child relation when the workspace can store it.",
      "- Keep child issues small enough to execute and verify independently.",
      "",
    ].join("\n")),
    artifact(".agent/rules/fail-closed-workflow.md", [
      "# Fail Closed Workflow",
      "",
      "- Do not skip workflow steps.",
      "- Do not close an issue without evidence.",
      "- Do not continue after a failed review unless recovery is logged.",
      "- If a gate fails, record the failure and stop at the blocked step.",
      "",
    ].join("\n")),
    artifact(".agent/rules/flowness-activation.md", [
      "# Flowness Activation",
      "",
      `- Project: ${analysis.projectName}`,
      "- If `.agent/` exists, use Flowness for all development work.",
      "- First analyze the request before creating any issue.",
      "- Do not create issues for simple questions or casual conversation.",
      "- Use the MVP workflow for product and MVP requests.",
      "- Ask clarification questions when the requirements are incomplete.",
      "- Reuse an existing open issue when the request matches the same work item.",
      "- Split large work into issues instead of forcing it into one ticket.",
      "- Follow `.agent/rules/*` and the workflow step files before implementing.",
      "",
    ].join("\n")),
    artifact(".agent/rules/workflow-routing.md", [
      "# Workflow Routing",
      "",
      "- Classify the request before changing code.",
      "- Casual conversation and simple Q&A do not create issues.",
      "- Route `mvp_or_product_planning` requests to `mvp-planning`.",
      "- Route review, bug fix, and refactor requests to their matching workflows.",
      "- Reuse an existing issue when the request matches the same work item.",
      "- Create a new issue only when a real task is being started.",
      "- Do not create a duplicate issue when a matching open issue already exists.",
      "",
    ].join("\n")),
    artifact(".agent/rules/definition-of-done.md", [
      "# Definition of Done",
      "",
      `- Build evidence should use \`${analysis.buildCommand ?? "TODO: detect build command"}\` when available.`,
      `- Test evidence should use \`${analysis.testCommand ?? "TODO: detect test command"}\` when available.`,
      analysis.lintCommand === null
        ? "- Lint evidence is not yet detected; add a lint command when the project has one."
        : `- Lint evidence should use \`${analysis.lintCommand}\` when available.`,
      "- Evidence must point to real project artifacts, not only Flowness metadata.",
      "- Workflow state and issue logs must be updated before closing.",
      "- Do not claim completion while the final review or evidence gate is still blocked.",
      "",
    ].join("\n")),
    artifact(".agent/rules/evidence-policy.md", [
      "# Evidence Policy",
      "",
      "- Prefer evidence from the detected source directories and docs.",
      analysis.sourceDirectories.length === 0
        ? "- TODO: detect source directories before relying on evidence."
        : `- Source directories: ${analysis.sourceDirectories.join(", ")}`,
      analysis.documentationPaths.length === 0
        ? "- TODO: detect README/docs paths before relying on documentation evidence."
        : `- Documentation paths: ${analysis.documentationPaths.join(", ")}`,
      `- Use \`${analysis.testCommand ?? "TODO: detect test command"}\` for test evidence when it exists.`,
      `- Use \`${analysis.buildCommand ?? "TODO: detect build command"}\` for build evidence when it exists.`,
      analysis.lintCommand === null
        ? "- Add lint evidence once a lint command exists."
        : `- Use \`${analysis.lintCommand}\` for lint evidence when it exists.`,
      "- Keep evidence append-only in the issue log.",
      "",
    ].join("\n")),
    artifact(".agent/rules/workflow-step-contract.md", [
      "# Workflow Step Contract",
      "",
      "- Run exactly one valid step at a time.",
      "- Do not skip ahead in the workflow order.",
      "- Append logs instead of rewriting them.",
      "- Stop when the current step needs evidence or review that is still missing.",
      "- If a review fails, log the recovery path before trying again.",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedSkillArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".agent/skills/root-cause-analysis.md", renderSkillMarkdown("Root Cause Analysis", analysis, [
      "Find the smallest reproducible cause before changing code.",
      "Use it when a command fails, a regression appears, or behavior is unclear.",
      "Reproduce the issue, isolate the path, and capture the evidence.",
      "Trace the failure through logs, tests, and relevant source files.",
      "Prefer a narrow explanation with file and line references.",
      "Record the failure mode and the likely fix path.",
      "The cause is explained and the next step is obvious.",
    ])),
    artifact(".agent/skills/code-review.md", renderSkillMarkdown("Code Review", analysis, [
      "Review a pull request, patch, or change set before it lands.",
      "Use it when you need to find bugs, regressions, or missing tests.",
      "Read the diff, compare it with the request, and look for risky edges.",
      "Check whether the change matches the existing workflow and evidence rules.",
      "List blocking and non-blocking findings separately.",
      "Tie each finding back to concrete evidence.",
      "The review can be summarized with clear follow-up items.",
    ])),
    artifact(".agent/skills/test-planning.md", renderSkillMarkdown("Test Planning", analysis, [
      "Plan tests before or after a change so the evidence path is clear.",
      "Use it when a task needs verification, regression coverage, or a gap analysis.",
      "Choose the smallest useful command set first.",
      "Use the detected test command when it exists.",
      "Call out missing fixtures, commands, or coverage gaps.",
      "Prefer commands that prove behavior rather than just compiling code.",
      "The test plan names the commands and evidence that matter.",
    ])),
    artifact(".agent/skills/implementation-planning.md", renderSkillMarkdown("Implementation Planning", analysis, [
      "Turn a request into a small, safe implementation sequence.",
      "Use it when a task needs an execution plan before code changes start.",
      "Map the request to the workflow and the likely files involved.",
      "Note the build/test/lint commands that should validate the change.",
      "Keep the plan narrow enough to finish in one workflow pass.",
      "Flag uncertainty instead of inventing details.",
      "The implementation path is scoped and ready to execute.",
    ])),
    artifact(".agent/skills/README.md", [
      "# Skills",
      "",
      "- `root-cause-analysis.md`",
      "- `code-review.md`",
      "- `test-planning.md`",
      "- `implementation-planning.md`",
      "",
      "Use these skills to keep issue work grounded in evidence and the detected project context.",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedTemplateArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".agent/templates/issue-template.md", [
      "# Issue Template",
      "",
      "## Title",
      "Describe the issue in one sentence.",
      "",
      "## Type",
      "feature | bugfix | refactor | research | investigation | planning | mvp | harness | documentation | decision",
      "",
      "## Workflow",
      "The workflow id that should execute this issue.",
      "",
      "## Goal",
      "What outcome should this issue achieve?",
      "",
      "## Acceptance Criteria",
      "- List the smallest useful outcomes.",
      "",
      "## Dependencies",
      "- List the issues or decisions this work depends on.",
      "",
      "## Evidence Required",
      "- Link to commands, files, or screenshots that prove the work.",
      "",
      "## Parent / Child Relations",
      "- Parent issue id if this is a child issue.",
      "- Child issue ids if this is a planning issue.",
      "",
      "## Notes",
      "- Keep the issue focused and append-only.",
      "",
    ].join("\n")),
    artifact(".agent/templates/issue-breakdown-template.md", [
      "# Issue Breakdown Template",
      "",
      "## Parent Issue",
      "Describe the planning issue that was reviewed.",
      "",
      "## Child Issues",
      "- Title",
      "- Type",
      "- Workflow",
      "- Goal",
      "- Acceptance Criteria",
      "- Dependencies",
      "- Evidence Required",
      "",
      "## Notes",
      "- Create only the issues that are approved by the reviewed plan.",
      "- Keep the parent/child relation explicit.",
      "",
    ].join("\n")),
    artifact(".agent/templates/decision-template.md", [
      "# Decision Template",
      "",
      "## Context",
      "Describe the situation and why a decision is needed.",
      "",
      "## Options",
      "- Option 1",
      "- Option 2",
      "",
      "## Decision",
      "State the chosen option clearly.",
      "",
      "## Consequences",
      "- What changes.",
      "- What remains open.",
      "",
      "## Evidence",
      `- Use \`${analysis.testCommand ?? "TODO: detect test command"}\` or other project evidence when relevant.`,
      "",
    ].join("\n")),
    artifact(".agent/templates/review-template.md", [
      "# Review Template",
      "",
      "## Scope",
      "Summarize the files or change set being reviewed.",
      "",
      "## Findings",
      "- Blocking",
      "- Non-blocking",
      "",
      "## Evidence",
      `- Use the detected commands when available: ${analysis.testCommand ?? "TODO"}, ${analysis.buildCommand ?? "TODO"}.`,
      "",
      "## Follow-up",
      "List the smallest next action if a fix is needed.",
      "",
    ].join("\n")),
    artifact(".agent/templates/log-entry-template.md", [
      "# Log Entry Template",
      "",
      "## Timestamp",
      "YYYY-MM-DDTHH:MM:SSZ",
      "",
      "## Step",
      "The step name.",
      "",
      "## Actions",
      "- What changed or what was inspected.",
      "",
      "## Evidence",
      "- The files, commands, or outputs that matter.",
      "",
      "## Summary",
      "A short statement of the result.",
      "",
      "## Next Step",
      "The next workflow step or `none`.",
      "",
    ].join("\n")),
    artifact(".agent/templates/README.md", [
      "# Templates",
      "",
      "- `issue-template.md`",
      "- `issue-breakdown-template.md`",
      "- `decision-template.md`",
      "- `review-template.md`",
      "- `log-entry-template.md`",
      "",
      "These templates are small, project-aware starting points for issue work.",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedWorkflowArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  const artifacts: ScaffoldArtifact[] = [
    artifact(".agent/workflows/README.md", [
      "# Workflows",
      "",
      "- `feature-development/`",
      "- `code-review/`",
      "- `bug-fix/`",
      "- `refactoring/`",
      "- `mvp-planning/`",
      "",
      "Each workflow folder contains ordered markdown step files that describe the path from intake to closure.",
      "",
    ].join("\n")),
  ];

  for (const workflow of workflowSpecs) {
    artifacts.push(
      artifact(`.agent/workflows/${workflow.id}/README.md`, renderWorkflowReadme(workflow, analysis)),
    );

    for (let index = 0; index < workflow.steps.length; index += 1) {
      const step = workflow.steps[index];
      if (step === undefined) {
        continue;
      }
      const nextStep = workflow.steps[index + 1] ?? null;
      artifacts.push(
        artifact(
          `.agent/workflows/${workflow.id}/${step.fileName}`,
          renderWorkflowStepMarkdown(workflow, step, nextStep, analysis),
        ),
      );
    }
  }

  return artifacts;
}

export function renderGeneratedScriptArtifacts(analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".agent/scripts/flowness-runner.ts", [
      "#!/usr/bin/env node",
      "",
      "import { spawnSync } from \"node:child_process\";",
      "",
      "function run(command: string, args: readonly string[]): number {",
      "  const result = spawnSync(command, [...args], {",
      "    stdio: \"inherit\",",
      "    encoding: \"utf8\",",
      "  });",
      "",
      "  if (result.error !== undefined) {",
      "    const error = result.error as { code?: string; message?: string };",
      "    if (error.code === \"ENOENT\") {",
      "      return 127;",
      "    }",
      "",
      "    console.error(error.message ?? \"Failed to run Flowness CLI.\");",
      "    return 1;",
      "  }",
      "",
      "  return result.status ?? 0;",
      "}",
      "",
      "function main(): number {",
      "  const request = process.argv.slice(2).join(\" \").trim();",
      "  if (request.length === 0) {",
      "    console.error('Usage: npx tsx .agent/scripts/flowness-runner.ts \"<request>\"');",
      "    return 1;",
      "  }",
      "",
      "  const attempts: readonly (readonly [string, readonly string[]])[] = [",
      "    [\"flowness\", [\"request:create\", request]],",
      "    [\"npx\", [\"flowness\", \"request:create\", request]],",
      "    [\"npm\", [\"exec\", \"flowness\", \"--\", \"request:create\", request]],",
      "  ];",
      "",
      "  for (const attempt of attempts) {",
      "    const [command, args] = attempt;",
      "    const code = run(command, args);",
      "    if (code !== 127) {",
      "      return code;",
      "    }",
      "  }",
      "",
      "  console.error('Flowness CLI was not found. Install or link `flowness`, then run the command again.');",
      "  return 1;",
      "}",
      "",
      "process.exitCode = main();",
      "",
    ].join("\n")),
    artifact(".agent/scripts/workflow-guard.ts", [
      "#!/usr/bin/env node",
      "",
      "import { existsSync } from \"node:fs\";",
      "import { spawnSync } from \"node:child_process\";",
      "import { join } from \"node:path\";",
      "",
      "function run(command: string, args: readonly string[]): number {",
      "  const result = spawnSync(command, [...args], {",
      "    stdio: \"inherit\",",
      "    encoding: \"utf8\",",
      "  });",
      "",
      "  if (result.error !== undefined) {",
      "    const error = result.error as { code?: string; message?: string };",
      "    if (error.code === \"ENOENT\") {",
      "      return 127;",
      "    }",
      "",
      "    console.error(error.message ?? \"Failed to run Flowness CLI.\");",
      "    return 1;",
      "  }",
      "",
      "  return result.status ?? 0;",
      "}",
      "",
      "function main(): number {",
      "  const rootDir = process.cwd();",
      "  const configPath = join(rootDir, \".flowness\", \"config.yaml\");",
      "  if (!existsSync(configPath)) {",
      "    console.error('Flowness project is not initialized. Run `flowness init` first.');",
      "    return 1;",
      "  }",
      "",
      "  const workflowId = process.argv.slice(2).filter((token) => !token.startsWith(\"-\")).at(0);",
      "  const commandArgs = workflowId === undefined",
      "    ? [\"validate\"]",
      "    : [\"workflow:validate\", workflowId];",
      "",
      "  const attempts: readonly (readonly [string, readonly string[]])[] = [",
      "    [\"flowness\", commandArgs],",
      "    [\"npx\", [\"flowness\", ...commandArgs]],",
      "    [\"npm\", [\"exec\", \"flowness\", \"--\", ...commandArgs]],",
      "  ];",
      "",
      "  for (const attempt of attempts) {",
      "    const [command, args] = attempt;",
      "    const code = run(command, args);",
      "    if (code !== 127) {",
      "      return code;",
      "    }",
      "  }",
      "",
      "  console.error('Flowness CLI was not found. Install or link `flowness`, then run `flowness validate` manually.');",
      "  return 1;",
      "}",
      "",
      "process.exitCode = main();",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedHookArtifacts(_analysis: ProjectAnalysis): readonly ScaffoldArtifact[] {
  return [
    artifact(".codex/hooks/package.json", JSON.stringify({
      type: "module",
    }, null, 2) + "\n"),
    artifact(".codex/hooks/user-prompt-submit.ts", [
      "#!/usr/bin/env node",
      "",
      "import { existsSync } from \"node:fs\";",
      "import { spawnSync } from \"node:child_process\";",
      "import { join, dirname } from \"node:path\";",
      "",
      "interface HookInput {",
      "  readonly prompt?: string;",
      "  readonly turn_id?: string;",
      "  readonly [key: string]: unknown;",
      "}",
      "",
      "function readAllStdin(): Promise<string> {",
      "  return new Promise((resolve, reject) => {",
      "    const chunks: Buffer[] = [];",
      "    process.stdin.setEncoding(\"utf8\");",
      "    process.stdin.on(\"data\", (chunk: string) => chunks.push(Buffer.from(chunk, \"utf8\")));",
      "    process.stdin.on(\"end\", () => resolve(Buffer.concat(chunks).toString(\"utf8\")));",
      "    process.stdin.on(\"error\", reject);",
      "  });",
      "}",
      "",
      "function findWorkspaceRoot(startDir: string): string | null {",
      "  let currentDir = startDir;",
      "  while (true) {",
      "    if (existsSync(join(currentDir, \".flowness\", \"config.yaml\"))) {",
      "      return currentDir;",
      "    }",
      "",
      "    const parentDir = dirname(currentDir);",
      "    if (parentDir === currentDir) {",
      "      return null;",
      "    }",
      "",
      "    currentDir = parentDir;",
      "  }",
      "}",
      "",
      "function runFlownessRequestCreate(rootDir: string, prompt: string): { status: number; stdout: string; stderr: string } {",
      "  const attempts: readonly (readonly [string, readonly string[]])[] = [",
      "    [\"flowness\", [\"request:create\", prompt]],",
      "    [\"npx\", [\"flowness\", \"request:create\", prompt]],",
      "    [\"npm\", [\"exec\", \"flowness\", \"--\", \"request:create\", prompt]],",
      "  ];",
      "",
      "  for (const attempt of attempts) {",
      "    const [command, args] = attempt;",
      "    const result = spawnSync(command, [...args], {",
      "      cwd: rootDir,",
      "      encoding: \"utf8\",",
      "      maxBuffer: 10 * 1024 * 1024,",
      "    });",
      "",
      "    if (result.error !== undefined) {",
      "      const error = result.error as { code?: string; message?: string };",
      "      if (error.code === \"ENOENT\") {",
      "        continue;",
      "      }",
      "",
      "      return {",
      "        status: 1,",
      "        stdout: result.stdout ?? \"\",",
      "        stderr: error.message ?? \"Failed to run Flowness CLI.\",",
      "      };",
      "    }",
      "",
      "    return {",
      "      status: result.status ?? 0,",
      "      stdout: result.stdout ?? \"\",",
      "      stderr: result.stderr ?? \"\",",
      "    };",
      "  }",
      "",
      "  return {",
      "    status: 127,",
      "    stdout: \"\",",
      "    stderr: \"Flowness CLI was not found.\",",
      "  };",
      "}",
      "",
      "async function main(): Promise<number> {",
      "  const rawInput = await readAllStdin();",
      "  if (rawInput.trim().length === 0) {",
      "    return 0;",
      "  }",
      "",
      "  let input: HookInput;",
      "  try {",
      "    input = JSON.parse(rawInput) as HookInput;",
      "  } catch {",
      "    return 0;",
      "  }",
      "",
      "  const prompt = typeof input.prompt === \"string\" ? input.prompt.trim() : \"\";",
      "  if (prompt.length === 0) {",
      "    return 0;",
      "  }",
      "",
      "  const rootDir = findWorkspaceRoot(process.cwd());",
      "  if (rootDir === null) {",
      "    return 0;",
      "  }",
      "",
      "  const result = runFlownessRequestCreate(rootDir, prompt);",
      "  if (result.status === 127) {",
      "    return 0;",
      "  }",
      "",
      "  const context = result.status === 0",
      "    ? result.stdout.trim()",
      "    : [result.stderr.trim(), result.stdout.trim()].filter((entry) => entry.length > 0).join(\"\\n\");",
      "",
      "  if (context.length === 0) {",
      "    return 0;",
      "  }",
      "",
      "  const payload = {",
      "    hookSpecificOutput: {",
      "      hookEventName: \"UserPromptSubmit\",",
      "      additionalContext: [\"Flowness routing result:\", context].join(\"\\n\"),",
      "    },",
      "  };",
      "",
      "  process.stdout.write(`${JSON.stringify(payload, null, 2)}\\n`);",
      "  return 0;",
      "}",
      "",
      "process.exitCode = await main();",
      "",
    ].join("\n")),
  ];
}

export function renderGeneratedScriptsReadmeMarkdown(analysis: ProjectAnalysis): string {
  const buildCommand = analysis.buildCommand ?? "TODO: detect build command";
  const testCommand = analysis.testCommand ?? "TODO: detect test command";
  const lintCommand = analysis.lintCommand ?? "TODO: detect lint command";

  return [
    "# Scripts",
    "",
    "Use the TypeScript runner when you want a local protocol helper:",
    "",
    '```bash',
    'npx tsx .agent/scripts/flowness-runner.ts "<request>"',
    '```',
    "",
    "Use the workflow guard when you want to validate the workspace or a specific workflow:",
    "",
    '```bash',
    "npx tsx .agent/scripts/workflow-guard.ts",
    '```',
    "",
    "Fallback to the Flowness CLI when TSX is unavailable:",
    "",
    '```bash',
    'flowness request:create "<request>"',
    '```',
    "",
    "## Workspace Scripts",
    "- `flowness-runner.ts` routes a request through Flowness.",
    "- `workflow-guard.ts` validates the workspace or a workflow id.",
    "- `.codex/hooks/user-prompt-submit.ts` analyzes user prompts before the assistant responds.",
    "- `find-fqcn.py` searches for fully qualified names and references.",
    "- `search-reference.py` searches for file and symbol references.",
    "- `check-md-size.py` checks Markdown size thresholds.",
    "",
    "## Project Commands",
    `- Build: ${buildCommand}`,
    `- Test: ${testCommand}`,
    `- Lint: ${lintCommand}`,
    "",
    "## Notes",
    "- Keep helper scripts small and deterministic.",
    "- If a command is missing, add a TODO instead of guessing.",
    "",
  ].join("\n");
}
