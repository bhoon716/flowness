# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="License" />
</div>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

> In day-to-day use, you normally run only `flowness init`. After that, work happens through natural conversation with the coding agent; commands stay available as escape hatches for agents, debugging, recovery, CI, and inspection.

## At a glance

| Surface | Link | Purpose |
| --- | --- | --- |
| GitHub README | this file | Repository overview |
| npm CLI package | [@flowness-labs/cli](https://www.npmjs.com/package/@flowness-labs/cli) | Install, init, and manual escape hatches |
| npm core package | [@flowness-labs/core](https://www.npmjs.com/package/@flowness-labs/core) | Harness primitives and workspace scaffolding |
| Chinese README | [README.zh-CN.md](README.zh-CN.md) | Simplified Chinese guide |

## What Flowness Is

Flowness is a conversational agent harness for software work. It turns requests into issues, routes them through explicit workflows, preserves evidence and logs in an append-only format, and keeps review and rule changes traceable.

## The Normal Flow

1. Install the CLI.
2. Run `flowness init` once for the workspace.
3. Continue by talking to the coding agent naturally.

Examples:

- "Add login validation."
- "Review the current diff."
- "Refactor UserService safely."
- "From now on, require tests for performance improvements."

## Concepts

- Issue: the tracked unit of work that Flowness creates from a request.
- Workflow: the ordered set of steps that shapes the work.
- Evidence: concrete files, commands, and outputs that support a decision.
- Review: the multi-perspective check that looks for hard and deferrable blockers.
- Rules: durable project conventions that should be explicit and reviewable.

## Install

```bash
npm install -g @flowness-labs/cli
```

## Initialize Once

```bash
flowness init ./my-project
cd ./my-project
```

After init, talk to the coding agent naturally. Keep the agent on task with ordinary conversation, then reach for commands only when you need setup, recovery, CI, or inspection.

## Escape Hatches

- `flowness locate "<task description>"`
- `flowness test --summary`
- `flowness audit --changed`
- `flowness review:run --issue ISSUE-ID`
- `flowness upgrade --dry-run`
- `flowness upgrade --apply`

## Docs

- CLI package README: [`packages/cli/README.md`](packages/cli/README.md)
- Core package README: [`packages/core/README.md`](packages/core/README.md)
- Chinese README: [`README.zh-CN.md`](README.zh-CN.md)
- Performance troubleshooting: [`docs/troubleshooting/performance-improvements.md`](docs/troubleshooting/performance-improvements.md)
- Evidence summary contract: [`docs/troubleshooting/evidence-summary.md`](docs/troubleshooting/evidence-summary.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Release checklist: [`docs/release-checklist.md`](docs/release-checklist.md)
- Release notes template: [`docs/templates/release-notes.md`](docs/templates/release-notes.md)
- Release notes: [`docs/releases/`](docs/releases/)

Run `npm run release:check` before cutting a release.
Run `npm run release:docs-check` when you only need documentation validation.
