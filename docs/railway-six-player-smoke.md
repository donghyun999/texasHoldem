# Railway 좌석 Smoke 메모

## 현재 기준

- 기준일: `2026-04-21 KST`
- 목적: Railway 배포 환경에서 좌석 수별 create / join / ready / start / table UI 기본 흐름을 빠르게 확인한다.
- 현재 권장 진입점
  - `scripts/railway-seat-smoke.cjs`
  - `scripts/railway-seat-continuous.cjs`

## 입력 규칙

- `PLAYER_COUNT`는 단일 값과 range를 모두 지원한다.
  - 예: `2`
  - 예: `2-9`
  - 예: `2..9`
  - 예: `2~9`

## 실행 예시

단발 smoke:

```bash
PLAYER_COUNT=2..9 node scripts/railway-seat-smoke.cjs
```

반복 smoke:

```bash
ALLOW_CONTINUOUS_RAILWAY_TESTS=true PLAYER_COUNT=2..9 node scripts/railway-seat-continuous.cjs
```

무한 반복은 추가로 아래가 필요하다.

```bash
ALLOW_INFINITE_CONTINUOUS_RAILWAY_TESTS=true
```

## 스크립트 구성

- `scripts/railway-seat-smoke.cjs`
  - 현재 좌석 smoke의 기본 wrapper
- `scripts/railway-seat-continuous.cjs`
  - 좌석 smoke 반복 실행 wrapper
- `scripts/railway-six-player-smoke.cjs`
  - 6인 회귀와 호환을 위한 기존 본체
- `scripts/railway-six-player-continuous.cjs`
  - 6인 회귀 연속 실행 본체
- `scripts/railway-six-player-live-continuous.cjs`
  - live 연속 검증용 6인 기반 본체

## 역사적 맥락

- 초기 Railway smoke는 seat 5 hole-card 이슈 재현 여부를 확인하기 위한 6인 회귀 중심으로 시작했다.
- 현재는 9석 일반화가 반영되어 wrapper 기준을 좌석 smoke 전반으로 확장했다.
- 다만 6인 회귀 문맥은 여전히 유효하므로 기존 `railway-six-player-*` 스크립트는 제거하지 않고 유지한다.

## 운영 메모

- 이 스크립트들은 create/join/table UI 라벨, local storage key, tournament snapshot API에 의도적으로 결합되어 있다.
- frontend/backend 흐름이 바뀌면 black-box 테스트로 취급하지 말고 함께 갱신한다.
- Railway 사용량을 직접 소비하므로 반복 실행은 수동 제어를 기본으로 둔다.
