# TAENGLE Design System — Figma v1 스펙

> 출처: `apps/taengle/assets/main.css` + `apps/taengle/src/main.rs` (2026-08-15, main `27a5a12`).
> 목적: Figma 디자인 시스템 빌드의 Phase 0(Discovery) 산출물. 코드가 단일 다크 테마이므로 v1은 Dark 1모드.

## 1. 토큰 인벤토리 (코드 원본 값)

### Color — Dark (단일 모드)

| 의미 | 코드 값 | 제안 CSS 이름 |
|---|---|---|
| 페이지 배경 | `#090b10` | `--color-bg-base` |
| 배경 그라데이션 상단 | `#171b25` | `--color-bg-base-top` |
| 상단바 배경 | `rgba(9,11,16,.94)` | `--color-bg-topbar` |
| 하단 내비 배경 | `rgba(10,12,17,.96)` | `--color-bg-nav` |
| 경기 행 배경 | `rgba(14,17,24,.62)` | `--color-bg-row` |
| 카드 배경(elevated) | `#121722` | `--color-bg-elevated` |
| 탭 배경 | `#11151d` | `--color-bg-tab` |
| 셀 배경 | `#111620` | `--color-bg-cell` |
| 텍스트 1차 | `#f5f7fb` | `--color-text-primary` |
| 텍스트 2차 | `#8f9aaa` / `#8993a2` / `#7e8999` / `#7f8997` / `#929bab` / `#aab4c4` | `--color-text-secondary` |
| 텍스트 3차 | `#555f6f` / `#727d8e` / `#707989` | `--color-text-tertiary` |
| 브랜드(강조) | `#7d8cff` | `--color-accent-blue` |
| 성공(good) | `#56dc91`(dot) / `#57da90`(gap) | `--color-success` |
| 경고(warn) | `#f1c75b` | `--color-warning` |
| 위험(bad) | `#ff7373` | `--color-danger` |
| 보더(경계) | `#232936` / `#242c3a` / `#202633` / `#202938` / `#252b37` / `#232a37` | `--color-border-default` |

> ⚠ 코드 내부 충돌: success 계열이 `#56dc91`(상태 점)과 `#57da90`(삭감률 good) 두 값으로 갈라져 있음. v1에서 하나로 통일할지 결정 필요(권장: `#56dc91`).
> text-secondary/tertiary/border는 각각 여러 근사값이 혼재 — v1에서 대표값으로 정규화(아래 표 참고).

### 정규화 제안 (v1)

| 시맨틱 토큰 | 대표값 | 근거 |
|---|---|---|
| `color/text/secondary` | `#8f9aaa` | status·meta에서 가장 빈번 |
| `color/text/tertiary` | `#707989` | nav·odds label 계열 중간값 |
| `color/border/default` | `#242c3a` | 카드·탭 보더 |
| `color/border/strong` | `#202633` | 리스트 구분선 계열 |

### Typography

| 스타일 | size | weight | line-height | letter-spacing | 비고 |
|---|---|---|---|---|---|
| Display (h1) | 29px → 38px(≥720px) | 400 | 1.16 | -0.04em | |
| Eyebrow | 11px | 800 | — | 0.13em | |
| Body/hero copy | 14px | 400 | 1.5 | — | |
| Brand | 16px(기본) | 900 | — | 0.12em | 크기 미지정→브라우저 기본 |
| Section title | 17px | 700(가정) | — | — | `h2` 기본값 |
| Metric value | 15px | 400(기본) | — | — | |
| Metric label | 10px | 400 | — | — | |
| Tab label | ~13px(UA 기본) | 700 | — | — | CSS 미지정, v1에서 13px 명시 권장 |
| Status | 11px | 400 | — | — | |
| Match meta | 11px | 400 | — | — | |
| League | 11px | 800 | — | — | |
| Teams | 16px(기본) | 400 | — | — | |
| Vs | 10px | 400 | — | — | |
| Odds label | 9px | 800 | — | — | |
| Odds value | 13px | 400 | — | — | |
| Nav label | 12px | 700 | — | — | |

폰트: Inter (+ ui-sans-serif fallback 스택)

