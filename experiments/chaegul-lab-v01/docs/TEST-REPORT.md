# 최종 실행 검증 보고서

검증일: 2026-10-17 (Asia/Seoul). 대상: 독립 실험판 v0.1 단일 HTML.

## 결과

- Node 규칙·회귀 테스트: 24/24 통과.
- Chromium 실제 키 입력·UI 클릭 연속 여정: 29개 확인 통과.
- 추가 브라우저 검사: 저장·화면 5개, 전투·귀환 2개 통과.
- 전체 여정 JavaScript 오류 0, 콘솔 오류 0.
- 실제 플레이 테스트는 상태를 주입하지 않았다. 읽기 전용 snapshot으로 결과와 경로를 관찰하고 키와 버튼으로 진행했다.
- 저장 오류 검사는 별도의 새 브라우저 컨텍스트에서 합성 저장·Quota 실패를 준비한 경계 테스트다.

## 필수 15단계 및 확장 플레이

- 통과: 1-2 시작 및 실제 Canvas 캐릭터 화면
- 통과: 3 WASD 이동
- 통과: 4 나무 및 바위 충돌
- 통과: 5-6 광맥 채굴·공용 저장소
- 통과: 7 공방 연구·곡괭이 제작
- 통과: 자전거 제작·탑승
- 통과: 10 NPC 대화
- 통과: 농사 심기·물주기
- 통과: 마을 복구·등불 배치
- 통과: 8 다른 지상 지역 이동
- 통과: 9 근접 전투·몬스터 처치
- 통과: 고원 철 채굴·사원 퍼즐
- 통과: 활성화한 장치 간 순간이동
- 통과: 강철 곡괭이·농작물 수확
- 통과: 늪지 수로 복구·주민
- 통과: 수정 광맥·연구 시설
- 통과: 산맥 터널 개통·통과
- 통과: 화산 특수광석·지열시설
- 통과: 11 지하 B1 진입
- 통과: 13 기존 철도 복구·수레·안전 하차
- 통과: b2 복구 퍼즐
- 통과: b3 복구 퍼즐
- 통과: 12 B4까지 이동
- 통과: 연구실 복원 탐험 목표 완료
- 통과: 14 마을 왕복 귀환
- 통과: 15 저장·새로고침 복원
- 통과: 11개 지역 방문·11개 기록
- 통과: 800x600 화면 크기 변경
- 통과: 콘솔 및 JavaScript 오류 0

## 추가 검증

- 통과: Existing save/view keys remain untouched
- 통과: JSON export downloads valid save
- 통과: Future save preserved on manual save
- 통과: Storage failure displayed without crash
- 통과: Wide viewport stays inside rendered terrain
- 통과: Real F-key ranged projectile kills enemy and grants ranged XP
- 통과: Enemy attacks exhaust HP and safely return player home

## 제한 및 실패 이력

- file:// 실행 시도는 ERR_BLOCKED_BY_ADMINISTRATOR로 차단됨. 관리 정책은 바꾸지 않았다. 이 항목은 통과가 아니며 일반 Chromebook 파일 실행도 미검증이다.
- 로컬 HTTP에서 실행한 Chromium의 결과이며 실물 Chromebook 성능·호환성을 보증하지 않는다.
- 초기 자동 경로가 광맥 모서리에 걸리던 것은 테스트 경로 여유 폭으로 수정했다. 강철 곡괭이 제작에 부족한 구리를 추가 채굴하도록 테스트 여정을 수정했다.
- B2 안내석과 중간 장치 사이에서 안내석을 선택하던 자동 접근점을 장치 앞쪽으로 옮겼다.
- 검토에서 찾은 수레 하차 끼임, 레일 위 기둥, B4 기록 선행 조건, 터널 충돌 잔류는 재현 회귀 테스트와 수정으로 해결했다.
- 2560×600 화면에서 빈 여백이 보이던 카메라 배율은 수정 후 양쪽 모서리 알파 255로 검증했다.
- 기존 Task112 전체 회귀와 저장 마이그레이션 검사는 수행하지 않았다. 기존 코드 기능 동등성 주장이 아니다.

## Phase 상태

- A: 월드·이동·충돌·카메라 및 지역 연결 구현·검증 완료.
- B: 채굴·저장소·연구·제작·장비 구현·검증 완료.
- C: 전투·NPC·기록·퍼즐·교통 구현·검증 완료.
- D: 집·공방·농사·마을 복구·등불 배치 구현·검증 완료.
- E: HTTP 연속 플레이와 패키징 완료. file://는 환경 정책으로 미검증. 다운로드의 최종 HTTP·해시 검사는 게시 후 별도 DELIVERY.md에 기록한다.

## 증거 파일

- evidence/browser-report.json: 전체 경로, 최종 상태, 오류 배열.
- evidence/edge-report.json: 저장·화면·file:// 검사.
- evidence/combat-report.json: 실제 원거리 전투와 사망 귀환.
- evidence/unit-tests.txt: Node 전체 결과.
- evidence/*.png: 각 단계 실제 화면.

## 보호된 원본

확인된 main: e00c62d867d8bd6fdc39434f47ac9504d3696eb5. PR #34 head: d21fb3437d11b2d78fe552e2760520b3c9cc388b. 기존 checkout은 깨끗하며 수정하지 않았다. 새 실험 브랜치의 experiments/chaegul-lab-v01/에만 파일을 추가한다.
