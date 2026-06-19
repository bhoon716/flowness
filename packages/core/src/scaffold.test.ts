import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { initializeProject } from "./scaffold.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureSeededProject(rootDir: string): Promise<void> {
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

test("initializeProject creates the Flowness project skeleton", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-init-"));
  await ensureSeededProject(rootDir);

  const result = await initializeProject({
    rootDir,
    projectName: "demo-project",
  });

  assert.equal(result.projectName, "demo-project");
  assert.equal(result.alreadyInitialized, false);
  assert.equal(result.gitInitialized, true);
  assert.match(result.warnings.join("\n"), /git repository was initialized/i);
  assert.ok(result.createdFiles.includes("AGENTS.md"));
  assert.ok(result.createdFiles.includes(".flowness/config/project.yaml"));
  assert.ok(result.createdFiles.includes(".flowness/project-profile.md"));
  assert.ok(result.createdFiles.includes(".flowness/context-index.json"));
  assert.ok(result.createdFiles.includes(".flowness/commands.json"));
  assert.ok(result.createdFiles.includes(".flowness/harness-manifest.json"));
  assert.ok(result.createdFiles.includes(".flowness/rules/commit-policy.md"));
  assert.ok(result.createdFiles.includes(".flowness/scripts/flowness-runner.ts"));
  assert.ok(result.createdFiles.includes(".flowness/scripts/workflow-guard.ts"));
  assert.ok(result.createdFiles.includes(".flowness/workflows/feature-development/07-commit.md"));
  assert.ok(result.createdFiles.includes(".flowness/workflows/mvp-planning/08-commit.md"));
  assert.ok(result.createdFiles.includes(".flowness/workflows/mvp-planning/09-close.md"));
  assert.ok(result.createdFiles.every((file) => !file.startsWith(".agent")));
  assert.ok(result.createdFiles.every((file) => !file.startsWith(".codex")));

  assert.ok(await exists(join(rootDir, ".git")));
  assert.equal(await exists(join(rootDir, ".agent")), false);
  assert.equal(await exists(join(rootDir, ".codex")), false);

  const agents = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  assert.match(agents, /Flowness keeps project guidance intentionally small\./);
  assert.match(agents, /flowness run "<request>"/);
  assert.match(agents, /flowness step --issue ISSUE-ID/);
  assert.match(agents, /flowness evidence:add --issue ISSUE-ID/);
  assert.match(agents, /Treat `\.flowness\/` as the source of truth and `\.agent\/` as legacy only\./);
  assert.match(agents, /Commit only after Evidence Review and the commit policy check\./);

  const scriptsReadme = await readFile(join(rootDir, ".flowness/scripts/README.md"), "utf8");
  assert.match(scriptsReadme, /npx tsx \.flowness\/scripts\/flowness-runner\.ts/);
  assert.match(scriptsReadme, /npx tsx \.flowness\/scripts\/workflow-guard\.ts/);
  assert.match(scriptsReadme, /flowness run "<request>"/);
  assert.match(scriptsReadme, /flowness status --issue ISSUE-ID/);
  assert.match(scriptsReadme, /flowness evidence:add/);

  const projectProfile = await readFile(join(rootDir, ".flowness/project-profile.md"), "utf8");
  assert.match(projectProfile, /# Project Profile/);
  assert.match(projectProfile, /Project: demo-project/);
  assert.match(projectProfile, /Build: `npm run build`/);

  const commands = await readFile(join(rootDir, ".flowness/commands.json"), "utf8");
  assert.match(commands, /flowness run/);
  assert.match(commands, /flowness status --issue ISSUE-ID/);
  assert.match(commands, /flowness evidence:add/);

  const contextIndex = await readFile(join(rootDir, ".flowness/context-index.json"), "utf8");
  assert.match(contextIndex, /"\.flowness\/project-profile\.md"/);
  assert.match(contextIndex, /"\.flowness\/commands\.json"/);
  assert.match(contextIndex, /"\.flowness\/state"/);

  const manifest = await readFile(join(rootDir, ".flowness/harness-manifest.json"), "utf8");
  assert.match(manifest, /"version": "0\.1\.4"/);
  assert.match(manifest, /"\.flowness\/state"/);
  assert.match(manifest, /flowness run/);
  assert.match(manifest, /flowness status --issue ISSUE-ID/);

  const featureReadme = await readFile(join(rootDir, ".flowness/workflows/feature-development/README.md"), "utf8");
  assert.match(featureReadme, /Feature Development/);
  assert.match(featureReadme, /Commit/);
  assert.match(featureReadme, /The final workflow step is Commit, and Close comes only after the commit record exists\./);

  const featureCommitStep = await readFile(join(rootDir, ".flowness/workflows/feature-development/07-commit.md"), "utf8");
  assert.match(featureCommitStep, /## Step Navigation/);
  assert.match(featureCommitStep, /Previous:/);
  assert.match(featureCommitStep, /Next:/);
  assert.match(featureCommitStep, /## Gate Behavior/);
  assert.match(featureCommitStep, /## Required Command \/ Runner Usage/);
  assert.match(featureCommitStep, /commit-policy\.md/);
  assert.match(featureCommitStep, /Inspect git status, git log, and diff stat before choosing the commit message\./);
  assert.match(featureCommitStep, /Report the commit hash, the message, and the changed files after the commit succeeds\./);

  const commitPolicy = await readFile(join(rootDir, ".flowness/rules/commit-policy.md"), "utf8");
  assert.match(commitPolicy, /git status --short --untracked-files=all/);
  assert.match(commitPolicy, /git log --oneline --graph --decorate -n 5/);
  assert.match(commitPolicy, /git diff --stat --cached/);

  const featureWorkflowFiles = (await readdir(join(rootDir, ".flowness/workflows/feature-development"))).sort();
  assert.deepEqual(featureWorkflowFiles, [
    "01-intake.md",
    "02-clarifying-questions.md",
    "03-requirement-analysis.md",
    "04-scope-definition.md",
    "05-implementation.md",
    "06-evidence-review.md",
    "07-commit.md",
    "08-close.md",
    "README.md",
  ]);

  for (const workflowId of [
    "feature-development",
    "code-review",
    "bug-fix",
    "refactoring",
    "mvp-planning",
  ]) {
    const workflowDir = join(rootDir, ".flowness/workflows", workflowId);
    const stepFiles = (await readdir(workflowDir))
      .filter((fileName) => fileName.endsWith(".md") && fileName !== "README.md")
      .sort();

    const expectedCount = workflowId === "mvp-planning" ? 9 : 8;
    assert.equal(stepFiles.length, expectedCount);

    for (const fileName of stepFiles) {
      const content = await readFile(join(workflowDir, fileName), "utf8");
      assert.match(content, /## Step Metadata/);
      assert.match(content, /Current Step:/);
      assert.match(content, /## Step Navigation/);
      assert.match(content, /Previous:/);
      assert.match(content, /Next:/);
      assert.match(content, /## Purpose/);
      assert.match(content, /## Human Gate/);
      assert.match(content, /## Gate Behavior/);
      assert.match(content, /## Required Command \/ Runner Usage/);
      assert.match(content, /## Required Inputs/);
      assert.match(content, /## Actions/);
      assert.match(content, /## Evidence Required/);
      assert.match(content, /## Exit Criteria/);

      if (fileName.includes("commit")) {
        assert.match(content, /commit-policy\.md/);
        assert.match(content, /flowness evidence:add/);
      }
    }
  }

  const mvpWorkflowFiles = (await readdir(join(rootDir, ".flowness/workflows/mvp-planning"))).sort();
  assert.deepEqual(mvpWorkflowFiles, [
    "01-intake.md",
    "02-requirement-analysis.md",
    "03-clarifying-questions.md",
    "04-scope-definition.md",
    "05-mvp-plan.md",
    "06-plan-review.md",
    "07-issue-breakdown.md",
    "08-commit.md",
    "09-close.md",
    "README.md",
  ]);

  const config = await readFile(join(rootDir, ".flowness/config/project.yaml"), "utf8");
  assert.match(config, /project_name: demo-project/);
  assert.match(config, /append_only: true/);
  assert.match(config, /feature: feature-development/);
  assert.match(config, /bugfix: bug-fix/);
  assert.match(config, /refactor: refactoring/);
});

test("initializeProject does not overwrite existing files without force", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-init-existing-"));
  await ensureSeededProject(rootDir);
  const agentsPath = join(rootDir, "AGENTS.md");

  await initializeProject({
    rootDir,
    projectName: "existing-project",
  });
  const before = await readFile(agentsPath, "utf8");

  const secondResult = await initializeProject({
    rootDir,
    projectName: "different-project",
  });

  const after = await readFile(agentsPath, "utf8");
  assert.equal(before, after);
  assert.ok(secondResult.skippedFiles.includes("AGENTS.md"));
});

test("initializeProject warns about legacy .agent workspace files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-legacy-"));
  await ensureSeededProject(rootDir);
  await mkdir(join(rootDir, ".agent"), { recursive: true });

  const result = await initializeProject({
    rootDir,
    projectName: "legacy-project",
  });

  assert.equal(result.alreadyInitialized, true);
  assert.match(result.warnings.join("\n"), /Legacy \.agent workspace files were detected/);
  assert.ok(result.createdFiles.includes(".flowness/config/project.yaml"));
});

test("repository AGENTS file remains Flowness-specific", async () => {
  const agents = await readFile(new URL("../../../AGENTS.md", import.meta.url), "utf8");

  assert.match(agents, /Flowness repository/);
  assert.match(agents, /master-plan\.md/);
  assert.match(agents, /Flowness 제품 명세/);
});
