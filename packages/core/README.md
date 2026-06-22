# @flowness-labs/core

The Flowness core package provides the workspace scaffolding, request routing, evidence helpers, review models, and generated artifacts that support the conversational harness.

> Flowness is built around one normal human action: run `flowness init` once, then work through the coding agent in natural language. The CLI and core package keep the workflow explicit, but they are not meant to turn day-to-day work back into a command-heavy process.
Broader requests can be decomposed into parent and child issues when that makes the work safer or clearer, and existing workspaces should use `flowness upgrade --dry-run` before applying a migration.

## What This Package Contains

- Core types for issues, workflows, evidence, logs, and review findings.
- Scaffold generation for AGENTS, navigation, rules, workflows, templates, and docs.
- Request routing that decides when to create issues, when to ask clarifying questions, and when a durable rule change is needed.
- Request routing that decides when to create issues, when to ask clarifying questions, when to decompose broad requests, and when a durable rule change is needed.
- Review and commit primitives that keep evidence, blockers, and append-only records aligned.

## When to Use It

- Use the root README for the normal conversational workflow.
- Use the CLI package README for command syntax and escape hatches.
- Use the Chinese README when you need a Simplified Chinese overview.
- Use this package directly when you are extending Flowness internals or generated scaffolding.

## Links

- GitHub repository: [bhoon716/flowness](https://github.com/bhoon716/flowness)
- Issues: [GitHub Issues](https://github.com/bhoon716/flowness/issues)
- Homepage: [README](https://github.com/bhoon716/flowness#readme)
- CLI package: [`@flowness-labs/cli`](https://www.npmjs.com/package/@flowness-labs/cli)
- Chinese README: [README.zh-CN.md](https://github.com/bhoon716/flowness/blob/main/README.zh-CN.md)
- Performance troubleshooting: [docs/troubleshooting/performance-improvements.md](https://github.com/bhoon716/flowness/blob/main/docs/troubleshooting/performance-improvements.md)
- Evidence summary contract: [docs/troubleshooting/evidence-summary.md](https://github.com/bhoon716/flowness/blob/main/docs/troubleshooting/evidence-summary.md)

## Notes

Flowness keeps logs append-only, treats generated state as current-state documents, and keeps commands mostly as operator or agent escape hatches.
