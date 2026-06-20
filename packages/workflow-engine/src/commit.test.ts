import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createInitialWorkflowState,
  createWorkflowStepContext,
  defineWorkflow,
} from "./index.js";
import {
  prepareCommitWorkflowStep,
  runCommitWorkflowStep,
} from "./commit.js";
import {
  runWorkflowStep,
} from "./runtime.js";

function getRealGitPath(): string {
  const result = spawnSync("sh", ["-lc", "command -v git"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Unable to locate git.");
  }

  const path = result.stdout.trim();
  if (path.length === 0) {
    throw new Error("command -v git returned an empty path.");
  }

  return path;
}

const realGitPath = getRealGitPath();

function runGit(cwd: string, args: readonly string[]): string {
  const result = spawnSync(realGitPath, [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`);
  }

  return (result.stdout ?? "").trim();
}

async function initGitRepo(rootDir: string, files: readonly { readonly path: string; readonly content: string }[], commitMessage: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });
  runGit(rootDir, ["init"]);
  runGit(rootDir, ["config", "user.name", "Flowness Test"]);
  runGit(rootDir, ["config", "user.email", "flowness@example.com"]);

  for (const file of files) {
    const filePath = join(rootDir, file.path);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
  }

  runGit(rootDir, ["add", "--", ...files.map((file) => file.path)]);
  runGit(rootDir, ["commit", "-m", commitMessage]);
}

async function writeGitRules(rootDir: string, nestedRepositories: "allow" | "disallow"): Promise<void> {
  const rulesDir = join(rootDir, ".flowness", "rules");
  await mkdir(rulesDir, { recursive: true });

  const gitRuleContent = [
    "# Git Rules",
    "",
    "- Git repo detection: Resolve the repository from the changed files, not from the process cwd.",
    "- Git repo detection: Probe each changed file path with `git -C <path> rev-parse --is-inside-work-tree`, `--show-toplevel`, and `--git-dir`.",
    "- Auto-commit allowed: no",
    "- Human approval required: yes",
    "- Commit message style: conventional",
    "- Conventional commits required: yes",
    "- git add . forbidden: yes",
    "- git commit -a forbidden: yes",
    "- force push forbidden: yes",
    "- rebase forbidden: yes",
    "- reset --hard forbidden: yes",
    "- merge forbidden: yes",
    `- Nested repositories: ${nestedRepositories}`,
    "- Submodules: disallow",
    "- Worktrees: allow",
    "- Never commit path: .flowness/issues/",
    "- Never commit path: .flowness/logs/",
    "- Never commit path: .flowness/state/",
    "- Never commit path: .flowness/backups/",
    "- Never commit path: .flowness/.flowness-cache/",
    "- Never commit path: .flowness/findings/",
    "- Never commit path: node_modules/",
    "- Never commit path: .git/",
    "- Never commit suffix: .log",
    "- Never commit suffix: .out",
    "- Never commit suffix: .err",
    "- Never commit suffix: .tmp",
    "- Never commit suffix: .temp",
    "- Never commit suffix: .swp",
    "- Never commit suffix: .bak",
    "",
    "## Notes",
    "- Use `git add -- <files>` with an explicit file list only.",
    "- Ask for human approval before the commit unless the project rule explicitly allows auto-commit.",
    "- Keep commit messages concise and aligned with the issue title or goal.",
    "",
  ].join("\n");

  await writeFile(join(rulesDir, "git.md"), gitRuleContent, "utf8");
  await writeFile(join(rulesDir, "commit-policy.md"), gitRuleContent.replace("# Git Rules", "# Commit Policy"), "utf8");
}

async function writeCommitIssueArtifacts(input: {
  readonly rootDir: string;
  readonly issueId: string;
  readonly workflowId: string;
  readonly issueTitle: string;
  readonly goal: string;
  readonly completedSteps: readonly string[];
  readonly currentStep: string;
  readonly changedFiles: readonly string[];
  readonly commandEvidence: readonly string[];
}): Promise<void> {
  const issueDir = join(input.rootDir, ".flowness", "issues", input.issueId);
  const reviewsDir = join(issueDir, "reviews");
  await mkdir(reviewsDir, { recursive: true });
  await mkdir(join(input.rootDir, ".flowness", "logs"), { recursive: true });

  const timestamp = "2026-06-21T00:00:00.000Z";
  await writeFile(join(issueDir, "issue.json"), `${JSON.stringify({
    issue: {
      id: input.issueId,
      type: "feature",
      title: input.issueTitle,
      state: "in_progress",
      workflowId: input.workflowId,
      directory: input.issueId,
      createdAt: timestamp,
      updatedAt: timestamp,
      logPath: `.flowness/logs/${input.issueId}.md`,
      goal: input.goal,
    },
    description: input.goal,
  }, null, 2)}\n`, "utf8");

  await writeFile(join(issueDir, "workflow-state.json"), `${JSON.stringify({
    workflowId: input.workflowId,
    currentStep: input.currentStep,
    completedSteps: [...input.completedSteps],
    failedSteps: [],
    blocked: false,
    updatedAt: timestamp,
    evidence: [],
  }, null, 2)}\n`, "utf8");

  const reviewPath = join(reviewsDir, `REVIEW-001-${input.issueId}.md`);
  await writeFile(reviewPath, [
    `# REVIEW-001-${input.issueId}.md`,
    "",
    `- Issue: ${input.issueId}`,
    `- Issue Title: ${input.issueTitle}`,
    `- Issue Type: feature`,
    `- Workflow: ${input.workflowId}`,
    `- Reviewed At: ${timestamp}`,
    "- Passed: yes",
    "- Blocking Roles: none",
    "- Concern Roles: none",
    "",
    "## Target",
    input.goal,
    "",
    "## Changed Files",
    ...input.changedFiles.map((file) => `- ${file}`),
    "",
    "## Commands / Tests",
    ...(input.commandEvidence.length === 0 ? ["- None"] : input.commandEvidence.map((item) => `- ${item}`)),
    "",
    "## Summary",
    "Evidence Review passed.",
    "",
    "## Perspective Results",
    "- None",
    "## Findings",
    "- None",
    "",
    "## Recommended Next Actions",
    "- None",
    "",
    "## Follow-up Issue Suggestions",
    "- None",
    "",
    "## Limitations",
    "- None",
    "",
  ].join("\n"), "utf8");
}

function createCommitWorkflow() {
  return defineWorkflow({
    id: "commit-workflow",
    name: "Commit Workflow",
    steps: [
      {
        name: "Evidence Review",
        preconditions: [],
        successConditions: ["The evidence review is recorded."],
        humanGate: "never",
        next: "Commit",
        execute: async () => ({
          summary: "Evidence review recorded.",
          evidence: [],
          nextStep: "Commit",
        }),
      },
      {
        name: "Commit",
        preconditions: ['"Evidence Review" has completed.'],
        successConditions: ["The selected files are committed."],
        humanGate: "never",
        execute: async () => ({
          summary: "Commit completed.",
          evidence: [],
          nextStep: null,
        }),
      },
    ],
  });
}

async function createNestedRepoFixture(rootDir: string, nestedRepositories: "allow" | "disallow"): Promise<{
  readonly outerRoot: string;
  readonly nestedRoot: string;
  readonly issueId: string;
  readonly workflowId: string;
  readonly workflow: ReturnType<typeof createCommitWorkflow>;
  readonly context: ReturnType<typeof createWorkflowStepContext>;
  readonly state: ReturnType<typeof createInitialWorkflowState>;
}> {
  const outerRoot = rootDir;
  const nestedRoot = join(rootDir, "packages", "app");
  const workflow = createCommitWorkflow();
  const issueId = "ISSUE-001-COMMIT-WORKFLOW";
  const workflowId = workflow.id;
  const startedAt = "2026-06-21T00:00:00.000Z";

  await writeGitRules(outerRoot, nestedRepositories);
  await initGitRepo(outerRoot, [
    { path: "README.md", content: "# Outer repo\n" },
  ], "chore: initial outer repo");

  await initGitRepo(nestedRoot, [
    { path: "src/index.ts", content: "export const version = 1;\n" },
  ], "feat: initial app");

  await writeFile(join(nestedRoot, "src/index.ts"), "export const version = 2;\n", "utf8");
  await mkdir(join(nestedRoot, ".flowness", "logs"), { recursive: true });
  await writeFile(join(nestedRoot, ".flowness", "logs", "commit.log"), "temporary raw log\n", "utf8");

  await writeCommitIssueArtifacts({
    rootDir: outerRoot,
    issueId,
    workflowId,
    issueTitle: "Improve commit workflow",
    goal: "Improve commit workflow",
    completedSteps: ["Evidence Review"],
    currentStep: "Commit",
    changedFiles: [
      "packages/app/src/index.ts",
      "packages/app/.flowness/logs/commit.log",
    ],
    commandEvidence: ["npm run build", "npm test"],
  });

  const state = {
    ...createInitialWorkflowState(workflow, startedAt),
    currentStep: "Commit",
    completedSteps: ["Evidence Review"],
    updatedAt: startedAt,
  } satisfies ReturnType<typeof createInitialWorkflowState>;

  const context = createWorkflowStepContext({
    issueId,
    issueType: "feature",
    workflowId,
    stepName: "Commit",
    rootDir: outerRoot,
    state,
  });

  return {
    outerRoot,
    nestedRoot,
    issueId,
    workflowId,
    workflow,
    context,
    state,
  };
}

async function withGitWrapper<T>(callback: (wrapper: { readonly logFile: string }) => Promise<T>): Promise<T> {
  const wrapperDir = await mkdtemp(join(tmpdir(), "flowness-git-wrapper-"));
  const logFile = join(wrapperDir, "git.log");
  const wrapperPath = join(wrapperDir, "git");
  await writeFile(wrapperPath, [
    "#!/usr/bin/env node",
    "const { appendFileSync } = require('node:fs');",
    "const { spawnSync } = require('node:child_process');",
    "const realGit = process.env.REAL_GIT;",
    "if (!realGit) throw new Error('REAL_GIT missing');",
    "if (process.env.GIT_WRAPPER_LOG) {",
    "  appendFileSync(process.env.GIT_WRAPPER_LOG, `git ${process.argv.slice(2).join(' ')}\\n`);",
    "}",
    "const result = spawnSync(realGit, process.argv.slice(2), { stdio: 'inherit' });",
    "process.exit(result.status === null ? 1 : result.status);",
    "",
  ].join("\n"), "utf8");
  await chmod(wrapperPath, 0o755);

  const previousPath = process.env.PATH;
  const previousRealGit = process.env.REAL_GIT;
  const previousWrapperLog = process.env.GIT_WRAPPER_LOG;
  process.env.PATH = `${wrapperDir}${previousPath === undefined ? "" : `:${previousPath}`}`;
  process.env.REAL_GIT = realGitPath;
  process.env.GIT_WRAPPER_LOG = logFile;

  try {
    return await callback({ logFile });
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }

    if (previousRealGit === undefined) {
      delete process.env.REAL_GIT;
    } else {
      process.env.REAL_GIT = previousRealGit;
    }

    if (previousWrapperLog === undefined) {
      delete process.env.GIT_WRAPPER_LOG;
    } else {
      process.env.GIT_WRAPPER_LOG = previousWrapperLog;
    }
  }
}

