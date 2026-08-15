# TAENGLE

베트맨 배당과 해외 시장 컨센서스를 같은 경기·같은 마켓 기준으로 비교해 환수율과 배당 삭감률을 보여주는 비공개 스포츠 데이터 앱입니다.

첫 구현은 Dioxus 기반의 Web / Desktop / Mobile 공용 앱 셸과 플랫폼 독립 Rust 도메인 크레이트로 시작합니다.

## 현재 포함된 것

- 4590fb.com의 높은 정보 밀도와 빠른 경기 진입 방식을 참고한 모바일 우선 홈
- 오늘 경기 / 리그 필터 / BETMAN·MARKET·CUT 비교 UI
- 실제 데이터와 혼동하지 않도록 명시한 DEMO 상태
- `DecimalOdds`, 3-way market, payout, overround, cut rate 계산 로직
- 도메인 단위 테스트
- Web 대상 cargo check를 포함한 GitHub Actions CI
- 실제 데이터 수집과 앱 확장 계획 문서

## 구조

```text
taengle2/
├── apps/taengle             Dioxus 앱
├── crates/odds-domain       플랫폼 독립 배당 계산
├── docs/product-plan.md     제품·데이터 설계
└── .github/workflows/ci.yml
```

## 로컬 웹 실행

Dioxus 최신 0.7 계열 CLI와 Rust stable이 필요합니다.

```bash
rustup target add wasm32-unknown-unknown
cargo install dioxus-cli --version 0.7.10 --locked
cd apps/taengle
dx serve --platform web
```

## 기본 검사

```bash
cargo fmt --all -- --check
cargo test -p taengle-odds-domain
cargo clippy -p taengle-odds-domain --all-targets -- -D warnings
cargo check -p taengle --target wasm32-unknown-unknown --no-default-features --features web
```

## 제품 원칙

1. 같은 이벤트·같은 마켓·같은 라인만 비교합니다.
2. 조회 시각과 데이터 freshness를 함께 보여줍니다.
3. 시장 평균과 no-vig 기준 가격을 구분합니다.
4. 실제 수집 데이터가 아닌 숫자는 `DEMO`로 명확히 표시합니다.
5. 해외 사이트 이동·가입·베팅 실행 기능은 제품 범위에 넣지 않습니다.

다음 구현 범위는 [`docs/product-plan.md`](docs/product-plan.md)에 정리되어 있습니다.
