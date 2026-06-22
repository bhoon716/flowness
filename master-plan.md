Flowness v2.5 Master Plan

Subtitle

Conversational Workflow Harness for Traceable AI-Agent Development

⸻

1. Introduction

Why Flowness Exists

현재 대부분의 AI 코딩 환경은 다음과 같은 문제를 가지고 있다.

문제 1

AI가 작업 기록을 남기지 않는다.

작업이 끝난 뒤:

- 왜 그렇게 구현했는지
- 어떤 고민을 했는지
- 어떤 대안을 검토했는지

추적할 수 없다.

⸻

문제 2

AI가 워크플로우를 강제적으로 따르지 않는다.

예시

- 분석 생략
- 설계 생략
- 테스트 생략
- 문서화 생략

⸻

문제 3

작업이 재현되지 않는다.

같은 요청이라도:

- 사람마다 다르고
- AI마다 다르고
- 시점마다 다르다

⸻

문제 4

결정 과정이 사라진다.

예시

“왜 Redis를 사용했지?”

“왜 JWT를 선택했지?”

몇 주 후 아무도 모른다.

⸻

문제 5

AI가 작업 결과만 남긴다.

실제 개발에서 중요한 것은:

결과물이 아니라

작업 과정이다.

⸻

Flowness의 목표

Flowness는 AI가 코드만 작성하는 것을 목표로 하지 않는다.

Flowness는 AI가 조직의 개발 프로세스를 강제적으로 따르도록 만드는 운영체제다.

⸻

2. Core Philosophy

Principle 1

Every Request Becomes an Issue

사용자는 티켓을 만들지 않는다.

모든 요청은 자동으로 Issue가 된다.

예시

로그인 기능 만들어줘

↓

ISSUE-001-SIGNIN

⸻

Principle 2

Every Issue Has A Log

Issue 생성과 동시에 Log 생성

issues/
logs/

동시에 생성

⸻

Principle 3

Logs Are Append Only

허용

- Append

금지

- Delete
- Update
- Rewrite

⸻

Principle 4

Workflow Execution Is Mandatory

AI는 자유롭게 행동하지 않는다.

항상 Workflow를 따른다.

⸻

Principle 5

Evidence Over Claims

“테스트 완료”

불인정

“테스트 결과”

인정

⸻

Principle 6

Decisions Must Be Preserved

중요한 결정은 반드시 기록한다.

⸻

Principle 7

Every Failure Is Traceable

실패도 기록한다.

⸻

3. Project Structure

.agent/
├── config/
├── issues/
├── logs/
├── workflows/
├── rules/
├── skills/
├── scripts/
├── templates/
├── prompts/
└── settings/

⸻

4. Issue System

Issue Naming

ISSUE-001-SIGNIN
ISSUE-002-PERFORMANCE-INVESTIGATION
ISSUE-003-SPRING35-RESEARCH

⸻

Issue Types

feature
bugfix
refactor
research
investigation
planning
mvp
harness
documentation
decision

⸻

Issue State

open
in_progress
blocked
closed

⸻

Issue Folder

issues/
└── ISSUE-001-SIGNIN/
issue.md
decisions/

⸻

5. Log System

Purpose

Log는 작업의 역사다.

⸻

Naming

logs/
ISSUE-001-SIGNIN.md

⸻

Rules

Append Only

⸻

Entry Format

Timestamp
Current Step
Actions
Evidence
Summary
Next Step

⸻

6. Decision System

Purpose

의사결정 기록

⸻

Structure

issues/
ISSUE-001-SIGNIN/
decisions/
DEC-001-SIGNIN-AUTH-STRATEGY.md
DEC-002-SIGNIN-TOKEN-STORAGE.md

⸻

Template

Context
Decision
Alternatives
Consequences
Evidence

⸻

7. Workflow Engine

Why Code-Based

Markdown은 설명용이다.

실행 엔진이 아니다.

⸻

따라서 Workflow는 코드로 작성한다.

⸻

Supported Languages

TypeScript
JavaScript
Python
Shell

TypeScript 권장

⸻

Workflow Structure

workflows/
feature/
workflow.ts
steps/

⸻

Example

export default workflow({
id: "feature-development",
steps: [
Clarification,
Design,
Implementation,
Review,
Documentation,
Commit,
Close
]
});

⸻

Step Structure

step({
name,
preconditions,
execute,
successConditions,
onFail,
next
});

⸻

