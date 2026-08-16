use dioxus::prelude::*;
use taengle_odds_domain::{cut_rate, DecimalOdds, ThreeWayMarket};

const MAIN_CSS: Asset = asset!("/assets/main.css");

#[derive(Clone, Copy, PartialEq)]
struct MatchCard {
    league: &'static str,
    time: &'static str,
    home: &'static str,
    away: &'static str,
    betman: f64,
    market: f64,
}

const MATCHES: [MatchCard; 4] = [
    MatchCard { league: "EPL", time: "22:00", home: "Arsenal", away: "Chelsea", betman: 1.82, market: 1.93 },
    MatchCard { league: "LaLiga", time: "23:15", home: "Real Madrid", away: "Valencia", betman: 1.71, market: 1.77 },
    MatchCard { league: "K League", time: "19:00", home: "Seoul", away: "Ulsan", betman: 2.34, market: 2.41 },
    MatchCard { league: "Serie A", time: "03:45", home: "Inter", away: "Roma", betman: 1.95, market: 2.08 },
];

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    let demo_market = ThreeWayMarket {
        home: DecimalOdds::new(1.82).unwrap(),
        draw: DecimalOdds::new(3.55).unwrap(),
        away: DecimalOdds::new(4.20).unwrap(),
    };
    let payout = demo_market.payout_rate() * 100.0;

    rsx! {
        document::Link { rel: "stylesheet", href: MAIN_CSS }
        div { class: "app-shell",
            header { class: "topbar",
                div { class: "brand", "TAENGLE" }
                div { class: "status", span { class: "status-dot" } "DEMO DATA" }
            }
            main {
                section { class: "hero",
                    p { class: "eyebrow", "ODDS INTELLIGENCE" }
                    h1 { "베트맨 배당, 시장보다 얼마나 깎였나" }
                    p { class: "hero-copy", "같은 경기·같은 마켓 기준으로 해외 컨센서스와 비교합니다." }
                    div { class: "metrics",
                        div { class: "metric", span { "오늘 비교 경기" } strong { "24" } }
                        div { class: "metric", span { "샘플 환수율" } strong { "{payout:.1}%" } }
                        div { class: "metric", span { "데이터 상태" } strong { "DEMO" } }
                    }
                }
                nav { class: "league-tabs",
                    button { class: "active", "전체" }
                    button { "축구" }
                    button { "야구" }
                    button { "농구" }
                    button { "랭킹" }
                }
                section { class: "section-heading", h2 { "오늘 경기" } span { "삭감률 낮은 순" } }
                section { class: "match-list",
                    for game in MATCHES {
                        MatchRow { game }
                    }
                }
            }
            nav { class: "bottom-nav",
                a { class: "active", href: "#", "홈" }
                a { href: "#", "리그" }
                a { href: "#", "랭킹" }
                a { href: "#", "설정" }
            }
        }
    }
}

#[component]
fn MatchRow(game: MatchCard) -> Element {
    let local = DecimalOdds::new(game.betman).unwrap();
    let market = DecimalOdds::new(game.market).unwrap();
    let gap = cut_rate(local, market) * 100.0;
    let grade = if gap < 3.0 { "good" } else if gap < 5.0 { "warn" } else { "bad" };

    rsx! {
        article { class: "match-row",
            div { class: "match-meta", span { class: "league", "{game.league}" } span { "{game.time}" } }
            div { class: "teams", strong { "{game.home}" } span { "vs" } strong { "{game.away}" } }
            div { class: "odds-grid",
                div { span { "BETMAN" } strong { "{game.betman:.2}" } }
                div { span { "MARKET" } strong { "{game.market:.2}" } }
                div { class: "gap {grade}", span { "CUT" } strong { "-{gap:.1}%" } }
            }
        }
    }
}