test("prepareCommitWorkflowStep blocks before Evidence Review completes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-commit-pre-review-"));
  await writeGitRules(rootDir, "disallow");

  const workflow = defineWorkflow({
    id: "single-commit",
    name: "Single Commit",
    steps: [
      {
        name: "Commit",
        preconditions: [],
        successConditions: ["The selected files are committed."],
        humanGate: "never",
        execute: async () => ({
          summary: "Commit completed.",
          evidence: [],
          nextStep: null,
        }),
      },
    ],
  });

  await writeCommitIssueArtifacts({
    rootDir,
    issueId: "ISSUE-001-COMMIT-GATE",
    workflowId: workflow.id,
    issueTitle: "Improve commit workflow",
    goal: "Improve commit workflow",
    completedSteps: [],
    currentStep: "Commit",
    changedFiles: ["src/index.ts"],
    commandEvidence: [],
  });

  const state = createInitialWorkflowState(workflow, "2026-06-21T00:00:00.000Z");
  const context = createWorkflowStepContext({
    issueId: "ISSUE-001-COMMIT-GATE",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Commit",
    rootDir,
    state,
  });

  const assessment = await prepareCommitWorkflowStep(context, workflow.id);
  assert.equal(assessment.blockingReason, "Evidence Review has not completed in the workflow state.");
  assert.equal(assessment.repoRoot, null);
  assert.equal(assessment.stagedFiles.length, 0);
});

