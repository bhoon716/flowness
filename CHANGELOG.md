# Changelog

All notable changes to Flowness are recorded here.

## [Unreleased]

### Added
- None.

### Changed
- None.

### Fixed
- None.

### Migration Notes
- None.

### Deprecated
- None.

### Removed
- None.

### Security
- None.

## [0.2.6] - 2026-06-22

### Added
- Publishable release notes for the previously completed hardening work, promoted from the 0.2.5 preparation line because 0.2.5 was already present on npm.
- CLI smoke coverage for the init, run, evidence, review, and commit-gate flow.
- Workflow ID consistency checks so routing aliases match the actual workflow blueprints.

### Changed
- Flowness remains positioned as a conversational workflow harness for traceable AI-agent development.
- English, Korean, and Simplified Chinese READMEs stay linked and aligned across GitHub and npm.
- Package metadata stays consistent across repository, homepage, and issue tracker fields.
- The CLI entrypoint is split into parser, handlers, services, and formatters while preserving the public command surface.
- Review wording uses structured and evidence-based checks instead of implying a deep human-style reviewer.
- Compact evidence summaries are the preferred surface for large raw artifacts in performance-sensitive review flows.

### Fixed
- README and package metadata checks now validate the multilingual links and official repository URLs together.
- The review and commit gates no longer deadlock on deferrable concerns once follow-up issues and approvals are recorded.
- Evidence review accepts large raw artifacts when a compact summary is available.

### Migration Notes
- Existing workspaces can keep using the current `@flowness-labs/*` package names.
- Add compact evidence summaries for performance-sensitive work before asking the review gate to approve it.
- If a review finding is intentionally deferred, create the follow-up issue first and record approval before commit.

### Deprecated
- None.

### Removed
- None.

### Security
- None.

## [0.2.5] - 2026-06-21

### Added
- `README.ko.md` for a Korean overview of Flowness.
- `README.zh-CN.md` for a Simplified Chinese overview of Flowness.
- Release docs and templates that spell out the conversational-first usage model, review finding lifecycle, deferrable blocker handling, and the performance troubleshooting / evidence summary contract.
- `docs/troubleshooting/evidence-summary.md` for compact performance evidence review guidance.
- `flowness issue:create --parent-issue` and `--approval-note` for linking follow-up issues with recorded approval text.

### Changed
- The GitHub and npm READMEs now present Flowness as a conversational workflow harness instead of a command-heavy CLI.
- `README.md`, `README.ko.md`, `README.zh-CN.md`, and `packages/cli/README.md` now share the same conversational-first positioning and language links.
- `packages/cli/README.md` and `packages/core/README.md` now point to the correct GitHub repository, homepage, and issue tracker links.
- Review reporting now separates hard blockers from deferrable blockers and records finding lifecycle statuses.
- Performance-sensitive work now expects a compact evidence summary alongside raw artifacts so large reports do not fail review by volume alone.
- `docs/troubleshooting/performance-improvements.md` now points to the new compact evidence summary guidance.
- Follow-up concerns can be linked to a parent issue when a user approves splitting the work, so the current issue can close once hard blockers are gone.

### Fixed
- Release docs, changelog notes, and package metadata now stay aligned with the 0.2.5 release line.
- README/package consistency checks now cover the translated README and package metadata links.
- The review/commit gate no longer deadlocks on deferrable performance concerns when a follow-up issue and approval are present.

### Migration Notes
- Existing workspaces can continue using `flowness upgrade --dry-run` and `flowness upgrade --apply` without renaming npm packages.
- If you maintain a performance-sensitive workflow, add the compact summary fields to your evidence notes before relying on the review gate.

### Deprecated
- None.

### Removed
- None.

### Security
- None.

## [0.2.4] - 2026-06-21

### Added
- `docs/troubleshooting/performance-improvements.md` for performance measurement baseline, comparison, and troubleshooting guidance.

### Changed
- The normal workspace flow now emphasizes `flowness init` once, then natural-language work with the coding agent.
- Generated rule files are current-state documents, and rule history is centralized in `.flowness/rules/rule-update-log.md`.
- `rule:create` and `rule:update` now prefer updating an existing matching rule instead of creating a duplicate file.
- Rule-change candidates now surface an approval prompt instead of automatically mutating rule files.

### Fixed
- Add missing rules and workflows files (e.g. `git.md`) to the upgrade plan if they are not present in the workspace, avoiding validation failures after upgrades.
- Remove the old per-rule append-only update blocks and write history only to `.flowness/rules/rule-update-log.md`.

## [0.2.3] - 2026-06-21

### Added
- `docs/troubleshooting/performance-improvements.md` for performance measurement baseline, comparison, and troubleshooting guidance.

### Changed
- The normal workspace flow now emphasizes `flowness init` once, then natural-language work with the coding agent.
- Generated rule files are current-state documents, and rule history is centralized in `.flowness/rules/rule-update-log.md`.
- `rule:create` and `rule:update` now prefer updating an existing matching rule instead of creating a duplicate file.
- Rule-change candidates now surface an approval prompt instead of automatically mutating rule files.

### Fixed
- Add missing rules and workflows files (e.g. `git.md`) to the upgrade plan if they are not present in the workspace, avoiding validation failures after upgrades.
- Remove the old per-rule append-only update blocks and write history only to `.flowness/rules/rule-update-log.md`.

## [0.2.2] - 2026-06-21

### Fixed
- Resolve target version correctly using the installed packages dynamic version instead of hardcoding 0.1.5.
- Deduplicate duplicate entries in upgrade plans.
- Add `--version` and `-v` options to print the package version.

## [0.2.1] - 2026-06-21

### Fixed
- Add `typescript` dependency to `@flowness-labs/workflow-engine` package metadata to fix global CLI installation failures.

## [0.2.0] - 2026-06-21

### Added
- `flowness locate` for focused file-area lookup.
- `flowness test --summary` for compact test output.
- `flowness audit --changed` for changed-file audits.
- `flowness upgrade --dry-run` and `flowness upgrade --apply` for safer workspace migrations.
- `flowness review:run` for the code-review workflow path.
- Release documentation checks for command docs, README files, changelog discipline, and package metadata.

### Changed
- Commit workflow safeguards now resolve the repository from changed files and block multi-repo or nested-repo commits by default.
- Evidence Review and recorded checks are required before commit for code changes.
- Generated AGENTS, navigation, context-index, command, and log artifacts stay compact and current-state focused.

### Fixed
- Current-release documentation now tracks the 0.2.0 release line across README, CLI docs, changelog, and versioned release notes.
- Release checks now validate docs, tests, build output, and `npm pack --dry-run` together.

### Migration Notes
- Existing projects should use `flowness upgrade --dry-run` first.
- Then run `flowness upgrade --apply` after reviewing the plan.
- Do not rerun `flowness init` on an existing project.

## [0.1.4] - 2026-06-19

See the full release notes for v0.1.4 in [docs/releases/v0.1.4.md](docs/releases/v0.1.4.md).

### Added
- `.flowness/` workspace scaffolding and compact context files.
- Command-driven issue creation and workflow execution.
- Append-only logging, evidence capture, and review aggregation.

### Changed
- Existing workflow and issue handling were tightened around explicit commands and evidence.

### Fixed
- Issue slugs, workflow gating, and audit paths were made more deterministic.

### Deprecated
- None.

### Removed
- None.

### Security
- None.
