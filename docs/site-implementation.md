# TAENGLE 사이트 구현 계획 (실데이터 기반)

> 2026-08-15. 목적: 디자인 시스템(v1.3)을 기반으로 실제 TAENGLE 사이트 구현. 목데이터 제거.

## 데이터 파이프라인

```
betman.co.kr (실데이터)
  └─ collector/betman_collect.py  ← JSON POST (inqCacheBuyAbleGameInfoList + gameInfoInq)
       └─ site/data/snapshots.json  ← 경기/실배당(승/무/패)/상태 스냅샷
            └─ site/app.js  ← 환수율·no-vig 확률 계산 후 렌더링
                 └─ GitHub Pages (site/ 자동 배포)
```

- 소스: 프로토 승부식(G101) 등 베트맨 판매중 게임 — 실배당 원본
- 수집: `python collector/betman_collect.py` (쿠키 세션 + `_sbmInfo` JSON POST)
- 산출 지표 (odds-domain 크레이트 로직과 동일):
  - 북메이커 마진(book%) = 1/승 + 1/무 + 1/패
  - 환수율 = 1 / book%
  - no-vig 공정확률 = (1/o) / book%

## 사이트 구조 (디자인 시스템 매핑)

| 섹션 | 디자인 시스템 컴포넌트 | 데이터 |
|---|---|---|
| 헤더 | SiteHeader 스타일 (brand + status + nav) | 회차·경기 수 실데이터 |
| 좌측 | TopLeagueCard (톱 리그, 접기 토글) | 실경기 리그 집계 |
| 좌측 | TeamRankingCard → 리그별 환수율 랭킹 | 실배당 계산값 |
| 중앙 | SectionCard + MatchScoreRow + OddsCell | 실경기 1X2 실배당 + 환수율 pill |
| 중앙 | PredictionCard (확률 바) | no-vig 공정확률 (파랑/노랑/빨강) |
| 우측 | MetricCard + 데이터 상태 카드 | 실수집 지표 |

## 상태

- [x] 베트맨 실데이터 수집 검증 (26096회차, 686경기, 1X2 258건)
- [x] collector 구현 (`collector/betman_collect.py`)
- [x] site/ 실사이트 구현 (index.html + app.js, tokens.css 기반)
- [x] GitHub Pages 배포 워크플로 (site/ 자동)
- [ ] 해외 컨센서스 연동 → 삭감률(CUT) 지표 활성화 (후속)
- [ ] 주기적 수집 (스케줄러/액션) (후속)

## 알려진 제약

- G102 등 일부 게임은 세션/권한으로 JSON 거부 → 스킵 (v1은 G101 중심)
- "베트맨 vs 시장" 삭감률은 해외 오즈 소스(The Odds API 등) 연동 후 가능 — 현재는 베트맨 실배당 + 파생 지표 표시