### Spacing / Radius / Effect

- Spacing(FLOAT): 7, 8, 9, 10, 11, 13, 15, 18, 26, 58(topbar h), 66(nav h), 84
- Radius: 9(셀), 12(카드), 14(데스크톱 경기 행), 999(탭 pill)
- Effect 스타일: `status-dot glow` = 0 0 14px `#56dc91`
- (Figma 표현 불가 — 기록만) backdrop blur 16/18px, radial gradient 배경

## 2. 컴포넌트 인벤토리 (v1)

| 컴포넌트 | 변형 축 | 비고 |
|---|---|---|
| `TopBar` | — | brand + StatusBadge |
| `StatusBadge` | Status=Demo/Live | dot + label |
| `Hero` | — | eyebrow + title + copy + metrics |
| `MetricCard` | — | label + value |
| `LeagueTab` | State=Default/Active | pill |
| `SectionHeading` | — | title + meta |
| `MatchRow` | (Layout=Mobile/Desktop) | meta + teams + 3 cells |
| `OddsCell` | Label=Betman/Market/Cut | label + value |
| `GapBadge` | Tone=Good/Warn/Bad | color-only v1 |
| `BottomNav` | Item=홈/리그/랭킹/설정, State=Default/Active | 4 slots |

## 3. Figma 아키텍처 계획

- 컬렉션: `Primitives`(1모드) / `Color`(Dark 1모드, 시맨틱=프리미티브 별칭) / `Spacing` / `Radius` (FLOAT) / Typography는 Text Style
- 변수 스코프: 배경 `FRAME_FILL,SHAPE_FILL` / 텍스트 `TEXT_FILL` / 보더 `STROKE_COLOR` / 간격 `GAP` / 라디우스 `CORNER_RADIUS` / 프리미티브 `[]`
- WEB code syntax: 위 제안 `var(--color-*)` 이름 사용
- 페이지: Cover → Getting Started → Foundations(Color/Type/Spacing/Radius) → --- → Components(컴포넌트별 1페이지) → --- → Utilities
- v1 제외: Light 모드, 아이콘 세트, motion/animation 토큰, breakpoint 토큰(문서화만)

## 4. 진행 상태