test("prepareCommitWorkflowStep blocks multi-repo changed files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-commit-multi-repo-"));
  await writeGitRules(rootDir, "disallow");

  const appRoot = join(rootDir, "packages", "app");
  const libRoot = join(rootDir, "packages", "lib");
  await initGitRepo(appRoot, [{ path: "src/index.ts", content: "export const app = true;\n" }], "feat: app");
  await initGitRepo(libRoot, [{ path: "src/index.ts", content: "export const lib = true;\n" }], "feat: lib");
  await writeFile(join(appRoot, "src/index.ts"), "export const app = false;\n", "utf8");
  await writeFile(join(libRoot, "src/index.ts"), "export const lib = false;\n", "utf8");

  await writeCommitIssueArtifacts({
    rootDir,
    issueId: "ISSUE-001-MULTI-REPO",
    workflowId: "commit-workflow",
    issueTitle: "Improve commit workflow",
    goal: "Improve commit workflow",
    completedSteps: ["Evidence Review"],
    currentStep: "Commit",
    changedFiles: [
      "packages/app/src/index.ts",
      "packages/lib/src/index.ts",
    ],
    commandEvidence: ["npm test"],
  });

  const workflow = createCommitWorkflow();
  const state = {
    ...createInitialWorkflowState(workflow, "2026-06-21T00:00:00.000Z"),
    currentStep: "Commit",
    completedSteps: ["Evidence Review"],
    updatedAt: "2026-06-21T00:00:00.000Z",
  } satisfies ReturnType<typeof createInitialWorkflowState>;
  const context = createWorkflowStepContext({
    issueId: "ISSUE-001-MULTI-REPO",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Commit",
    rootDir,
    state,
  });

  const assessment = await prepareCommitWorkflowStep(context, workflow.id);
  assert.match(assessment.blockingReason ?? "", /multiple Git repositories/);
  assert.equal(assessment.repoRoot, null);
});

