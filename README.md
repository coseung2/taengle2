# TAENGLE

베트맨 배당과 해외 시장 컨센서스를 같은 경기·같은 마켓 기준으로 비교해, 배당 삭감률을 보여주는 스포츠 데이터 앱입니다.

## 현재 상태

첫 번째 앱 셸이 `main`에 들어가 있습니다.

- Dioxus 기반 Web / Desktop / Mobile 공용 앱 구조
- 모바일 우선 오늘 경기 홈
- Betman / Market / Cut 지표를 바로 비교하는 경기 행
- `DecimalOdds`, 3-way market, 오버라운드, no-vig, 삭감률 계산을 담은 독립 Rust 도메인 크레이트
- 도메인 테스트와 GitHub Actions CI
- 데이터 수집과 정규화 방향을 정리한 제품 설계 문서

Rust/Dioxus 앱 셸의 기본 화면은 도메인 데모를 포함하고, 실제 공개 웹 사이트는 `site/`에서 Betman과 The Odds API 실수집 데이터를 사용합니다.

## 공개 웹 사이트

[TAENGLE GitHub Pages](https://coseung2.github.io/taengle2/)

수집기를 실행하려면 The Odds API 키를 환경변수로 주입합니다. 키는 공개 저장소에 저장하지 않습니다.

```bash
set ODDS_API_KEYS=account1-key,account2-key
python collector/collect_all.py
```

공개 수집은 두 계정 키를 `ODDS_API_KEYS`에 쉼표로 넣어 사용하며, 키는 GitHub Actions secret으로만 저장합니다. 11개 종목을 두 계정에 번갈아 배분하고 월 44회 실행해 계정당 약 484크레딧을 사용합니다.

파이프라인은 베트맨 실배당 수집 → 해외 `h2h`·`totals` 컨센서스 수집 → 팀명·킥오프·기준점 검증 병합 → 삭감률 계산 순서로 동작합니다. `승무패`·`일반 승패`는 h2h, `일반 언더오버`는 같은 기준점의 totals와 비교하며 핸디캡·홀짝은 별도 마켓이라 제외합니다. 상세 구현은 [`docs/site-implementation.md`](docs/site-implementation.md)를 참고하세요.

## 구조

```text
Rust 2024
├── apps/taengle            Dioxus 앱 (Web / Desktop / Mobile)
├── crates/odds-domain      플랫폼 독립 배당 계산 로직
├── docs/product-plan.md    MVP / 비교군 / 정규화 / 데이터 모델
└── worker/                 Cloudflare Worker + D1 개인 계정/관측 API
```

## 실행

Rust와 Dioxus CLI를 준비합니다.

```bash
rustup target add wasm32-unknown-unknown
cargo install dioxus-cli --locked
```

웹 개발 서버:

```bash
cd apps/taengle
dx serve --platform web
```

모바일 툴체인이 설정된 환경에서는 같은 앱 크레이트를 Android/iOS 대상으로 실행합니다.

```bash
dx serve --platform android
# macOS + Xcode
dx serve --platform ios
```

## 검사

```bash
cargo fmt --all -- --check
cargo test -p taengle-odds-domain
cargo clippy -p taengle-odds-domain --all-targets -- -D warnings
cargo check -p taengle --target wasm32-unknown-unknown --no-default-features --features web
```

## 지표 정의

- **Book percentage**: 각 결과의 암시확률 합
- **Overround**: `book percentage - 1`
- **Fair odds**: 마진을 비례 제거한 no-vig 배당
- **Cut rate**: `1 - 베트맨 배당 / 해외 기준 배당`

`Cut rate`는 북메이커 자체 마진과 다른 지표이므로 UI에서도 별도로 표시합니다.

다음 단계의 데이터 공급원, 이벤트 매칭 키, 저장 모델과 모바일 확장 계획은 [`docs/product-plan.md`](docs/product-plan.md)에 있습니다.
