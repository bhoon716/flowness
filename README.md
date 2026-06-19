# Flowness

Issue-driven AI development operating system.

이 저장소는 Flowness의 TypeScript-first npm workspace 구현체를 담는다.
`master-plan.md`가 상위 설계 문서이며, 구현은 그 문서를 따라간다.

## 현재 상태

- monorepo 워크스페이스 골격
- `flowness init`, `issue:create`, `workflow:create`, `workflow:step`, `workflow:recover` CLI 구현
- `decision:create`, `review:run`, `skill:create`, `rule:create`, `validate`, `upgrade` CLI 구현
- 핵심 타입, 초기화 스캐폴딩, 결정/리뷰/증거/워크플로우 런타임 구현

## 주요 명령

```bash
npm install
npm run build
npm test
npm run link:cli   # one-time: makes `flowness` available on PATH
flowness init ./some-project
flowness issue:create --title "Sign in" --type feature
flowness workflow:step --issue ISSUE-001-SIGN-IN --approve
flowness review:run --issue ISSUE-001-SIGN-IN
```

`flowness`를 `npx` 없이 바로 쓰려면 `npm run link:cli`를 한 번 실행하면 됩니다. 이미 다른 `flowness` 링크가 있으면 이 저장소 버전으로 덮어씁니다.

## 레이아웃

- `packages/cli`: CLI 진입점
- `packages/core`: 공통 타입, 설정, 스캐폴딩
- `packages/workflow-engine`: 코드 기반 워크플로우 엔진
- `packages/issue-system`: 이슈 선택과 이슈 모델
- `packages/log-system`: append-only 로그 계약
- `packages/decision-system`: 결정 문서 계약
- `packages/evidence-system`: 증거 모델
- `packages/review-system`: 다중 리뷰어 집계
- `packages/config-system`: 프로젝트 설정 시스템
- `packages/templates`: 템플릿 레지스트리
