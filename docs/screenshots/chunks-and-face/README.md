# 1.5x 캐릭터 손질 · 청크 렌더링 — 실제 실행 화면

모든 이미지는 같은 저장 데이터로 Chromium(Playwright)에서 실제로 실행한 화면입니다. 확대는 같은 스크린샷을 잘라 정수배로만 키웠습니다.

## 캐릭터 (B안 스타일 위)
| 파일 | 내용 |
| --- | --- |
| `char_<기기>_<down/right/up>.png` | 정면 · 옆 · 뒤, 4열: 1x · 1.5x(PR #46) · **1.5x 손질** · auto |
| `full_<기기>_1x_vs_15.png` | 전체 화면 1x / 1.5x 손질 |

기기: `pc` (1280×800, DPR 1, 배율 3) · `mobile` (iPhone 13, DPR 3, 배율 2) · `laptop150` (Windows 150%, DPR 1.5, 배율 3).
`auto`는 그 기기에서 1.5x가 균일하게 그려질 때만 1.5x를, 아니면 1x를 씁니다(laptop150에서는 1x).

## 청크 렌더링
| 파일 | 내용 |
| --- | --- |
| `chunks_debug_<기기>_<village/corner>.png` | `?chunks=debug` — 노란 선이 청크 경계(8 단위 = 32 타일), 숫자가 청크 번호 |
| `raw/*_before_still.png`, `raw/*_after_still.png` | 같은 장면, 예전 한 장 바닥 / 청크 바닥 |
| `raw/chunk_perf.json` | 걷기(실제 키 · 조이스틱) 중 프레임 시간, 청크 통계 |
| `raw/character_scene.json` | 캐릭터 비교의 장면 기록(위치 · 카메라 · 배율이 모든 열에서 같음) |
