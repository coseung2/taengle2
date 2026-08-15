#!/usr/bin/env python3
"""The Odds API 해외배당 수집기 -> site/data/market_odds.json

Usage:
    set ODDS_API_KEY=xxxx
    python collector/market_collect.py

주의: API 키는 환경변수로만 주입한다. 출력 JSON에 키를 쓰지 않는다.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# 베트맨 리그명 -> The Odds API sport key
SPORT_MAP = {
    "MLB": "baseball_mlb",
    "KBO": "baseball_kbo",
    "NPB": "baseball_npb",
    "K리그1": "soccer_korea_kleague1",
    "MLS": "soccer_usa_mls",
    "EFL챔": "soccer_efl_champ",
    "에레디비": "soccer_netherlands_eredivisie",
    "엘리테세": "soccer_norway_eliteserien",  # 노르웨이 엘리테세리엔
    "라리가": "soccer_spain_la_liga",
    "코파리베": "soccer_conmebol_copa_libertadores",
    "J1리그": "soccer_japan_j_league",
}

BASE = "https://api.the-odds-api.com/v4/sports"
KST = dt.timezone(dt.timedelta(hours=9))


def fetch_sport(api_key: str, sport_key: str, regions: str) -> tuple[list, str | None]:
    url = (
        f"{BASE}/{sport_key}/odds/?apiKey={api_key}"
        f"&regions={regions}&markets=h2h&oddsFormat=decimal&dateFormat=iso"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "taengle-collector/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r), r.headers.get("x-requests-remaining")


def summarize_event(ev: dict) -> dict:
    """북메이커 배당 -> 컨센서스(평균) + 피나클 기준가."""
    home, away = ev["home_team"], ev["away_team"]
    prices: dict[str, list[float]] = {"home": [], "draw": [], "away": []}
    pinnacle: dict[str, float] = {}
    for bk in ev.get("bookmakers", []):
        outcomes = {}
        for m in bk.get("markets", []):
            if m.get("key") != "h2h":
                continue
            for o in m.get("outcomes", []):
                if o["name"] == home:
                    outcomes["home"] = o["price"]
                elif o["name"] == away:
                    outcomes["away"] = o["price"]
                elif o["name"] == "Draw":
                    outcomes["draw"] = o["price"]
        for k, v in outcomes.items():
            prices[k].append(v)
        if bk.get("key") == "pinnacle":
            pinnacle = outcomes
    consensus = {k: round(sum(v) / len(v), 4) for k, v in prices.items() if v}
    return {
        "id": ev["id"],
        "sportKey": ev["sport_key"],
        "commenceUtc": ev["commence_time"],
        "homeEn": home,
        "awayEn": away,
        "books": len(ev.get("bookmakers", [])),
        "consensus": consensus,
        "pinnacle": pinnacle,
    }


def main() -> int:
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        print("[error] ODDS_API_KEY 환경변수가 필요합니다", file=sys.stderr)
        return 1
    regions = os.environ.get("ODDS_REGIONS", "eu,uk").strip() or "eu,uk"

    out_sports: dict[str, list] = {}
    remaining = None
    for league, sport_key in SPORT_MAP.items():
        try:
            events, remaining = fetch_sport(api_key, sport_key, regions)
        except urllib.error.HTTPError as e:
            print(f"[skip] {league} ({sport_key}): HTTP {e.code}", file=sys.stderr)
            continue
        except urllib.error.URLError as e:
            print(f"[skip] {league} ({sport_key}): {e}", file=sys.stderr)
            continue
        out_sports[league] = [summarize_event(ev) for ev in events]
        print(f"[ok] {league} ({sport_key}): {len(events)}경기")

    if not out_sports:
        print("[error] 수집된 해외배당 없음", file=sys.stderr)
        return 1

    payload = {
        "source": "the-odds-api.com",
        "regions": regions,
        "fetchedAt": dt.datetime.now(KST).isoformat(),
        "creditsRemaining": int(remaining) if remaining and remaining.isdigit() else remaining,
        "leagues": out_sports,
    }
    out_path = Path(__file__).resolve().parents[1] / "site" / "data" / "market_odds.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[done] {out_path} ({out_path.stat().st_size} bytes), 잔여 크레딧: {remaining}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
