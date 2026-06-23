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
  assert.ok(result.createdFiles.includes(".flowness/navigation.md"));
  assert.ok(result.createdFiles.includes(".flowness/state/active-issue.md"));
  assert.ok(result.createdFiles.includes(".flowness/findings/README.md"));
  assert.ok(result.createdFiles.includes(".flowness/templates/review-template.md"));
  assert.ok(result.createdFiles.includes(".flowness/templates/finding-template.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/git.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/commit-policy.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/project-overrides.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/performance-improvement.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/rule-update-log.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/tech/README.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/tech/react.md"));
  assert.ok(result.createdFiles.includes(".flowness/rules/tech/typescript.md"));
  assert.ok(result.createdFiles.includes(".flowness/scripts/flowness-runner.ts"));
  assert.ok(result.createdFiles.includes(".flowness/scripts/workflow-guard.ts"));
  assert.ok(result.createdFiles.includes("docs/troubleshooting/performance-improvements.md"));
  assert.ok(result.createdFiles.includes("docs/troubleshooting/evidence-summary.md"));
  assert.ok(result.createdFiles.includes("docs/PRD.md"));
  assert.ok(result.createdFiles.includes("docs/ARD.md"));
  assert.ok(result.createdFiles.includes(".flowness/workflows/feature-development/07-commit.md"));
  assert.ok(result.createdFiles.includes(".flowness/workflows/mvp-planning/08-commit.md"));
  assert.ok(result.createdFiles.includes(".flowness/workflows/mvp-planning/09-close.md"));
  assert.ok(result.createdFiles.every((file) => !file.startsWith(".agent")));
  assert.ok(result.createdFiles.every((file) => !file.startsWith(".codex")));

  assert.ok(await exists(join(rootDir, ".git")));
  assert.equal(await exists(join(rootDir, ".agent")), false);
  assert.equal(await exists(join(rootDir, ".codex")), false);

  const agents = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  assert.match(agents, /Keep this file short\. After `flowness init`, talk to the coding agent in natural language first, then use the generated files when you need setup, debugging, recovery, (?:inspection, )?or manual escape hatches\./);
  assert.match(agents, /Respond to the user in the user's language unless the user asks otherwise\./);
  assert.match(agents, /flowness locate "<task description>"/);
  assert.match(agents, /flowness review:run/);
  assert.match(agents, /flowness test --summary/);
  assert.match(agents, /flowness audit --changed/);
  assert.match(agents, /Use the command list as agent-facing instructions and manual escape hatches, not as the normal human workflow\./);
  assert.match(agents, /Treat `\.flowness\/` as the source of truth and `\.agent\/` as legacy only\./);
  assert.match(agents, /Do not paste long transcripts into logs, findings, or reviews\./);
  assert.ok(agents.split("\n").length < 45);

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

  const commandsJson = JSON.parse(await readFile(join(rootDir, ".flowness/commands.json"), "utf8")) as {
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
  assert.equal(commandsJson.commands.run, "flowness run \"<request>\"");
  assert.equal(commandsJson.commands.reviewRun, "flowness review:run --issue ISSUE-ID");
  assert.equal(commandsJson.commands.status, "flowness status --issue ISSUE-ID");
  assert.equal(commandsJson.commands.locate, "flowness locate \"<task description>\"");
  assert.equal(commandsJson.commands.testSummary, "flowness test --summary");
  assert.equal(commandsJson.commands.auditChanged, "flowness audit --changed");
  assert.equal(commandsJson.commands.evidenceAdd, "flowness evidence:add --issue ISSUE-ID --kind file --title \"...\" --location path");
  assert.equal(commandsJson.commands.ruleUpdate, "flowness rule:update --id RULE-ID --input \"...\"");

  const contextIndex = await readFile(join(rootDir, ".flowness/context-index.json"), "utf8");
  const parsedContextIndex = JSON.parse(contextIndex) as {
    readonly projectName: string;
    readonly areas: readonly { readonly area: string; readonly entryFiles: readonly string[] }[];
  };
  assert.equal(parsedContextIndex.projectName, "demo-project");
  assert.ok(parsedContextIndex.areas.some((area) => area.area === "findings"));
  assert.ok(parsedContextIndex.areas.some((area) => area.area === "source"));
  const sourceArea = parsedContextIndex.areas.find((area) => area.area === "source");
  assert.ok(sourceArea !== undefined);
  assert.ok(sourceArea.entryFiles.every((file) => file !== "src"));
  assert.ok(parsedContextIndex.areas.some((area) => area.area === "navigation"));

  const navigation = await readFile(join(rootDir, ".flowness/navigation.md"), "utf8");
  assert.match(navigation, /# Navigation/);
  assert.match(navigation, /Read this file first/);
  assert.match(navigation, /## File Location/);
  assert.match(navigation, /flowness locate "<task description>"/);
  assert.match(navigation, /flowness test --summary/);
  assert.match(navigation, /flowness audit --changed/);
  assert.match(navigation, /Active issue: none yet/);
  assert.doesNotMatch(navigation, /Planning docs:/);

  const activeIssue = await readFile(join(rootDir, ".flowness/state/active-issue.md"), "utf8");
  assert.match(activeIssue, /# Active Issue/);
  assert.match(activeIssue, /No active issue exists yet\./);
  assert.match(activeIssue, /## Where To Start/);
  assert.match(activeIssue, /flowness locate "<task description>"/);
  assert.match(activeIssue, /## Rules/);
  assert.doesNotMatch(activeIssue, /Planning Docs/);

  const prd = await readFile(join(rootDir, "docs/PRD.md"), "utf8");
  assert.match(prd, /# PRD/);
  assert.match(prd, /## Product Topic \/ Users \/ Problem/);
  assert.match(prd, /## Core Features \/ Non-goals/);
  assert.match(prd, /## Open Questions/);
  assert.match(prd, /\[\s*Navigation\s*\]\(\.\.\/\.flowness\/navigation\.md\)/);

  const ard = await readFile(join(rootDir, "docs/ARD.md"), "utf8");
  assert.match(ard, /# ARD/);
  assert.match(ard, /## Stack/);
  assert.match(ard, /## Storage \/ Auth \/ Deployment \/ Scale/);
  assert.match(ard, /## Test Strategy \/ Security/);
  assert.match(ard, /\[\s*Navigation\s*\]\(\.\.\/\.flowness\/navigation\.md\)/);

  const performanceDoc = await readFile(join(rootDir, "docs/troubleshooting/performance-improvements.md"), "utf8");
  assert.match(performanceDoc, /## Compact Summary/);
  assert.match(performanceDoc, /## Baseline/);
  assert.match(performanceDoc, /## Measurement/);
  assert.match(performanceDoc, /## Troubleshooting/);
  assert.match(performanceDoc, /## Evidence/);
  assert.match(performanceDoc, /scenario/);
  assert.match(performanceDoc, /baseline/);
  assert.match(performanceDoc, /after\/result/);
  assert.match(performanceDoc, /workload or iterations/);
  assert.match(performanceDoc, /key metric/);
  assert.match(performanceDoc, /raw report path/);
  assert.match(performanceDoc, /limitations/);
  assert.match(performanceDoc, /follow-up issue/);
  assert.match(performanceDoc, /same workload after the change/);
  assert.match(performanceDoc, /same metric whenever possible/);
  assert.match(performanceDoc, /Evidence Summary/);

  const evidenceSummaryDoc = await readFile(join(rootDir, "docs/troubleshooting/evidence-summary.md"), "utf8");
  assert.match(evidenceSummaryDoc, /## Required Fields/);
  assert.match(evidenceSummaryDoc, /## Review Rules/);
  assert.match(evidenceSummaryDoc, /## When To Use/);
  assert.match(evidenceSummaryDoc, /scenario/);
  assert.match(evidenceSummaryDoc, /baseline/);
  assert.match(evidenceSummaryDoc, /after\/result/);
  assert.match(evidenceSummaryDoc, /workload or iterations/);
  assert.match(evidenceSummaryDoc, /raw report path/);
  assert.match(evidenceSummaryDoc, /follow-up issue/);

  const techReadme = await readFile(join(rootDir, ".flowness/rules/tech/README.md"), "utf8");
  assert.match(techReadme, /# Tech Rules/);
  assert.match(techReadme, /java\.md/);
  assert.match(techReadme, /react\.md/);

  const reactRule = await readFile(join(rootDir, ".flowness/rules/tech/react.md"), "utf8");
  assert.match(reactRule, /# React/);
  assert.match(reactRule, /## Common Architecture/);
  assert.match(reactRule, /## Testing Guidance/);
  assert.match(reactRule, /## Security Notes/);

  const typeScriptRule = await readFile(join(rootDir, ".flowness/rules/tech/typescript.md"), "utf8");
  assert.match(typeScriptRule, /# TypeScript/);
  assert.match(typeScriptRule, /## Anti-Patterns/);

  const manifest = JSON.parse(await readFile(join(rootDir, ".flowness/harness-manifest.json"), "utf8")) as {
    readonly version: string;
    readonly contextFiles: {
      readonly findings: string;
      readonly activeIssue: string;
      readonly navigation: string;
      readonly prd: string;
    };
    readonly commands: {
      readonly reviewRun: string;
      readonly run: string;
      readonly status: string;
      readonly locate: string;
      readonly testSummary: string;
      readonly auditChanged: string;
    };
  };
  assert.equal(manifest.version, "0.2.8");
  assert.equal(manifest.contextFiles.findings, ".flowness/findings/README.md");
  assert.equal(manifest.contextFiles.activeIssue, ".flowness/state/active-issue.md");
  assert.equal(manifest.contextFiles.navigation, ".flowness/navigation.md");
  assert.equal(manifest.contextFiles.prd, "docs/PRD.md");
  assert.equal(manifest.commands.reviewRun, "flowness review:run --issue ISSUE-ID");
  assert.equal(manifest.commands.run, "flowness run \"<request>\"");
  assert.equal(manifest.commands.status, "flowness status --issue ISSUE-ID");
  assert.equal(manifest.commands.locate, "flowness locate \"<task description>\"");
  assert.equal(manifest.commands.testSummary, "flowness test --summary");
  assert.equal(manifest.commands.auditChanged, "flowness audit --changed");

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
  assert.match(featureCommitStep, /## Required Input Files/);
  assert.match(featureCommitStep, /## Required Output Files/);
  assert.match(featureCommitStep, /## Relevant Rules/);
  assert.match(featureCommitStep, /git\.md/);
  assert.match(featureCommitStep, /commit-policy\.md/);
  assert.match(featureCommitStep, /Inspect the active issue, workflow state, Evidence Review report, git status, and diff summary before choosing the commit message\./);
  assert.match(featureCommitStep, /Report the repo root, commit hash, commit message, and changed files after the commit succeeds\./);

  const gitRules = await readFile(join(rootDir, ".flowness/rules/git.md"), "utf8");
  assert.match(gitRules, /## Scope/);
  assert.match(gitRules, /Protect repository selection, commit scope, and dangerous git operations\./);
  assert.match(gitRules, /Resolve the repository from the changed files, not from the process cwd\./);
  assert.match(gitRules, /## Policy/);
  assert.match(gitRules, /Stage only the intended files and keep commits tied to evidence review\./);
  assert.match(gitRules, /Dangerous commands need a dry-run impact report and explicit approval before execution\./);
  assert.match(gitRules, /Classify `git reset`, `git clean`, `git checkout \.`, `git restore \.`, force push, rebase, reset --hard, and merge by risk before running them\./);
  assert.match(gitRules, /Forbid `git add \.` and `git commit -a` by default\./);
  assert.match(gitRules, /Avoid committing logs, temporary files, nested repo metadata, or generated noise\./);

  const commitPolicy = await readFile(join(rootDir, ".flowness/rules/commit-policy.md"), "utf8");
  assert.match(commitPolicy, /## Policy/);
  assert.match(commitPolicy, /Commit only after the workflow evidence bar is met\./);
  assert.match(commitPolicy, /Use concise conventional-style commit messages\./);
  assert.match(commitPolicy, /Do not use `git add \.` or `git commit -a`\./);
  assert.match(commitPolicy, /Do not rewrite work with destructive git commands without explicit approval\./);
  assert.match(commitPolicy, /Do not commit automatically before the workflow commit step\./);

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

  const reviewWorkflowReadme = await readFile(join(rootDir, ".flowness/workflows/code-review/README.md"), "utf8");
  assert.match(reviewWorkflowReadme, /Review a change set/);
  assert.match(reviewWorkflowReadme, /diff-focused review work/);
  assert.match(reviewWorkflowReadme, /multi-perspective findings/);

  const reviewScopeStep = await readFile(join(rootDir, ".flowness/workflows/code-review/03-scope-definition.md"), "utf8");
  assert.match(reviewScopeStep, /flowness locate/);
  assert.match(reviewScopeStep, /context-index\.json/);

  const reviewTemplate = await readFile(join(rootDir, ".flowness/templates/review-template.md"), "utf8");
  assert.match(reviewTemplate, /## Target/);
  assert.match(reviewTemplate, /## Perspective Results/);
  assert.match(reviewTemplate, /Blocking: yes \/ no/);
  assert.match(reviewTemplate, /Deferrable: yes \/ no/);
  assert.match(reviewTemplate, /Hard blockers/);
  assert.match(reviewTemplate, /Deferrable blockers/);
  assert.match(reviewTemplate, /Follow-up issue: required or none/);
  assert.match(reviewTemplate, /User approval: required before commit/);
  assert.match(reviewTemplate, /## Follow-up/);

  const findingTemplate = await readFile(join(rootDir, ".flowness/templates/finding-template.md"), "utf8");
  assert.match(findingTemplate, /## Perspective/);
  assert.match(findingTemplate, /## Severity/);
  assert.match(findingTemplate, /## Blocking/);
  assert.match(findingTemplate, /## Deferrable/);
  assert.match(findingTemplate, /## Status/);
  assert.match(findingTemplate, /open \| addressed \| closed \| deferred \| accepted-risk/);
  assert.match(findingTemplate, /## Blocker kind/);
  assert.match(findingTemplate, /## File\/path/);
  assert.match(findingTemplate, /## Follow-up issue/);
  assert.match(findingTemplate, /## User approval/);
  assert.match(findingTemplate, /Requires follow-up issue/);

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
      assert.match(content, /## Required Input Files/);
      assert.match(content, /## Required Output Files/);
      assert.match(content, /## Relevant Rules/);
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

  const projectOverrides = await readFile(join(rootDir, ".flowness/rules/project-overrides.md"), "utf8");
  assert.match(projectOverrides, /# Project Overrides/);
  assert.match(projectOverrides, /## Policy/);
  assert.match(projectOverrides, /Use the central rule update log when an override is approved or changed\./);

  const changeLog = await readFile(join(rootDir, ".flowness/rules/rule-update-log.md"), "utf8");
  assert.match(changeLog, /# Rule Update Log/);
  assert.match(changeLog, /- None yet\./);
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
