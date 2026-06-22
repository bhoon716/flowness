# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="License" />
</div>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

> In day-to-day use, you normally run `flowness init` once. After that, work continues through natural conversation with your coding agent; commands remain available as agent-facing controls, debugging/recovery tools, CI helpers, and advanced inspection tools.

## At a glance

| Surface | Link | Purpose |
| --- | --- | --- |
| GitHub README | this file | Repository overview |
| npm CLI package | [@flowness-labs/cli](https://www.npmjs.com/package/@flowness-labs/cli) | Install, init, and manual escape hatches |
| npm core package | [@flowness-labs/core](https://www.npmjs.com/package/@flowness-labs/core) | Harness primitives and workspace scaffolding |
| Korean README | [README.ko.md](README.ko.md) | Korean guide |
| Chinese README | [README.zh-CN.md](README.zh-CN.md) | Simplified Chinese guide |

## What Flowness Is

Flowness is a conversational workflow harness for traceable AI-agent development. It turns requests into issues, routes them through explicit workflows, preserves evidence and logs in an append-only format, and keeps structured review checks and rule changes traceable.
Broad requests can be decomposed into parent and child issues when that is safer or clearer, and dangerous commands should be checked with a dry-run impact report before they run.

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
- Review: structured review checks that look for hard and deferrable blockers.
- Rules: durable project conventions that should be explicit and reviewable.

## Install

```bash
npm install -g @flowness-labs/cli
npx @flowness-labs/cli init ./my-project
```

## Initialize Once

```bash
flowness init ./my-project
cd ./my-project
```

After init, talk to the coding agent naturally. Keep the agent on task with ordinary conversation, then reach for commands only when you need setup, recovery, CI, or inspection.
For existing workspaces, start with `flowness upgrade --dry-run`, then use `flowness upgrade --apply` once you have reviewed the plan; add `--force` only when you have explicitly approved remaining conflicts.

## Escape Hatches

- `flowness locate "<task description>"`
- `flowness test --summary`
- `flowness audit --changed`
- `flowness review:run --issue ISSUE-ID`
- `flowness upgrade --dry-run`
- `flowness upgrade --explain`
- `flowness upgrade --apply`
- `flowness upgrade --apply --force`

## Docs

- CLI package README: [`packages/cli/README.md`](packages/cli/README.md)
- Core package README: [`packages/core/README.md`](packages/core/README.md)
- Korean README: [`README.ko.md`](README.ko.md)
- Chinese README: [`README.zh-CN.md`](README.zh-CN.md)
- Performance troubleshooting: [`docs/troubleshooting/performance-improvements.md`](docs/troubleshooting/performance-improvements.md)
- Evidence summary contract: [`docs/troubleshooting/evidence-summary.md`](docs/troubleshooting/evidence-summary.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Release checklist: [`docs/release-checklist.md`](docs/release-checklist.md)
- Release notes template: [`docs/templates/release-notes.md`](docs/templates/release-notes.md)
- Release notes: [`docs/releases/`](docs/releases/)

Run `npm run release:check` before cutting a release.
Run `npm run release:docs-check` when you only need documentation validation.
