# 추첨 도구 모음 — roulette.milomiso.com

돌림판 · 사다리타기 · 제비뽑기를 제공하는 한국어 무료 추첨 사이트.
바닐라 HTML/CSS/JS, 빌드 없음, GitHub Pages 배포.

## 구조

```
index.html      돌림판 (가중치 비례 부채꼴, 당첨자 제외 재추첨)
ladder.html     사다리타기 (2~20명, 경로 애니메이션, 결과 문구 커스텀)
lots.html       제비뽑기 (순서제 카드 뒤집기, 당첨 개수 설정)
css/style.css   디자인 토큰(라이트/다크) + 전체 컴포넌트
js/theme.js     테마 결정 — <head>에서 블로킹 로드 (FOUC 방지)
js/storage.js   데이터 계층 — localStorage 전담 (참가자·기록·설정)
js/ui.js        공유 UI — 참가자 패널, 기록 패널, 토스트
js/roulette.js  js/ladder.js  js/lots.js   각 도구 로직
```

- 참가자 명단은 세 도구가 localStorage(`rp.v1.*`)로 공유한다.
- localStorage 접근은 반드시 `storage.js`(`window.Store`)를 통해서만.
- 캔버스는 CSS 변수를 직접 못 읽으므로 그리기 시점에 `getComputedStyle`로
  토큰을 읽고, 테마 토글 시 다시 그린다.
- 돌림판은 당첨자를 먼저 추첨한 뒤 그 위치로 회전한다 (각도 역산 아님).

## 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## 배포

`main` 브랜치에 푸시하면 GitHub Pages가 자동 배포한다.
`CNAME`(roulette.milomiso.com)은 삭제하면 도메인이 끊기므로 주의.
배포 후 최대 10분 캐시(`max-age=600`)가 남을 수 있다.
