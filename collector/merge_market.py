#!/usr/bin/env python3
"""베트맨 스냅샷 + 해외 컨센서스 병합 -> 삭감률 계산 후 snapshots.json 갱신.

매칭 규칙:
  1) 같은 리그 + 킥오프 시각차 <= TOL_SEC 후보 중
     team_map.json 으로 홈/원정 양쪽 이름이 확인되면 그 경기 (matchedBy=name)
  2) 후보가 1개뿐이면 시간만으로 매칭 (matchedBy=time, 모호성 없음)
  3) 후보가 여러 개인데 이름 미확인 -> 매칭 실패 (오매칭 방지)
삭감률: cut = 1 - 베트맨배당 / 해외배당 (양수면 베트맨이 더 짠 배당)

대상 베팅 유형: 승무패·일반 승패는 해외 h2h, 일반 언더오버는 해외 totals와 비교한다.
(승N패=야구승1패, 핸디캡, 홀짝은 별도 마켓이라 제외)

Usage:
    python collector/merge_market.py
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAP = ROOT / "site" / "data" / "snapshots.json"
MARKET = ROOT / "site" / "data" / "market_odds.json"
TEAM_MAP = ROOT / "collector" / "team_map.json"
TOL_SEC = 20 * 60
COMPARE_BET_TYPES = {"승무패", "일반 승패"}
TOTAL_BET_TYPES = {"일반 언더오버", "언더오버"}


def parse_ts(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def cut(betman: float | None, market: float | None) -> float | None:
    if not betman or not market:
        return None
    return round(1 - betman / market, 4)


def market_type(m: dict) -> str:
    if m.get("marketType") == "totals" or m.get("betType") in TOTAL_BET_TYPES or "언더" in str(m.get("betType")):
        return "totals"
    return "h2h"


def main() -> int:
    if not SNAP.exists() or not MARKET.exists():
        print("[error] snapshots.json / market_odds.json 필요 (betman_collect, market_collect 먼저 실행)", file=sys.stderr)
        return 1
    snap = json.loads(SNAP.read_text(encoding="utf-8"))
    market = json.loads(MARKET.read_text(encoding="utf-8"))
    leagues: dict[str, list] = market.get("leagues", {})
    team_map: dict[str, dict] = (
        json.loads(TEAM_MAP.read_text(encoding="utf-8")) if TEAM_MAP.exists() else {}
    )

    stats: dict[str, list[int]] = {}
    map_miss: set[str] = set()
    for game in snap.get("games", []):
        for m in game.get("matches", []):
            m.pop("market", None)
            lg = m.get("league")
            ko = m.get("kickoff")
            events = leagues.get(lg)
            kind = market_type(m)
            comparable = m.get("betType") in COMPARE_BET_TYPES if kind == "h2h" else kind == "totals"
            if (
                not events
                or not ko
                or not comparable
                or (kind == "h2h" and (not m.get("win") or not m.get("lose")))
                or (kind == "totals" and (not m.get("over") or not m.get("under") or m.get("totalPoint") is None))
            ):
                continue
            st = stats.setdefault(lg, [0, 0])
            st[1] += 1
            t0 = parse_ts(ko)
            cands = []
            for ev in events:
                diff = abs((parse_ts(ev["commenceUtc"]) - t0).total_seconds())
                if diff <= TOL_SEC:
                    cands.append((diff, ev))
            cands.sort(key=lambda x: x[0])
            best, matched_by = None, None
            names = team_map.get(lg, {})
            home_en, away_en = names.get(m.get("home")), names.get(m.get("away"))
            for diff, ev in cands:
                if home_en and away_en and ev["homeEn"] == home_en and ev["awayEn"] == away_en:
                    best, best_diff, matched_by = ev, diff, "name"
                    break
            if not best and len(cands) == 1:
                best, best_diff, matched_by = cands[0][1], cands[0][0], "time"
            if not best and cands:
                if not (home_en and away_en):
                    map_miss.add(f"{lg}: {m.get('home')} / {m.get('away')}")
            if not best:
                continue
            if kind == "totals":
                totals = best.get("totals")
                if not totals or abs(float(m["totalPoint"]) - float(totals.get("point"))) > 0.01:
                    continue
                cons, pin = totals.get("consensus", {}), totals.get("pinnacle", {})
                cuts_cons = {"over": cut(m.get("over"), cons.get("over")), "under": cut(m.get("under"), cons.get("under"))}
                cuts_pin = {"over": cut(m.get("over"), pin.get("over")), "under": cut(m.get("under"), pin.get("under"))}
                market_data = {
                    "marketType": "totals",
                    "marketId": best.get("id"),
                    "sportKey": best.get("sportKey"),
                    "point": totals.get("point"),
                    "books": totals.get("books"),
                    "homeEn": best.get("homeEn"),
                    "awayEn": best.get("awayEn"),
                    "consensus": {"over": cons.get("over"), "under": cons.get("under")},
                    "pinnacle": {"over": pin.get("over"), "under": pin.get("under")},
                    "cutConsensus": cuts_cons,
                    "cutPinnacle": cuts_pin,
                }
            else:
                cons, pin = best.get("consensus", {}), best.get("pinnacle", {})
                cuts_cons = {
                    "win": cut(m.get("win"), cons.get("home")),
                    "draw": cut(m.get("draw"), cons.get("draw")),
                    "lose": cut(m.get("lose"), cons.get("away")),
                }
                cuts_pin = {
                    "win": cut(m.get("win"), pin.get("home")),
                    "draw": cut(m.get("draw"), pin.get("draw")),
                    "lose": cut(m.get("lose"), pin.get("away")),
                }
                market_data = {
                    "marketType": "h2h",
                    "marketId": best.get("id"),
                    "sportKey": best.get("sportKey"),
                    "books": best.get("books"),
                    "homeEn": best.get("homeEn"),
                    "awayEn": best.get("awayEn"),
                    "consensus": {"win": cons.get("home"), "draw": cons.get("draw"), "lose": cons.get("away")},
                    "pinnacle": {"win": pin.get("home"), "draw": pin.get("draw"), "lose": pin.get("away")},
                    "cutConsensus": cuts_cons,
                    "cutPinnacle": cuts_pin,
                }
            valid = [v for v in cuts_cons.values() if v is not None]
            if not valid:
                continue
            market_data["cutAvg"] = round(sum(valid) / len(valid), 4) if valid else None
            market_data["timeDiffSec"] = int(best_diff)
            market_data["matchedBy"] = matched_by
            m["market"] = market_data
            st[0] += 1

    snap["marketSource"] = market.get("source")
    snap["marketFetchedAt"] = market.get("fetchedAt")
    snap["marketCreditsRemaining"] = market.get("creditsRemaining")
    SNAP.write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding="utf-8")

    print("=== 리그별 매칭 (matched/total) ===")
    for lg, (a, b) in sorted(stats.items()):
        print(f"  {lg}: {a}/{b}")
    if map_miss:
        print("=== team_map 미등록 (team_map.json 보강 필요) ===")
        for s in sorted(map_miss):
            print(f"  {s}")
    print(f"[done] {SNAP} ({SNAP.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
