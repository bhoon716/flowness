# Flowness

Flowness is an issue-driven AI development operating system. It turns requests into tracked issues, runs them through explicit workflows, and records evidence in append-only logs.

## What It Does

- Converts requests into structured issues.
- Guides agents through workflow steps instead of ad hoc edits.
- Stores navigation, command, and context shortcuts under `.flowness/`.
- Keeps evidence, logs, and review output compact and traceable.

## Install

```bash
npm install -g @flowness-labs/cli
```

Or start a new workspace with `npx`:

```bash
npx @flowness-labs/cli init ./my-project
```

## Quick Start

```bash
flowness init ./my-project
cd ./my-project
flowness run "Add user authentication"
flowness status --issue ISSUE-001-AUTH
```

After initialization, read these files first:

- `.flowness/navigation.md`
- `.flowness/context-index.json`
- `.flowness/commands.json`

## Core Commands

- `flowness init`
- `flowness run`
- `flowness request:create`
- `flowness issue:create`
- `flowness step`
- `flowness workflow:step`
- `flowness status`
- `flowness review:run`
- `flowness locate`
- `flowness test --summary`
- `flowness audit --changed`
- `flowness upgrade --dry-run`
- `flowness upgrade --apply`
- `flowness validate`

## Lightweight Navigation

Flowness keeps the working set small by writing compact navigation artifacts during `init`.

- Read `.flowness/navigation.md` before scanning the workspace.
- Use `.flowness/context-index.json` to find the smallest useful file set.
- Use `.flowness/commands.json` for exact command strings.
- Prefer `flowness locate "<task description>"` over broad repo scans.

## Safety Model

- Workflow state is managed by Flowness commands, not by manual file edits.
- Logs are append-only.
- Review requests stay in the review workflow instead of becoming feature work.
- Use `flowness upgrade --dry-run` before `flowness upgrade --apply` on existing projects.

## Upgrade Existing Projects

- Use `flowness init` for a new project.
- Use `flowness upgrade` for an existing `.flowness/` project that needs regenerated docs or workspace updates.
- `--dry-run` shows the planned regeneration and conflict handling.
- `--apply` performs the update after you review the dry-run output.

## Release Documentation

- GitHub README: this file
- npm README / full command reference for the CLI package: `packages/cli/README.md`
- Changelog: `CHANGELOG.md`
- Release checklist: `docs/release-checklist.md`
- Release notes template: `docs/templates/release-notes.md`
- Versioned release notes: `docs/releases/`
- Run `npm run release:check` before cutting a release.
- Run `npm run release:docs-check` when you only need documentation validation.
