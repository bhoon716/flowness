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
