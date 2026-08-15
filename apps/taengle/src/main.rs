use dioxus::prelude::*;
use taengle_odds_domain::{DecimalOdds, ThreeWayMarket, cut_rate};

const CSS: Asset = asset!("/assets/main.css");

fn main() {
    dioxus::launch(App);
}

#[allow(non_snake_case)]
fn App() -> Element {
    let betman = ThreeWayMarket {
        home: DecimalOdds::new(1.82).unwrap(),
        draw: DecimalOdds::new(3.45).unwrap(),
        away: DecimalOdds::new(3.85).unwrap(),
    };
    let market_home = DecimalOdds::new(1.93).unwrap();
    let gap = cut_rate(betman.home, market_home) * 100.0;
    let payout = betman.payout_rate() * 100.0;

    rsx! {
        document::Stylesheet { href: CSS }
        div { class: "app-shell",
            header { class: "topbar",
                div { class: "brand-block",
                    span { class: "live-dot" }
                    h1 { "TAENGLE" }
                    span { class: "demo-badge", "DEMO" }
                }
                button { class: "icon-button", aria_label: "설정", "⚙" }
            }

            main { class: "content",
                section { class: "hero",
                    p { class: "eyebrow", "BETMAN × GLOBAL MARKET" }
                    h2 { "오늘 배당, 얼마나 깎였나" }
                    p { class: "hero-copy", "같은 경기·같은 마켓만 묶어서 베트맨과 해외 시장 컨센서스를 빠르게 비교합니다." }
                    div { class: "hero-metrics",
                        div { span { "베트맨 환수율" } strong { "{payout:.1}%" } }
                        div { span { "해외 기준" } strong { "95.1%" } }
                        div { span { "평균 차이" } strong { class: "negative", "-3.4%p" } }
                    }
                }

                nav { class: "league-tabs", aria_label: "리그 필터",
                    button { class: "tab active", "전체" }
                    button { class: "tab", "EPL" }
                    button { class: "tab", "라리가" }
                    button { class: "tab", "K리그" }
                    button { class: "tab", "NBA" }
                }

                section { class: "section-head",
                    div { p { class: "eyebrow", "LIVE BOARD" } h3 { "오늘 경기" } }
                    span { "3 MATCHES" }
                }

                section { class: "match-list",
                    article { class: "match-card featured",
                        div { class: "match-meta", span { "EPL · 23:30" } span { class: "status", "분석중" } }
                        div { class: "teams", strong { "Arsenal" } span { "vs" } strong { "Chelsea" } }
                        div { class: "odds-grid",
                            div { span { "BETMAN" } strong { "1.82" } }
                            div { span { "MARKET" } strong { "1.93" } }
                            div { span { "CUT" } strong { class: "negative", "{gap:.1}%" } }
                        }
                        div { class: "card-footer", span { "환수율 {payout:.1}%" } span { "Pinnacle · Betfair · SBO · bet365" } }
                    }

                    article { class: "match-card",
                        div { class: "match-meta", span { "LA LIGA · 02:00" } span { class: "status good", "저마진" } }
                        div { class: "teams", strong { "Real Madrid" } span { "vs" } strong { "Valencia" } }
                        div { class: "odds-grid",
                            div { span { "BETMAN" } strong { "1.56" } }
                            div { span { "MARKET" } strong { "1.59" } }
                            div { span { "CUT" } strong { class: "positive", "-1.9%" } }
                        }
                        div { class: "card-footer", span { "환수율 94.0%" } span { "업데이트 18초 전" } }
                    }

                    article { class: "match-card",
                        div { class: "match-meta", span { "K LEAGUE · 19:00" } span { class: "status warn", "고마진" } }
                        div { class: "teams", strong { "Seoul" } span { "vs" } strong { "Ulsan" } }
                        div { class: "odds-grid",
                            div { span { "BETMAN" } strong { "2.48" } }
                            div { span { "MARKET" } strong { "2.70" } }
                            div { span { "CUT" } strong { class: "negative", "-8.1%" } }
                        }
                        div { class: "card-footer", span { "환수율 88.6%" } span { "업데이트 31초 전" } }
                    }
                }
            }

            nav { class: "bottom-nav", aria_label: "주 메뉴",
                a { class: "nav-item active", href: "#", span { "●" } strong { "홈" } }
                a { class: "nav-item", href: "#", span { "▤" } strong { "리그" } }
                a { class: "nav-item", href: "#", span { "↕" } strong { "랭킹" } }
                a { class: "nav-item", href: "#", span { "◎" } strong { "설정" } }
            }
        }
    }
}
