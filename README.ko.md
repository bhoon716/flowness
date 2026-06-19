# Flowness

<div align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/npm/v/@flowness-labs/cli?color=369eff&labelColor=black&logo=npm&style=flat-square" alt="NPM Version" />
  <img src="https://img.shields.io/github/license/bhoon716/flowness?style=flat-square&color=white&labelColor=black" alt="License" />
</div>

<p align="center">
  <strong>이슈 기반 AI 개발 운영체제 (Issue-driven AI Development Operating System)</strong>
</p>

---

## Flowness란 무엇인가요?

현재 대부분의 AI 코딩 환경은 심각한 한계를 가지고 있습니다. AI가 어떤 과정을 거쳤는지 기록을 남기지 않고, 정해진 프로세스를 생략하며, 중요한 의사결정 맥락이 순식간에 사라집니다. **Flowness**는 단순한 AI 코드 생성 도구가 아닙니다. AI 에이전트가 조직의 개발 프로세스와 규칙을 강제적으로 따르도록 통제하는 **운영체제(OS)**입니다.

모든 사용자 요청은 정식 **이슈(Issue)**가 되며, 모든 단계는 불변의 **증거(Evidence)**를 남기고, 이 모든 과정은 누적만 가능한(Append-only) 로그 모델을 통해 기록됩니다.

---

## 핵심 철학

- 🎯 **모든 요청은 이슈가 됩니다**: 사용자의 요구사항은 분석과 설계 단계를 거치기 위해 이슈 상태로 관리됩니다.
- 📜 **누적 전용 로그 (Append-only)**: 에이전트의 모든 행동은 타임스탬프와 함께 연대기적으로 기록되며, 절대 삭제되거나 수정될 수 없습니다.
- ⚙️ **강제 워크플로우**: AI 에이전트는 사용자가 정의한 실행 경로(Workflow) 내에서만 엄격하게 행동합니다.
- 🔍 **주장보다 증거**: "테스트를 통과했다"는 AI의 말만으로는 부족합니다. 통과 결과물이나 실행 로그 등의 검증 페이로드를 직접 제출해야 합니다.
- 🧠 **결정 기록 보존**: 설계 도중 발생한 모든 핵심 의사결정은 RFC 형태의 템플릿 문서로 보존됩니다.

---

## 프로젝트 구조

Flowness는 모듈화된 패키지로 분할된 모노레포(Monorepo) 워크스페이스입니다.

- [`@flowness-labs/cli`](file:///Users/bhoon/Project/flowness/packages/cli): CLI 진입점 및 에이전트 오케스트레이션.
- [`@flowness-labs/core`](file:///Users/bhoon/Project/flowness/packages/core): 공통 타입, 설정 파서 및 로컬 스캐폴딩 초기화.
- [`@flowness-labs/workflow-engine`](file:///Users/bhoon/Project/flowness/packages/workflow-engine): 코드로 정의된 결정론적 워크플로우 엔진.
- [`@flowness-labs/issue-system`](file:///Users/bhoon/Project/flowness/packages/issue-system): 이슈 선택 및 상태 관리.
- [`@flowness-labs/log-system`](file:///Users/bhoon/Project/flowness/packages/log-system): Append-only 로그 수집기.
- [`@flowness-labs/decision-system`](file:///Users/bhoon/Project/flowness/packages/decision-system): 의사결정 문서(Decision) 빌더.
- [`@flowness-labs/evidence-system`](file:///Users/bhoon/Project/flowness/packages/evidence-system): 실행 도구 검증기 및 파서.
- [`@flowness-labs/review-system`](file:///Users/bhoon/Project/flowness/packages/review-system): 다중 에이전트 리뷰 수집기.
- [`@flowness-labs/config-system`](file:///Users/bhoon/Project/flowness/packages/config-system): 프로젝트 설정 및 오버라이드 시스템.
- [`@flowness-labs/templates`](file:///Users/bhoon/Project/flowness/packages/templates): 사용자 프로젝트 초기화 시 제공되는 템플릿 레지스트리.

---

## 설치 및 시작하기

npm을 사용하여 전역으로 CLI를 설치할 수 있습니다:

```bash
npm install -g @flowness-labs/cli
```

또는 `npx`를 사용하여 새 프로젝트를 즉시 초기화할 수 있습니다:

```bash
npx @flowness-labs/cli init ./my-new-project
```

### 개발 환경 설정

로컬에서 모노레포를 빌드하고 테스트하려면 다음 명령을 사용하세요:

```bash
# 의존성 설치
npm install

# 워크스페이스 내 모든 패키지 빌드
npm run build

# 단위 및 통합 테스트 실행
npm test

# 로컬 CLI 테스트용 심볼릭 링크 생성
npm run link:cli
```

---

## 주요 CLI 명령어

초기화된 Flowness 프로젝트 내에서 아래 명령을 사용하여 AI 작업을 트리거합니다:

```bash
# 새로운 기능 개발 요청
flowness request:create "사용자 로그인 기능 구현해줘"

# 이슈 직접 수동 등록
flowness issue:create --title "Redis 캐싱 추가" --type feature

# 워크스페이스 내 지정한 이슈의 워크플로우 단계 승인 및 실행
flowness workflow:step --issue ISSUE-001-SIGNIN --approve

# 다중 에이전트 코드 리뷰 실행
flowness review:run --issue ISSUE-001-SIGNIN
```

---

## 아키텍처 레이아웃

```
.agent/                  ← 로컬 프로젝트에 생성되는 AI OS 디렉토리
├── config/              ← 환경설정 규칙 및 사양
├── issues/              ← 작업 중인 이슈 및 의사결정 기록 문서
├── logs/                ← Append-only 실행 로그
├── workflows/           ← 실행 가능한 워크플로우 파일들
├── rules/               ← 에이전트 가이드라인
└── templates/           ← 템플릿 파일들
```

---

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.
