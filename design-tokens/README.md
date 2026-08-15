# TAENGLE Design System — tokens & components

Figma 원본: [TAENGLE Design System](https://www.figma.com/design/OcKhOxsU6zddMeRWlXFyYt) (`OcKhOxsU6zddMeRWlXFyYt`)

## 구조

```
design-tokens/
├── tokens.json          DTCG 포맷 토큰 (Figma 변수 78개, Light/Dark 모드)
├── tokens.css           CSS 커스텀 프로퍼티 (Light 기본 + .dark 테마 + 타이포 스케일)
├── components.md        컴포넌트 카탈로그 (27종 + 홈페이지 데모)
└── components/          컴포넌트 페이지 스크린샷 (Figma 캡처)
```

## 사용

```css
/* tokens.css 를 import 하면 */
.card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-12);
  padding: var(--spacing-13);
}

.dark .card { /* .dark 컨테이너/루트 아래에서는 자동으로 다크 값으로 해석 */ }
```

- 색상: 프리미티브(`--gray-500`, `--blue-500`, `--dark-950`...)는 직접 사용 금지 — 시맨틱(`--color-*`)만 사용
- 간격/라디우스: `--spacing-4..84`, `--radius-9/12/14/full`
- 타이포: `--font-*` (+ `-weight`, `-tracking`) — Inter 기반 22단계

## 규칙

- 카드 패딩 `spacing/13`, 리스트 행 패딩 `spacing/7`·`spacing/9`, pill 태그 `spacing/4`
- 모드 전환: `:root` = Light, `.dark` = Dark
- 토큰 변경 시 Figma에서 수정 후 `tokens.json`/`tokens.css` 재생성 필요 (아래)

## 재생성

1. Figma 변수 변경
2. `tokens.json` 갱신 (Figma → DTCG 내보내기)
3. `tokens.css` 재생성: `tokens.json`을 읽어 생성 (스크립트는 `docs/design-system.md` §10 참고)