test("prepareCommitWorkflowStep blocks nested repositories by default", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-commit-nested-block-"));
  const fixture = await createNestedRepoFixture(rootDir, "disallow");

  const assessment = await prepareCommitWorkflowStep(fixture.context, fixture.workflowId);
  assert.match(assessment.blockingReason ?? "", /Nested repository commits are disallowed/);
  assert.equal(assessment.repoRoot, runGit(fixture.nestedRoot, ["rev-parse", "--show-toplevel"]));
  assert.equal(assessment.repoRelationship, "nested-repo");
});

test("prepareCommitWorkflowStep blocks code changes when checks are not recorded", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-commit-missing-checks-"));
  await writeGitRules(rootDir, "disallow");
  await initGitRepo(rootDir, [{ path: "src/index.ts", content: "export const value = 1;\n" }], "feat: base");
  await writeFile(join(rootDir, "src", "index.ts"), "export const value = 2;\n", "utf8");

  await writeCommitIssueArtifacts({
    rootDir,
    issueId: "ISSUE-001-MISSING-CHECKS",
    workflowId: "commit-workflow",
    issueTitle: "Improve commit workflow",
    goal: "Improve commit workflow",
    completedSteps: ["Evidence Review"],
    currentStep: "Commit",
    changedFiles: ["src/index.ts"],
    commandEvidence: [],
  });

  const workflow = createCommitWorkflow();
  const state = {
    ...createInitialWorkflowState(workflow, "2026-06-21T00:00:00.000Z"),
    currentStep: "Commit",
    completedSteps: ["Evidence Review"],
    updatedAt: "2026-06-21T00:00:00.000Z",
  } satisfies ReturnType<typeof createInitialWorkflowState>;
  const context = createWorkflowStepContext({
    issueId: "ISSUE-001-MISSING-CHECKS",
    issueType: "feature",
    workflowId: workflow.id,
    stepName: "Commit",
    rootDir,
    state,
  });

  const assessment = await prepareCommitWorkflowStep(context, workflow.id);
  assert.equal(assessment.blockingReason, "Required checks were not recorded in the Evidence Review report.");
  assert.deepEqual(assessment.stagedFiles, ["src/index.ts"]);
});

