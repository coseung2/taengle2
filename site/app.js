"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const API_BASE = window.TAENGLE_API_BASE || "https://taengle-api.mdownloader.workers.dev";
let ACCOUNT = { user: null, keyConfigured: false, keyLast4: null, watches: [] };
let AUTH_SIGNUP = false;
let CURRENT_MATCHES = [];

const apiRequest = async (path, options = {}) => {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
};

const matchMarketType = (m) => m.marketType || m.market?.marketType || (String(m.betType).includes("언더") ? "totals" : "h2h");
const watchKey = (m) => [m.market?.marketId || "", matchMarketType(m), m.market?.point ?? m.totalPoint ?? ""].join("|");
const watchedFor = (m) => ACCOUNT.watches.find((watch) => watch.marketId === m.market?.marketId && (watch.marketType || "h2h") === matchMarketType(m) && (watch.totalPoint == null || Number(watch.totalPoint) === Number(m.market?.point ?? m.totalPoint)));

// 해외 h2h와 비교 가능한 베트맨 베팅 유형
const COMPARABLE = new Set(["승무패", "일반 승패"]);
const BASEBALL_LEAGUES = new Set(["MLB", "KBO", "NPB"]);
const SOCCER_LEAGUES = new Set([
  "K리그1", "K리그2", "EFL챔", "에레디비", "엘리테세", "라리가", "MLS", "J1리그", "J2리그",
  "코파리베", "축ASEA챔", "잉슈퍼컵", "프슈퍼컵", "축클럽친",
]);
const LEAGUE_FULL_NAMES = Object.freeze({
  "MLB": "메이저 리그 베이스볼 (MLB)",
  "KBO": "한국 프로야구 (KBO)",
  "NPB": "일본 프로야구 (NPB)",
  "K리그1": "대한민국 K리그1",
  "K리그2": "대한민국 K리그2",
  "EFL챔": "잉글랜드 EFL 챔피언십",
  "에레디비": "네덜란드 에레디비시",
  "엘리테세": "노르웨이 엘리테세리엔",
  "라리가": "스페인 라리가",
  "MLS": "미국 메이저리그사커 (MLS)",
  "J1리그": "일본 J1리그",
  "J2리그": "일본 J2리그",
  "코파리베": "코파 리베르타도레스",
  "축ASEA챔": "ASEAN 클럽 챔피언십",
  "잉슈퍼컵": "FA 커뮤니티 실드",
  "프슈퍼컵": "트로페 데 샹피옹",
  "축클럽친": "클럽 친선경기",
});
const leagueFullName = (league) => LEAGUE_FULL_NAMES[league] || league;

let SNAPSHOT = null;

const THEME_ICONS = {
  moon: '<svg class="lucide lucide-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>',
  sun: '<svg class="lucide lucide-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.42 1.42"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>',
};

function renderThemeToggle() {
  const button = $("#themeToggle");
  if (!button) return;
  const dark = document.documentElement.classList.contains("dark");
  const label = dark ? "라이트 모드로 전환" : "다크 모드로 전환";
  button.innerHTML = dark ? THEME_ICONS.sun : THEME_ICONS.moon;
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function initTheme() {
  const saved = localStorage.getItem("taengle-theme");
  if (saved === "dark") document.documentElement.classList.add("dark");
  if (saved === "light") document.documentElement.classList.remove("dark");
  renderThemeToggle();
  $("#themeToggle")?.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("taengle-theme", dark ? "dark" : "light");
    renderThemeToggle();
  });
}

function formatRefreshTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatRefreshInterval(minutes) {
  const value = Number(minutes) || 630;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

async function load() {
  const res = await fetch("data/snapshots.json", { cache: "no-store" });
  SNAPSHOT = await res.json();
  const game = SNAPSHOT.games.find((g) => g.gmId === "G101") || SNAPSHOT.games[0];

  // 비교 가능 유형 + 배당 확정 + 경기단위 중복 제거 (승무패 우선)
  const seen = new Map();
  for (const m of game.matches) {
    const totals = matchMarketType(m) === "totals";
    if ((!COMPARABLE.has(m.betType) && !totals) || (totals ? (!(m.over > 0) || !(m.under > 0)) : (!(m.win > 0) || !(m.lose > 0)))) continue;
    const key = [m.league, m.kickoff, m.home, m.away, matchMarketType(m), m.totalPoint ?? ""].join("|");
    const prev = seen.get(key);
    if (!prev || (m.betType === "승무패" && prev.betType !== "승무패")) seen.set(key, m);
  }
  const all = [...seen.values()];
  const upcoming = all.filter((m) => !m.score && new Date(m.kickoff).getTime() > Date.now()).sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || ""));
  const matched = upcoming.filter((m) => m.market);

  let activeMode = "all";
  let selectedLeague = null;
  const modeFilter = (mode, matches) => {
    if (mode === "soccer") return matches.filter((m) => SOCCER_LEAGUES.has(m.league));
    if (mode === "baseball") return matches.filter((m) => BASEBALL_LEAGUES.has(m.league));
    return matches;
  };
  const applyView = (mode = "all", league = null) => {
    activeMode = mode;
    selectedLeague = league;
    const modeAll = mode === "ranking" ? all : modeFilter(mode, all);
    const modeUpcoming = mode === "ranking" ? upcoming : modeFilter(mode, upcoming);
    const viewAll = league ? modeAll.filter((m) => m.league === league) : modeAll;
    const viewUpcoming = league ? modeUpcoming.filter((m) => m.league === league) : modeUpcoming;
    const viewMatched = viewUpcoming.filter((m) => m.market);

    renderNav(mode);
    renderHeader(game, viewUpcoming, viewMatched, selectedLeague, mode);
    renderLeagues(countLeagues(modeUpcoming), selectedLeague, (nextLeague) => {
      applyView(activeMode, nextLeague);
    });
    renderCutRank(viewMatched);
    renderMetrics(game, viewAll, viewUpcoming, viewMatched);

    const matchesView = $("#matchesView");
    const rankingView = $("#rankingView");
    if (mode === "ranking") {
      matchesView.hidden = true;
      rankingView.hidden = false;
      renderRankingView(viewMatched);
    } else {
      matchesView.hidden = false;
      rankingView.hidden = true;
      const sortedMatches = [...viewUpcoming].sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || ""));
      const grouped = new Map();
      for (const match of sortedMatches) {
        const key = [match.league, match.kickoff, match.home, match.away].join("|");
        const group = grouped.get(key) || [];
        group.push(match);
        grouped.set(key, group);
      }
      const displayGroups = [];
      for (const group of grouped.values()) {
        group.sort((a, b) => Number(matchMarketType(a) === "totals") - Number(matchMarketType(b) === "totals"));
        displayGroups.push({
          h2h: group.find((match) => matchMarketType(match) !== "totals") || null,
          totals: group.find((match) => matchMarketType(match) === "totals") || null,
        });
        if (displayGroups.length >= 8) break;
      }
      renderMatches(displayGroups);
    }
  };

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.onclick = () => applyView(button.dataset.mode || "all");
  });
  renderDataInfo(game);
  applyView();
}

