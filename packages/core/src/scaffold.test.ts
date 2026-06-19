import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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

async function seedProject(rootDir: string): Promise<void> {
  await writeFile(join(rootDir, "package.json"), JSON.stringify({
    name: "demo-project",
    scripts: {
      build: "tsc -b",
      test: "vitest",
      lint: "eslint .",
    },
  }, null, 2), "utf8");
  await writeFile(join(rootDir, "README.md"), "# Demo Project\n", "utf8");
  await writeFile(join(rootDir, "docs", "guide.md"), "# Guide\n", "utf8").catch(async () => {
    // create docs directory first if needed
  });
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
  assert.ok(result.createdFiles.includes("AGENTS.md"));
  assert.ok(result.createdFiles.includes(".flowness/config.yaml"));
  assert.ok(result.createdFiles.includes(".codex/hooks.json"));
  assert.ok(result.createdFiles.includes(".codex/hooks/package.json"));
  assert.ok(result.createdFiles.includes(".codex/hooks/user-prompt-submit.ts"));
  assert.ok(result.createdFiles.includes(".agent/config/project-profile.md"));
  assert.ok(result.createdFiles.includes(".agent/config/commands.md"));
  assert.ok(result.createdFiles.includes(".agent/scripts/README.md"));
  assert.ok(result.createdFiles.includes(".agent/workflows/README.md"));
  assert.ok(result.createdFiles.includes(".agent/workflows/feature-development/README.md"));
  assert.ok(result.createdFiles.includes(".agent/workflows/feature-development/01-intake.md"));
  assert.ok(result.createdFiles.includes(".agent/skills/README.md"));
  assert.ok(result.createdFiles.includes(".agent/templates/README.md"));
  assert.ok(result.createdFiles.includes(".agent/rules/README.md"));

  assert.ok(await exists(join(rootDir, ".agent/workflows/README.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/README.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/01-intake.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/02-clarifying-questions.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/03-requirement-analysis.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/04-scope-definition.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/05-implementation.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/06-evidence-review.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/feature-development/07-close.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/README.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/01-intake.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/02-requirement-analysis.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/03-clarifying-questions.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/04-scope-definition.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/05-mvp-plan.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/06-plan-review.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/07-issue-breakdown.md")));
  assert.ok(await exists(join(rootDir, ".agent/workflows/mvp-planning/08-close.md")));
  assert.ok(await exists(join(rootDir, ".agent/config/project-profile.md")));
  assert.ok(await exists(join(rootDir, ".agent/config/commands.md")));
  assert.ok(await exists(join(rootDir, ".agent/prompts/core-agent.md")));
  assert.ok(await exists(join(rootDir, ".agent/scripts/find-fqcn.py")));
  assert.ok(await exists(join(rootDir, ".agent/scripts/flowness-runner.ts")));
  assert.ok(await exists(join(rootDir, ".agent/scripts/workflow-guard.ts")));
  assert.ok(await exists(join(rootDir, ".agent/scripts/README.md")));
  assert.ok(await exists(join(rootDir, ".codex/hooks/user-prompt-submit.ts")));
  assert.ok(await exists(join(rootDir, ".agent/skills/root-cause-analysis.md")));
  assert.ok(await exists(join(rootDir, ".agent/templates/issue-template.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/flowness-activation.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/request-analysis.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/clarification-policy.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/issue-decomposition.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/fail-closed-workflow.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/workflow-routing.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/workflow-step-contract.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/definition-of-done.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/evidence-policy.md")));
  assert.ok(await exists(join(rootDir, ".agent/rules/README.md")));
  assert.ok(await exists(join(rootDir, ".agent/templates/issue-breakdown-template.md")));

  const agents = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  assert.match(agents, /If `\.agent\/` exists, use Flowness for all development work\./);
  assert.match(agents, /First analyze the request before creating an issue\./);
  assert.match(agents, /Use the MVP planning workflow for product and MVP requests\./);
  assert.match(agents, /Ask clarification questions when requirements are incomplete\./);
  assert.match(agents, /Reuse an existing open issue when the request matches the same work item\./);
  assert.match(agents, /Split large work into issues instead of forcing it into one ticket\./);
  assert.match(agents, /flowness request:create/);
  assert.match(agents, /npx tsx \.agent\/scripts\/flowness-runner\.ts/);
  assert.match(agents, /\.agent\/scripts\/workflow-guard\.ts/);
  assert.match(agents, /\.agent\/rules\/\*/);
  assert.match(agents, /\.agent\/config\/project-profile\.md/);
  assert.match(agents, /Build command: `npm run build`/);
  assert.match(agents, /Test command: `npm test`/);
  assert.match(agents, /Lint command: `npm run lint`/);
  assert.match(agents, /Do not rely on `master-plan\.md` unless you are working on Flowness itself\./);

  const scriptsReadme = await readFile(join(rootDir, ".agent/scripts/README.md"), "utf8");
  assert.match(scriptsReadme, /npx tsx \.agent\/scripts\/flowness-runner\.ts/);
  assert.match(scriptsReadme, /flowness request:create/);
  assert.match(scriptsReadme, /user-prompt-submit\.ts/);

  const hooksJson = await readFile(join(rootDir, ".codex/hooks.json"), "utf8");
  assert.match(hooksJson, /UserPromptSubmit/);
  assert.match(hooksJson, /user-prompt-submit\.ts/);
  assert.match(hooksJson, /node --no-warnings --experimental-strip-types \.codex\/hooks\/user-prompt-submit\.ts/);
  assert.match(hooksJson, /Analyzing request and routing to Flowness/);
  assert.doesNotMatch(hooksJson, /git rev-parse/);
  assert.doesNotMatch(hooksJson, /TICKET-/);

  const hooksPackageJson = await readFile(join(rootDir, ".codex/hooks/package.json"), "utf8");
  assert.match(hooksPackageJson, /"type": "module"/);

  const hookScript = await readFile(join(rootDir, ".codex/hooks/user-prompt-submit.ts"), "utf8");
  assert.match(hookScript, /request:create/);
  assert.doesNotMatch(hookScript, /TICKET-/);

  const hookOutput = execFileSync(
    "node",
    ["--experimental-strip-types", ".codex/hooks/user-prompt-submit.ts"],
    {
      cwd: rootDir,
      input: JSON.stringify({ prompt: "회원가입 로그인 기능 만들어줘" }),
      encoding: "utf8",
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  assert.match(hookOutput, /hookSpecificOutput/);
  assert.match(hookOutput, /Flowness analyzed this as a development task\./);
  assert.match(hookOutput, /ISSUE-001-[A-Z0-9-]+/);
  assert.doesNotMatch(hookOutput, /decision\s*:\s*"block"|decision:block/);
  assert.doesNotMatch(hookOutput, /TICKET-/);

  const projectProfile = await readFile(join(rootDir, ".agent/config/project-profile.md"), "utf8");
  assert.match(projectProfile, /# Project Profile/);
  assert.match(projectProfile, /Project: demo-project/);
  assert.match(projectProfile, /Build: `npm run build`/);

  const commands = await readFile(join(rootDir, ".agent/config/commands.md"), "utf8");
  assert.match(commands, /# Commands/);
  assert.match(commands, /Build/);
  assert.match(commands, /npm run build/);

  const workflowReadme = await readFile(join(rootDir, ".agent/workflows/feature-development/README.md"), "utf8");
  assert.match(workflowReadme, /Feature Development/);
  assert.match(workflowReadme, /Clarifying Questions/);

  const mvpWorkflowReadme = await readFile(join(rootDir, ".agent/workflows/mvp-planning/README.md"), "utf8");
  assert.match(mvpWorkflowReadme, /MVP Planning/);
  assert.match(mvpWorkflowReadme, /Issue Breakdown/);

  const workflowFiles = await readdir(join(rootDir, ".agent/workflows/feature-development"));
  assert.deepEqual([...workflowFiles].sort(), [
    "01-intake.md",
    "02-clarifying-questions.md",
    "03-requirement-analysis.md",
    "04-scope-definition.md",
    "05-implementation.md",
    "06-evidence-review.md",
    "07-close.md",
    "README.md",
  ]);

  const mvpWorkflowFiles = await readdir(join(rootDir, ".agent/workflows/mvp-planning"));
  assert.deepEqual([...mvpWorkflowFiles].sort(), [
    "01-intake.md",
    "02-requirement-analysis.md",
    "03-clarifying-questions.md",
    "04-scope-definition.md",
    "05-mvp-plan.md",
    "06-plan-review.md",
    "07-issue-breakdown.md",
    "08-close.md",
    "README.md",
  ]);

  const config = await readFile(join(rootDir, ".flowness/config.yaml"), "utf8");
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

test("repository AGENTS file remains Flowness-specific", async () => {
  const agents = await readFile(new URL("../../../AGENTS.md", import.meta.url), "utf8");

  assert.match(agents, /Flowness repository/);
  assert.match(agents, /master-plan\.md/);
  assert.match(agents, /Flowness 제품 명세/);
});
