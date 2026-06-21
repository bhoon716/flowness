# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="License" />
</div>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a>
</p>

> Initialize once with `flowness init`, then talk to the coding agent naturally. Commands remain available as escape hatches for navigation, testing, audits, upgrades, and recovery.

## At a glance

| Surface | Link | Purpose |
| --- | --- | --- |
| GitHub README | this file | Repo overview |
| npm package | [@flowness-labs/core](https://www.npmjs.com/package/@flowness-labs/core) | Package page |
| CLI docs | [`packages/cli/README.md`](packages/cli/README.md) | npm command reference |
| Release notes | [`docs/releases/`](docs/releases/) | Version-specific changelogs |

## What is Flowness?

Flowness is a development operating system that routes requests to issues, executes them via explicit workflows, and preserves evidence and logs in an append-only format. The normal flow is: initialize once, then work through the coding agent in natural language. Use commands when you need a compact escape hatch for navigation, verification, or recovery.

## Install the CLI

```bash
npm install -g @flowness-labs/cli
```

Or start a new workspace with `npx`:

```bash
npx @flowness-labs/cli init ./my-project
```

## Start a Workspace

```bash
flowness init ./my-project
cd ./my-project
flowness run "Add user authentication"
flowness status --issue ISSUE-001-AUTH
```

After initialization, read these files first and then continue the conversation with the coding agent:

- `.flowness/navigation.md`
- `.flowness/context-index.json`
- `.flowness/commands.json`

## What It Does

- Routes requests to issues with explicit workflows after a single `flowness init`.
- Lets you keep working in natural language with the coding agent instead of command-first rituals.
- Limits scanning scope using `flowness locate` when you need a compact file map.
- Provides `flowness test --summary`, `flowness audit --changed`, `flowness upgrade --dry-run`, and `flowness upgrade --apply` as escape hatches.
- Separates code review flows with `flowness review:run`.
- Explicitly manages progress with `flowness step`, `flowness workflow:step`, and `flowness status`.
- Preserves evidence, logs, and review outputs in an append-only format.

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

- Read `.flowness/navigation.md` before scanning the workspace.
- Use `.flowness/context-index.json` to find the smallest useful file set.
- Use `.flowness/commands.json` for exact command strings when you need a manual escape hatch.
- Prefer `flowness locate "<task description>"` over broad repo scans.

## Upgrade Existing Projects

> Use `flowness upgrade --dry-run` first, then apply the approved plan with `flowness upgrade --apply`.
> Do not rerun `flowness init` on an existing project.

## Release Documentation

- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Release checklist: [`docs/release-checklist.md`](docs/release-checklist.md)
- Release notes template: [`docs/templates/release-notes.md`](docs/templates/release-notes.md)
- Release notes: [`docs/releases/`](docs/releases/)
- Run `npm run release:check` before cutting a release.
- Run `npm run release:docs-check` when you only need documentation validation.
