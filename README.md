# TAENGLE

베트맨 배당과 해외 시장 컨센서스를 같은 경기·같은 마켓 기준으로 비교해, 환수율과 배당 삭감률을 보여주는 비공개 스포츠 데이터 앱입니다.

## 현재 상태

첫 번째 앱 셸이 `main`에 들어가 있습니다.

- Dioxus 기반 Web / Desktop / Mobile 공용 앱 구조
- 모바일 우선 오늘 경기 홈
- Betman / Market / Cut 지표를 바로 비교하는 경기 행
- `DecimalOdds`, 3-way market, 환수율, 오버라운드, no-vig, 삭감률 계산을 담은 독립 Rust 도메인 크레이트
- 도메인 테스트와 GitHub Actions CI
- 데이터 수집과 정규화 방향을 정리한 제품 설계 문서

화면에 표시되는 경기와 수치는 현재 **DEMO DATA**입니다.

## 구조

```text
Rust 2024
├── apps/taengle            Dioxus 앱 (Web / Desktop / Mobile)
├── crates/odds-domain      플랫폼 독립 배당 계산 로직
└── docs/product-plan.md    MVP / 비교군 / 정규화 / 데이터 모델
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
- **Payout rate**: `1 / book percentage`
- **Fair odds**: 마진을 비례 제거한 no-vig 배당
- **Cut rate**: `1 - 베트맨 배당 / 해외 기준 배당`

`Cut rate`는 북메이커 자체 마진과 다른 지표이므로 UI에서도 별도로 표시합니다.

다음 단계의 데이터 공급원, 이벤트 매칭 키, 저장 모델과 모바일 확장 계획은 [`docs/product-plan.md`](docs/product-plan.md)에 있습니다.
