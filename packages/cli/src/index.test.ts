import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand, runCli } from "./index.js";

async function withWorkingDirectory<T>(
  cwd: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await callback();
  } finally {
    process.chdir(previous);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listIssueDirectories(rootDir: string): Promise<readonly string[]> {
  const entries = await readdir(join(rootDir, ".agent", "issues"));
  return entries.filter((name) => name.startsWith("ISSUE-"));
}

test("parseCommand handles init with options", () => {
  const parsed = parseCommand(["init", "/tmp/demo", "--name", "demo-app", "--force"]);
  assert.equal(parsed.kind, "init");
  assert.equal(parsed.targetPath, "/tmp/demo");
  assert.equal(parsed.projectName, "demo-app");
  assert.equal(parsed.force, true);
});

test("runCli initializes a target directory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-"));
  const result = await runCli(["init", rootDir, "--name", "cli-project"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Initialized Flowness project/);

  const config = await readFile(join(rootDir, ".flowness/config.yaml"), "utf8");
  assert.match(config, /project_name: cli-project/);
});

test("runCli captures a request as an issue", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-request-"));
  const initResult = await runCli(["init", rootDir, "--name", "request-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["request:create", "로그인 기능을 만들어줘"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Captured request as issue ISSUE-001-[A-Z0-9-]+/);
    assert.match(result.output, /Type: feature/);
    assert.match(result.output, /Workflow: feature-development/);

    const issueDirectories = await listIssueDirectories(rootDir);
    assert.equal(issueDirectories.length, 1);
  });
});

test("runCli leaves casual questions as answers without issues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-question-"));

  const result = await withWorkingDirectory(rootDir, async () => runCli(["request:create", "지금 시간이 몇 시야?"]));
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /No issue created\./);
  assert.match(result.output, /Category: casual_or_question/);
  assert.equal(await exists(join(rootDir, ".agent", "issues")), false);
});

test("runCli routes MVP requests through the MVP planning workflow", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-mvp-"));
  const initResult = await runCli(["init", rootDir, "--name", "mvp-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["request:create", "온보딩 MVP를 기획해줘"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Workflow: mvp-planning/);
    assert.match(result.output, /Category: mvp_or_product_planning/);

    const issueDirectories = await listIssueDirectories(rootDir);
    assert.equal(issueDirectories.length, 1);
  });
});

test("runCli decomposes multi issue requests into parent and child issues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-multi-issue-"));
  const initResult = await runCli(["init", rootDir, "--name", "multi-issue-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli([
      "request:create",
      "로그인 화면을 만들고; 비밀번호 재설정 페이지도 추가해줘; 알림 설정도 구현해줘",
    ]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Category: multi_issue_project/);
    assert.match(result.output, /Child issues:/);

    const issueDirectories = await listIssueDirectories(rootDir);
    assert.equal(issueDirectories.length, 4);

    const parentIssueName = issueDirectories.find((name) => name.startsWith("ISSUE-001-"));
    if (parentIssueName === undefined) {
      throw new Error("Expected parent issue workspace to be created.");
    }

    const parentIssue = JSON.parse(await readFile(join(rootDir, ".agent", "issues", parentIssueName, "issue.json"), "utf8")) as {
      issue: { childIssueIds?: readonly string[] };
    };
    assert.ok(parentIssue.issue.childIssueIds !== undefined);
    assert.equal(parentIssue.issue.childIssueIds?.length, 3);

    const decomposition = JSON.parse(await readFile(join(rootDir, ".agent", "issues", parentIssueName, "decomposition.json"), "utf8")) as {
      childIssues: readonly unknown[];
    };
    assert.equal(decomposition.childIssues.length, 3);
  });
});

test("runCli auto-captures freeform requests as issues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-request-auto-"));
  const initResult = await runCli(["init", rootDir, "--name", "request-auto-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["로그인", "기능을", "만들어줘"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Captured request as issue ISSUE-001-[A-Z0-9-]+/);
    assert.match(result.output, /Workflow: feature-development/);
  });
});

