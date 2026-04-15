# 상태 요약

## 목적

- 이 문서는 현재 프로젝트 상태를 유지형 요약으로 관리한다
- 오래된 요약은 덮어쓰거나 정제해서 갱신한다
- append-only 세션 로그처럼 사용하지 않는다

## 현재 단계

- 토너먼트 MVP 구현 단계
- 로컬 개발 목표는 네이티브 PostgreSQL 사용
- 최종 배포 목표는 Docker 전환 가능 상태 유지
- Railway staging은 로컬 PostgreSQL 워크플로우를 깨지 않은 채 배포되어 있고, 최신 frontend asset/result UX는 smoke 검증되었다. 배포 frontend 기준 6인 플레이 검증도 seat 5 hole-card 렌더링 중심으로 통과했다

## 완료된 작업

- 게스트 기반 토너먼트 생성, 참가, ready, owner-start 흐름
- 로비 생성 흐름이 사용자 입력 룸 코드 대신 닉네임, 방 제목, 테이블 공개 여부 중심으로 바뀜
- 홈 화면에서 현재 게스트의 active tournament 감지 및 resume 경로 제공
- backend REST, WebSocket, frontend UI 간 공통 tournament snapshot 계약 정리
- snapshot 식별자에 `handNumber`, `stateVersion`, public/viewer audience 메타데이터를 포함해 stale/public snapshot과 viewer 개인화 카드 상태를 구분 가능하게 함
- hand 경계 기준 blind level progression
- fold, check, call, raise, all-in을 포함한 in-hand action 흐름
- minimum raise sizing과 short all-in raise-reopen 동작을 포함한 betting rule 정렬
- preflop, postflop, snapshot `availableActions`, persisted reload를 아우르는 betting rule 후속 검증
- persisted reload 및 reconnect recovery를 포함한 disconnected folded/all-in player reconnect 검증
- 만료된 `HAND_RESULT` recovery와 table message 연속성 중심의 reconnect 보강
- 메인 팟 및 사이드 팟 계산
- showdown 정산, 탈락 처리, 토너먼트 종료 흐름
- richer showdown/result payload와 frontend result panel 요약
- backend 정산 결과에서 showdown hand-class label을 만들어 result snapshot과 frontend 렌더링까지 전달
- reconnect-safe result rendering을 위해 hand 단위 탈락 요약을 snapshot과 result payload에 보존
- 테이블 상단에는 compact winner / payout / hand-label badge만 유지하고, 상세 showdown panel은 테이블 하단에 두는 result UX 정리
- 셔플된 deck 기반 hole-card 배분과 board runout 및 persisted in-hand card recovery
- 5초 후 result-state auto-advance
- `FINISHED` 전 final-hand result 유지 시간 처리 및 expired reconnect/reload normalization
- 기본 reconnect 및 persistence 흐름
- WebSocket origin allowlist를 환경 기반 local frontend origin 설정과 통합
- 사용자에게는 room title만 노출하고 내부 room code는 서버 생성으로 유지
- 홈 로비 목록에 공개방과 잠금방을 모두 표시하고, 잠금방은 참가 전 비밀번호를 요구
- 잠금방 비밀번호를 mutable tournament state에 평문 대신 hash로 저장
- 대기방 오너에게 direct table deep link 대신 로비 복귀 안내 패널 제공
- ready, start, disconnect, reconnect용 REST mirror endpoint가 URL path의 tournament code를 받도록 수정해 fallback disconnect와 waiting-room leave validation 실패 제거
- frontend disconnect fallback이 반환 snapshot을 로컬에 적용하고 active-tournament cache를 waiting-room leave 이후에도 맞춰 유지
- 초기 React `StrictMode` cleanup에서 테이블 진입 직후 auto-remove되던 문제를 방지하도록 table-entry disconnect cleanup 수정
- table-page WebSocket lifecycle이 매 render마다 STOMP client를 재생성하지 않도록 바꿔 `LIVE SNAPSHOT` 루프 fallback 문제 제거
- 브라우저에서 명시적으로 in-hand disconnect 했을 때 같은 페이지에서 즉시 auto-reconnect 되지 않도록 수정해 manual reconnect 흐름을 테스트 가능하게 만듦
- waiting-room join이 새로운 `tournamentSnapshot`을 fan-out 하도록 바꿔 기존 seated browser의 참가자 목록이 즉시 갱신되게 함
- 로비 room list를 생성 순서 기준으로 안정화하고 full waiting room을 제외하며, table snapshot 기반 재동기화로 stale cache 정리를 빠르게 함
- 브라우저 refresh가 in-hand seat에 fallback disconnect를 자동 전송하지 않도록 바꿔, active actor reload가 즉시 fold로 이어지지 않고 최신 snapshot을 복원하게 함
- table REST snapshot이 optional `guestId`를 받아 `selfHoleCards`를 반환하도록 바꿔 현재 플레이어만 자기 손패를 볼 수 있게 함
- frontend realtime snapshot merge가 같은 `handNumber` 안에서만 마지막 self hole card를 유지하고, 이전 `stateVersion` 업데이트는 무시하도록 조정
- 종료된 토너먼트는 결과 화면 이후 자동 정리되며, `FINISHED` 후 20초 또는 마지막 연결 플레이어 이탈 시 더 빠르게 삭제되도록 처리
- persisted stale tournament를 `updated_at` TTL 규칙으로 active-tournament lookup 및 capacity-sensitive create/join 전에 정리해 abandoned row가 새 세션을 막지 않도록 함
- Railway deployment profile과 service manifest를 local `local` 프로필 흐름과 분리
- Railway 공개 도메인에서 create, join, ready, start, all-in, call, showdown, showdown hand-label 렌더링까지 smoke 검증 완료
- 배포 frontend URL 기준 Railway 6인 브라우저 smoke 검증 완료, 두 번의 full-table run에서 seat 5 missing-card / wrong-card 이슈 재현 없음
- Railway용 smoke script를 `scripts/` 아래로 정리하고 공통 config helper를 공유하도록 개선했으며, continuous runner는 explicit opt-in env flag가 있어야 시작되도록 변경
- 남은 active player가 모두 AFK일 때 hand를 soft-pause하여 turn/blind timer를 멈추고, 현재 actor가 return-to-play 할 때까지 기다리도록 구현
- 로비에서 잠금방 참여 규칙과 호스트 공유 안내를 더 직접적으로 보여주도록 private-room UX를 정리
- `use-tournament-realtime-snapshot.ts`에서 snapshot merge, event parse, cache sync 보조 로직을 분리해 realtime 책임을 조금 더 명확히 정리
- `TournamentTable`의 중앙 상태 카피를 `WAITING`, `IN_HAND`, `HAND_RESULT` 중심으로 더 분명히 나눠 읽기 우선순위를 개선
- `TournamentService`를 더 얇은 facade로 유지하고 command-specific flow를 focused collaborator로 분리
- frontend 비주얼 톤을 `WPL`에 가까운 social-poker 스타일로 조정하고, 로비와 테이블 HUD에 공통 `social-*` 디자인 토큰을 도입

