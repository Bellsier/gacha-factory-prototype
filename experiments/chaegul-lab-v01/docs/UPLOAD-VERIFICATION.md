# v0.1 독립 실험판 업로드 검증

검증일: 2026-10-18 (Asia/Seoul)

## 범위와 원본

- 기준 main: `d31da0123c764bed55ee56ac9f3bb6dedb6a7b8b`
- 업로드 브랜치: `codex/chaegul-lab-v01-upload`
- 모든 추가 파일은 `experiments/chaegul-lab-v01/` 내부에만 배치한다.
- 본게임의 `index.html`, `js/`, `css/`, 저장 시스템은 수정하지 않는다. 본게임 통합과 main 병합은 수행하지 않는다.
- 첨부 ZIP의 37개 파일을 원래 상대 경로와 내용 그대로 보존했다. `evidence/` 바로 아래 자료는 ZIP에 들어 있던 과거 검증 자료이며 이번 실행 결과가 아니다.
- `artifacts/`는 원본 소스에서 패키징 도구를 실행하여 재생성한 배포 스냅샷이다. 업로드 검증 문서와 이번 실행 결과를 추가하기 전에 원본과 일치함을 확인했다.

| 원본/재생성 파일 | SHA-256 |
| --- | --- |
| 프로젝트 ZIP (1,972,287 bytes) | `e4ae22d0513e3bc8995a801a302ebff3382eb0236d1d2bb67e8e52cf4650a080` |
| 단일 HTML (54,861 bytes) | `edff4eb3f6e087cbe0b052e44d36393712437eb980f765e9102a7da45b0df250` |

## 기존 실험판과 비교

비교 대상: `codex/chaegul-lab-v01-20261017`, Git tree `1603ba9cf2fd884537168c3334998e7ddbc87db3`.

Git blob SHA-1으로 비교했으며, 기존 브랜치의 `artifacts/…-single.html`은 ZIP 루트의 단일 HTML에 대응시켰다.

- 공통 파일 24개 모두 내용 일치: README, index, package.json, src 6개, docs 5개, tests 4개, tools/package.py, evidence 보고서 4개, 단일 HTML.
- 내용이 다른 공통 파일: 0개.
- ZIP에만 있는 파일: evidence 스크린샷 12개 및 `evidence/exported-save.json`.
- 기존 브랜치에만 있는 파일: `.gitignore`, `docs/DELIVERY.md`, `artifacts/SHA256SUMS.json`, `artifacts/chaegul-gongbang-lab-v0.1-project.zip`.
- 기존 브랜치에 보관된 프로젝트 ZIP의 Git blob 해시 `22fb8f5f1e7367807d8c5cdb87ac41728405dfaf`는 이번 첨부 ZIP과 일치한다.

## 로컬 실행과 저장 분리

```sh
cd experiments/chaegul-lab-v01
python3 -m http.server 43191 --bind 127.0.0.1
```

분리 소스: `http://127.0.0.1:43191/index.html`

단일 HTML: `http://127.0.0.1:43191/chaegul-gongbang-lab-v0.1-single.html`

실험판은 `chaegulGongbang.experimental.v01`만 사용한다. 브라우저에서 본게임 키 `gachaFactorySave`와 `gachaFactoryView`에 검증용 값을 넣고 실험판 수동 저장 후 값이 바뀌지 않음을 확인했다. 분리 소스와 단일 HTML 각각에서 저장 및 새로고침 복원을 확인했다.

## 이번 검증 결과

이번 실행 결과는 `evidence/upload-20261018/`에 별도로 보관한다. Chromium과 실행 환경에 설치된 Playwright를 사용했다.

- `npm test`: 단위 테스트 24개 통과.
- `npm run package`: 생성 성공. 생성한 ZIP과 단일 HTML이 첨부본과 바이트 단위로 일치.
- `node tests/edge-browser.cjs`: HTTP 경계 조건 5개 통과(본게임 키 보존, JSON 내보내기, 미래 버전 저장 보존, 저장 실패 처리, 넓은 화면 렌더링).
- `node tests/combat-browser.cjs`: 원거리 공격과 체력 소진 후 안전 귀환 2개 통과.
- 별도 HTTP 실행 점검: 분리 소스 및 단일 HTML의 시작·저장 분리·재로드 통과.
- `node tests/browser.cjs`: 실제 키보드·클릭 기반 탐험 29개 점검 통과. 11개 지역 방문, B4 연구실 복구, 마을 귀환, 저장·재로드 및 화면 크기 변경을 확인했다. JavaScript 및 콘솔 오류 0개.
- 읽기 전용 독립 검토: ZIP 37개 파일 보존, 본게임 변경 없음, 저장 키 분리 확인. 중요 차단 사항 없음.
- 추가 본게임 회귀 검사(`npm test`, 저장소 루트): **미완료**. 약 2GB Node.js 힙 한도에서 `JavaScript heap out of memory`로 종료 코드 134가 발생했다. 전체 통과를 주장하지 않는다. 이 실행에서 본게임 파일은 변경하지 않았으며 로그를 `evidence/upload-20261018/main-regression.log`에 보관한다.

### 제한 사항

`file://` 직접 열기는 관리형 Chromium의 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단된다. 실제 업로드 경로를 사용한 별도 점검에서도 차단되었으므로 직접 파일 실행 성공은 주장하지 않는다. HTTP 실행을 사용한다.

원본 테스트를 보존했으므로 일부 브라우저 테스트는 포트 43191과 `/usr/bin/chromium`을 고정 사용한다. `edge-browser.cjs`의 보조 file:// 점검은 과거 작업 경로를 사용하며, 이번에는 `upload-smoke.json`에서 실제 경로를 별도로 점검했다.
