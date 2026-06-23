# @flowness-labs/cli

<p align="center">
  <a href="https://github.com/bhoon716/flowness/blob/main/README.md">English</a> | <a href="https://github.com/bhoon716/flowness/blob/main/README.ko.md">한국어</a> | <a href="https://github.com/bhoon716/flowness/blob/main/README.zh-CN.md">简体中文</a>
</p>

This is the npm README for the Flowness CLI package. The main repository overview lives in the root [README](https://github.com/bhoon716/flowness/blob/main/README.md), and the Korean and Chinese guides are in [README.ko.md](https://github.com/bhoon716/flowness/blob/main/README.ko.md) and [README.zh-CN.md](https://github.com/bhoon716/flowness/blob/main/README.zh-CN.md).

> In normal use, run `flowness init` once, work through the coding agent in natural language, and keep the command surface for agent-facing controls, debugging/recovery tools, CI helpers, and advanced inspection tools.

## Package at a Glance

| Item | Value |
| --- | --- |
| Install | `npm install -g @flowness-labs/cli` |
| Bootstrap | `npx @flowness-labs/cli init ./my-project` |
| Best for | Initializing and operating Flowness workspaces |
| Primary docs | Root README, Korean README, Chinese README, release checklist, release notes |

Flowness is a conversational workflow harness for traceable AI-agent development. It turns requests into tracked issues, routes them through explicit workflows, preserves evidence and logs in an append-only format, and keeps structured review checks and rule changes traceable.
Broad requests can be decomposed into parent and child issues when that is safer or clearer, and dangerous commands should be checked with a dry-run impact report before they run. User-facing progress updates and final reports should follow the user's language when practical; internal IDs, filenames, commands, and technical symbols may stay in English.

## Start Here

1. Install the CLI.
2. Run `flowness init` once for the workspace.
3. Continue by talking to the coding agent naturally.

Examples:

- "Add login validation."
- "Review the current diff."
- "Refactor UserService safely."
- "From now on, require tests for performance improvements."

## Core Concepts

- Issue: the tracked unit of work created from a request.
- Workflow: the ordered set of steps that shapes the work.
- Evidence: files, commands, and outputs that support a decision.
- Review: structured review checks for hard and deferrable blockers.
- Rules: durable project conventions that stay explicit and reviewable.

## Escape Hatches

- `flowness locate "<task description>"`
- `flowness issue:create --dry-run`
- `flowness test --summary`
- `flowness audit --changed`
- `flowness review:run --issue ISSUE-ID`
- `flowness upgrade --dry-run`
- `flowness upgrade --explain`
- `flowness upgrade --apply`

## Common Commands

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
- `flowness test --summary --confirm-risk`
- `flowness audit --full --confirm-risk`
- `flowness upgrade --dry-run`
- `flowness upgrade --explain`
- `flowness upgrade --apply`
- `flowness validate`

## Command Reference

The usage lines below mirror `flowness --help` and should stay in lockstep with the registered CLI surface.

```text
flowness init [path] [--name <project-name>] [--force]
flowness run <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]
flowness issue:create [--title <title>] --type <issue-type> [--workflow <workflow-id>] [--description <text>] [--parent-issue <issue-id>] [--approval-note <text>] [--force]
flowness request:create <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]
flowness skill:run --id <skill-id> [--issue <issue-id>] [--input <text>]
flowness workflow:create [workflow-id] [--name <display-name>] [--force]
flowness workflow:validate [workflow-id]
flowness step --issue <issue-id> [--approve]
flowness status --issue <issue-id>
flowness locate <task description>
flowness test [--summary] [--confirm-risk]
flowness audit [--changed|--full] [--confirm-risk]
flowness evidence:add --issue <issue-id> --kind <kind> --title <title> [--detail <text>] [--location <path>]
flowness workflow:step --issue <issue-id> [--approve]
flowness workflow:recover --issue <issue-id> --root-cause <text>
flowness decision:create --issue <issue-id> --title <title> --context <text> --decision <text> --alternatives <a,b> --consequences <x,y>
flowness review:run --issue <issue-id>
flowness skill:create [--id <skill-id>] --title <title> [--description <text>] [--force]
flowness skill:list
flowness rule:create [--id <rule-id>] [--title <title>] [--description <text>] [--force]
flowness rule:apply --id <rule-id> [--issue <issue-id>] [--input <text>]
flowness rule:update --id <rule-id> [--issue <issue-id>] --input <text>
flowness rule:list
flowness config:gate [--set <instruction>]
flowness validate
flowness upgrade [--dry-run|--apply] [--from <version>] [--to <version>] [--explain] [--force]
```

## Upgrade Path

Use `flowness upgrade --dry-run` first, then apply the approved plan with `flowness upgrade --apply`. If the plan still has conflicts after review, add `--force` only after you explicitly approve the remaining manual work.
Do not rerun `flowness init` on an existing project.

## Release Docs

- Changelog: [`CHANGELOG.md`](https://github.com/bhoon716/flowness/blob/main/CHANGELOG.md)
- Release checklist: [`docs/release-checklist.md`](https://github.com/bhoon716/flowness/blob/main/docs/release-checklist.md)
- Release notes template: [`docs/templates/release-notes.md`](https://github.com/bhoon716/flowness/blob/main/docs/templates/release-notes.md)
- Korean README: [`README.ko.md`](https://github.com/bhoon716/flowness/blob/main/README.ko.md)
- Chinese README: [`README.zh-CN.md`](https://github.com/bhoon716/flowness/blob/main/README.zh-CN.md)
- Performance troubleshooting: [`docs/troubleshooting/performance-improvements.md`](https://github.com/bhoon716/flowness/blob/main/docs/troubleshooting/performance-improvements.md)
- Evidence summary contract: [`docs/troubleshooting/evidence-summary.md`](https://github.com/bhoon716/flowness/blob/main/docs/troubleshooting/evidence-summary.md)
- Run `npm run release:check` before shipping a release.
- Run `npm run release:docs-check` when you only need documentation validation.