test("runCli applies human gate instructions from natural language", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-config-"));
  const initResult = await runCli(["init", rootDir, "--name", "config-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["config:gate", "설계는 항상 물어봐"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Updated human gate configuration/);
  });

  const config = await readFile(join(rootDir, ".flowness/config.yaml"), "utf8");
  assert.match(config, /design: always/);
});

test("runCli creates an issue workspace and initial log", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-issue-"));
  const initResult = await runCli(["init", rootDir, "--name", "issue-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["issue:create", "--title", "Sign in", "--type", "feature"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Created issue ISSUE-001-SIGN-IN/);

    const issueEntries = await readdir(join(rootDir, ".agent/issues"));
    const issueName = issueEntries.find((name) => name.startsWith("ISSUE-001-"));
    if (!issueName) {
      throw new Error("Expected issue workspace to be created.");
    }

    const issueMarkdown = await readFile(join(rootDir, ".agent/issues", issueName, "issue.md"), "utf8");
    assert.match(issueMarkdown, /Workflow: feature/);
    assert.match(issueMarkdown, /Workflow State:/);

    const reviewReadme = await readFile(join(rootDir, ".agent/issues", issueName, "reviews", "README.md"), "utf8");
    assert.match(reviewReadme, /Review reports/);

    const logMarkdown = await readFile(join(rootDir, ".agent/logs", `${issueName}.md`), "utf8");
    assert.match(logMarkdown, /Issue Created/);
    assert.match(logMarkdown, /Selected workflow feature/);
  });
});

test("runCli advances workflows, records decisions, and runs reviews", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-runtime-"));
  const initResult = await runCli(["init", rootDir, "--name", "runtime-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const issueResult = await runCli(["issue:create", "--title", "Sign in", "--type", "feature"]);
    assert.equal(issueResult.exitCode, 0);

    const issueEntries = await readdir(join(rootDir, ".agent/issues"));
    const issueName = issueEntries.find((name) => name.startsWith("ISSUE-001-"));
    if (!issueName) {
      throw new Error("Expected issue workspace to be created.");
    }

    const pendingStep = await runCli(["workflow:step", "--issue", issueName]);
    assert.equal(pendingStep.exitCode, 1);
    assert.match(pendingStep.output, /waiting_approval/);

    const approvedStep = await runCli(["workflow:step", "--issue", issueName, "--approve"]);
    assert.equal(approvedStep.exitCode, 0);
    assert.match(approvedStep.output, /Workflow step completed/);

    const workflowState = JSON.parse(await readFile(join(rootDir, ".agent/issues", issueName, "workflow-state.json"), "utf8")) as { currentStep: string };
    assert.equal(workflowState.currentStep, "Clarifying Questions");

    const decisionResult = await runCli([
      "decision:create",
      "--issue",
      issueName,
      "--title",
      "Auth strategy",
      "--context",
      "Choose the session strategy.",
      "--decision",
      "Use server sessions.",
      "--alternatives",
      "JWT,session",
      "--consequences",
      "csrf mitigation,stateful auth",
    ]);
    assert.equal(decisionResult.exitCode, 0);
    assert.match(decisionResult.output, /Created decision/);

    const decisionEntries = await readdir(join(rootDir, ".agent/issues", issueName, "decisions"));
    const decisionFile = decisionEntries.find((name) => name.startsWith("DEC-001-"));
    if (!decisionFile) {
      throw new Error("Expected a decision document to be created.");
    }

    const reviewResult = await runCli(["review:run", "--issue", issueName]);
    assert.equal(reviewResult.exitCode, 1);
    assert.match(reviewResult.output, /Blocking roles: Testing Reviewer/);

    const reviewEntries = await readdir(join(rootDir, ".agent/issues", issueName, "reviews"));
    const reviewFile = reviewEntries.find((name) => name.startsWith("REVIEW-001-"));
    if (!reviewFile) {
      throw new Error("Expected a review report to be created.");
    }

    const reviewMarkdown = await readFile(join(rootDir, ".agent/issues", issueName, "reviews", reviewFile), "utf8");
    assert.match(reviewMarkdown, /Testing Reviewer/);
    assert.match(reviewMarkdown, /Status: fail/);
  });
});

