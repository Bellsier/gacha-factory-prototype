# A안 / B안 그래픽 비교 (Before / After)

- **A안**: 기존 픽셀 아트 (`?style=classic`, 현재 기본값)
- **B안**: Core Keeper에서 영감을 받은 새 픽셀 아트 (`?style=v2`, PR #45의 실험)

## 촬영 조건 (A·B 동일)
- 같은 빌드(`claude/style-experiment-v1`), 같은 저장 데이터, Chromium(Playwright)에서 실제 실행
- 캐릭터: 집 문 앞 디딤 자리(4.75, −3.05), 정면, 정지 — 저장 데이터에 넣은 위치
- 카메라: 캐릭터 중심 (4.75, −3.05), PC 확대 3배 · 모바일 확대 2배
- 화면: PC 1280×800 (DPR 1), 모바일 iPhone 13 에뮬레이션 (390×664 표시 영역, DPR 3)
- 조명: 낮(어둠 0) / 저녁(어둠 0.45)으로 고정
- `raw/scene.json` 에 두 안의 플레이어 위치 · 카메라 · 배율 · 화면 좌표가 기록되어 있고, 모든 쌍이 같습니다.

## 파일
| 파일 | 내용 |
| --- | --- |
| `compare_pc_day_full.png`, `compare_pc_evening_full.png` | PC 전체 화면 좌우 비교 (낮 / 저녁) |
| `compare_mobile_day_full.png`, `compare_mobile_evening_full.png` | 모바일 전체 화면 좌우 비교 (낮 / 저녁) |
| `compare_*_zoom_1.png` | 확대: 집 전체 (아트 픽셀 1개 = 6 px) |
| `compare_*_zoom_2.png` | 확대: 지붕 · 벽 · 창 질감 (1개 = 12 px) |
| `compare_*_zoom_3.png` | 확대: 캐릭터 윤곽 (1개 = 12 px) |
| `compare_*_zoom_4.png` | 확대: 돌길 · 잔디 (1개 = 12 px) |
| `raw/*.png` | 합성 전 원본 스크린샷 (A · B 각각) |

확대 이미지는 같은 스크린샷에서 잘라 **정수배 최근접 확대**만 했습니다(흐림 보정, 덧칠 없음).
