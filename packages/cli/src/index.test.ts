import { mkdir, mkdtemp, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand, runCli } from "./index.js";

let workingDirectoryLock = Promise.resolve();

async function withWorkingDirectory<T>(
  cwd: string,
  callback: () => Promise<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    const previous = process.cwd();
    process.chdir(cwd);
    try {
      return await callback();
    } finally {
      process.chdir(previous);
    }
  };

  const result = workingDirectoryLock.then(run, run);
  workingDirectoryLock = result.then(
    () => undefined,
    () => undefined,
  );
  return await result;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

async function rewriteManifestVersion(rootDir: string, version: string | null): Promise<void> {
  const manifestPath = join(rootDir, ".flowness", "harness-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  if (version === null) {
    delete manifest.version;
  } else {
    manifest.version = version;
  }

  delete manifest.manifestHash;
  manifest.manifestHash = hashJson(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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

async function upgradeBackupDirectories(rootDir: string): Promise<readonly string[]> {
  const backupsRoot = join(rootDir, ".flowness", "backups");
  if (!(await exists(backupsRoot))) {
    return [];
  }

  return (await readdir(backupsRoot)).filter((name) => name.startsWith("upgrade-"));
}

function runGit(rootDir: string, args: readonly string[]): void {
  const result = spawnSync("git", [...args], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}

test("parseCommand handles the new direct aliases", () => {
  const runCommand = parseCommand(["run", "회원가입 로그인 기능 만들어줘"]);
  const stepCommand = parseCommand(["step", "--issue", "ISSUE-001-TEST"]);
  const statusCommand = parseCommand(["status", "--issue", "ISSUE-001-TEST"]);
  const locateCommand = parseCommand(["locate", "request routing"]);
  const testCommand = parseCommand(["test", "--summary"]);
  const auditCommand = parseCommand(["audit", "--changed"]);
  const fullAuditCommand = parseCommand(["audit", "--full"]);
  const evidenceCommand = parseCommand(["evidence:add", "--issue", "ISSUE-001-TEST", "--title", "README", "--location", "README.md"]);
  const ruleUpdateCommand = parseCommand(["rule:update", "--id", "tech/react", "--input", "feature-based"]);

  assert.equal(runCommand.kind, "request:create");
  assert.equal(stepCommand.kind, "workflow:step");
  assert.equal(statusCommand.kind, "status");
  assert.equal(locateCommand.kind, "locate");
  assert.equal(testCommand.kind, "test");
  assert.equal(auditCommand.kind, "audit");
  assert.equal(fullAuditCommand.kind, "audit");
  assert.equal(evidenceCommand.kind, "evidence:add");
  assert.equal(ruleUpdateCommand.kind, "rule:update");
  if (locateCommand.kind === "locate") {
    assert.equal(locateCommand.query, "request routing");
  }
  if (testCommand.kind === "test") {
    assert.equal(testCommand.summary, true);
  }
  if (auditCommand.kind === "audit") {
    assert.equal(auditCommand.scope, "changed");
  }
  if (fullAuditCommand.kind === "audit") {
    assert.equal(fullAuditCommand.scope, "full");
  }
  if (evidenceCommand.kind === "evidence:add") {
    assert.equal(evidenceCommand.evidenceKind, "file");
  }
});

test("parseCommand handles upgrade flags and defaults to dry-run", () => {
  const defaultUpgrade = parseCommand(["upgrade"]);
  const dryRunUpgrade = parseCommand(["upgrade", "--dry-run", "--from", "0.1.4", "--to", "0.1.5"]);
  const applyUpgrade = parseCommand(["upgrade", "--apply", "--from=0.1.4", "--to=0.1.5"]);

  assert.equal(defaultUpgrade.kind, "upgrade");
  assert.equal(dryRunUpgrade.kind, "upgrade");
  assert.equal(applyUpgrade.kind, "upgrade");

  if (defaultUpgrade.kind === "upgrade") {
    assert.equal(defaultUpgrade.mode, "dry-run");
    assert.equal(defaultUpgrade.fromVersion, null);
    assert.equal(defaultUpgrade.toVersion, null);
  }

  if (dryRunUpgrade.kind === "upgrade") {
    assert.equal(dryRunUpgrade.mode, "dry-run");
    assert.equal(dryRunUpgrade.fromVersion, "0.1.4");
    assert.equal(dryRunUpgrade.toVersion, "0.1.5");
  }

  if (applyUpgrade.kind === "upgrade") {
    assert.equal(applyUpgrade.mode, "apply");
    assert.equal(applyUpgrade.fromVersion, "0.1.4");
    assert.equal(applyUpgrade.toVersion, "0.1.5");
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
  assert.ok(await exists(join(rootDir, ".flowness", "navigation.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "state", "active-issue.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "findings", "README.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "templates", "finding-template.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "rules", "project-overrides.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "rules", "change-log.md")));
  assert.ok(await exists(join(rootDir, ".flowness", "rules", "tech", "README.md")));
  assert.ok(await exists(join(rootDir, "docs", "PRD.md")));
  assert.ok(await exists(join(rootDir, "docs", "ARD.md")));
  assert.equal(await exists(join(rootDir, ".agent")), false);
  assert.equal(await exists(join(rootDir, ".codex")), false);

  const commands = JSON.parse(await readFile(join(rootDir, ".flowness", "commands.json"), "utf8")) as {
    readonly commands: {
      readonly run: string;
      readonly reviewRun: string;
      readonly status: string;
      readonly locate: string;
      readonly testSummary: string;
      readonly auditChanged: string;
      readonly evidenceAdd: string;
      readonly ruleUpdate: string;
    };
  };
  assert.equal(commands.commands.run, "flowness run \"<request>\"");
  assert.equal(commands.commands.reviewRun, "flowness review:run --issue ISSUE-ID");
  assert.equal(commands.commands.status, "flowness status --issue ISSUE-ID");
  assert.equal(commands.commands.locate, "flowness locate \"<task description>\"");
  assert.equal(commands.commands.testSummary, "flowness test --summary");
  assert.equal(commands.commands.auditChanged, "flowness audit --changed");
  assert.equal(commands.commands.evidenceAdd, "flowness evidence:add --issue ISSUE-ID --kind file --title \"...\" --location path");
  assert.equal(commands.commands.ruleUpdate, "flowness rule:update --id RULE-ID --input \"...\"");

  const navigation = await readFile(join(rootDir, ".flowness", "navigation.md"), "utf8");
  assert.match(navigation, /# Navigation/);
  assert.match(navigation, /Active issue: none yet/);
  assert.match(navigation, /Read this file first/);
  assert.match(navigation, /## File Location/);
  assert.match(navigation, /flowness locate "<task description>"/);
  assert.match(navigation, /flowness test --summary/);
  assert.match(navigation, /flowness audit --changed/);
  assert.doesNotMatch(navigation, /Planning docs:/);

  const activeIssue = await readFile(join(rootDir, ".flowness", "state", "active-issue.md"), "utf8");
  assert.match(activeIssue, /# Active Issue/);
  assert.match(activeIssue, /No active issue exists yet\./);
  assert.match(activeIssue, /## Where To Start/);
  assert.match(activeIssue, /flowness locate "<task description>"/);
  assert.match(activeIssue, /## Rules/);
  assert.doesNotMatch(activeIssue, /Planning Docs/);

  const contextIndex = JSON.parse(await readFile(join(rootDir, ".flowness", "context-index.json"), "utf8")) as {
    readonly projectName: string;
    readonly areas: readonly { readonly area: string; readonly entryFiles: readonly string[] }[];
  };
  assert.equal(contextIndex.projectName, "cli-project");
  assert.ok(contextIndex.areas.some((area) => area.area === "findings"));
  assert.ok(contextIndex.areas.some((area) => area.area === "navigation"));
  const sourceArea = contextIndex.areas.find((area) => area.area === "source");
  assert.ok(sourceArea !== undefined);
  assert.ok(sourceArea.entryFiles.every((file) => file !== "src"));

  const prd = await readFile(join(rootDir, "docs", "PRD.md"), "utf8");
  assert.match(prd, /# PRD/);
  assert.match(prd, /## Product Topic \/ Users \/ Problem/);
  assert.match(prd, /## Core Features \/ Non-goals/);
  assert.match(prd, /## Open Questions/);

  const ard = await readFile(join(rootDir, "docs", "ARD.md"), "utf8");
  assert.match(ard, /# ARD/);
  assert.match(ard, /## Stack/);
  assert.match(ard, /## Storage \/ Auth \/ Deployment \/ Scale/);
  assert.match(ard, /## Test Strategy \/ Security/);

  const techReadme = await readFile(join(rootDir, ".flowness", "rules", "tech", "README.md"), "utf8");
  assert.match(techReadme, /# Tech Rules/);
  assert.match(techReadme, /java\.md/);
  assert.match(techReadme, /react\.md/);

  const reactRule = await readFile(join(rootDir, ".flowness", "rules", "tech", "react.md"), "utf8");
  assert.match(reactRule, /# React/);
  assert.match(reactRule, /## Common Architecture/);
  assert.match(reactRule, /## Testing Guidance/);
  assert.match(reactRule, /## Security Notes/);

  const overrideRule = await readFile(join(rootDir, ".flowness", "rules", "project-overrides.md"), "utf8");
  assert.match(overrideRule, /Record the first override below this line\./);

  const changeLog = await readFile(join(rootDir, ".flowness", "rules", "change-log.md"), "utf8");
  assert.match(changeLog, /Add the first rule update entry below this line\./);

  const manifest = JSON.parse(await readFile(join(rootDir, ".flowness", "harness-manifest.json"), "utf8")) as {
    readonly version: string;
    readonly contextFiles: {
      readonly findings: string;
    };
    readonly commands: {
      readonly reviewRun: string;
      readonly locate: string;
      readonly testSummary: string;
      readonly auditChanged: string;
    };
  };
  assert.equal(manifest.version, "0.1.5");
  assert.equal(manifest.contextFiles.findings, ".flowness/findings/README.md");
  assert.equal(manifest.commands.reviewRun, "flowness review:run --issue ISSUE-ID");
  assert.equal(manifest.commands.locate, "flowness locate \"<task description>\"");
  assert.equal(manifest.commands.testSummary, "flowness test --summary");
  assert.equal(manifest.commands.auditChanged, "flowness audit --changed");
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

test("runCli routes review requests to code-review with a concrete target", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-review-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "review-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["run", "이 PR 리뷰해줘"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Flowness analyzed this as a review task\./);
    assert.match(result.output, /Execution mode: run_review/);
    assert.match(result.output, /Workflow: code-review/);
    assert.match(result.output, /Issue type: review/);
    assert.match(result.output, /Review target: PR or Branch/);
    assert.match(result.output, /Clarification required: no/);
    assert.match(result.output, /Created issue ISSUE-001-REVIEW-PR-BRANCH and routed it to code-review\./);

    const directories = await issueDirectories(rootDir);
    assert.deepEqual(directories, ["ISSUE-001-REVIEW-PR-BRANCH"]);
  });
});

test("runCli review:run preserves source files and avoids auto-created follow-up issues", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-review-run-"));
  await seedProject(rootDir);
  await writeFile(join(rootDir, "src", "review-target.ts"), "export const value = 1;\n", "utf8");

  const initResult = await runCli(["init", rootDir, "--name", "review-run-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const createResult = await runCli(["run", "이 PR 리뷰해줘"]);
    assert.equal(createResult.exitCode, 0);

    const [reviewIssueId] = await issueDirectories(rootDir);
    if (reviewIssueId === undefined) {
      throw new Error("Expected a review issue directory.");
    }

    const sourceBefore = await readFile(join(rootDir, "src", "review-target.ts"), "utf8");
    const outputBefore = await readdir(join(rootDir, ".flowness", "issues", reviewIssueId, "reviews"));

    const reviewResult = await runCli(["review:run", "--issue", reviewIssueId]);
    assert.ok(reviewResult.exitCode === 0 || reviewResult.exitCode === 1);
    assert.match(reviewResult.output, /Created review report/);
    assert.match(reviewResult.output, /Passed:/);

    const sourceAfter = await readFile(join(rootDir, "src", "review-target.ts"), "utf8");
    assert.equal(sourceAfter, sourceBefore);

    const directoriesAfter = await issueDirectories(rootDir);
    assert.deepEqual(directoriesAfter, [reviewIssueId]);

    const reviewFilesAfter = await readdir(join(rootDir, ".flowness", "issues", reviewIssueId, "reviews"));
    assert.ok(reviewFilesAfter.length >= outputBefore.length);

    const latestReportName = reviewFilesAfter
      .filter((fileName) => fileName.endsWith(".md") && fileName !== "README.md")
      .sort()
      .at(-1);
    if (latestReportName === undefined) {
      throw new Error("Expected a review report file.");
    }

    const reportContents = await readFile(join(rootDir, ".flowness", "issues", reviewIssueId, "reviews", latestReportName), "utf8");
    assert.ok(reportContents.split("\n").length < 120);
  });
});

test("runCli routes broad product requests to planning and decomposition", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-broad-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "broad-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["run", "전체 쇼핑몰 만들어줘"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Execution mode: decompose_project/);
    assert.match(result.output, /Safe to proceed: no/);
    assert.match(result.output, /Next action: clarify_and_decompose/);
    assert.match(result.output, /Created issue ISSUE-001-/);

    const directories = await issueDirectories(rootDir);
    assert.ok(directories.length > 1);

    const parentIssueId = directories[0];
    if (parentIssueId === undefined) {
      throw new Error("Expected a parent issue directory.");
    }

    const issueJson = JSON.parse(await readFile(join(rootDir, ".flowness", "issues", parentIssueId, "issue.json"), "utf8")) as {
      readonly issue: { readonly workflowId: string; readonly type: string };
    };
    assert.equal(issueJson.issue.workflowId, "mvp-planning");
    assert.equal(issueJson.issue.type, "planning");
  });
});

test("runCli routes natural language rule updates through rule:update", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-rule-update-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "rule-update-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["run", "React는 feature-based로 작성해"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Updated rule tech\/react\./);
    assert.match(result.output, /\.flowness\/rules\/tech\/react\.md/);
    assert.match(result.output, /\.flowness\/rules\/change-log\.md/);

    const directories = await issueDirectories(rootDir);
    assert.deepEqual(directories, []);

    const reactRule = await readFile(join(rootDir, ".flowness", "rules", "tech", "react.md"), "utf8");
    assert.match(reactRule, /## Update/);
    assert.match(reactRule, /feature-based/);

    const changeLog = await readFile(join(rootDir, ".flowness", "rules", "change-log.md"), "utf8");
    assert.match(changeLog, /tech\/react/);
    assert.match(changeLog, /React는 feature-based로 작성해/);
  });
});

test("runCli locate returns the best matching file area", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-locate-"));
  await seedProject(rootDir);
  await writeFile(join(rootDir, "src", "request-routing.ts"), "export const requestRouting = () => \"ok\";\n", "utf8");
  await writeFile(join(rootDir, "src", "request-routing.test.ts"), [
    "import assert from \"node:assert/strict\";",
    "import test from \"node:test\";",
    "",
    "test(\"request routing\", () => {",
    "  assert.equal(1, 1);",
    "});",
    "",
  ].join("\n"), "utf8");

  const initResult = await runCli(["init", rootDir, "--name", "locate-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["locate", "request routing"]);
    assert.equal(result.exitCode, 0);

    const summary = JSON.parse(result.output) as {
      readonly query: string;
      readonly projectName: string;
      readonly area: string;
      readonly readFirst: readonly string[];
      readonly tests: readonly string[];
      readonly commands: readonly string[];
      readonly doNotReadYet: readonly string[];
    };

    assert.equal(summary.query, "request routing");
    assert.equal(summary.projectName, "locate-project");
    assert.equal(summary.area, "request-routing");
    assert.ok(summary.readFirst.includes("src/request-routing.ts"));
    assert.ok(summary.tests.includes("src/request-routing.test.ts"));
    assert.ok(summary.commands.some((command) => command.includes("npm test")));
    assert.ok(summary.doNotReadYet.includes("closed issues"));
  });
});

test("runCli test --summary returns a compact JSON summary", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-test-summary-"));
  await seedProject(rootDir);
  await writeFile(join(rootDir, "package.json"), JSON.stringify({
    name: "summary-project",
    scripts: {
      test: "node summary-failure.js",
    },
  }, null, 2), "utf8");
  await writeFile(join(rootDir, "summary-failure.js"), [
    `process.stdout.write("${"x".repeat(6000)}\\n");`,
    'process.stdout.write("✖ failing summary\\n");',
    'process.stdout.write("ℹ tests 1\\n");',
    'process.stdout.write("ℹ pass 0\\n");',
    'process.stdout.write("ℹ fail 1\\n");',
    'process.stdout.write("expected: 2\\n");',
    'process.stdout.write("actual: 1\\n");',
    'process.stdout.write("sample.test.js:6:10\\n");',
    'process.exit(1);',
    '',
  ].join("\n"), "utf8");
  await writeFile(join(rootDir, "sample.test.js"), [
    "import assert from \"node:assert/strict\";",
    "import test from \"node:test\";",
    "",
    "test(\"failing summary\", () => {",
    `  console.log("${"x".repeat(6000)}");`,
    "  assert.equal(1, 2);",
    "});",
    "",
  ].join("\n"), "utf8");

  const initResult = await runCli(["init", rootDir, "--name", "summary-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["test", "--summary"]);
    assert.equal(result.exitCode, 1);

    const summary = JSON.parse(result.output) as {
      readonly command: string;
      readonly passed: boolean;
      readonly failCount: number | null;
      readonly failedTests: readonly string[];
      readonly relevantFiles: readonly string[];
      readonly suggestedNextCommand: string;
      readonly rawOutputPath: string | null;
      readonly summary: string;
    };

    assert.equal(summary.command, "npm test");
    assert.equal(summary.passed, false);
    assert.equal(summary.failCount, 1);
    assert.ok(summary.failedTests.includes("failing summary"));
    assert.ok(summary.relevantFiles.includes("sample.test.js"));
    assert.match(summary.suggestedNextCommand, /node --test sample\.test\.js/);
    assert.match(summary.summary, /Failed 1 test\(s\) for npm test\./);
    assert.ok(summary.rawOutputPath !== null);
    if (summary.rawOutputPath === null) {
      throw new Error("Expected raw test output to be stored.");
    }
    assert.ok(await exists(join(rootDir, summary.rawOutputPath)));
  });
});

test("runCli audit --changed summarizes changed files and suggested checks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-audit-"));
  await seedProject(rootDir);
  await writeFile(join(rootDir, "src", "request-routing.ts"), "export const requestRouting = () => \"ok\";\n", "utf8");
  await writeFile(join(rootDir, "src", "request-routing.test.ts"), [
    "import assert from \"node:assert/strict\";",
    "import test from \"node:test\";",
    "",
    "test(\"request routing\", () => {",
    "  assert.equal(1, 1);",
    "});",
    "",
  ].join("\n"), "utf8");

  const initResult = await runCli(["init", rootDir, "--name", "audit-project"]);
  assert.equal(initResult.exitCode, 0);

  runGit(rootDir, ["config", "user.name", "Test User"]);
  runGit(rootDir, ["config", "user.email", "test@example.com"]);
  runGit(rootDir, ["add", "-A"]);
  runGit(rootDir, ["commit", "-m", "baseline"]);

  await writeFile(join(rootDir, "src", "request-routing.ts"), "export const requestRouting = () => \"changed\";\n", "utf8");

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["audit", "--changed"]);
    assert.equal(result.exitCode, 0);

    const summary = JSON.parse(result.output) as {
      readonly mode: string;
      readonly gitAvailable: boolean;
      readonly changedFiles: readonly string[];
      readonly relevantAreas: readonly string[];
      readonly checks: readonly {
        readonly file: string;
        readonly area: string;
        readonly readFirst: readonly string[];
        readonly tests: readonly string[];
        readonly commands: readonly string[];
      }[];
      readonly suggestedCommands: readonly string[];
      readonly summary: string;
    };

    assert.equal(summary.mode, "changed");
    assert.equal(summary.gitAvailable, true);
    assert.ok(summary.changedFiles.includes("src/request-routing.ts"));
    assert.ok(summary.relevantAreas.includes("request-routing"));
    const requestCheck = summary.checks.find((check) => check.file === "src/request-routing.ts");
    if (requestCheck === undefined) {
      throw new Error("Expected audit summary to include the changed request-routing file.");
    }
    assert.equal(requestCheck.area, "request-routing");
    assert.ok(requestCheck.readFirst.includes("src/request-routing.ts"));
    assert.ok(requestCheck.tests.includes("src/request-routing.test.ts"));
    assert.ok(requestCheck.commands.some((command) => command.includes("npm test")));
    assert.ok(summary.suggestedCommands.some((command) => command.includes("npm test")));
    assert.match(summary.summary, /Scanned 1 changed file/);
  });
});

test("runCli upgrade --dry-run reports a plan without writing files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-upgrade-dry-run-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "upgrade-dry-run-project"]);
  assert.equal(initResult.exitCode, 0);

  await rewriteManifestVersion(rootDir, null);

  const navigationBefore = await readFile(join(rootDir, ".flowness", "navigation.md"), "utf8");

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["upgrade", "--dry-run"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Current version: legacy/);
    assert.match(result.output, /Target version: 0\.1\.5/);
    assert.match(result.output, /Will regenerate:/);
    assert.match(result.output, /Will add if missing:/);
    assert.match(result.output, /Will patch:/);
    assert.match(result.output, /Will not touch:/);
    assert.match(result.output, /Recommended next commands:/);
    assert.match(result.output, /flowness upgrade --apply/);
  });

  assert.equal(await readFile(join(rootDir, ".flowness", "navigation.md"), "utf8"), navigationBefore);
  assert.equal(await exists(join(rootDir, ".flowness", "upgrade")), false);
  assert.deepEqual(await upgradeBackupDirectories(rootDir), []);
});

test("runCli upgrade --apply backs up files and preserves user-owned content", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-upgrade-apply-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "upgrade-apply-project"]);
  assert.equal(initResult.exitCode, 0);

  await rewriteManifestVersion(rootDir, "0.1.4");

  const issueId = "ISSUE-123-TEST";
  const issueDir = join(rootDir, ".flowness", "issues", issueId);
  const decisionsDir = join(issueDir, "decisions");
  await mkdir(decisionsDir, { recursive: true });
  await mkdir(join(issueDir, "reviews"), { recursive: true });
  await mkdir(join(rootDir, ".flowness", "logs"), { recursive: true });
  const issueFile = join(issueDir, "issue.md");
  const logFile = join(rootDir, ".flowness", "logs", `${issueId}.md`);
  const decisionFile = join(decisionsDir, "decision.md");
  await writeFile(issueFile, "# Issue\n", "utf8");
  await writeFile(logFile, "# Log\n", "utf8");
  await writeFile(decisionFile, "# Decision\n", "utf8");

  const reactRulePath = join(rootDir, ".flowness", "rules", "tech", "react.md");
  const originalReactRule = await readFile(reactRulePath, "utf8");
  const customReactRule = `${originalReactRule}\n<!-- custom user rule -->\n`;
  await writeFile(reactRulePath, customReactRule, "utf8");

  const findingsPath = join(rootDir, ".flowness", "findings", "README.md");
  await unlink(findingsPath);

  const generatedAgents = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  const customAgents = [
    "# Custom Intro",
    "",
    generatedAgents.replace(
      /<!-- FLOWNESS:BEGIN -->[\s\S]*?<!-- FLOWNESS:END -->/,
      [
        "<!-- FLOWNESS:BEGIN -->",
        "# Custom Managed Block",
        "",
        "- user note",
        "",
        "<!-- FLOWNESS:END -->",
      ].join("\n"),
    ),
    "",
    "# Custom Footer",
    "",
  ].join("\n");
  await writeFile(join(rootDir, "AGENTS.md"), customAgents, "utf8");

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["upgrade", "--apply"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Current version: 0\.1\.4/);
    assert.match(result.output, /Target version: 0\.1\.5/);
    assert.match(result.output, /Backup path:/);
    assert.match(result.output, /Report path:/);
    assert.match(result.output, /Updated files:/);
  });

  const backupDirs = await upgradeBackupDirectories(rootDir);
  assert.ok(backupDirs.length > 0);
  const backupDir = backupDirs[0];
  if (backupDir === undefined) {
    throw new Error("Expected at least one upgrade backup directory.");
  }

  const backupRoot = join(rootDir, ".flowness", "backups", backupDir);
  assert.equal(await readFile(join(backupRoot, "AGENTS.md"), "utf8"), customAgents);

  assert.ok(await exists(join(rootDir, ".flowness", "upgrade", "upgrade-report.md")));
  assert.match(await readFile(findingsPath, "utf8"), /# Findings/);
  assert.equal(await readFile(reactRulePath, "utf8"), customReactRule);

  const updatedAgents = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  assert.match(updatedAgents, /# Custom Intro/);
  assert.match(updatedAgents, /# Custom Footer/);
  assert.match(updatedAgents, /# AGENTS/);
  assert.match(updatedAgents, /Keep this file short and use the generated navigation files for details\./);

  assert.equal(await readFile(issueFile, "utf8"), "# Issue\n");
  assert.equal(await readFile(logFile, "utf8"), "# Log\n");
  assert.equal(await readFile(decisionFile, "utf8"), "# Decision\n");
});

test("runCli upgrade --apply leaves AGENTS.md untouched without FLOWNESS markers", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-upgrade-agents-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "upgrade-agents-project"]);
  assert.equal(initResult.exitCode, 0);

  const customAgents = [
    "# Custom AGENTS",
    "",
    "This file is intentionally unmanaged.",
    "",
  ].join("\n");
  await writeFile(join(rootDir, "AGENTS.md"), customAgents, "utf8");

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["upgrade", "--apply"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /AGENTS\.md does not contain FLOWNESS markers/);
  });

  assert.equal(await readFile(join(rootDir, "AGENTS.md"), "utf8"), customAgents);
});

test("runCli upgrade --apply refuses to overwrite modified generated project profile files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-upgrade-generated-conflict-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "upgrade-generated-conflict-project"]);
  assert.equal(initResult.exitCode, 0);

  const projectProfilePath = join(rootDir, ".flowness", "project-profile.md");
  const modifiedProjectProfile = `${await readFile(projectProfilePath, "utf8")}\n<!-- user edit -->\n`;
  await writeFile(projectProfilePath, modifiedProjectProfile, "utf8");

  await withWorkingDirectory(rootDir, async () => {
    const result = await runCli(["upgrade", "--apply"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Conflicts:/);
    assert.match(result.output, /\.flowness\/project-profile\.md/);
  });

  assert.equal(await readFile(projectProfilePath, "utf8"), modifiedProjectProfile);
});

test("runCli surfaces blocked human gates as pending approval", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-cli-human-gate-"));
  await seedProject(rootDir);

  const initResult = await runCli(["init", rootDir, "--name", "gate-project"]);
  assert.equal(initResult.exitCode, 0);

  await withWorkingDirectory(rootDir, async () => {
    const issueResult = await runCli(["issue:create", "--title", "Sign in", "--type", "feature"]);
    assert.equal(issueResult.exitCode, 0);

    const [issueName] = await issueDirectories(rootDir);
    if (issueName === undefined) {
      throw new Error("Expected issue workspace to be created.");
    }

    const waitingStep = await runCli(["step", "--issue", issueName]);
    assert.equal(waitingStep.exitCode, 1);
    assert.match(waitingStep.output, /Status: waiting_approval/);
    assert.match(waitingStep.output, /Gate\/review: blocked: waiting_human_approval/);
    assert.match(waitingStep.output, /Current issue state: blocked/);

    const waitingStatus = await runCli(["status", "--issue", issueName]);
    assert.equal(waitingStatus.exitCode, 0);
    assert.match(waitingStatus.output, /Blocked: yes/);
    assert.match(waitingStatus.output, /Block reason: waiting_human_approval/);
    assert.match(waitingStatus.output, /Pending step: Intake/);
    assert.match(waitingStatus.output, /Required action: Approve the Intake gate before continuing\./);
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
    assert.match(firstStep.output, /Completed step: Intake/);
    assert.match(firstStep.output, /Status: completed/);
    assert.match(firstStep.output, /What was done:/);
    assert.match(firstStep.output, /Evidence created:/);
    assert.match(firstStep.output, /Gate\/review: passed/);
    assert.match(firstStep.output, /Current issue state:/);
    assert.match(firstStep.output, /Next step file:/);

    await unlink(join(rootDir, "docs", "PRD.md"));
    await unlink(join(rootDir, "docs", "ARD.md"));

    const blockedPlanningDocs = await runCli(["step", "--issue", issueName, "--approve"]);
    assert.equal(blockedPlanningDocs.exitCode, 1);
    assert.match(blockedPlanningDocs.output, /Status: blocked/);
    assert.match(blockedPlanningDocs.output, /blocked: missing planning docs/);
    assert.match(blockedPlanningDocs.output, /Current issue state: blocked/);
    assert.match(blockedPlanningDocs.output, /Next step file:/);

    const planningBlockedStatus = await runCli(["status", "--issue", issueName]);
    assert.equal(planningBlockedStatus.exitCode, 0);
    assert.match(planningBlockedStatus.output, /Blocked: yes/);

    const workflowStatePath = join(rootDir, ".flowness", "issues", issueName, "workflow-state.json");
    const workflowState = JSON.parse(await readFile(workflowStatePath, "utf8")) as { currentStep: string; updatedAt: string };
    workflowState.currentStep = "Implementation";
    workflowState.updatedAt = "2026-06-19T00:10:00.000Z";
    await writeFile(workflowStatePath, `${JSON.stringify(workflowState, null, 2)}\n`, "utf8");

    const blockedStep = await runCli(["step", "--issue", issueName, "--approve"]);
    assert.equal(blockedStep.exitCode, 1);
    assert.match(blockedStep.output, /State\/log mismatch detected/);
    assert.match(blockedStep.output, /Recovery:/);

    const mismatchStatus = await runCli(["status", "--issue", issueName]);
    assert.equal(mismatchStatus.exitCode, 1);
    assert.match(mismatchStatus.output, /State\/log mismatch detected/);
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
