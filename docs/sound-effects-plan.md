# 사운드 효과 계획

## 목적

- 텍사스 홀덤 MVP에 필요한 효과음 자산을 미리 정리한다
- 실제 음원 파일 확보 전까지 파일명, 우선순위, 연결 이벤트를 합의된 기준으로 유지한다
- 사운드 구현 시 backend 변경 없이 frontend 자산/재생 로직만 연결할 수 있게 준비한다

## 자산 배치 원칙

- 권장 위치: `frontend/public/sounds/`
- 권장 포맷: `mp3` 또는 `wav`
- 파일명은 소문자 kebab-case로 통일한다
- 같은 의미의 사운드는 한 파일로 시작하고, 필요 시 나중에 variation을 추가한다

## 1차 권장 사운드 목록

### 필수

- `deal-card`
  - 용도: 플레이어 hole card 분배, 보드 카드 공개
- `chip-bet`
  - 용도: bet, raise, call, small blind, big blind 반영
- `check-call`
  - 용도: check 또는 call 확정 시 가벼운 확인음
- `fold`
  - 용도: fold 액션 확정 시 재생
- `turn-alert`
  - 용도: 현재 플레이어 턴 진입 시 알림
- `hand-win`
  - 용도: hand 종료 후 승자/정산 결과 강조

### 있으면 좋은 것

- `board-reveal`
  - 용도: flop, turn, river 공개 시 카드 딜과 분리된 강조음
- `all-in`
  - 용도: all-in 액션 확정 시 강한 강조음
- `seat-join`
  - 용도: waiting room 참가 또는 착석 시 재생
- `ready-toggle`
  - 용도: ready 상태 on/off 반영
- `tournament-start`
  - 용도: waiting 상태에서 in-hand 시작 시 재생
- `reconnect`
  - 용도: reconnect 또는 return-to-play 성공 시 재생

### 선택

- `error`
  - 용도: 실패 토스트 또는 invalid action 반응
- `blind-level-up`
  - 용도: blind level 상승 시 알림
- `result-panel`
  - 용도: showdown/result 패널 강조
- `pause-alert`
  - 용도: AFK pause 또는 soft-pause 진입 시 알림

## 1차 실제 확보 추천 세트

MVP 기준으로 먼저 확보할 우선 자산:

- `deal-card.mp3`
- `chip-bet.mp3`
- `check-call.mp3`
- `fold.mp3`
- `turn-alert.mp3`
- `board-reveal.mp3`
- `all-in.mp3`
- `hand-win.mp3`

## 이벤트 연결 초안

- 카드 분배 시작: `deal-card`
- flop/turn/river 공개: `board-reveal` 또는 초기에는 `deal-card` 재사용
- check/call: `check-call`
- bet/raise/blind 반영: `chip-bet`
- fold: `fold`
- all-in: `all-in`
- 현재 내 턴 시작: `turn-alert`
- hand result/showdown winner 표시: `hand-win`
- waiting room 참가/착석: `seat-join`
- ready 변경: `ready-toggle`
- 토너먼트 시작: `tournament-start`
- reconnect/return-to-play: `reconnect`

## UX 원칙

- autoplay 정책 때문에 사용자 상호작용 이후에만 재생 가능하다고 가정한다
- 같은 순간 여러 사운드가 겹치면 우선순위를 둔다
- 기본 볼륨은 낮게 시작하고, 설정에서 조절 가능하게 한다
- 음소거 또는 사운드 on/off 설정을 제공하는 방향을 권장한다

## 우선순위 규칙 초안

- 가장 높은 우선순위: `turn-alert`, `all-in`, `hand-win`
- 중간 우선순위: `board-reveal`, `chip-bet`, `fold`
- 낮은 우선순위: `seat-join`, `ready-toggle`, `reconnect`

동시 발생 시 낮은 우선순위 사운드는 생략 가능하다.

## 후속 구현 시 고려사항

- 사운드 재생은 frontend 전용으로 처리한다
- 재생 트리거는 snapshot 상태 변화와 action event를 함께 고려한다
- 동일 이벤트 반복 수신 시 중복 재생 방지 로직이 필요하다
- websocket reconnect 후 과거 상태를 다시 hydrate할 때는 불필요한 효과음이 재생되지 않도록 해야 한다
- 모바일 환경에서도 과도하게 시끄럽지 않도록 짧고 명확한 효과음을 우선한다
