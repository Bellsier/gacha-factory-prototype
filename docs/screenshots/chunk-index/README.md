# 청크 캐시 보완 · 청크 공간 색인 — 실행 결과

- `chunks_debug_<pc|mobile>_<village|corner>.png`: Chromium 실제 화면, `?style=v2&res=auto&chunks=debug` — 노란 선이 청크 경계(8 단위 = 32 타일), 숫자가 청크 번호.
- `walk_perf.json`: PR #47(before)과 이 브랜치(after)에서 같은 저장으로 실제 키 · 조이스틱 걷기(청크 6개를 지나감) 중 프레임 시간, 청크 통계, playerCanStand 2만 번 비교(색인 / 전체 훑기).
- `stress_walk_perf.json`: 위와 같되 걷기 직전에 화면 밖 청크를 모두 버려, 새 청크가 계속 화면에 들어오게 한 시험.
