# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="License" />
</div>

<p align="center">
  <strong>Issue-driven AI Development Operating System.</strong>
</p>

---

## What is Flowness?

Most AI coding environments suffer from severe limitations: AI actions are untraceable, workflows are ignored, and decisions vanish without a trace. **Flowness** changes this. Flowness is not just an AI code generation tool; it is an **operating system** that enforces software development workflows and guidelines on AI agents.

Every request becomes a formal **Issue**, and every step produces immutable **Evidence** under an append-only log model.

---

## Core Philosophy

- 🎯 **Every Request is an Issue**: Requests automatically transition into structured issues.
- 📜 **Append-Only Logs**: All agent actions are recorded chronologically and can never be mutated.
- ⚙️ **Mandatory Workflows**: Agents operate strictly within user-defined/system-enforced execution paths.
- 🔍 **Evidence Over Claims**: "Test succeeded" is not enough. Agents must provide verification payloads.
- 🧠 **Preserved Decisions**: Design decisions (e.g., architectural choices) are archived in structured RFC-style templates.

---

## Project Structure

Flowness is a Monorepo workspace divided into modular packages:

- [`@flowness-labs/cli`](file:///Users/bhoon/Project/flowness/packages/cli): CLI entry points and orchestration.
- [`@flowness-labs/core`](file:///Users/bhoon/Project/flowness/packages/core): Common types, configuration parser, and initialization scaffolding.
- [`@flowness-labs/workflow-engine`](file:///Users/bhoon/Project/flowness/packages/workflow-engine): Code-based, deterministic workflow orchestrator.
- [`@flowness-labs/issue-system`](file:///Users/bhoon/Project/flowness/packages/issue-system): Issue selection and states.
- [`@flowness-labs/log-system`](file:///Users/bhoon/Project/flowness/packages/log-system): Append-only logger.
- [`@flowness-labs/decision-system`](file:///Users/bhoon/Project/flowness/packages/decision-system): Decisison artifact builder.
- [`@flowness-labs/evidence-system`](file:///Users/bhoon/Project/flowness/packages/evidence-system): Executed tool validation parser.
- [`@flowness-labs/review-system`](file:///Users/bhoon/Project/flowness/packages/review-system): Multi-agent reviewer aggregator.
- [`@flowness-labs/config-system`](file:///Users/bhoon/Project/flowness/packages/config-system): Project-wide settings and overrides.
- [`@flowness-labs/templates`](file:///Users/bhoon/Project/flowness/packages/templates): Scaffolding templates for local projects.

---

## Installation & Getting Started

Install the CLI globally from npm:

```bash
npm install -g @flowness-labs/cli
```

Or initialize a new Flowness-governed project using `npx`:

```bash
npx @flowness-labs/cli init ./my-new-project
```

### Development Setup

To build and test the monorepo locally:

```bash
# Install dependencies
npm install

# Build all workspace packages
npm run build

# Run unit and integration tests
npm run test

# Symlink CLI for local CLI usage
npm run link:cli
```

---

## Key CLI Commands

Once initialized, use the following commands to drive agent tasks:

```bash
# Request a feature or change
flowness request:create "Implement user authentication"

# Manually register an issue
flowness issue:create --title "Integrate Redis caching" --type feature

# Run a step on a workflow
flowness workflow:step --issue ISSUE-001-SIGNIN --approve

# Execute a multi-agent code review
flowness review:run --issue ISSUE-001-SIGNIN
```

---

## Architecture Layout

```
.agent/                  ← Local project's AI OS directory
├── config/              ← Configuration rules
├── issues/              ← Working issues & design decisions
├── logs/                ← Append-only logs
├── workflows/           ← Executable workflows
├── rules/               ← System rules
└── templates/           ← Document templates
```

---

## License

This project is licensed under the MIT License.
