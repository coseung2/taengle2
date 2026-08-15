# TAENGLE 사이트 구현 계획 (실데이터 기반)

> 2026-08-15. 목적: 디자인 시스템(v1.3)을 기반으로 실제 TAENGLE 사이트 구현. 목데이터 제거.

## 데이터 파이프라인

```
betman.co.kr (실데이터)
  └─ collector/betman_collect.py  ← JSON POST (inqCacheBuyAbleGameInfoList + gameInfoInq)
       └─ site/data/snapshots.json  ← 경기/실배당/상태 스냅샷
            └─ collector/merge_market.py ← 매칭(리그+시각+팀명 검증) 후 삭감률 계산
                 ↑ collector/market_collect.py ← The Odds API (ODDS_API_KEY env)
                 ↑ collector/team_map.json ← 베트맨 한글팀명 → API 영문팀명
            └─ site/app.js  ← 환수율·삭감률·no-vig 확률 렌더링
                 └─ GitHub Pages (site/ 자동 배포)
```

- 소스: 프로토 승부식(G101) 등 베트맨 판매중 게임 — 실배당 원본
- 수집: `python collector/collect_all.py` (베트맨 → 해외 → 병합 3단계)
  - 사전조건: `ODDS_API_KEY` 환경변수 (코드/출력에 키 비저장, 레포 퍼블릭)
- 산출 지표 (odds-domain 크레이트 로직과 동일):
  - 북메이커 마진(book%) = 1/승 + 1/무 + 1/패
  - 환수율 = 1 / book%
  - no-vig 공정확률 = (1/o) / book%
  - 삭감률(cut) = 1 − 베트맨배당 ÷ 해외 컨센서스 배당 (양수 = 베트맨이 더 낮음)
- 비교 대상: 베트맨 `승무패`(1X2)·`일반 승패`(머니라인)만. 승N패/핸디캡/언더오버/홀짝은 시장 h2h와 비교 불가로 제외.
- 매칭 규칙: 같은 리그 + 킥오프 ±20분 후보 중 `team_map.json`으로 홈/원정 양쪽 일치 확인(후보 1개면 시간만으로 허용). 미확인 시 미매칭 처리(오매칭 방지).
- 커버 리그: MLB·MLS·K리그1·EFL챔·에레디비·엘리테세(노르웨이)·라리가·코파리베·KBO·NPB·J1 (The Odds API 활성 종목 기준). K리그2·J2·슈퍼컵·친선 등 미커버.
- 주의: The Odds API는 미시작 경기만 반환 → 이미 시작된 경기는 매칭 0건이 정상. 물량: 리그당 regions 수 크레딧(eu,uk=2) → 1회 수집 22크레딧.

## 사이트 구조 (디자인 시스템 매핑)

| 섹션 | 디자인 시스템 컴포넌트 | 데이터 |
|---|---|---|
| 헤더 | SiteHeader 스타일 (brand + status + nav) | 회차·경기 수 실데이터 |
| 좌측 | TopLeagueCard (톱 리그, 접기 토글) | 실경기 리그 집계 |
| 좌측 | TeamRankingCard → 리그별 환수율 랭킹 | 실배당 계산값 |
| 중앙 | SectionCard + MatchScoreRow + OddsCell | 실경기 국내/해외 배당 + 셀별 삭감률 + 환수율 |
| 중앙 | PredictionCard (확률 바) | no-vig 공정확률 (파랑/노랑/빨강) |
| 우측 | CutRankCard + MetricCard + 데이터 상태 카드 | 삭감률 TOP + 실수집 지표 |

## 상태

- [x] 베트맨 실데이터 수집 검증 (26096회차, 686경기, 1X2 258건)
- [x] collector 구현 (`collector/betman_collect.py`)
- [x] site/ 실사이트 구현 (index.html + app.js, tokens.css 기반)
- [x] GitHub Pages 배포 워크플로 (site/ 자동)
- [x] 해외 컨센서스 연동 → 삭감률(CUT) 지표 (market_collect + team_map + merge_market)
- [x] 삭감률 UI (경기행 셀별 해외배당/삭감%, 삭감률 TOP, 지표 카드)
- [ ] 주기적 수집 (스케줄러/액션) (후속)
- [ ] K리그2·J2 등 미커버 리그 소스 보강 (후속)

## 알려진 제약

- G102 등 일부 게임은 세션/권한으로 JSON 거부 → 스킵 (v1은 G101 중심)
- 해외배당이 아직 노출되지 않은 리그/경기는 `해외 미매칭`으로 표시하며 삭감률을 계산하지 않음