function countLeagues(matches) {
  const counts = {};
  for (const m of matches) counts[m.league] = (counts[m.league] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function renderNav(mode) {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderHeader(game, upcoming, matched, selectedLeague, mode) {
  const modeLabel = mode === "soccer" ? "축구" : mode === "baseball" ? "야구" : mode === "ranking" ? "랭킹" : "";
  const context = [modeLabel, selectedLeague].filter(Boolean).join(" · ");
  const fetchedAt = SNAPSHOT.marketFetchedAt || SNAPSHOT.fetchedAt;
  const status = $("#dataStatus");
  const interval = formatRefreshInterval(SNAPSHOT.marketRefreshIntervalMinutes);
  status.textContent = `${interval} 주기 · 최근 ${formatRefreshTime(fetchedAt)}`;
  status.parentElement.title = `${game.gameName}${context ? ` · ${context}` : ""} · 예정 ${upcoming.length}경기 · 해외 매칭 ${matched.length}경기 · 30일 균등 갱신 · 최근 ${fetchedAt || "-"}`;
}

function renderLeagues(leagues, selectedLeague, onSelect) {
  const el = $("#leagueList");
  const expanded = el.dataset.expanded === "true";
  const draw = () => {
    const list = expanded ? leagues : leagues.slice(0, 8);
    el.innerHTML = list
      .map(([lg, cnt]) => `<button type="button" class="league-row ${selectedLeague === lg ? "on" : ""}" aria-pressed="${selectedLeague === lg}" data-league="${esc(lg)}"><span class="league-name">${esc(leagueFullName(lg))}</span><span class="cnt">${cnt}</span></button>`)
      .join("");
    el.querySelectorAll("[data-league]").forEach((row) => {
      row.onclick = () => onSelect(row.dataset.league);
    });
    $("#allLeagues").textContent = expanded ? "접기 ▴" : `모든 리그 ▾ (${leagues.length})`;
  };
  $("#allLeagues").onclick = () => {
    el.dataset.expanded = String(!expanded);
    onSelect(null);
  };
  draw();
}

function cutBadge(cut) {
  if (cut == null) return "";
  const pct = (cut * 100).toFixed(1);
  return cut >= 0
    ? `<span class="c cut" title="해외 대비 삭감">▼${pct}%</span>`
    : `<span class="c edge" title="해외보다 높은 배당">▲${(-cut * 100).toFixed(1)}%</span>`;
}

function oddCell(label, betman, market, cut, className = "") {
  const mLine = market ? `<span class="m">해외 ${market.toFixed(2)}</span>` : "";
  return `<div class="cell ${className}"><span class="l">${label}</span><span class="v">${betman.toFixed(2)}</span>${mLine}${cutBadge(cut)}</div>`;
}

function emptyOddCell() {
  return '<div class="cell empty" aria-hidden="true"></div>';
}

function pointCell(point) {
  return `<div class="cell point"><span class="l">기준점</span><span class="v">${point != null ? esc(point) : "—"}</span></div>`;
}

function marketMeta(m) {
  if (!m) return "";
  const mk = m.market;
  const totals = matchMarketType(m) === "totals";
  const watch = watchedFor(m);
  const cutText = mk && mk.cutAvg != null
    ? (mk.cutAvg >= 0
      ? `<span class="market-meta-cut" title="${totals ? `기준점 ${mk.point} 언오버` : "승무패"} 삭감률 평균 (컨센서스 ${mk.books}개 북)">삭감 ${(mk.cutAvg * 100).toFixed(1)}%</span>`
      : `<span class="market-meta-cut edge" title="해외보다 높은 평균 배당 (컨센서스 ${mk.books}개 북)">우대 ${(-mk.cutAvg * 100).toFixed(1)}%</span>`)
    : `<span class="market-meta-muted">미매칭</span>`;
  const watchButton = mk?.marketId
    ? `<button type="button" class="watch-link ${watch?.enabled ? "on" : ""}" aria-label="${totals ? "언오버" : "승무패"} ${watch?.enabled ? "관측 끄기" : "관측 추가"}" data-watch-key="${esc(watchKey(m))}">${watch?.enabled ? "관측 ON" : "+ 관측"}</button>`
    : "";
  return `<div class="market-meta">${cutText}${watchButton}</div>`;
}

function renderMatches(groups) {
  CURRENT_MATCHES = groups;
  const el = $("#matchList");
  if (!groups.length) { el.innerHTML = '<p class="note" style="padding:14px;">예정된 비교 가능 경기가 없습니다.</p>'; return; }
  el.innerHTML = groups.map(({ h2h, totals }) => {
    const primary = h2h || totals;
    const h2hMarket = h2h?.market;
    const totalsMarket = totals?.market;
    const t = (primary.kickoff || "").slice(5, 16).replace("T", " ");
    const point = totalsMarket?.point ?? totals?.totalPoint;
    const h2hCells = h2h
      ? [
        oddCell("승", h2h.win, h2hMarket?.consensus?.win, h2hMarket?.cutConsensus?.win),
        h2h.draw ? oddCell("무", h2h.draw, h2hMarket?.consensus?.draw, h2hMarket?.cutConsensus?.draw) : emptyOddCell(),
        oddCell("패", h2h.lose, h2hMarket?.consensus?.lose, h2hMarket?.cutConsensus?.lose),
      ].join("")
      : '<span class="market-empty">미제공</span>';
    const totalsCells = totals
      ? [
        oddCell("오버", totals.over, totalsMarket?.consensus?.over, totalsMarket?.cutConsensus?.over),
        pointCell(point),
        oddCell("언더", totals.under, totalsMarket?.consensus?.under, totalsMarket?.cutConsensus?.under),
      ].join("")
      : '<span class="market-empty">미제공</span>';
    return `<div class="match odds-collapsed">
      <div class="match-top">
        <div class="match-meta">
          <div class="m-league" title="${esc(primary.league)}">${esc(primary.league)}</div>
          <div class="m-time">${esc(t)}</div>
        </div>
        <div class="m-event">
          <div class="m-teams" title="${esc(primary.home)} vs ${esc(primary.away)}"><span class="m-team home">${esc(primary.home)}</span><span class="vs">vs</span><span class="m-team away">${esc(primary.away)}</span></div>
        </div>
        <button type="button" class="odds-toggle" data-odds-toggle aria-label="배당정보 펼치기" title="배당정보 펼치기" aria-expanded="false"></button>
      </div>
      <div class="match-bottom">
        <div class="market-block">
          <div class="m-odds h2h">${h2hCells}</div>
          ${marketMeta(h2h)}
        </div>
        <div class="market-block">
          <div class="m-odds totals">${totalsCells}</div>
          ${marketMeta(totals)}
        </div>
      </div>
    </div>`;
  }).join("");
  const marketByWatchKey = new Map(groups.flatMap((group) => [group.h2h, group.totals]).filter(Boolean).map((match) => [watchKey(match), match]));
  el.querySelectorAll("[data-watch-key]").forEach((button) => {
    const match = marketByWatchKey.get(button.dataset.watchKey);
    button.onclick = () => addWatch(match);
  });
  el.querySelectorAll("[data-odds-toggle]").forEach((button) => {
    button.onclick = () => {
      const match = button.closest(".match");
      const expanded = !match.classList.contains("odds-collapsed");
      const nextExpanded = !expanded;
      match.classList.toggle("odds-collapsed", !nextExpanded);
      button.setAttribute("aria-expanded", String(nextExpanded));
      const label = nextExpanded ? "배당정보 접기" : "배당정보 펼치기";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.textContent = "";
    };
  });
}

function renderCutRank(matched) {
  const el = $("#cutRank");
  const top = [...matched].filter((m) => m.market.cutAvg != null)
    .sort((a, b) => a.market.cutAvg - b.market.cutAvg).slice(0, 10);
  if (!top.length) { el.innerHTML = '<p class="note">매칭된 예정 경기가 없습니다.</p>'; return; }
  el.innerHTML = top.map((m, i) => {
    const c = m.market.cutAvg;
    const marketLabel = matchMarketType(m) === "totals" ? ` · 언오버 ${m.market.point ?? m.totalPoint}` : "";
    return `<div class="rank-row" title="${esc(m.league)}${esc(marketLabel)} · ${esc((m.kickoff || "").slice(5, 16).replace("T", " "))}">
      <span class="r">${i + 1}</span>
      <span style="flex:1;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.home)} vs ${esc(m.away)}</span>
      <span class="v" style="color:${c >= 0 ? "var(--color-status-danger)" : "var(--color-accent-blue)"}">${c >= 0 ? "▼" : "▲"}${(Math.abs(c) * 100).toFixed(1)}%</span>
    </div>`;
  }).join("");
}

function renderRankingView(matched) {
  const el = $("#rankingList");
  const ranked = [...matched].filter((m) => m.market.cutAvg != null)
    .sort((a, b) => a.market.cutAvg - b.market.cutAvg);
  if (!ranked.length) {
    el.innerHTML = '<p class="note" style="padding:14px;">매칭된 예정 경기가 없습니다.</p>';
    return;
  }
  el.innerHTML = ranked.slice(0, 30).map((m, i) => {
    const c = m.market.cutAvg;
    const label = c < 0 ? `우대 ${(-c * 100).toFixed(1)}%` : `삭감 ${(c * 100).toFixed(1)}%`;
    const color = c < 0 ? "var(--color-accent-blue)" : "var(--color-status-danger)";
    return `<div class="rank-row" title="${esc(m.league)} · ${esc((m.kickoff || "").slice(5, 16).replace("T", " "))}">
      <span class="r">${i + 1}</span>
      <span style="width:72px;font-size:11px;color:var(--color-text-tertiary);">${esc(m.league)}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.home)} vs ${esc(m.away)}</span>
      <span class="v" style="color:${color}">${label}</span>
    </div>`;
  }).join("");
}

function renderMetrics(game, all, upcoming, matched) {
  const cuts = matched.map((m) => m.market.cutAvg).filter((v) => v != null);
  const avgC = cuts.length ? cuts.reduce((s, v) => s + v, 0) / cuts.length : null;
  const k = (label, v, cls = "") => `<div class="kv"><span>${label}</span><b class="${cls}">${v}</b></div>`;
  $("#todayMetrics").innerHTML =
    k("회차", esc(game.gameName)) +
    k("비교 가능 경기", all.length + "건") +
    k("예정 경기", upcoming.length + "건") +
    k("해외 배당 매칭", matched.length + "건") +
    (avgC != null ? k("평균 삭감률", (avgC * 100).toFixed(1) + "%", "") : "");
}

function renderDataInfo(game) {
  const t = (SNAPSHOT.fetchedAt || "").replace("T", " ").slice(0, 16);
  const mt = (SNAPSHOT.marketFetchedAt || "").replace("T", " ").slice(0, 16);
  $("#dataInfo").innerHTML =
    `<div class="kv"><span>국내 소스</span><b>betman.co.kr</b></div>` +
    `<div class="kv"><span>해외 소스</span><b>${esc(SNAPSHOT.marketSource || "-")}</b></div>` +
    `<div class="kv"><span>게임</span><b>${esc(game.gameName)} 승부식</b></div>` +
    `<div class="kv"><span>수집</span><b>${esc(t)}</b></div>` +
    `<div class="kv"><span>해외 수집</span><b>${esc(mt || "-")}</b></div>` +
    `<div class="kv"><span>API 크레딧</span><b>${esc(SNAPSHOT.marketCreditsRemaining ?? "-")}</b></div>`;
}

function accountMessage(message, error = false) {
  const el = $("#accountMessage");
  el.textContent = message;
  el.style.color = error ? "var(--color-status-danger)" : "";
}

function renderAccount() {
  const guest = $("#authGuest");
  const signedIn = $("#authUser");
  if (!guest || !signedIn) return;
  const loggedIn = Boolean(ACCOUNT.user);
  guest.hidden = loggedIn;
  signedIn.hidden = !loggedIn;
  $("#authSubmit").textContent = AUTH_SIGNUP ? "회원가입" : "로그인";
  $("#authMode").textContent = AUTH_SIGNUP ? "이미 계정이 있으면 로그인" : "처음이면 회원가입";
  if (!loggedIn) return;
  $("#accountIdentity").textContent = `${ACCOUNT.user.username}님으로 로그인됨`;
  $("#keyStatus").textContent = ACCOUNT.keyConfigured
    ? `API 키 등록됨 (••••${ACCOUNT.keyLast4 || ""}) · 서버 암호화 보관`
    : "API 키 미등록";
  const list = $("#watchList");
  list.innerHTML = ACCOUNT.watches.length
    ? ACCOUNT.watches.map((watch) => `<div class="watch-item">
        <div class="name">${esc(watch.home)} vs ${esc(watch.away)}</div>
        <div class="meta">${esc(watch.league)} · ${watch.marketType === "totals" ? `언오버 기준점 ${esc(watch.totalPoint)}` : "승무패"} · ${esc(watch.kickoffUtc.slice(0, 16).replace("T", " "))}</div>
        <div class="row"><button class="${watch.enabled ? "" : "linkish"}" type="button" data-watch-toggle="${esc(watch.id)}">${watch.enabled ? "10분 갱신 ON" : "갱신 OFF"}</button><button class="linkish" type="button" data-watch-delete="${esc(watch.id)}">삭제</button></div>
      </div>`).join("")
    : '<p class="account-message">아직 관측 중인 경기가 없습니다.</p>';
  list.querySelectorAll("[data-watch-toggle]").forEach((button) => {
    button.onclick = () => toggleWatch(button.dataset.watchToggle);
  });
  list.querySelectorAll("[data-watch-delete]").forEach((button) => {
    button.onclick = () => deleteWatch(button.dataset.watchDelete);
  });
  if (CURRENT_MATCHES.length) renderMatches(CURRENT_MATCHES);
}

async function refreshAccount(successMessage = "") {
  let refreshedUser = null;
  try {
    const data = await apiRequest("/api/me");
    ACCOUNT = { user: data.user, keyConfigured: data.keyConfigured, keyLast4: data.keyLast4, watches: data.watches || [] };
    refreshedUser = data.user;
    accountMessage(data.user ? (successMessage || "로그인 상태입니다.") : "로그인하면 경기별 10분 관측을 사용할 수 있습니다.");
  } catch (error) {
    ACCOUNT = { user: null, keyConfigured: false, keyLast4: null, watches: [] };
    if (error.message.includes("로그인이 필요")) accountMessage("로그인하면 경기별 10분 관측을 사용할 수 있습니다.");
    else accountMessage(`계정 서버 연결 실패: ${error.message}`, true);
  }
  renderAccount();
  if (successMessage && refreshedUser) accountMessage(successMessage);
  if (successMessage && !refreshedUser) accountMessage("인증은 완료됐지만 세션을 확인하지 못했습니다. 다시 로그인해 주세요.", true);
}

async function submitAuth(event) {
  event.preventDefault();
  const username = $("#authUsername").value.trim();
  const password = $("#authPassword").value;
  try {
    const data = await apiRequest(`/api/auth/${AUTH_SIGNUP ? "signup" : "login"}`, { method: "POST", body: JSON.stringify({ username, password }) });
    ACCOUNT = { user: data.user, keyConfigured: data.keyConfigured, keyLast4: data.keyLast4 || null, watches: [] };
    $("#authPassword").value = "";
    await refreshAccount(AUTH_SIGNUP ? "가입되었습니다. 로그인 상태입니다." : "로그인되었습니다.");
  } catch (error) {
    accountMessage(error.message, true);
  }
}

async function saveApiKey(event) {
  event.preventDefault();
  try {
    const data = await apiRequest("/api/me/api-key", { method: "PUT", body: JSON.stringify({ apiKey: $("#apiKey").value.trim() }) });
    ACCOUNT.keyConfigured = data.keyConfigured;
    ACCOUNT.keyLast4 = data.keyLast4;
    $("#apiKey").value = "";
    accountMessage("API 키가 검증되고 암호화 저장되었습니다.");
    renderAccount();
  } catch (error) {
    accountMessage(error.message, true);
  }
}

async function addWatch(match) {
  if (!match) return;
  if (!ACCOUNT.user) return accountMessage("먼저 아이디로 로그인하세요.", true);
  if (!ACCOUNT.keyConfigured) return accountMessage("먼저 본인 The Odds API 키를 등록하세요.", true);
  try {
    const totals = matchMarketType(match) === "totals";
    await apiRequest("/api/watches", {
      method: "POST",
      body: JSON.stringify({
        marketId: match.market.marketId,
        sportKey: match.market.sportKey,
        marketType: totals ? "totals" : "h2h",
        totalPoint: totals ? (match.market?.point ?? match.totalPoint) : null,
        league: match.league,
        home: match.home,
        away: match.away,
        kickoffUtc: match.kickoff,
        betman: totals ? { over: match.over, under: match.under } : { win: match.win, draw: match.draw, lose: match.lose },
      }),
    });
    accountMessage("관측을 켰습니다. 킥오프 2시간 전부터 10분마다 갱신됩니다.");
    await refreshAccount();
  } catch (error) {
    accountMessage(error.message, true);
  }
}

async function toggleWatch(watchId) {
  const watch = ACCOUNT.watches.find((item) => item.id === watchId);
  if (!watch) return;
  try {
    const data = await apiRequest(`/api/watches/${encodeURIComponent(watchId)}`, { method: "PATCH", body: JSON.stringify({ enabled: !watch.enabled }) });
    ACCOUNT.watches = ACCOUNT.watches.map((item) => item.id === watchId ? data.watch : item);
    accountMessage(data.watch.enabled ? "10분 갱신을 켰습니다." : "10분 갱신을 껐습니다.");
    renderAccount();
  } catch (error) {
    accountMessage(error.message, true);
  }
}

async function deleteWatch(watchId) {
  try {
    await apiRequest(`/api/watches/${encodeURIComponent(watchId)}`, { method: "DELETE" });
    ACCOUNT.watches = ACCOUNT.watches.filter((item) => item.id !== watchId);
    accountMessage("관측 경기를 삭제했습니다.");
    renderAccount();
  } catch (error) {
    accountMessage(error.message, true);
  }
}

function initAccount() {
  $("#authForm")?.addEventListener("submit", submitAuth);
  $("#authMode")?.addEventListener("click", () => { AUTH_SIGNUP = !AUTH_SIGNUP; renderAccount(); });
  $("#keyForm")?.addEventListener("submit", saveApiKey);
  $("#removeKey")?.addEventListener("click", async () => {
    try { await apiRequest("/api/me/api-key", { method: "DELETE" }); ACCOUNT.keyConfigured = false; ACCOUNT.keyLast4 = null; accountMessage("API 키를 삭제했습니다."); renderAccount(); } catch (error) { accountMessage(error.message, true); }
  });
  $("#logout")?.addEventListener("click", async () => {
    try { await apiRequest("/api/auth/logout", { method: "POST" }); } finally { ACCOUNT = { user: null, keyConfigured: false, keyLast4: null, watches: [] }; accountMessage("로그아웃했습니다."); renderAccount(); }
  });
  refreshAccount();
}

initTheme();
initAccount();
load().catch((e) => {
  $("#dataStatus").textContent = "데이터 로드 실패";
  $("#matchList").innerHTML = `<p class="note" style="padding:14px;">snapshots.json 로드 실패: ${esc(e.message)}<br>
  <code>python collector/collect_all.py</code> 실행 후 다시 배포하세요.</p>`;
});
