# AGENTS

- This file applies only to the Flowness repository.
- 협업 응답과 문서 설명은 한국어로 작성한다.
- Flowness 리포지토리에서 구현이나 설계 결정을 내리기 전에는 `master-plan.md`를 기준으로 확인한다.
- `master-plan.md`는 Flowness 제품 명세일 뿐이며, `flowness init`으로 생성되는 사용자 프로젝트의 필수 규칙이 아니다.
- 사용자 프로젝트에서는 프로젝트 로컬 `AGENTS.md`와 해당 저장소의 문서를 기준으로 판단한다.
- 새 기능은 작게 나누고, 검증 가능한 단위로 진행한다.
- 기존 로그, 결정, 증거는 덮어쓰지 말고 append-only 원칙을 지킨다.
- 초기화/스캐폴딩은 기존 파일을 기본적으로 보존하고, 덮어쓰기에는 명시적 옵션이 필요하다.
- 브랜치와 커밋은 Git Flow를 따른다. 기본 통합 기준은 `develop`이고, 기능은 `feature/*`, 버그 수정은 `fix/*`, 긴급 수정은 `hotfix/*`로 분리한다.
