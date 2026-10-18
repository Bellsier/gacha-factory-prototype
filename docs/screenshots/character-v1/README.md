# 주인공 캐릭터 1차 구현 — 실행 화면

모든 `pc_*` / `phone_*` 이미지는 이 브랜치의 게임을 Chromium(Playwright)에서 새 게임으로 실행하고,
실제 키 입력(PC) · 가상 조이스틱(모바일)으로 걸어 다니며 찍은 화면입니다. `*_closeup` 은 같은 스크린샷에서 주인공 주변만 잘라낸 것입니다.

- PC: 1280×800, 확대 3배
- 모바일: 390×844 상당, 확대 2배

| 파일 | 내용 |
| --- | --- |
| `*_1_start` | 새 게임 시작 직후 (정면 대기) |
| `*_front_idle_closeup`, `*_front_after_walk_closeup` | 정면 |
| `*_walk_right`, `*_2_right_idle`, `*_right_idle_closeup` | 오른쪽 걷기 · 대기 |
| `*_walk_left`, `*_left_idle_closeup` | 왼쪽 걷기 · 대기 |
| `*_walk_down` | 아래로 걷기 |
| `*_walk_up`, `*_3_back_idle`, `*_back_idle_closeup` | 뒷모습 걷기 · 대기 |

`sprite_sheet_preview_10x.png` 는 게임 화면이 아니라, 게임의 스프라이트 함수(`tdPlayerSprite`)가 그린
16×22 스프라이트 4방향 × 걷기 4프레임을 10배로 늘려 나열한 미리보기입니다.

이 브랜치는 main 기준이라 PR #41의 마을(광장 · 집 · 정원)은 화면에 없습니다.