Workflow State

current_step:
completed_steps:
failed_steps:
blocked:

⸻

Step Skip 금지

⸻

8. Human Gate System

사용자 개입 제어

⸻

Example

human_gate:
clarification: always
design: always
review: optional
implementation: never

⸻

Natural Language Configuration

예시

“설계는 항상 물어봐”

↓

설정 변경

⸻

9. Evidence System

Philosophy

완료는 증거로 증명

⸻

Evidence Types

file
test
review
documentation
decision
command_output

⸻

Example

evidence:
files:
tests:
reviews:
docs:

⸻

10. Rules System

전역 규칙

⸻

예시

spring.md
controller.md
api.md
security.md
testing.md

⸻

11. Skills System

재사용 가능한 작업 단위

⸻

예시

root-cause-analysis
code-review
api-design
troubleshooting

⸻

12. Scripts System

반복 작업 자동화

⸻

예시

find-fqcn.py
search-reference.py
check-md-size.py

⸻

13. Multi-Agent Review

Review Agents

Architecture Reviewer
Security Reviewer
Testing Reviewer
Documentation Reviewer
Maintainability Reviewer
Performance Reviewer

⸻

Coordinator

모든 리뷰 취합

⸻

14. Recovery Loop

실패는 Workflow 내부 루프

⸻

Review
↓
Fail
↓
Root Cause
↓
Fix
↓
Review

⸻

Mandatory

Root Cause 작성

Log 기록

재검증

⸻

15. Built-In Workflows

Planning Workflow

Idea
↓
Requirements
↓
Questions
↓
Scope
↓
Architecture
↓
Roadmap
↓
Issue Generation

⸻

MVP Workflow

Idea
↓
Core Features
↓
MVP Scope
↓
Architecture
↓
Implementation
↓
Validation
↓
Release Candidate

⸻

Greenfield Workflow

Vision
↓
Problem Definition
↓
Requirements
↓
Architecture
↓
MVP Planning
↓
Backlog Generation
↓
Issue Generation

⸻

Research Workflow

Question
↓
Research
↓
Comparison
↓
Recommendation
↓
Decision
↓
Documentation

⸻

Feature Workflow

Clarification
↓
Design
↓
Implementation
↓
Review
↓
Documentation
↓
Commit
↓
Close

⸻

Bugfix Workflow

Issue Analysis
↓
Root Cause
↓
Troubleshooting
↓
Fix
↓
Review
↓
Documentation
↓
Close

⸻

Refactor Workflow

Current Analysis
↓
Risk Analysis
↓
Refactor
↓
Review
↓
Documentation
↓
Close

⸻

Harness Workflow

Analysis
↓
Design
↓
Workflow Update
↓
Validation
↓
Review
↓
Documentation
↓
Close

⸻

16. Prompt Architecture

Core Agent

운영체제 규칙

⸻

Planning Agent

기획 전용

⸻

Review Agent

검증 전용

⸻

Research Agent

조사 전용

⸻

Architecture Agent

설계 전용

⸻

17. NPM Package

Goal

npx flowness init

실행만으로

Flowness 환경 설치

⸻

Generated Structure

.agent/
config/
issues/
logs/
workflows/
rules/
skills/
scripts/
prompts/
settings/

⸻

Commands

Initialize

npx flowness init

⸻

Create Workflow

npx flowness workflow:create

⸻

Create Skill

npx flowness skill:create

⸻

Create Rule

npx flowness rule:create

⸻

Validate Harness

npx flowness validate

⸻

Upgrade Harness

npx flowness upgrade

⸻

18. Configuration

project_name:
human_gate:
default_workflows:
review_agents:
documentation_rules:

⸻

19. Future Roadmap (v3)

Dependency Graph

ISSUE-001
↓
ISSUE-002
↓
ISSUE-003

Issue 간 의존성 관리

⸻

Parallel Workflows

동시 작업 지원

⸻

Workflow Visualization

워크플로우 그래프 시각화

⸻

Metrics

Lead Time

Review Score

Failure Rate

Recovery Count

⸻

Team Mode

여러 에이전트 협업

⸻

Final Definition

Flowness는 단순한 AI 하네스가 아니다.

Flowness는

Issue

Workflow

Log

Decision

Evidence

Review

Recovery

를 중심으로 AI가 조직의 개발 프로세스를 강제적으로 수행하도록 만드는 conversational workflow harness for traceable AI-agent development이다.
