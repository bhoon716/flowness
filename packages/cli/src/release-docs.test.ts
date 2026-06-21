import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { runCli } from "./index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(join(repoRoot, relativePath), "utf8");
}

function runNodeScript(scriptPath: string, args: readonly string[] = []): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(process.execPath, [join(repoRoot, scriptPath), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("release docs and changelog files are present and aligned", async () => {
  const [
    rootReadme,
    cliReadme,
    coreReadme,
    chineseReadme,
    changelog,
    checklist,
    releaseNotesTemplate,
    rootPackageJson,
    cliPackageJson,
    corePackageJson,
    configSystemPackageJson,
    decisionSystemPackageJson,
    evidenceSystemPackageJson,
    issueSystemPackageJson,
    logSystemPackageJson,
    reviewSystemPackageJson,
    templatesPackageJson,
    workflowEnginePackageJson,
  ] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("packages/cli/README.md"),
    readRepoFile("packages/core/README.md"),
    readRepoFile("README.zh-CN.md"),
    readRepoFile("CHANGELOG.md"),
    readRepoFile("docs/release-checklist.md"),
    readRepoFile("docs/templates/release-notes.md"),
    readRepoFile("package.json"),
    readRepoFile("packages/cli/package.json"),
    readRepoFile("packages/core/package.json"),
    readRepoFile("packages/config-system/package.json"),
    readRepoFile("packages/decision-system/package.json"),
    readRepoFile("packages/evidence-system/package.json"),
    readRepoFile("packages/issue-system/package.json"),
    readRepoFile("packages/log-system/package.json"),
    readRepoFile("packages/review-system/package.json"),
    readRepoFile("packages/templates/package.json"),
    readRepoFile("packages/workflow-engine/package.json"),
  ]);

  const rootPackage = JSON.parse(rootPackageJson) as { readonly version: string };
  const cliPackage = JSON.parse(cliPackageJson) as { readonly version: string };
  const corePackage = JSON.parse(corePackageJson) as { readonly version: string };
  const packageManifests = [
    JSON.parse(rootPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(cliPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(corePackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(configSystemPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(decisionSystemPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(evidenceSystemPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(issueSystemPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(logSystemPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(reviewSystemPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(templatesPackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
    JSON.parse(workflowEnginePackageJson) as { readonly name: string; readonly version: string; readonly repository?: { readonly url?: string }; readonly bugs?: { readonly url?: string }; readonly homepage?: string },
  ];

  assert.equal(rootPackage.version, cliPackage.version);
  assert.equal(rootPackage.version, corePackage.version);
  for (const manifest of packageManifests) {
    assert.equal(manifest.version, rootPackage.version);
    assert.equal(manifest.repository?.url, "git+https://github.com/bhoon716/flowness.git");
    assert.equal(manifest.bugs?.url, "https://github.com/bhoon716/flowness/issues");
    assert.equal(manifest.homepage, "https://github.com/bhoon716/flowness#readme");
  }
  assert.equal(packageManifests[1]?.name, "@flowness-labs/cli");
  assert.equal(packageManifests[2]?.name, "@flowness-labs/core");
  assert.ok(rootReadme.length > 0);
  assert.ok(cliReadme.length > 0);
  assert.ok(coreReadme.length > 0);
  assert.ok(chineseReadme.length > 0);
  assert.ok(changelog.length > 0);
  assert.ok(checklist.length > 0);
  assert.ok(releaseNotesTemplate.length > 0);

  assert.match(rootReadme, /What Flowness Is/);
  assert.match(rootReadme, /The Normal Flow/);
  assert.match(rootReadme, /Install/);
  assert.match(rootReadme, /Initialize Once/);
  assert.match(rootReadme, /Escape Hatches/);
  assert.match(rootReadme, /Docs/);
  assert.match(rootReadme, /flowness locate/);
  assert.match(rootReadme, /flowness review:run/);
  assert.match(rootReadme, /Add login validation\./);
  assert.match(rootReadme, /Review the current diff\./);
  assert.match(rootReadme, /Refactor UserService safely\./);
  assert.match(rootReadme, /From now on, require tests for performance improvements\./);
  assert.match(rootReadme, /flowness test --summary/);
  assert.match(rootReadme, /flowness audit --changed/);
  assert.match(rootReadme, /flowness upgrade --dry-run/);
  assert.match(rootReadme, /flowness upgrade --apply/);
  assert.match(rootReadme, /README\.zh-CN\.md/);
  assert.match(rootReadme, /docs\/troubleshooting\/performance-improvements\.md/);
  assert.match(rootReadme, /docs\/troubleshooting\/evidence-summary\.md/);

  assert.match(cliReadme, /In normal use, run `flowness init` once/i);
  assert.match(cliReadme, /work through the coding agent in natural language/i);
  assert.match(cliReadme, /Package at a Glance/);
  assert.match(cliReadme, /Start Here/);
  assert.match(cliReadme, /Core Concepts/);
  assert.match(cliReadme, /Escape Hatches/);
  assert.match(cliReadme, /Common Commands/);
  assert.match(cliReadme, /## Command Reference/);
  assert.match(cliReadme, /Upgrade Path/);
  assert.match(cliReadme, /Release Docs/);
  assert.match(cliReadme, /flowness locate/);
  assert.match(cliReadme, /flowness test --summary/);
  assert.match(cliReadme, /flowness audit --changed/);
  assert.match(cliReadme, /flowness upgrade --dry-run/);
  assert.match(cliReadme, /flowness upgrade --apply/);
  assert.match(cliReadme, /flowness skill:run/);
  assert.match(cliReadme, /flowness workflow:create/);
  assert.match(cliReadme, /flowness rule:update/);
  assert.match(cliReadme, /flowness config:gate/);
  assert.match(cliReadme, /README\.zh-CN\.md/);
  assert.match(cliReadme, /docs\/troubleshooting\/performance-improvements\.md/);
  assert.match(cliReadme, /docs\/troubleshooting\/evidence-summary\.md/);

  assert.match(coreReadme, /conversational harness/i);
  assert.match(coreReadme, /flowness init/);
  assert.match(coreReadme, /natural language/i);
  assert.match(coreReadme, /README\.zh-CN\.md/);
  assert.match(coreReadme, /docs\/troubleshooting\/performance-improvements\.md/);
  assert.match(coreReadme, /docs\/troubleshooting\/evidence-summary\.md/);
  assert.match(coreReadme, /GitHub repository/);
  assert.match(coreReadme, /Issues/);
  assert.match(coreReadme, /Homepage/);

  assert.match(chineseReadme, /Flowness 是什么/);
  assert.match(chineseReadme, /安装与初始化/);
  assert.match(chineseReadme, /对话式工作模型/);
  assert.match(chineseReadme, /Review、Issue、证据与规则/);
  assert.match(chineseReadme, /升级已有项目/);
  assert.match(chineseReadme, /Add login validation\./);
  assert.match(chineseReadme, /Review the current diff\./);
  assert.match(chineseReadme, /Refactor UserService safely\./);
  assert.match(chineseReadme, /docs\/troubleshooting\/performance-improvements\.md/);
  assert.match(chineseReadme, /docs\/troubleshooting\/evidence-summary\.md/);

  assert.match(checklist, /GitHub README: `README\.md`/);
  assert.match(checklist, /npm README for the CLI package \/ command reference: `packages\/cli\/README\.md`/);
  assert.match(checklist, /Chinese README: `README\.zh-CN\.md`/);
  assert.match(checklist, /Core package README: `packages\/core\/README\.md`/);
  assert.match(checklist, /Package metadata links verified/);
  assert.match(checklist, /CHANGELOG\.md/);
  assert.match(checklist, /docs\/templates\/release-notes\.md/);
  assert.match(checklist, /docs\/troubleshooting\/performance-improvements\.md/);
  assert.match(checklist, /docs\/troubleshooting\/evidence-summary\.md/);
  assert.match(checklist, /npm pack --dry-run/);

  assert.match(releaseNotesTemplate, /## Summary/);
  assert.match(releaseNotesTemplate, /## Added/);
  assert.match(releaseNotesTemplate, /## Changed/);
  assert.match(releaseNotesTemplate, /## Fixed/);
  assert.match(releaseNotesTemplate, /## Migration Notes/);
  assert.match(releaseNotesTemplate, /## Breaking Changes/);
  assert.match(releaseNotesTemplate, /## Commands/);
  assert.match(releaseNotesTemplate, /## Verification/);
  assert.match(releaseNotesTemplate, /## Known Limitations/);

  assert.match(changelog, /## \[Unreleased\]/);
  assert.match(changelog, /### Added/);
  assert.match(changelog, /### Changed/);
  assert.match(changelog, /### Fixed/);
  assert.match(changelog, /### Deprecated/);
  assert.match(changelog, /### Removed/);
  assert.match(changelog, /### Security/);
  assert.match(changelog, new RegExp(`## \\[${rootPackage.version}\\]`));

  const helpResult = await runCli(["--help"]);
  assert.equal(helpResult.exitCode, 0);
  assert.match(helpResult.output, /flowness init/);
  assert.match(helpResult.output, /flowness run/);
  assert.match(helpResult.output, /flowness request:create/);
  assert.match(helpResult.output, /flowness issue:create/);
  assert.match(helpResult.output, /flowness step/);
  assert.match(helpResult.output, /flowness review:run/);
  assert.match(helpResult.output, /flowness locate/);
  assert.match(helpResult.output, /flowness test/);
  assert.match(helpResult.output, /flowness audit/);
  assert.match(helpResult.output, /flowness upgrade/);
  assert.match(helpResult.output, /flowness validate/);
  assert.match(helpResult.output, /flowness skill:run/);
  assert.match(helpResult.output, /flowness workflow:create/);
  assert.match(helpResult.output, /flowness rule:update/);
  assert.match(helpResult.output, /flowness config:gate/);
});

test("release docs check and release check dry run stay non-publishing", () => {
  const docsCheck = runNodeScript("scripts/release-docs-check.mjs");
  assert.equal(docsCheck.status, 0, docsCheck.stderr || docsCheck.stdout);
  assert.match(docsCheck.stdout, /Release documentation check passed\./);

  const releaseCheck = runNodeScript("scripts/release-check.mjs", ["--dry-run"]);
  assert.equal(releaseCheck.status, 0, releaseCheck.stderr || releaseCheck.stdout);
  assert.match(releaseCheck.stdout, /Release check dry run\./);
  assert.match(releaseCheck.stdout, /npm run build/);
  assert.match(releaseCheck.stdout, /npm run test/);
  assert.match(releaseCheck.stdout, /npm run audit/);
  assert.match(releaseCheck.stdout, /node scripts\/release-docs-check\.mjs/);
  assert.match(releaseCheck.stdout, /npm pack --dry-run --workspace packages\/cli/);
  assert.doesNotMatch(releaseCheck.stdout, /npm publish/i);
});
