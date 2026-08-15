#!/usr/bin/env python3
"""전체 수집 파이프라인: 베트맨 -> 해외 컨센서스 -> 병합.

Usage:
    set ODDS_API_KEY=xxxx
    python collector/collect_all.py
"""

from __future__ import annotations

import betman_collect
import market_collect
import merge_market


def main() -> int:
    print("== 1/3 베트맨 수집 ==")
    rc = betman_collect.main()
    if rc != 0:
        return rc
    print("\n== 2/3 해외배당 수집 ==")
    rc = market_collect.main()
    if rc != 0:
        return rc
    print("\n== 3/3 병합 ==")
    return merge_market.main()


if __name__ == "__main__":
    raise SystemExit(main())
