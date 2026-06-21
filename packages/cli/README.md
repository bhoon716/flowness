# @flowness-labs/cli

This is the npm README for the Flowness CLI package. The repository overview lives in the root [README](https://github.com/bhoon716/flowness/blob/main/README.md).

> Initialize once with `flowness init`, then work through the coding agent in natural language. The command reference below is for setup, debugging, recovery, and other manual escape hatches.

## Package at a Glance

| Item | Value |
| --- | --- |
| Install | `npm install -g @flowness-labs/cli` |
| Bootstrap | `npx @flowness-labs/cli init ./my-project` |
| Best for | Initializing and operating Flowness workspaces |
| Related docs | Root README, release checklist, release notes |

Flowness turns requests into tracked issues, runs them through explicit workflows, and keeps evidence in append-only logs. After init, natural-language requests should go through the coding agent first, and you can reach for commands only when you need a compact override.

## Install

```bash
npm install -g @flowness-labs/cli
```

Or use `npx`:

```bash
npx @flowness-labs/cli init ./my-project
```

## Start a Workspace

```bash
flowness init ./my-project
cd ./my-project
flowness run "Add user authentication"
flowness review:run --issue ISSUE-001-AUTH
```

After init, use the generated navigation files first, then continue the conversation with the coding agent:

- `.flowness/navigation.md`
- `.flowness/context-index.json`
- `.flowness/commands.json`

## Highlights

- `flowness init` is the one-time bootstrap step for a project.
- Natural-language requests should go through the coding agent first.
- `flowness locate` finds the smallest relevant file area.
- `flowness test --summary` returns compact test output.
- `flowness audit --changed` focuses on the current diff.
- `flowness upgrade --dry-run` previews workspace changes.
- `flowness upgrade --apply` applies approved workspace changes.
- `flowness review:run` routes work through the code-review workflow.
- `flowness step`, `flowness workflow:step`, and `flowness status` keep issue progress explicit.

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

## Command Reference

The usage lines below mirror `flowness --help` and should stay in lockstep with the registered CLI surface.

```text
flowness init [path] [--name <project-name>] [--force]
flowness run <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]
flowness issue:create [--title <title>] --type <issue-type> [--workflow <workflow-id>] [--description <text>] [--force]
flowness request:create <request text> [--type <issue-type>] [--workflow <workflow-id>] [--force]
flowness skill:run --id <skill-id> [--issue <issue-id>] [--input <text>]
flowness workflow:create [workflow-id] [--name <display-name>] [--force]
flowness workflow:validate [workflow-id]
flowness step --issue <issue-id> [--approve]
flowness status --issue <issue-id>
flowness locate <task description>
flowness test [--summary]
flowness audit [--changed|--full]
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
flowness upgrade [--dry-run|--apply] [--from <version>] [--to <version>]
```

## Upgrade Path

> Use `flowness upgrade --dry-run` first, then apply the approved plan with `flowness upgrade --apply`.
> Do not rerun `flowness init` on an existing project.

## Release Docs

- Changelog: [`CHANGELOG.md`](https://github.com/bhoon716/flowness/blob/main/CHANGELOG.md)
- Release checklist: [`docs/release-checklist.md`](https://github.com/bhoon716/flowness/blob/main/docs/release-checklist.md)
- Release notes template: [`docs/templates/release-notes.md`](https://github.com/bhoon716/flowness/blob/main/docs/templates/release-notes.md)
- Run `npm run release:check` before shipping a release.
- Run `npm run release:docs-check` when you only need documentation validation.