test("runWorkflowStep resolves the repo from changed files and commits only approved files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-commit-success-"));
  const fixture = await createNestedRepoFixture(rootDir, "allow");

  const assessment = await prepareCommitWorkflowStep(fixture.context, fixture.workflowId);
  assert.equal(assessment.repoRoot, runGit(fixture.nestedRoot, ["rev-parse", "--show-toplevel"]));
  assert.equal(assessment.repoRelationship, "nested-repo");
  assert.equal(assessment.approvalRequired, true);
  assert.deepEqual([...assessment.changedFiles].sort(), [
    "packages/app/.flowness/logs/commit.log",
    "packages/app/src/index.ts",
  ]);
  assert.deepEqual(assessment.excludedFiles, [".flowness/logs/commit.log"]);
  assert.deepEqual(assessment.stagedFiles, ["src/index.ts"]);
  assert.equal(assessment.proposedCommitMessage, "feat: improve commit workflow");

  await withGitWrapper(async ({ logFile }) => {
    const waiting = await runWorkflowStep({
      workflow: fixture.workflow,
      state: fixture.state,
      context: fixture.context,
      timestamp: "2026-06-21T00:01:00.000Z",
      approved: false,
    });
    assert.equal(waiting.status, "waiting_approval");
    assert.match(waiting.logEntry.summary, /Awaiting human approval/);

    const completed = await runCommitWorkflowStep(fixture.context, fixture.workflowId, true, assessment);

    const commitHash = runGit(fixture.nestedRoot, ["rev-parse", "HEAD"]);
    const expectedRepoRoot = runGit(fixture.nestedRoot, ["rev-parse", "--show-toplevel"]);
    assert.match(completed.summary, new RegExp(commitHash));
    assert.match(completed.summary, /feat: improve commit workflow/);
    assert.match(completed.summary, new RegExp(`Committed ${commitHash} in ${expectedRepoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(completed.evidence.some((item) => item.title === ".flowness/rules/git.md"), true);
    assert.equal(completed.evidence.some((item) => item.title === "git commit"), true);
    assert.equal(completed.evidence.some((item) => item.title === "git rev-parse HEAD"), true);

    const logLines = (await readFile(logFile, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    assert.equal(logLines.some((line) => line === "git add -- src/index.ts"), true);
    assert.equal(logLines.some((line) => line.startsWith("git commit -m feat: improve commit workflow")), true);
    assert.equal(logLines.every((line) => !line.includes("git add .")), true);
    assert.equal(logLines.every((line) => !line.includes("git commit -a")), true);
  });
});
