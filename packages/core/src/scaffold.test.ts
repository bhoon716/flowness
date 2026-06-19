import { mkdtemp, readFile, stat } from "node:fs/promises";
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

test("initializeProject creates the Flowness project skeleton", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-init-"));
  const result = await initializeProject({
    rootDir,
    projectName: "demo-project",
  });

  assert.equal(result.projectName, "demo-project");
  assert.equal(result.alreadyInitialized, false);
  assert.ok(result.createdFiles.includes("AGENTS.md"));
  assert.ok(result.createdFiles.includes(".flowness/config.yaml"));
  assert.ok(result.createdFiles.includes(".codex/hooks.json"));
  assert.ok(await exists(join(rootDir, ".agent/workflows/README.md")));
  assert.ok(await exists(join(rootDir, ".agent/prompts/core-agent.md")));
  assert.ok(await exists(join(rootDir, ".agent/scripts/find-fqcn.py")));

  const config = await readFile(join(rootDir, ".flowness/config.yaml"), "utf8");
  assert.match(config, /project_name: demo-project/);
  assert.match(config, /append_only: true/);
});

test("initializeProject does not overwrite existing files without force", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "flowness-init-existing-"));
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
