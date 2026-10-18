# 다운로드 전달 검증

검증일: 2026-10-18 UTC.

독립 실험판 최종 커밋: 79cbefa96852047eb14b7af68679c244c7633cf1.

- ZIP과 단일 HTML을 공개 raw.githubusercontent.com 주소에서 인증 없이 실제 다운로드했다. 둘 다 HTTP 200이며 로컬 패키지와 바이트 단위로 동일하다.
- ZIP: 1,972,287 bytes, 37개 파일, 압축 무결성 검사 통과.
- ZIP SHA256: e4ae22d0513e3bc8995a801a302ebff3382eb0236d1d2bb67e8e52cf4650a080
- HTML: 54,861 bytes.
- HTML SHA256: edff4eb3f6e087cbe0b052e44d36393712437eb980f765e9102a7da45b0df250

[ZIP 다운로드](https://raw.githubusercontent.com/Bellsier/gacha-factory-prototype/79cbefa96852047eb14b7af68679c244c7633cf1/experiments/chaegul-lab-v01/artifacts/chaegul-gongbang-lab-v0.1-project.zip)

[단일 HTML 다운로드](https://raw.githubusercontent.com/Bellsier/gacha-factory-prototype/79cbefa96852047eb14b7af68679c244c7633cf1/experiments/chaegul-lab-v01/artifacts/chaegul-gongbang-lab-v0.1-single.html)

## 원본 보호

이번 재개 시 main은 d31da0123c764bed55ee56ac9f3bb6dedb6a7b8b로 별도 갱신되어 있었다. 이 작업은 main과 PR #34를 수정하지 않고 codex/chaegul-lab-v01-20261017 브랜치만 갱신했다. PR #34 head는 d21fb3437d11b2d78fe552e2760520b3c9cc388b이다. 이전 TEST-REPORT.md의 main SHA는 이전 검증 시점의 값이다.

## 검증 범위

HTTP Chromium 플레이 검증 완료. file:// 실행은 관리 브라우저 정책으로 차단되어 미검증이다. Task 112 기능 및 저장 호환성을 검증했다고 주장하지 않는다. ZIP은 게시 전 고정된 패키지이며 이 전달 검증 문서는 저장소에 별도로 제공한다.
