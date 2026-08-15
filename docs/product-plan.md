# TAENGLE 제품 계획

## 1. 목적

TAENGLE은 베트맨 배당을 해외 시장의 동일 이벤트·동일 마켓과 비교해 다음 질문에 빠르게 답하는 비공개 데이터 앱이다.

- 현재 베트맨의 이론 환수율은 얼마인가?
- 해외 시장 컨센서스 대비 특정 선택지 배당이 얼마나 낮은가?
- 오늘 발매 경기 중 상대적으로 삭감이 적은 경기는 무엇인가?
- 배당이 시간에 따라 어떻게 움직였는가?

해외 사이트로 사용자를 보내거나 베팅을 실행하는 기능은 범위에 포함하지 않는다.

## 2. UI 방향

레퍼런스인 4590fb.com에서 가져오는 것은 브랜드나 화면 복제가 아니라 다음 사용성 원칙이다.

1. 첫 화면에서 오늘 경기로 바로 진입한다.
2. 한 화면에 많은 경기 정보를 넣되 숫자 위계를 강하게 둔다.
3. 모바일에서 엄지손가락으로 리그 전환과 주요 메뉴 이동이 빠르다.
4. 상태, 시간, 배당을 카드 안에서 즉시 스캔할 수 있다.
5. 상세 분석은 한 단계 아래로 보내고 홈은 랭킹과 이상치 발견에 집중한다.

## 3. 첫 비교군

초기 데이터 모델은 공급자를 고정하지 않지만 제품에서 우선 다룰 비교군은 아래와 같다.

- Betman: 국내 비교 대상
- Pinnacle: 기준 가격 후보
- Betfair Exchange: 시장 가격 참고
- SBOBET: 아시아 시장 참고
- bet365: 대중형 글로벌 북
- Unibet: 유럽 대중형 북

해외 컨센서스는 단순 평균이 아니라 각 공급자의 마진을 제거한 확률을 집계하는 방식으로 발전시킨다.

## 4. MVP 범위

### Phase 0 — 이번 PR

- Dioxus Web/Mobile 공용 앱 셸
- 모바일 우선 홈
- 데모 경기 카드
- 배당 계산 도메인 크레이트
- CI

### Phase 1 — 실제 데이터

- Betman 수집 어댑터
- 해외 odds provider 어댑터
- PostgreSQL 스키마
- 이벤트/마켓 정규화
- 현재 배당 API
- 데이터 수집 상태 표시

### Phase 2 — 비교 엔진

- 공급자별 overround
- payout rate
- no-vig 확률
- consensus fair odds
- Betman cut rate
- 데이터 커버리지 confidence

### Phase 3 — 히스토리

- odds snapshot 저장
- 오픈/현재/마감 배당
- 시간별 차트
- 해외 변동 대비 Betman 반영 지연 분석

### Phase 4 — 앱

- Android/iOS 패키징
- 즐겨찾는 리그/경기
- 자체 서버의 데이터 갱신 알림
- 오프라인 캐시

## 5. 이벤트와 마켓 매칭 규칙

배당 비교는 다음 키가 모두 호환되는 경우에만 수행한다.

```text
sport
league
home participant
away participant
start_at
market_type
period
line
settlement_rule
```

`start_at`은 공급자별 시간 오차를 허용한 후보 검색에 사용하되 최종 매칭은 참가자와 리그까지 확인한다.

핸디캡/오버언더는 line 값이 동일하지 않으면 같은 마켓으로 취급하지 않는다. 연장 포함 여부나 정규시간 여부가 다르면 settlement rule이 다른 별도 마켓이다.

## 6. 핵심 지표

### Book percentage

```text
sum(1 / decimal_odds)
```

### Overround

```text
book_percentage - 1
```

### Payout rate

```text
1 / book_percentage
```

### Proportional no-vig probability

```text
raw_probability / book_percentage
```

### Cut rate

```text
1 - betman_odds / reference_odds
```

양수일수록 베트맨 배당이 기준 배당보다 낮다. UI에서는 사용자가 바로 읽을 수 있도록 부호/색상 정책을 한 번 더 정의한다.

## 7. 데이터 모델 초안

```text
sports
leagues
participants
events
providers
markets
selections
odds_snapshots
provider_event_mappings
```

`odds_snapshots`는 최소한 아래 필드를 가진다.

```text
id
provider_id
market_id
selection_id
decimal_odds
captured_at
source_updated_at
```

원본 공급자 식별자와 원본 line/market name도 보존해 정규화 오류를 추적할 수 있게 한다.

## 8. 코드 구조

```text
apps/taengle
  Dioxus UI와 플랫폼 진입점

crates/odds-domain
  배당 타입과 계산 규칙

향후:
crates/odds-ingest
crates/odds-normalize
crates/odds-storage
services/api
```

도메인 크레이트는 UI, DB, 네트워크에 의존하지 않는다. 이 규칙을 유지하면 Web에서 검증한 계산 로직을 Android/iOS에서도 같은 바이너리 코드로 재사용할 수 있다.

## 9. 다음 PR 추천 범위

`feat: add normalized event and odds storage`

- SQLx/PostgreSQL 도입
- 이벤트/마켓/스냅샷 migration
- provider trait
- fake provider + fixture
- 현재 홈 화면을 fixture API와 연결
- 수집 freshness 표시
