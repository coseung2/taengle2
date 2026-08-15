#!/usr/bin/env python3
"""The Odds API 해외배당 수집기 -> site/data/market_odds.json

Usage:
    set ODDS_API_KEYS=account1-key,account2-key
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
MARKETS = "h2h,totals"
KST = dt.timezone(dt.timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = ROOT / "site" / "data" / "snapshots.json"
OUT_PATH = ROOT / "site" / "data" / "market_odds.json"
DEFAULT_MAX_SPORTS_PER_RUN = 7
DEFAULT_REFRESH_INTERVAL_MINUTES = 630


def fetch_sport(api_key: str, sport_key: str, regions: str) -> tuple[list, str | None]:
    url = (
        f"{BASE}/{sport_key}/odds/?apiKey={api_key}"
        f"&regions={regions}&markets={MARKETS}&oddsFormat=decimal&dateFormat=iso"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "taengle-collector/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        events = json.load(r)
        now = dt.datetime.now(dt.timezone.utc)
        future = [event for event in events if dt.datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00")) > now]
        return future, r.headers.get("x-requests-remaining")


def average_prices(values: dict[str, list[float]]) -> dict[str, float]:
    result = {}
    for key, items in values.items():
        clean = [value for value in items if 1.01 <= value <= 20]
        if clean:
            ordered = sorted(clean)
            middle = len(ordered) // 2
            median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
            result[key] = round(median, 4)
    return result


def summarize_event(ev: dict) -> dict:
    """북메이커 배당 -> h2h 및 totals 컨센서스(중앙값) + 피나클 기준가."""
    home, away = ev["home_team"], ev["away_team"]
    prices: dict[str, list[float]] = {"home": [], "draw": [], "away": []}
    pinnacle: dict[str, float] = {}
    totals_by_point: dict[float, dict[str, list[float]]] = {}
    totals_pinnacle: dict[float, dict[str, float]] = {}
    for bk in ev.get("bookmakers", []):
        outcomes = {}
        for m in bk.get("markets", []):
            if m.get("key") == "h2h":
                for o in m.get("outcomes", []):
                    if o["name"] == home:
                        outcomes["home"] = o["price"]
                    elif o["name"] == away:
                        outcomes["away"] = o["price"]
                    elif o["name"] == "Draw":
                        outcomes["draw"] = o["price"]
            elif m.get("key") == "totals":
                for o in m.get("outcomes", []):
                    point = o.get("point")
                    if point is None or o.get("name") not in {"Over", "Under"}:
                        continue
                    point = float(point)
                    bucket = totals_by_point.setdefault(point, {"over": [], "under": []})
                    bucket[o["name"].lower()].append(o["price"])
                    if bk.get("key") == "pinnacle":
                        totals_pinnacle.setdefault(point, {})[o["name"].lower()] = o["price"]
        for k, v in outcomes.items():
            prices[k].append(v)
        if bk.get("key") == "pinnacle":
            pinnacle = outcomes
    result = {
        "id": ev["id"],
        "sportKey": ev["sport_key"],
        "commenceUtc": ev["commence_time"],
        "homeEn": home,
        "awayEn": away,
        "books": len(ev.get("bookmakers", [])),
        "consensus": average_prices(prices),
        "pinnacle": pinnacle,
    }
    if totals_by_point:
        point, values = max(totals_by_point.items(), key=lambda item: sum(len(v) for v in item[1].values()))
        result["totals"] = {
            "point": point,
            "consensus": average_prices(values),
            "pinnacle": totals_pinnacle.get(point, {}),
            "books": max(len(values.get("over", [])), len(values.get("under", []))),
        }
    return result


def read_api_keys() -> list[str]:
    pool = os.environ.get("ODDS_API_KEYS", "")
    keys = [key.strip() for key in pool.split(",") if key.strip()]
    if not keys:
        legacy = os.environ.get("ODDS_API_KEY", "").strip()
        if legacy:
            keys = [legacy]
    return list(dict.fromkeys(keys))


def read_previous_market() -> dict:
    if not OUT_PATH.exists():
        return {}
    try:
        return json.loads(OUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def active_leagues(now: dt.datetime | None = None) -> list[str]:
    """Return mapped leagues with future Betman matches, nearest kickoff first."""
    if not SNAPSHOT_PATH.exists():
        return list(SPORT_MAP)
    now = now or dt.datetime.now(dt.timezone.utc)
    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    earliest: dict[str, dt.datetime] = {}
    for game in snapshot.get("games", []):
        for match in game.get("matches", []):
            league = match.get("league")
            kickoff = match.get("kickoff")
            if league not in SPORT_MAP or not kickoff:
                continue
            try:
                kickoff_at = dt.datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
            except ValueError:
                continue
            if kickoff_at <= now:
                continue
            current = earliest.get(league)
            if current is None or kickoff_at < current:
                earliest[league] = kickoff_at
    return sorted(earliest, key=lambda league: (earliest[league], list(SPORT_MAP).index(league)))


def select_leagues(leagues: list[str], maximum: int, now: dt.datetime | None = None) -> list[str]:
    """Bound each run's cost and rotate overflow leagues between runs."""
    if maximum <= 0 or len(leagues) <= maximum:
        return leagues
    now = now or dt.datetime.now(dt.timezone.utc)
    interval = int(os.environ.get("ODDS_REFRESH_INTERVAL_MINUTES", DEFAULT_REFRESH_INTERVAL_MINUTES))
    slot = int(now.timestamp() // (interval * 60))
    start = (slot * maximum) % len(leagues)
    return [leagues[(start + index) % len(leagues)] for index in range(maximum)]


def main() -> int:
    api_keys = read_api_keys()
    if not api_keys:
        print("[error] ODDS_API_KEYS 또는 ODDS_API_KEY 환경변수가 필요합니다", file=sys.stderr)
        return 1
    expected_accounts = int(os.environ.get("ODDS_EXPECTED_ACCOUNTS", "0") or 0)
    if expected_accounts and len(api_keys) < expected_accounts:
        print(f"[error] API 계정 {expected_accounts}개가 필요하지만 {len(api_keys)}개만 설정됨", file=sys.stderr)
        return 1
    regions = os.environ.get("ODDS_REGIONS", "eu").strip() or "eu"
    offset_env = os.environ.get("ODDS_ACCOUNT_OFFSET", "").strip()
    if offset_env:
        account_offset = int(offset_env) % len(api_keys)
    else:
        now = dt.datetime.now(dt.timezone.utc)
        account_offset = (now.timetuple().tm_yday + int(now.hour >= 12)) % len(api_keys)

    now = dt.datetime.now(dt.timezone.utc)
    maximum = int(os.environ.get("ODDS_MAX_SPORTS_PER_RUN", DEFAULT_MAX_SPORTS_PER_RUN))
    refresh_interval = int(os.environ.get("ODDS_REFRESH_INTERVAL_MINUTES", DEFAULT_REFRESH_INTERVAL_MINUTES))
    active = active_leagues(now)
    selected = select_leagues(active, maximum, now)
    previous = read_previous_market()
    previous_leagues = previous.get("leagues", {})
    out_sports: dict[str, list] = {
        league: previous_leagues[league]
        for league in active
        if league in previous_leagues
    }
    league_fetched_at = {
        league: fetched_at
        for league, fetched_at in previous.get("leagueFetchedAt", {}).items()
        if league in active
    }
    credits: dict[str, int] = dict(previous.get("creditsByAccount", {}))
    fetched_at = dt.datetime.now(KST).isoformat()
    fetched_leagues: list[str] = []
    for index, league in enumerate(selected):
        sport_key = SPORT_MAP[league]
        account_index = (index + account_offset) % len(api_keys)
        api_key = api_keys[account_index]
        account_name = f"account-{account_index + 1}"
        try:
            events, remaining = fetch_sport(api_key, sport_key, regions)
        except urllib.error.HTTPError as e:
            print(f"[skip] {league} ({sport_key}) {account_name}: HTTP {e.code}", file=sys.stderr)
            continue
        except urllib.error.URLError as e:
            print(f"[skip] {league} ({sport_key}) {account_name}: {e}", file=sys.stderr)
            continue
        if remaining and remaining.isdigit():
            credits[account_name] = int(remaining)
        out_sports[league] = [summarize_event(ev) for ev in events]
        league_fetched_at[league] = fetched_at
        fetched_leagues.append(league)
        print(f"[ok] {league} ({sport_key}) {account_name}: {len(events)}경기")

    if not fetched_leagues:
        print("[error] 수집된 해외배당 없음", file=sys.stderr)
        return 1

    payload = {
        "source": "the-odds-api.com",
        "regions": regions,
        "fetchedAt": fetched_at,
        "accounts": len(api_keys),
        "accountOffset": account_offset,
        "creditsRemaining": sum(credits.values()) if credits else None,
        "creditsByAccount": credits,
        "refreshIntervalMinutes": refresh_interval,
        "maxSportsPerRun": maximum,
        "estimatedCreditsPerRun": len(selected) * len(MARKETS.split(",")),
        "activeLeagues": active,
        "fetchedLeagues": fetched_leagues,
        "leagueFetchedAt": league_fetched_at,
        "leagues": out_sports,
    }
    out_path = OUT_PATH
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[done] {out_path} ({out_path.stat().st_size} bytes), 계정 {len(api_keys)}개, 잔여 크레딧 합계: {sum(credits.values()) if credits else '확인 불가'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