## 현재 집중 영역

- MVP가 로컬 PostgreSQL 기준으로 계속 정상 동작하도록 유지
- 최종 Docker 배포로 넘어갈 수 있는 경로를 깨끗하게 유지
- reconnect 및 persistence 동작 보강
- 잠금방 affordance와 생성 후 공유 안내 중심의 남은 로비 UX 다듬기
- backend betting state, snapshot action, persisted hand state를 spec과 계속 정렬
- backend REST, public WebSocket event, frontend derived table state 사이의 snapshot identity 계약 정렬 유지
- 진짜 must-fix와 명시적 out-of-scope를 분리해 MVP closeout 정리
- result UX와 reconnect handling을 마무리하는 동안 local과 Railway 동작 차이를 줄이기

## 다음 작업

- 잠금방 메시지, 비밀번호 입력, 호스트 공유 안내 중심의 로비 UX 정리
- 새로 발견되는 edge case가 있는지 reconnect 및 persistence 최종 점검
- create, join, leave, resume, reconnect 흐름을 아우르는 최종 브라우저 smoke test
- 다음 의미 있는 gameplay/UI 변경 이후에만 Railway smoke 재실행
- 어떤 기능이 MVP 범위 밖인지에 대한 최종 closeout review
- local / Docker 프로필 전환이 쉽도록 런타임 설정 정리 계속
- multi-browser / staged deployment smoke 조건에서 cross-instance tournament command lock 검증

