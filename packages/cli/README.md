# @flowness-labs/cli

> **Flowness**: The Issue-driven AI Development Operating System.

Flowness is an AI agent orchestration system that enforces software development workflows and guidelines on AI agents. This package provides the CLI tools to initialize and manage Flowness-governed workspaces.

---

## Installation

You can run the CLI directly using `npx`:

```bash
npx @flowness-labs/cli init ./my-project
```

Or install it globally:

```bash
npm install -g @flowness-labs/cli
```

---

## Key Commands

Inside a Flowness-governed workspace, run these commands to manage issues, workflows, and reviews:

```bash
# Initialize a new workspace
flowness init ./my-project

# Request a feature or change (automatically spawns a structured issue)
flowness request:create "Implement user authentication"

# Manually register a structured issue
flowness issue:create --title "Redis integration" --type feature

# Run or approve a specific step in the workflow
flowness workflow:step --issue ISSUE-001-SIGNIN --approve

# Execute a multi-agent review on the issue changes
flowness review:run --issue ISSUE-001-SIGNIN
```

---

## Project Context Layout

When initialized, Flowness sets up the following local scaffolding for AI guidelines:

```
.agent/                  ← AI Workspace OS Directory
├── config/              ← Environment rules
├── issues/              ← Issues & RFC-style decisions
├── logs/                ← Append-only execution logs
├── workflows/           ← Executable workflow files
└── templates/           ← Document and issue templates
```

---

## Documentation

For the full architectural layout, multi-package monorepo design, and advanced features, please visit the [Main GitHub Repository](https://github.com/bhoon716/flowness).
