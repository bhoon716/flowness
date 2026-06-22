# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="License" />
</div>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

> 보통은 `flowness init`을 한 번만 실행합니다. 그다음부터는 코딩 에이전트와 자연스럽게 대화하면서 작업을 이어가며, 명령은 에이전트용 제어, 디버깅/복구 도구, CI 보조 도구, 고급 점검 도구로 남겨둡니다.

## 한눈에 보기

| 영역 | 링크 | 용도 |
| --- | --- | --- |
| GitHub README | 이 파일 | 저장소 개요 |
| npm 패키지 | [@flowness-labs/core](https://www.npmjs.com/package/@flowness-labs/core) | 패키지 페이지 |
| CLI 문서 | [`packages/cli/README.md`](packages/cli/README.md) | npm 명령 참조 |
| 릴리스 노트 | [`docs/releases/`](docs/releases/) | 버전별 변경 내역 |

## Flowness란?

Flowness는 추적 가능한 AI 에이전트 개발을 위한 대화형 워크플로우 하네스(conversational workflow harness)입니다. 요청을 이슈로 라우팅하고, 명시적인 워크플로우를 통해 실행하며, 증거와 로그를 append-only(추가 전용) 형식으로 보존하고, 구조화된 review 체크와 rule 변경을 추적 가능하게 유지합니다.

## CLI 설치

```bash
npm install -g @flowness-labs/cli
npx @flowness-labs/cli init ./my-project
```

또는 `npx`로 새로운 워크스페이스를 시작하세요:

```bash
npx @flowness-labs/cli init ./my-project
```

## 워크스페이스 시작하기

```bash
flowness init ./my-project
cd ./my-project
flowness run "사용자 인증 기능 추가"
flowness status --issue ISSUE-001-AUTH
```

초기화 직후에는 다음 파일들을 먼저 확인하세요:

- `.flowness/navigation.md`
- `.flowness/context-index.json`
- `.flowness/commands.json`

## 주요 기능 (What It Does)

- 명시적인 워크플로우를 통해 요청을 이슈로 라우팅합니다.
- `flowness locate`를 사용하여 탐색 범위를 제한합니다.
- `flowness test --summary`, `flowness audit --changed`, `flowness upgrade --dry-run`, `flowness upgrade --apply`를 제공합니다.
- `flowness review:run`을 통해 구조화된 review 체크를 실행합니다.
- `flowness step`, `flowness workflow:step`, `flowness status`를 통해 진행 상황을 명시적으로 관리합니다.
- 증거, 로그, 리뷰 결과를 append-only(추가 전용) 형식으로 보존합니다.

## 핵심 명령

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

## 가벼운 네비게이션 (Lightweight Navigation)

- 워크스페이스를 스캔하기 전에 `.flowness/navigation.md`를 먼저 읽으세요.
- `.flowness/context-index.json`을 사용하여 유용한 최소 파일 집합을 찾으세요.
- 정확한 명령 문자열을 확인하려면 `.flowness/commands.json`을 사용하세요.
- 광범위한 저장소 스캔 대신 `flowness locate "<task description>"`를 우선 사용하세요.

## 기존 프로젝트 업그레이드

> 기존 프로젝트는 먼저 `flowness upgrade --dry-run`을 실행한 다음, 승인된 계획을 `flowness upgrade --apply`로 적용하세요.
> 기존 프로젝트에서 `flowness init`을 다시 실행하지 마세요.

## 릴리스 문서 (Release Documentation)

- 변경 로그: [`CHANGELOG.md`](CHANGELOG.md)
- 릴리스 체크리스트: [`docs/release-checklist.md`](docs/release-checklist.md)
- 릴리스 노트 템플릿: [`docs/templates/release-notes.md`](docs/templates/release-notes.md)
- 릴리스 노트: [`docs/releases/`](docs/releases/)
- 릴리스를 진행하기 전에 `npm run release:check`를 실행하세요.
- 문서 검증만 필요한 경우에는 `npm run release:docs-check`를 실행하세요.