## 현재 평가

- 최근 betting-rule 변경은 backend action flow, persisted hand state, snapshot-driven client 동작에서 일관성을 유지하고 있다
- minimum-raise 또는 short all-in raise-reopen 처리와 관련해 추가 frontend 또는 websocket 계약 변경은 현재 필요하지 않다
- 현재 reconnect 흐름은 persisted offline state와 reload 후 reconnect를 포함해 MVP 범위에서 seat-level recovery에 부합한다
- 홈 화면은 이제 create/join 실패 후에야 알 수 있던 active tournament 참가 상태를 미리 보여준다
- 플레이어가 guest ID나 direct room code를 직접 입력할 필요가 없는 방향으로 UX가 정리되었고, 닉네임, 방 제목, 공개 여부, 잠금방 비밀번호가 핵심 흐름이 되었다
- reconnect는 stale expired `HAND_RESULT` 상태를 snapshot publish 전에 normalize 하므로 실제 현재 hand 기준 recovery가 된다
- final-hand result는 `FINISHED` 전 5초 동안 유지되며, expired recovery는 next-hand / final-finish 두 가지 분기를 올바르게 normalize 한다
- result 처리는 richer websocket payload 요약을 제공하면서도 snapshot-driven client 계약을 유지한다
- result snapshot에 server-evaluated showdown hand label이 포함되므로 클라이언트는 revealed hand를 재평가하지 않아도 된다
- result snapshot이 hand-local bust context를 보존하므로 split-pot / side-pot 결과 화면에서 cumulative state만 보고 탈락을 추론할 필요가 없다
- 현재 테이블 UX는 의도한 배포 동작과 맞는다. compact result summary badge는 felt 위에 유지되고, full settled-pot detail은 full-table overlay 대신 테이블 아래에 유지된다
- hand setup은 shuffled 52-card deck을 사용하며, persisted reload 이후에도 board와 hole card 일관성을 유지한다
- 로컬 PostgreSQL 개발 흐름은 바뀌지 않았고, 변경 사항은 Docker host 고정 가정을 추가하지 않았다
- 로컬 브라우저 개발 호스트는 이제 REST와 WebSocket에 하나의 origin allowlist를 공유하므로 `127.0.0.1:5173`에서 STOMP handshake가 설정 때문에 실패하지 않는다
- 최근 smoke check로 REST mirror endpoint와 frontend fallback disconnect 간 validation mismatch를 찾아 수정했다
- 같은 smoke check에서 frontend dev `StrictMode` 초기 table entry 시 auto-disconnect 버그도 수정했다
- 최신 브라우저 검증에서는 create, join, ready, start, waiting-room leave, disconnect, reconnect 전반에서 `LIVE WS` 상태가 안정적으로 유지되는 것이 확인되었다
- waiting-room participant list는 REST join이 websocket snapshot broadcast를 fan-out 하므로 즉시 갱신된다
- waiting-room list 의미도 더 엄격해졌다. 홈 목록은 좌석이 남은 `WAITING` room만 나타내고, leave/start/finish 시 table-driven cache sync가 stale entry를 즉시 제거한다
- room code는 플레이어 입력 UX에서 사라졌지만 라우팅과 서버 API에서는 여전히 내부 안정 식별자다
- 잠금방 비밀번호는 backend가 hash만 저장하므로 stored tournament state만으로는 복원할 수 없다
- 현재 owner invite UX는 direct table invite link 대신 waiting-room guidance panel과 copied lobby note를 의도적으로 사용한다. seating은 여전히 로비 목록에서 시작하기 때문이다
- reload recovery는 현재 in-hand seat를 자동 disconnect/fold 경로로 바꾸지 않고 그대로 복원한다
- 현재 남은 핵심 작업은 waiting-room leave나 기본 websocket 안정성 문제라기보다 MVP boundary 확정과 새 reconnect edge case 여부 점검이다
- 로비 쪽 남은 과제는 correctness gap보다는 UX polish다
- 이번 구조 변경 이후에도 frontend build와 `TournamentServiceTest` targeted suite는 통과했다
- 최신 WPL 방향 visual pass 이후에도 frontend build는 통과했다
- active-player capacity는 persisted `updated_at` 기반 stale-row safety valve를 가지므로 abandoned tournament가 반복적인 `503 at capacity` 실패를 일으킬 가능성이 줄었다
- Railway용 배포 설정은 local profile과 분리되어 있고, 현재 public frontend 배포는 expected showdown/result 동작까지 수동 검증이 끝났다
- 최신 배포 6인 브라우저 smoke에서는 seat 5 self-hole-card 렌더링 이슈가 재현되지 않았고, 상세 내용은 `docs/railway-six-player-smoke.md`에 기록되어 있다
- table state 계약은 명시적 hand/state 식별자를 가지므로 public WebSocket snapshot과 personalized REST snapshot이 경합할 때 frontend의 상태/board heuristic 의존을 줄인다
- tournament command는 현재 PostgreSQL 기반 per-table lock 아래에서 최신 persisted table state를 reload한 뒤 mutation 또는 timer transition을 적용하므로, backend instance가 1 JVM을 넘을 때 stale-cache overwrite 리스크를 줄인다
- Railway smoke harness는 MVP 회귀 도구로 유지 가능하지만, 여전히 일반 Playwright 프레임워크가 아니라 현재 UI 라벨, local storage, snapshot 계약 세부사항에 의도적으로 결합되어 있다
- AFK 정책은 partial AFK와 full-table AFK를 구분한다. 개별 AFK seat는 auto-check/fold 되지만, 모든 active player가 AFK이면 hand는 자동 소진되지 않고 pause 된다

