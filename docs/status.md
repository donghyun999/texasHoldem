# 상태 요약

## 목적

- 이 문서는 현재 프로젝트 상태를 유지형 요약으로 관리한다.
- 세션 로그나 append-only 변경 이력 대신, 지금 기준의 유효한 상태만 남긴다.

## 마지막 기준

- 마지막 갱신: `2026-04-21 Asia/Seoul`
- 현재 작업 기준: 로컬 PostgreSQL + `SPRING_PROFILES_ACTIVE=local`
- 현재 기본 워크트리: `C:\Users\user\texasHoldem`

## 현재 단계

- 텍사스 홀덤 싱글 테이블 토너먼트 MVP 개발 지속
- 로컬 개발 기준은 네이티브 PostgreSQL(`localhost:5432`) 유지
- 최종 배포 목표는 Docker 전환이지만, 현재 실행 흐름은 `local` 프로필 기준으로 유지

## 현재 코드 기준 완료 항목

- 게스트 기반 create / join / ready / owner-start / in-hand action / showdown / finish 흐름 유지
- public REST snapshot / personalized snapshot / STOMP WebSocket 흐름 유지
- waiting room / private room / lobby list / invite 안내를 포함한 로비 UX 유지
- single table 최대 좌석 수 9석 기준 일반화 반영
  - backend 규칙, 팟 분배, 테스트 보강 완료
  - frontend seat layout / table / player seat / overview / demo / preview 9석 기준 정리 완료
- Railway smoke 좌석 검증 스크립트 정리
  - `scripts/railway-seat-smoke.cjs`
  - `scripts/railway-seat-continuous.cjs`
  - `PLAYER_COUNT=2..9` range 입력 지원

## 이번 세션 반영 사항

- `docs/guest-token-session-transition.md`
  - Safari / iPhone `Unauthorized` ?댁뒋 ?먯쓣 ?댄빐 guest token 湲곕컲 ?꾪솚 workflow瑜??묐━
- guest auth compatibility patch
  - backend媛 `guestToken`??諛섑솚?섍퀬 REST? WebSocket CONNECT?먯꽌 bearer token?쇰줈 guest瑜??몄떇?섎룄濡?蹂닿컯
  - frontend媛 `guestId + guestToken`??濡쒖뺄????ν븯怨?protected API / STOMP connect header?먯꽌 token???꾩꽑 ?ъ슜?섎룄濡?蹂닿컯
  - 湲곗〈 session cookie??fallback?쇰줈 ?좎??섏뿬 local ?먮쫫怨?湲곗〈 遺뚮윭?ㅽ뒪???묒떇?먯꽌 break ?섏? ?딄쾶 ?섎룞
- `frontend/src/widgets/tournament/ui/TournamentTable.tsx`
  - 팟 수거 애니메이션 계산을 hand 경계와 state gap에서 더 안정적으로 이어지도록 보강
  - 마지막 non-zero contribution snapshot을 별도로 추적해 다인원 hand 전환에서도 팟 수거 출발점을 유지
  - `data-pot-animation-sequence` DOM hook 추가
- `scripts/local-seat-flow-verify.cjs`
  - 기본 action budget을 늘려 6인/9인에서 hand 3까지 안정적으로 진행되도록 조정
  - 자동 전이 구간 샘플링과 settle 대기 구간 보강
  - `data-pot-animation-sequence`를 함께 읽어 transient pot animation 관측을 안정화
  - `PLAYER_COUNTS=2-3` 같은 range 파서 재검증 완료
- `scripts/local-e2e-common.cjs`
  - backend/frontend health check 대기 중 child process가 먼저 종료되면 로그 경로를 포함해 빠르게 실패하도록 보강

## 실제 검증 결과

- backend
  - `backend\.\gradlew.bat test` 통과
- frontend
  - `frontend\npm.cmd run build` 통과
- 로컬 좌석 검증
  - `node .\scripts\local-seat-flow-verify.cjs` 기준 2인, 6인, 9인 묶음 실행 통과
  - 개별 재검증도 2인 / 6인 / 9인 각각 통과
  - 확인 항목
    - create / join / ready / start
    - hand 3까지 진행
    - dealer / SB / BB 표시
    - empty seat 표시
    - hero 카드 / 타이머 / 배지 위치
    - bet marker 위치
    - 모바일 겹침 없음
    - `flying-bet-chip` 관측
    - `flying-pot-chip` 관측
- range 파서 검증
  - `PLAYER_COUNTS=2-3 node .\scripts\local-seat-flow-verify.cjs` 통과

## 원인 정리

- 세션 초반 `connect ECONNREFUSED 127.0.0.1:8080` 재현 원인은 backend URL/port 오설정이 아니었다.
- 사용자 인터럽트와 짧은 스크립트 로드 확인 중단으로 local e2e backend/frontend가 중간 상태로 남았고, 다음 실행이 그 stale 프로세스와 겹치면서
  - 한쪽은 `8080 already in use`
  - 다른 쪽은 이후 `ECONNREFUSED`
  로 이어졌다.
- 현재 helper는 child 조기 종료를 더 빠르게 보고하도록 보강됐다.

## 검증 산출물

- 최신 2인 통과:
  - `test-results/local-seat-flow-verify/20260421-030516949Z`
- 최신 6인 통과:
  - `test-results/local-seat-flow-verify/20260421-032826833Z`
- 최신 9인 통과:
  - `test-results/local-seat-flow-verify/20260421-033246856Z`
- 최신 2/6/9 묶음 통과:
  - `test-results/local-seat-flow-verify/20260421-034413399Z`
- range(`2-3`) 통과:
  - `test-results/local-seat-flow-verify/20260421-033900069Z`

## 현재 남은 리스크

- `flying-pot-chip`은 2/6/9 모두 관측되지만, 다인원에서는 transient DOM만으로는 놓치기 쉬워 `data-pot-animation-sequence` hook을 함께 사용한다.
- local e2e를 강제 중단하면 backend/frontend dev process가 남아 다음 실행과 충돌할 수 있다.
- Railway wrapper는 정리됐지만, 실제 배포 환경에서 2..9 전 구간을 주기적으로 돌리는 운영 기준은 추가 정리가 필요하다.

## 다음 작업

- Railway wrapper 기준 문서와 운영 절차를 정리하고, 2..9 smoke 결과를 누적 관리할지 결정
- local e2e 시작 전 stale local backend/frontend 정리 절차를 스크립트로 자동화할지 검토
- Docker 전환 단계에서도 local / docker profile 분리를 유지하도록 환경 문서 정리 지속
