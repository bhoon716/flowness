import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
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

async function seedProject(rootDir: string): Promise<void> {
  await mkdir(join(rootDir, "src"), { recursive: true });
  await mkdir(join(rootDir, "docs"), { recursive: true });
  await writeFile(join(rootDir, "package.json"), JSON.stringify({
    name: "demo-project",
    scripts: {
      build: "tsc -b",
      test: "vitest",
      lint: "eslint .",
    },
  }, null, 2), "utf8");
  await writeFile(join(rootDir, "README.md"), "# Demo Project\n", "utf8");
  await writeFile(join(rootDir, "src", "index.ts"), "export {};\n", "utf8");
  await writeFile(join(rootDir, "docs", "guide.md"), "# Guide\n", "utf8");
}

async function issueDirectories(rootDir: string): Promise<readonly string[]> {
  return (await readdir(join(rootDir, ".flowness", "issues"))).filter((name) => name.startsWith("ISSUE-"));
}

test("parseCommand handles the new direct aliases", () => {
  const runCommand = parseCommand(["run", "회원가입 로그인 기능 만들어줘"]);
  const stepCommand = parseCommand(["step", "--issue", "ISSUE-001-TEST"]);
  const statusCommand = parseCommand(["status", "--issue", "ISSUE-001-TEST"]);
  const evidenceCommand = parseCommand(["evidence:add", "--issue", "ISSUE-001-TEST", "--title", "README", "--location", "README.md"]);

  assert.equal(runCommand.kind, "request:create");
  assert.equal(stepCommand.kind, "workflow:step");
  assert.equal(statusCommand.kind, "status");
  assert.equal(evidenceCommand.kind, "evidence:add");
  if (evidenceCommand.kind === "evidence:add") {
    assert.equal(evidenceCommand.evidenceKind, "file");
  }
});

test("runCli initializes the .flowness workspace and keeps legacy dirs absent", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-init-"));
  await seedProject(rootDir);

  const result = await runCli(["init", rootDir, "--name", "cli-project"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Initialized Flowness project/);
  assert.match(result.output, /Initialized a git repository/);

  assert.ok(await exists(join(rootDir, ".git")));
  assert.ok(await exists(join(rootDir, ".flowness", "config", "project.yaml")));
  assert.ok(await exists(join(rootDir, ".flowness", "project-profile.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "context-index.json")));
  assert.ok(await exists(join(rootDir, ".flowness", "commands.json")));
  assert.ok(await exists(join(rootDir, ".flowness", "harness-manifest.json")));
  assert.equal(await exists(join(rootDir, ".agent")), false);
  assert.equal(await exists(join(rootDir, ".codex")), false);

  const commands = await readFile(join(rootDir, ".flowness", "commands.json"), "utf8");
  assert.match(commands, /flowness run/);
  assert.match(commands, /flowness status --issue ISSUE-ID/);
  assert.match(commands, /flowness evidence:add/);
});

test("runCli routes requests through the new run alias and reuses matching issues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-run-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "request-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const firstResult = await runCli(["run", "회원가입 로그인 기능 만들어줘"]);
    assert.equal(firstResult.exitCode, 0);
    assert.match(firstResult.output, /Flowness analyzed this as a development task\./);
    assert.match(firstResult.output, /Created issue ISSUE-001-SIGNUP-LOGIN and routed it to feature-development\./);
    assert.match(firstResult.output, /Workflow: feature-development/);
    assert.match(firstResult.output, /Implementation is blocked until clarification questions are answered\./);

    const secondResult = await runCli(["request:create", "회원가입 로그인 기능 만들어줘"]);
    assert.equal(secondResult.exitCode, 0);
    assert.match(secondResult.output, /Reused existing issue ISSUE-001-SIGNUP-LOGIN and routed it to feature-development\./);

    const directories = await issueDirectories(rootDir);
    assert.deepEqual(directories, ["ISSUE-001-SIGNUP-LOGIN"]);
  });
});

test("runCli status, evidence, and step commands block manual state mismatches", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-state-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "state-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const issueResult = await runCli(["issue:create", "--title", "Sign in", "--type", "feature"]);
    assert.equal(issueResult.exitCode, 0);

    const [issueName] = await issueDirectories(rootDir);
    if (issueName === undefined) {
      throw new Error("Expected issue workspace to be created.");
    }

    const statusResult = await runCli(["status", "--issue", issueName]);
    assert.equal(statusResult.exitCode, 0);
    assert.match(statusResult.output, /Layout: flowness/);
    assert.match(statusResult.output, /Current step: Intake/);

    const evidenceResult = await runCli(["evidence:add", "--issue", issueName, "--title", "Repository README", "--location", "README.md"]);
    assert.equal(evidenceResult.exitCode, 0);
    assert.match(evidenceResult.output, /Recorded evidence for/);
    assert.match(evidenceResult.output, /Kind: file/);

    const firstStep = await runCli(["step", "--issue", issueName, "--approve"]);
    assert.equal(firstStep.exitCode, 0);
    assert.match(firstStep.output, /Workflow step completed for/);

    const workflowStatePath = join(rootDir, ".flowness", "issues", issueName, "workflow-state.json");
    const workflowState = JSON.parse(await readFile(workflowStatePath, "utf8")) as { currentStep: string; updatedAt: string };
    workflowState.currentStep = "Implementation";
    workflowState.updatedAt = "2026-06-19T00:10:00.000Z";
    await writeFile(workflowStatePath, `${JSON.stringify(workflowState, null, 2)}\n`, "utf8");

    const blockedStep = await runCli(["step", "--issue", issueName, "--approve"]);
    assert.equal(blockedStep.exitCode, 1);
    assert.match(blockedStep.output, /State\/log mismatch detected/);
    assert.match(blockedStep.output, /Recovery:/);

    const blockedStatus = await runCli(["status", "--issue", issueName]);
    assert.equal(blockedStatus.exitCode, 1);
    assert.match(blockedStatus.output, /State\/log mismatch detected/);
  });
});

test("runCli warns when legacy .agent workspace files are present", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-legacy-"));
  await seedProject(rootDir);
  await mkdir(join(rootDir, ".agent"), { recursive: true });

  const result = await runCli(["init", rootDir, "--name", "legacy-project"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Legacy \.agent workspace files were detected/);
  assert.ok(await exists(join(rootDir, ".flowness", "config", "project.yaml")));
});

test("runCli creates and validates workflow scaffolds", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-workflow-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "workflow-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const createResult = await runCli(["workflow:create", "custom-flow", "--name", "Custom Flow"]);
    assert.equal(createResult.exitCode, 0);
    assert.match(createResult.output, /Created workflow scaffold custom-flow \(Custom Flow\)\./);

    const validateResult = await runCli(["workflow:validate", "custom-flow"]);
    assert.equal(validateResult.exitCode, 0);
    assert.match(validateResult.output, /Workflow validation passed for custom-flow\./);
  });
});