## MVP 마무리 범위

### 유지할 범위

- board card, settled pot payout, split pot, side pot, hand-local elimination을 포함한 snapshot-driven result rendering
- server-evaluated showdown hand-class label을 result snapshot과 result payload에 보존
- stale-result normalization 이후 올바른 live hand, `HAND_RESULT`, `FINISHED` snapshot으로 복귀하는 reconnect / reload recovery
- 로컬 PostgreSQL 개발 흐름과 이후 Docker 프로필 분리를 모두 고려한 persistence 동작

### 이번 MVP에서 제외할 범위

- card-by-card showdown reveal sequencing 또는 staged reveal animation 계약
- replay, hand history, event timeline 재구성
- 우승자와 최신 정산 snapshot을 넘는 final standings ladder

## 남은 갭

- reconnect recovery는 여전히 snapshot 수준이며, seat ownership과 최신 snapshot을 넘는 richer in-hand session restoration은 시도하지 않는다
- create / capacity / room-name 경쟁 상태는 여전히 기존 MVP 제약에 의존하며, 새로운 shared lock은 특정 tournament code가 정해진 뒤의 command만 직렬화한다
- showdown reveal sequencing, replay metadata, final standings history는 의도적으로 MVP 범위 밖이다

## 메모

- 프로젝트 상태가 의미 있게 바뀌면 이 요약을 갱신한다
- 오래된 상태 정보가 더 이상 유효하지 않다면 이력을 누적하지 말고 다시 써서 정리한다