test("runCli creates skill and rule scaffolds and validates the workspace", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-asset-"));
  const initResult = await runCli(["init", rootDir, "--name", "asset-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const skillResult = await runCli(["skill:create", "--id", "root-cause-analysis", "--title", "Root Cause Analysis", "--description", "Find why a workflow failed"]);
    assert.equal(skillResult.exitCode, 0);
    assert.match(skillResult.output, /Created skill scaffold/);

    const ruleResult = await runCli(["rule:create", "--id", "testing", "--title", "Testing", "--description", "Always write tests"]);
    assert.equal(ruleResult.exitCode, 0);
    assert.match(ruleResult.output, /Created rule/);

    const issueResult = await runCli(["issue:create", "--title", "Skill issue", "--type", "feature"]);
    assert.equal(issueResult.exitCode, 0);

    const issueEntries = await readdir(join(rootDir, ".agent/issues"));
    const issueName = issueEntries.find((name) => name.startsWith("ISSUE-001-"));
    if (!issueName) {
      throw new Error("Expected issue workspace to be created.");
    }

    const skillRun = await runCli(["skill:run", "--id", "root-cause-analysis", "--issue", issueName, "--input", "Find the root cause"]);
    assert.equal(skillRun.exitCode, 0);
    assert.match(skillRun.output, /Executed skill root-cause-analysis/);

    const ruleApply = await runCli(["rule:apply", "--id", "testing", "--issue", issueName, "--input", "Always write tests"]);
    assert.equal(ruleApply.exitCode, 0);
    assert.match(ruleApply.output, /Applied rule testing/);

    const skillList = await runCli(["skill:list"]);
    assert.equal(skillList.exitCode, 0);
    assert.match(skillList.output, /root-cause-analysis/);

    const ruleList = await runCli(["rule:list"]);
    assert.equal(ruleList.exitCode, 0);
    assert.match(ruleList.output, /testing/);

    const skillMarkdown = await readFile(join(rootDir, ".agent/skills/root-cause-analysis/SKILL.md"), "utf8");
    assert.match(skillMarkdown, /Root Cause Analysis/);

    const ruleMarkdown = await readFile(join(rootDir, ".agent/rules/testing.md"), "utf8");
    assert.match(ruleMarkdown, /Always write tests/);

    const validateResult = await runCli(["validate"]);
    assert.equal(validateResult.exitCode, 0);
    assert.match(validateResult.output, /Workflow validation passed/);

    const logMarkdown = await readFile(join(rootDir, ".agent/logs", `${issueName}.md`), "utf8");
    assert.match(logMarkdown, /Skill Executed/);
    assert.match(logMarkdown, /Rule Applied/);

    const upgradeResult = await runCli(["upgrade"]);
    assert.equal(upgradeResult.exitCode, 0);
    assert.match(upgradeResult.output, /Upgraded Flowness project/);
  });
});

test("runCli creates and validates a workflow scaffold", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-workflow-"));
  const initResult = await runCli(["init", rootDir, "--name", "workflow-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const createResult = await runCli(["workflow:create", "feature-development", "--name", "Feature Development"]);
    assert.equal(createResult.exitCode, 0);
    assert.match(createResult.output, /Created workflow scaffold feature-development/);

    const workflowSource = await readFile(
      join(rootDir, ".agent/workflows", "feature-development", "workflow.ts"),
      "utf8",
    );
    assert.match(workflowSource, /defineWorkflow/);

    const validateResult = await runCli(["workflow:validate", "feature-development"]);
    assert.equal(validateResult.exitCode, 0);
    assert.match(validateResult.output, /Workflow validation passed/);
  });
});

