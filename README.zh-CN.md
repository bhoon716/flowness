# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="状态" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM 版本" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="许可证" />
</div>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

> 日常使用时，通常只需要运行一次 `flowness init`。之后的工作默认通过与编码代理的自然对话完成；命令主要作为代理控制、调试/恢复、CI 辅助和高级检查的保留通道。

## 一览

| 位置 | 链接 | 用途 |
| --- | --- | --- |
| GitHub README | [README.md](README.md) | 仓库总览 |
| npm CLI 包 | [@flowness-labs/cli](https://www.npmjs.com/package/@flowness-labs/cli) | 安装、初始化和手动逃生通道 |
| npm core 包 | [@flowness-labs/core](https://www.npmjs.com/package/@flowness-labs/core) | Harness 原语与工作区脚手架 |

## Flowness 是什么

Flowness 是一个面向可追踪 AI 代理开发的对话式工作流 harness (conversational workflow harness)。它把自然语言请求转换成受跟踪的问题单（Issue），通过显式工作流推进工作，保留 append-only 的证据与日志，并让结构化 review 检查和规则变更保持可追踪。更大的请求可以在更安全或更清晰时拆成 1..N 个 Issue，危险命令则应先给出 dry-run 影响报告并获得明确批准。面向用户的进度更新和最终报告应尽量沿用用户的语言；内部 ID、文件名、命令和技术符号可以继续使用英文。

它的重点不是把日常工作变成一串命令，而是让你用自然语言持续推进任务，同时保留必要的结构、证据和审计线索。

## 常规使用方式

1. 安装 CLI。
2. 在工作区里运行一次 `flowness init`。
3. 之后直接和编码代理对话，像和同事交流一样描述要做的事。

示例：

- “Add login validation.”
- “Review the current diff.”
- “Refactor UserService safely.”
- “From now on, require tests for performance improvements.”

如果你需要先看 Issue 编号和 slug，可先运行 `flowness issue:create --dry-run`。

## 核心概念

- Issue：由请求生成并被跟踪的工作单元。
- Workflow：定义工作推进顺序的步骤集合。
- Evidence：支持决策的文件、命令输出和其他可验证材料。
- Review：使用结构化 review 检查来区分 hard blockers 和 deferrable blockers。
- Rules：长期有效、需要显式记录的项目规范。

## 安装与初始化

```bash
npm install -g @flowness-labs/cli
npx @flowness-labs/cli init ./my-project
```

```bash
flowness init ./my-project
cd ./my-project
```

初始化完成后，把默认工作流交给编码代理。只有在你需要设置、恢复、CI、检查或调查时，再回到命令。

## 对话式工作模型

Flowness 期望的默认输入不是“执行一个命令”，而是“描述一个任务”。

可以直接这样说：

- “Add login validation.”
- “Review the current diff.”
- “Refactor UserService safely.”
- “From now on, require tests for performance improvements.”

系统会根据请求创建或复用 Issue，路由到合适的 Workflow，记录证据，并把必要的 review / rule / evidence 结果保留下来。

## 关键工作流

- Issue：请求被转成可追踪的工作项。
- Workflow：把问题拆成清晰步骤。
- Evidence：用文件、测试、命令输出证明结果。
- Review：使用结构化 review 检查来区分 hard blockers 和 deferrable blockers。
- Rule：把长期规则和一次性工作分开。

## Review、Issue、证据与规则

- Issue 记录工作内容、目标、验收条件和依赖关系。
- Workflow 记录每一步要做什么、需要什么证据、何时需要人工批准。
- Evidence 记录可验证的事实，尽量短、可复查、可追加。
- Review 记录发现、建议、阻塞类型和后续 Issue。
- Rule 记录长期有效的项目约束，例如提交策略、性能证据要求和技术栈约定。

## 升级已有项目

1. 先运行 `flowness upgrade --dry-run`。
2. 检查计划里会被重建或补齐的文件。
3. 再运行 `flowness upgrade --apply`。
4. 如果仍然有冲突，只有在你明确批准之后才使用 `--force`。
5. 不要在已有项目上重复运行 `flowness init`。

升级后，现有工作区会继续保持向后兼容，同时把 README、规则、模板和 release 文档对齐到当前版本。

## 文档

- CLI 包 README: [`packages/cli/README.md`](packages/cli/README.md)
- Core 包 README: [`packages/core/README.md`](packages/core/README.md)
- 性能排查: [`docs/troubleshooting/performance-improvements.md`](docs/troubleshooting/performance-improvements.md)
- 证据摘要契约: [`docs/troubleshooting/evidence-summary.md`](docs/troubleshooting/evidence-summary.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Release checklist: [`docs/release-checklist.md`](docs/release-checklist.md)
- Release notes template: [`docs/templates/release-notes.md`](docs/templates/release-notes.md)
- Release notes: [`docs/releases/`](docs/releases/)

## 逃生通道

- `flowness locate "<task description>"`
- `flowness test --summary`
- `flowness audit --changed`
- `flowness review:run --issue ISSUE-ID`
- `flowness upgrade --dry-run`
- `flowness upgrade --explain`
- `flowness upgrade --apply`

## 备注

在 Flowness 中，命令是工具，不是主流程。主流程是：先 `flowness init`，然后通过自然语言和编码代理持续协作。
