# TAENGLE product plan

## Product statement

TAENGLE is a private sports-odds intelligence app. It compares Betman with overseas market references only when the event, market, line and settlement rules match, then exposes relative cut rate in a fast mobile-first interface.

The visual direction takes inspiration from 4590fb.com's dense, scan-first sports information layout: users should land directly on today's actionable match list instead of a marketing-heavy home page. TAENGLE does not copy its branding or page structure.

## MVP

### Home
- Today's matches ordered by lowest Betman cut rate.
- Sport and league filters.
- Betman price, market benchmark and relative cut percentage visible without opening detail.
- Data freshness and demo/live status always visible.

### Match detail
- Same-market bookmaker comparison table.
- Consensus no-vig fair odds.
- Snapshot history chart.

### Ranking
- Lowest-cut matches today.
- Highest-cut matches today.
- League-level average cut rate.

## Comparison set

Start with a small set of references with distinct roles rather than dozens of nearly identical books:

- Betman: local comparison target.
- Pinnacle: sharp-book benchmark.
- Betfair Exchange: exchange reference; keep commission-aware metrics separate from standard bookmaker markets.
- SBOBET or SingBet: Asian-market reference.
- bet365: mainstream global bookmaker.
- Unibet: mainstream European bookmaker.

The implementation should support adding/removing providers without changing domain calculations.

## Normalization rules

Never compare prices unless all keys match:

1. sport
2. competition
3. normalized participants
4. scheduled start time within provider tolerance
5. market type
6. period (full game / first half / etc.)
7. line value for spread or totals
8. overtime / extra-time settlement rule
9. snapshot time window

Provider-specific names must map to canonical IDs before calculations run.

## Core metrics

For decimal odds `o_i`:

- implied probability: `1 / o_i`
- book percentage: `sum(1 / o_i)`
- overround: `book percentage - 1`
- proportional no-vig probability: `(1 / o_i) / book percentage`
- fair odds: `1 / no-vig probability`
- relative cut rate: `1 - local_odds / benchmark_odds`

Do not label the cut rate as bookmaker margin. Margin and relative price discount are separate metrics.

## Data model

Suggested first storage model:

```text
sports
competitions
teams
providers
events
markets
market_outcomes
odds_snapshots
provider_event_mappings
provider_market_mappings
```

Every odds snapshot should store provider, normalized event/market/outcome IDs, observed decimal odds, provider timestamp when available, ingestion timestamp and source metadata.

## Architecture

```text
Provider collectors / APIs
        |
        v
Normalization + matching
        |
        v
PostgreSQL snapshots
        |
        +--> consensus / no-vig engine (Rust domain crate)
        |
        v
TAENGLE API
        |
        +--> Dioxus Web
        +--> Dioxus Android
        +--> Dioxus iOS
```

The first repository version intentionally keeps UI and domain logic only. Provider integrations and persistence come next so fake data is never mistaken for production data.

## Delivery phases

### Phase 1 - app shell
- Dioxus workspace.
- Responsive mobile-first home.
- Platform-independent odds-domain crate and tests.
- Demo-data badge.

### Phase 2 - ingestion foundation
- PostgreSQL schema and migrations.
- Provider adapter trait.
- First overseas odds provider.
- Betman ingestion prototype.
- Canonical event matcher.

### Phase 3 - real comparison
- Consensus calculation.
- Match detail page.
- Snapshot history.
- Data freshness and provider coverage UI.

### Phase 4 - mobile
- Android/iOS packaging.
- Native notifications only for app status/data refresh features that are useful to the private group.
- Shared domain and API contracts remain unchanged.

## Non-goals for early versions

- bookmaker affiliate links
- account creation at overseas betting sites
- bet placement or bet-slip handoff
- prediction/tip-selling features
- comparing mismatched lines merely because teams are the same
