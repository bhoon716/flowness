# @flowness-labs/cli

This is the npm README for the Flowness CLI package. The repository overview lives in the root [README](https://github.com/flowness-labs/flowness).

Flowness turns requests into tracked issues, runs them through explicit workflows, and keeps evidence in append-only logs.

## Install

```bash
npm install -g @flowness-labs/cli
```

Or use `npx`:

```bash
npx @flowness-labs/cli init ./my-project
```

## Quick Start

```bash
flowness init ./my-project
cd ./my-project
flowness run "Add user authentication"
flowness review:run --issue ISSUE-001-AUTH
```

After init, use the generated navigation files first:

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

Use `flowness upgrade` when an existing project needs regenerated docs or workspace updates.

- `flowness upgrade --dry-run` previews the regeneration plan.
- `flowness upgrade --apply` writes the approved updates.
- Review the dry-run output before applying changes.

## Release Docs

- Changelog: `https://github.com/flowness-labs/flowness/blob/main/CHANGELOG.md`
- Release checklist: `https://github.com/flowness-labs/flowness/blob/main/docs/release-checklist.md`
- Release notes template: `https://github.com/flowness-labs/flowness/blob/main/docs/templates/release-notes.md`
- Run `npm run release:check` before shipping a release.
- Run `npm run release:docs-check` when you only need documentation validation.
