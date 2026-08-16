#!/usr/bin/env python3
"""Betman(베트맨) 실데이터 수집기 -> TAENGLE snapshot JSON.

Usage:
    python collector/betman_collect.py

출력: site/data/snapshots.json (경기 + 실배당 + 파생 지표)
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
import urllib.request
import urllib.error
from http.cookiejar import CookieJar
from pathlib import Path

BASE = "https://www.betman.co.kr"
SLIP_URL = BASE + "/main/mainPage/gamebuy/gameSlip.do"
API_URL = BASE + "/buyPsblGame/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE,
    "Referer": SLIP_URL,
}


def _opener():
    jar = CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def open_with_retry(opener, request, attempts: int = 3):
    """Retry transient Betman connection resets without retrying HTTP errors."""
    last_error = None
    for attempt in range(attempts):
        try:
            return opener.open(request, timeout=30)
        except (urllib.error.URLError, ConnectionResetError, TimeoutError) as error:
            last_error = error
            if attempt + 1 < attempts:
                delay = 2**attempt
                print(
                    f"[warn] Betman 연결 재시도 {attempt + 1}/{attempts - 1} ({delay}초 대기): {error}",
                    file=sys.stderr,
                )
                time.sleep(delay)
    raise last_error


def establish_session():
    """Start a fresh cookie session for every retry after a transport failure."""
    last_error = None
    for attempt in range(3):
        opener = _opener()
        try:
            with open_with_retry(opener, SLIP_URL, attempts=1) as response:
                response.read()
            return opener
        except (urllib.error.URLError, ConnectionResetError, TimeoutError) as error:
            last_error = error
            if attempt < 2:
                delay = 2**attempt
                print(
                    f"[warn] Betman 세션 재시도 {attempt + 1}/2 ({delay}초 대기): {error}",
                    file=sys.stderr,
                )
                time.sleep(delay)
    raise last_error


def post_json(opener, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        API_URL + path,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={**HEADERS, "Content-Type": "application/json; charset=UTF-8"},
        method="POST",
    )
    with open_with_retry(opener, req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def num(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        if isinstance(v, str):
            match = re.search(r"-?\d+(?:\.\d+)?", v.replace(",", ""))
            if match:
                try:
                    f = float(match.group())
                    return f if f > 0 else None
                except ValueError:
                    pass
        return None


def first_num(row: dict, *names: str):
    for name in names:
        value = num(row.get(name))
        if value is not None:
            return value
    return None


def total_point(row: dict, values: list) -> float | None:
    # Betman exposes the totals line under a handicap-like field. `point` is
    # also present in some payloads, but it is an internal value (often 9),
    # not the actual Over/Under line.
    point = first_num(
        row,
        "totalPoint",
        "totPoint",
        "totalLine",
        "baseLine",
        "basePoint",
        "handicapPoint",
        "handiPoint",
        "handiCap",
        "handicap",
        "handi",
        "handiValue",
        "handicapValue",
        "lineValue",
        "betLine",
    )
    if point is not None:
        return point
    # The current Betman table keeps the handicap/total line at column 19.
    # Keep this positional fallback behind named fields so unrelated `point`
    # values can never win over the actual line.
    if len(values) > 19:
        return num(values[19])
    return None


def parse_matches(table: dict) -> list[dict]:
    keys = table.get("keys", [])
    rows = table.get("datas", [])
    matches: list[dict] = []
    for r in rows:
        m = dict(zip(keys, r))
        win, draw, lose = num(m.get("winAllot")), num(m.get("drawAllot")), num(m.get("loseAllot"))
        if not (win and lose):
            continue
        home = (m.get("homeName") or "").strip()
        away = (m.get("awayName") or "").strip()
        if not home or not away:
            continue
        ts = m.get("gameDate")
        kickoff = (
            dt.datetime.fromtimestamp(ts / 1000, tz=dt.timezone(dt.timedelta(hours=9))).isoformat()
            if isinstance(ts, (int, float))
            else None
        )
        bet_type = m.get("betTypNm") or (None if draw else "승패")
        is_total = "언더" in str(bet_type) or "오버" in str(bet_type)
        total_line = total_point(m, r) if is_total else None
        row = {
            "kickoff": kickoff,
            "league": m.get("leagueShortName") or m.get("leagueName"),
            "home": home,
            "away": away,
            "win": win,
            "draw": draw,
            "lose": lose,
            "status": m.get("protoStatus"),
            "score": m.get("mchScore") or None,
            "betType": bet_type,
        }
        if is_total:
            row["marketType"] = "totals"
            row["totalPoint"] = total_line
            row["over"] = win
            row["under"] = lose
        else:
            row["marketType"] = "h2h"
        matches.append(row)
    return matches


def main() -> int:
    # 세션/쿠키 초기화 (페이지 방문)
    try:
        opener = establish_session()
    except (urllib.error.URLError, ConnectionResetError, TimeoutError) as e:
        print(f"[error] gameSlip 접근 실패: {e}", file=sys.stderr)
        return 1

    games = post_json(opener, "inqCacheBuyAbleGameInfoList.do", {"_sbmInfo": {"debugMode": "false"}})
    candidates = games.get("protoGames", []) + games.get("totoGames", [])
    print(f"[info] 판매중 게임 {len(candidates)}개")

    out_games = []
    for g in candidates:
        gm_id = g.get("gmId")
        gm_ts = g.get("gmTs")
        year = g.get("gmOsidTsYear")
        if not gm_id or not gm_ts:
            continue
        try:
            info = post_json(
                opener,
                "gameInfoInq.do",
                {
                    "gmId": gm_id,
                    "gmTs": gm_ts,
                    "gameYear": str(year),
                    "_sbmInfo": {"debugMode": "false"},
                },
            )
        except urllib.error.HTTPError as e:
            print(f"[skip] {gm_id}: HTTP {e.code}", file=sys.stderr)
            continue
        except urllib.error.URLError as e:
            print(f"[skip] {gm_id}: {e}", file=sys.stderr)
            continue
        except json.JSONDecodeError as e:
            print(f"[skip] {gm_id}: JSON 아님 (세션/권한?) {e}", file=sys.stderr)
            continue
        matches = parse_matches(info.get("compSchedules") or {})
        if not matches:
            continue
        print(f"[ok] {gm_id} {g.get('gameName','')} 경기 {len(matches)}건")
        out_games.append(
            {
                "gmId": gm_id,
                "gameName": g.get("gameName"),
                "gameType": g.get("gameMaster", {}).get("gameNickName")
                if isinstance(g.get("gameMaster"), dict)
                else None,
                "gmTs": gm_ts,
                "saleEnd": g.get("saleEndDate"),
                "totalSellAmount": g.get("totalSellAmount"),
                "matches": matches,
            }
        )

    if not out_games:
        print("[error] 수집된 경기 없음", file=sys.stderr)
        return 1

    snapshot = {
        "source": "betman.co.kr",
        "fetchedAt": dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(),
        "games": out_games,
    }
    out_path = Path(__file__).resolve().parents[1] / "site" / "data" / "snapshots.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[done] {out_path} ({out_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
