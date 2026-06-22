import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCommandRisk } from "./command-risk.js";

async function initGitRepo(rootDir: string): Promise<void> {
  const run = (args: readonly string[]): void => {
    const result = spawnSync("git", [...args], {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });

    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout || "unknown error"}`);
    }
  };

  run(["init"]);
  run(["config", "user.name", "Test User"]);
  run(["config", "user.email", "test@example.com"]);
  await writeFile(join(rootDir, "tracked.txt"), "tracked\n", "utf8");
  run(["add", "-A"]);
  run(["commit", "-m", "initial"]);
  await writeFile(join(rootDir, "tracked.txt"), "changed\n", "utf8");
  await mkdir(join(rootDir, "scratch"), { recursive: true });
  await writeFile(join(rootDir, "scratch", "untracked.txt"), "untracked\n", "utf8");
}

test("dangerous command analysis classifies git reset with intent clarification and dry-run impact", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-command-risk-git-reset-"));
  await initGitRepo(rootDir);

  const analysis = await analyzeCommandRisk("git reset --hard HEAD~1", rootDir);

  assert.equal(analysis.category, "git-reset-hard");
  assert.equal(analysis.riskLevel, "critical");
  assert.equal(analysis.requiresExplicitConfirmation, true);
  assert.match(analysis.warning, /discard tracked working tree changes/i);
  assert.match(analysis.safeAlternative ?? "", /git restore --staged/i);
  assert.ok(analysis.intentClarification.includes("Unstage files only"));
  assert.ok(analysis.intentClarification.includes("Discard working tree changes"));
  assert.match(analysis.dryRunImpact.join("\n"), /Current branch:/);
  assert.match(analysis.dryRunImpact.join("\n"), /Changed files: tracked\.txt/);
  assert.match(analysis.dryRunImpact.join("\n"), /Untracked files: scratch\/untracked\.txt/);
});

test("dangerous command analysis flags rm -rf and database-destructive commands", async () => {
  const rmAnalysis = await analyzeCommandRisk("rm -rf ./scratch");
  const dbAnalysis = await analyzeCommandRisk("drop table users;");

  assert.equal(rmAnalysis.category, "rm-rf");
  assert.equal(rmAnalysis.riskLevel, "critical");
  assert.equal(rmAnalysis.requiresExplicitConfirmation, true);
  assert.match(rmAnalysis.warning, /permanently/i);
  assert.match(rmAnalysis.dryRunImpact.join("\n"), /Files removed:/);

  assert.equal(dbAnalysis.category, "database-destructive");
  assert.equal(dbAnalysis.riskLevel, "critical");
  assert.equal(dbAnalysis.requiresExplicitConfirmation, true);
  assert.match(dbAnalysis.warning, /permanently delete data or schema/i);
});

test("safe commands stay low risk and do not require explicit approval", async () => {
  const analysis = await analyzeCommandRisk("npm test");

  assert.equal(analysis.category, "low-risk");
  assert.equal(analysis.riskLevel, "low");
  assert.equal(analysis.requiresExplicitConfirmation, false);
  assert.equal(analysis.safeAlternative, null);
});