test("runCli loads custom workflow files when creating issues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-custom-workflow-"));
  const initResult = await runCli(["init", rootDir, "--name", "custom-workflow-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const createWorkflow = await runCli(["workflow:create", "custom-flow", "--name", "Custom Flow"]);
    assert.equal(createWorkflow.exitCode, 0);

    const workflowPath = join(rootDir, ".agent/workflows/custom-flow/workflow.ts");
    const originalWorkflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      originalWorkflow.replace('name: "Intake"', 'name: "Discovery"'),
      "utf8",
    );

    const issueResult = await runCli(["issue:create", "--title", "Custom issue", "--type", "feature", "--workflow", "custom-flow"]);
    assert.equal(issueResult.exitCode, 0);

    const issueEntries = await readdir(join(rootDir, ".agent/issues"));
    const issueName = issueEntries.find((name) => name.startsWith("ISSUE-001-"));
    if (!issueName) {
      throw new Error("Expected issue workspace to be created.");
    }

    const workflowState = JSON.parse(await readFile(join(rootDir, ".agent/issues", issueName, "workflow-state.json"), "utf8")) as { currentStep: string };
    assert.equal(workflowState.currentStep, "Discovery");

    const stepResult = await runCli(["workflow:step", "--issue", issueName, "--approve"]);
    assert.equal(stepResult.exitCode, 0);
    assert.match(stepResult.output, /Next step: Clarification/);
  });
});

test("runCli recover command retries a fixed workflow step", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-recover-"));
  const initResult = await runCli(["init", rootDir, "--name", "recover-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const createWorkflow = await runCli(["workflow:create", "recover-flow", "--name", "Recover Flow"]);
    assert.equal(createWorkflow.exitCode, 0);

    const workflowPath = join(rootDir, ".agent/workflows/recover-flow/workflow.ts");
    await writeFile(
      workflowPath,
      [
        'import { defineWorkflow } from "@flowness/workflow-engine";',
        'import { joinPaths, pathExists } from "@flowness/core";',
        '',
        'export default defineWorkflow({',
        '  id: "recover-flow",',
        '  name: "Recover Flow",',
        '  steps: [',
        '    {',
        '      name: "Close",',
        '      preconditions: [],',
        '      successConditions: ["Ready file exists."],',
        '      next: null,',
        '      execute: async (context) => {',
        '        const readyPath = joinPaths(context.rootDir, "ready.txt");',
        '        if (!(await pathExists(readyPath))) {',
        '          throw new Error("Not ready yet");',
        '        }',
        '        return {',
        '          summary: "Ready file found.",',
        '          evidence: [',
        '            { kind: "file", title: "ready.txt", location: readyPath, detail: "Ready to close." },',
        '          ],',
        '          nextStep: null,',
        '        };',
        '      },',
        '    },',
        '  ],',
        '});',
        '',
      ].join("\n"),
      "utf8",
    );

    const issueResult = await runCli(["issue:create", "--title", "Recover doc", "--type", "documentation", "--workflow", "recover-flow"]);
    assert.equal(issueResult.exitCode, 0);

    const issueEntries = await readdir(join(rootDir, ".agent/issues"));
    const issueName = issueEntries.find((name) => name.startsWith("ISSUE-001-"));
    if (!issueName) {
      throw new Error("Expected issue workspace to be created.");
    }

    const failedStep = await runCli(["workflow:step", "--issue", issueName, "--approve"]);
    assert.equal(failedStep.exitCode, 1);
    assert.match(failedStep.output, /blocked|waiting_approval/i);

    await writeFile(join(rootDir, "ready.txt"), "ready\n", "utf8");

    const recoverResult = await runCli(["workflow:recover", "--issue", issueName, "--root-cause", "Ready file was missing"]);
    assert.equal(recoverResult.exitCode, 0);
    assert.match(recoverResult.output, /Recorded recovery loop/);
    assert.match(recoverResult.output, /Workflow step completed/);

    const workflowState = JSON.parse(await readFile(join(rootDir, ".agent/issues", issueName, "workflow-state.json"), "utf8")) as { currentStep: string; blocked: boolean };
    assert.equal(workflowState.blocked, false);
    assert.equal(workflowState.currentStep, "");
  });
});