- [x] Phase 0: Discovery — Figma 파일 [TAENGLE Design System](https://www.figma.com/design/OcKhOxsU6zddMeRWlXFyYt) 생성 (`OcKhOxsU6zddMeRWlXFyYt`)
- [x] Phase 1: Foundations — 컬렉션 4개(Primitives 33 / Color 17 Light·Dark / Spacing 12 / Radius 4), 텍스트 스타일 17, 이펙트 1, code syntax·스코프 전부 설정
- [x] Phase 2: 파일 구조 — Cover / Getting Started / Foundations / --- / Utilities, 스와치 50·타이포 17·스페이싱 12·라디우스 4·glow 문서화
- [x] Phase 3: 컴포넌트 10종 — StatusBadge(2), OddsCell(3), GapBadge(3), LeagueTab(2), MetricCard, SectionHeading, TopBar, Hero, MatchRow(2), BottomNav(8)
- [x] Phase 4: QA — 하드코딩 fill 0건, 미명명 0건, 변형별 라벨 복구, 스크린샷 검증

## 5. 라이트 모드 팔레트 (디자인 제안 — 코드 미반영)

| 시맨틱 토큰 | Light 값 | 근거 |
|---|---|---|
| `color/bg/base` | `#f4f6fb` | 코드의 Active 탭 배경(역상 근거) |
| `color/bg/base-top` | `#ffffff` | 라이트 그라데이션 상단 |
| `color/bg/topbar` | `rgba(255,255,255,.94)` | 다크 `rgba(9,11,16,.94)` 대응 |
| `color/bg/nav` | `rgba(255,255,255,.96)` | 다크 대응 |
| `color/bg/row` | `rgba(255,255,255,.62)` | 다크 대응 |
| `color/bg/elevated` · `tab` · `cell` | `#ffffff` | 카드/탭/셀 |
| `color/text/primary` | `#090b10` | 코드의 Active 탭 텍스트(역상 근거) |
| `color/text/secondary` | `#5f6a7c` | 다크 `#8f9aaa` 대응 |
| `color/text/tertiary` | `#8a94a4` | 대비 약화 (감사: 소형 텍스트 AA 미달 가능성) |
| `color/accent/blue` | `#5b6cff` | 대비 강화 (11px eyebrow AA 확보 목적) |
| `color/status/success` · `warning` · `danger` | `#1f9d62` / `#a16207` / `#d64545` | 대비 강화 |
| `color/border/default` · `strong` | `#d7dce7` / `#c2c9d8` | 라이트 보더 |

> 후속 작업: 위 라이트 값의 CSS 변수 구현(`main.css`에 Light 모드 추가), Figma 라이브러리 퍼블리시 후 Code Connect 매핑(MatchRow→`apps/taengle/src/main.rs`), 라이트 대비 재검토(tertiary/accent-blue).

## 6. v1.1 — FOOTBALL 4590 레퍼런스 재정립 (2026-08-15)

### 레퍼런스 분석 (스크린샷 픽셀 추출)

| 역할 | 추출값 | 토큰 |
|---|---|---|
| 페이지 배경 | `#f8f9fa` | `gray/50` |
| 카드/헤더 배경 | `#ffffff` | `white` |
| 텍스트(네이비) | `#1a2233` | `gray/900` |
| 보더 | `#e5e7eb` | `gray/200` |
| 주 액션 블루 | `#2f6bf0` | `blue/500` |
| 블루 hover/태그 | `#1e55d8` | `blue/600` |
| 별/핫/오렌지 | `#f5a623` | `amber/500` |
| 오렌지 텍스트 | `#d97706` | `amber/600` |
| 확률바 레드 | `#ef3050` | `red/500` |
| 라이트 블루 틴트 | `#eef3ff` | `blue/50` |

### 변경 사항

- 프리미티브 재정렬: `gray/*` = 라이트 스케일, 기존 다크 그레이 → `dark/*` (앨리어스는 ID 기반이라 자동 반영)
- Color 시맨틱 Light 모드를 레퍼런스 값으로 재앨리어싱, Dark 모드 유지
- 타이포 추가 5종: `typography/logo`(22 Black), `nav`(14 Bold), `card-title`(14 Bold), `team`(14 Bold), `score`(18 Bold) — 총 22종
- 전 페이지 데모 캔버스 Light 전환 (라이트 퍼스트)
- 신규 컴포넌트 8종:
  - `PrimaryButton` (State=Default/Hover/Pressed/Disabled)
  - `SearchField` (라운드 검색창)
  - `TopNavItem` (State=Default/Active)
  - `LeagueNavItem` (Star=Off/On, 별 아이콘 SVG)
  - `MatchScoreRow` (State=Finished/Live, 대회 태그+스코어+상태 배지)
  - `PredictionCard` (리그 태그+분석 제목+팀+홈/무/원정 확률 바)
  - `PostListItem` (순위+제목+메타)
  - `RankingTab` (State=Default/Active)

### 알려진 한계

- `MatchScoreRow` Live 배지: 빨간 텍스트 10px가 틴트 배경 위에서 대비 낮음 — 후속 대비 조정 권장
- 확률 바 세그먼트 폭은 토큰이 아닌 고정값(값 비례 수동 조정)
- 오렌지 링크("실시간 전체 경기 보기")는 `amber/500` + TEXT로 조합 가능

## 7. v1.2 — 복합 컴포넌트 + 홈페이지 데모 (2026-08-15)

### 복합 컴포넌트 9종 (하위 컴포넌트 인스턴스 조합)

| 컴포넌트 | 구성 | 비고 |
|---|---|---|
| `SectionCard` | 타이틀 + 우측 링크 | 모든 패널 헤더의 기본 |
| `NavBar` | TopNavItem × 9 | 전체/인기=Active |
| `SiteHeader` | 로고 + 로그인/회원가입 + NavBar + SearchField | |
| `RecentVisitStrip` | 최근방문 팀 + × | |
| `TopLeagueCard` | 헤더 + LeagueNavItem × 6 + 모든 리그 | |
| `GuideCard` | 파란 안내 패널 (아이콘+텍스트+화살표) | |
| `TeamRankingCard` | 헤더 + RankingTab × 6 + 순위 행 × 3 | |
| `ShortcutRow` | 바로가기 타일 × 4 | |
| `PopularPostsCard` | 헤더 + 탭 4 + PostListItem × 5 | |

### Homepage Demo

`Homepage Demo` 페이지: SiteHeader + 3열 레이아웃(좌: 톱리그/가이드/팀순위, 중앙: 빅매치/숏컷/예측 2×2, 우: 인기글)을 전부 인스턴스로 조립 — 레퍼런스 스크린샷과 동일한 구성.

### 노트

- COMPONENT_SET에는 `createInstance()` 불가 → `children[0].createInstance()` 사용 (v1.2에서 확인)
- 컬럼 등 컨테이너는 `resize(260, 1)` 후 `primaryAxisSizingMode='AUTO'`로 HUG 전환 필수 (FIXED 1px 잠금 버그)

## 8. v1.2.1 — 피드백 수정 (2026-08-15)

- `ShortcutRow`: HORIZONTAL 레이아웃에서 `primaryAxisSizingMode='AUTO'`가 가로 축을 HUG로 만들어 타일이 17.5px로 붕괴하던 버그 수정 → 가로 `FIXED 560`, 세로 `AUTO`. 타일 132.5px × 4.
- `GuideCard`: 텍스트 `>` 제거 → **Lucide chevron-right** SVG(16×16, stroke `white` 변수 바인딩)로 교체.
- `TopLeagueCard`: "톱 리그" 제목(좌) + "모든 리그 ▾" 펼치기 토글(우)를 헤더 행에 space-between 정렬. 하단 중복 토글 제거.

## 9. v1.2.2 — 전수조사 정렬/여백 수정 (2026-08-15)

27개 컴포넌트 지오메트리 전수조사 결과 수정:

- `spacing/4` 토큰 추가 (GAP, `var(--spacing-4)`) — 기존 4px fallback이 `spacing/7`로 대체되던 문제 해소
- `OddsCell`: 변형 3종 `FIXED 116px` (기존 87/87/67 콘텐츠 폭 붕괴 — HORIZONTAL에서 `primaryAxisSizingMode='AUTO'` 사용 금지, `counterAxisSizingMode='AUTO'` 사용)
- `StatusBadge`: Live를 Demo와 동일 78px 고정, 그리드 균등 (0/98)
- `MatchScoreRow`: 변형 2종 `FIXED 420px`, 그리드 균등 (0/460); Live 배지를 레드 솔리드 + 흰 텍스트로 강화
- `TopLeagueCard`: 좌우 패딩 7→13 (카드 일관성), 헤더 행 하단 간격 4, 아이템 간격 4, 리그 행 FILL 정렬
- `PopularPostsCard`: 글 행 FILL 정렬
- `NavBar`: gap 2→4 (토큰 적용)
- `MatchScoreRow`/`PredictionCard` 태그 pill: 상하 패딩 7→4

기준: 카드 패딩 13, 리스트 행 패딩 7/9, pill 태그 패딩 4, 컴포넌트 세트 페이지 시작점 (60,109) 전 페이지 동일 확인.

## 10. v1.3 — 저장소 정립 (다운로드, 2026-08-15)

Figma에서 디자인 시스템을 내려받아 저장소 `design-tokens/`로 정식 확립:

- `tokens.json` — DTCG 포맷, 변수 78개 (Primitives 44 / Color 17 Light·Dark / Spacing 13 / Radius 4), 스코프·code syntax 포함
- `tokens.css` — `:root`(Light) + `.dark`(Dark) 시맨틱 CSS 변수 + 프리미티브 + `--font-*` 타이포 22단계
- `components/` — 컴포넌트 페이지 스크린샷 28장 (27종 + Homepage Demo)
- `components.md` — 컴포넌트 카탈로그, `README.md` — 사용법/재생성 가이드

재생성: Figma 변수 변경 → `tokens.json` 갱신 → `tokens.css`는 `tokens.json`에서 생성(스크립트 재실행).
