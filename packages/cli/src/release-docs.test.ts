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
  const [rootReadme, cliReadme, changelog, checklist, releaseNotesTemplate, rootPackageJson, cliPackageJson] = await Promise.all([
    readRepoFile("README.md"),
    readRepoFile("packages/cli/README.md"),
    readRepoFile("CHANGELOG.md"),
    readRepoFile("docs/release-checklist.md"),
    readRepoFile("docs/templates/release-notes.md"),
    readRepoFile("package.json"),
    readRepoFile("packages/cli/package.json"),
  ]);

  const rootPackage = JSON.parse(rootPackageJson) as { readonly version: string };
  const cliPackage = JSON.parse(cliPackageJson) as { readonly version: string };

  assert.equal(rootPackage.version, cliPackage.version);
  assert.ok(rootReadme.length > 0);
  assert.ok(cliReadme.length > 0);
  assert.ok(changelog.length > 0);
  assert.ok(checklist.length > 0);
  assert.ok(releaseNotesTemplate.length > 0);

  assert.match(rootReadme, /talk to the coding agent naturally/i);
  assert.match(rootReadme, /What It Does/);
  assert.match(rootReadme, /Lightweight Navigation/);
  assert.match(rootReadme, /Upgrade Existing Projects/);
  assert.match(rootReadme, /Release Documentation/);
  assert.match(rootReadme, /flowness locate/);
  assert.match(rootReadme, /flowness test --summary/);
  assert.match(rootReadme, /flowness audit --changed/);
  assert.match(rootReadme, /flowness upgrade --dry-run/);
  assert.match(rootReadme, /flowness upgrade --apply/);

  assert.match(cliReadme, /natural-language requests should go through the coding agent first/i);
  assert.match(cliReadme, /Core Commands/);
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

  assert.match(checklist, /GitHub README: `README\.md`/);
  assert.match(checklist, /npm README for the CLI package \/ command reference: `packages\/cli\/README\.md`/);
  assert.match(checklist, /CHANGELOG\.md/);
  assert.match(checklist, /docs\/templates\/release-notes\.md/);
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
