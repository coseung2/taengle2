"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 해외 h2h와 비교 가능한 베트맨 베팅 유형
const COMPARABLE = new Set(["승무패", "일반 승패"]);

let SNAPSHOT = null;

const book = (m) => 1 / m.win + (m.draw ? 1 / m.draw : 0) + 1 / m.lose;
const payout = (m) => 1 / book(m);
const noVig = (m) => {
  const b = book(m);
  return { home: 1 / m.win / b, draw: m.draw ? 1 / m.draw / b : 0, away: 1 / m.lose / b };
};

async function load() {
  const res = await fetch("data/snapshots.json", { cache: "no-store" });
  SNAPSHOT = await res.json();
  const game = SNAPSHOT.games.find((g) => g.gmId === "G101") || SNAPSHOT.games[0];

  // 비교 가능 유형 + 배당 확정 + 경기단위 중복 제거 (승무패 우선)
  const seen = new Map();
  for (const m of game.matches) {
    if (!COMPARABLE.has(m.betType) || !(m.win > 0) || !(m.lose > 0)) continue;
    const key = [m.league, m.kickoff, m.home, m.away].join("|");
    const prev = seen.get(key);
    if (!prev || (m.betType === "승무패" && prev.betType !== "승무패")) seen.set(key, m);
  }
  const all = [...seen.values()];
  const upcoming = all.filter((m) => !m.score).sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || ""));
  const matched = upcoming.filter((m) => m.market);

  // 톱 리그 (예정 경기 수)
  const byLeague = {};
  for (const m of upcoming) byLeague[m.league] = (byLeague[m.league] || 0) + 1;
  const leagues = Object.entries(byLeague).sort((a, b) => b[1] - a[1]);

  // 리그별 평균 환수율
  const agg = {};
  for (const m of all) {
    (agg[m.league] = agg[m.league] || []).push(payout(m));
  }
  const payoutRank = Object.entries(agg)
    .map(([lg, v]) => [lg, v.reduce((s, x) => s + x, 0) / v.length])
    .sort((a, b) => b[1] - a[1]);

  renderHeader(game, upcoming, matched);
  renderLeagues(leagues);
  // 해외배당이 매칭된 경기를 먼저 보여 핵심 비교 정보를 첫 화면에 배치
  const displayMatches = [...upcoming].sort((a, b) => {
    const marketOrder = Number(Boolean(b.market)) - Number(Boolean(a.market));
    return marketOrder || (a.kickoff || "").localeCompare(b.kickoff || "");
  });
  renderMatches(displayMatches.slice(0, 8));
  renderCutRank(matched);
  renderPredictions(upcoming);
  renderRank(payoutRank);
  renderMetrics(game, all, upcoming, matched);
  renderDataInfo(game);
}

function renderHeader(game, upcoming, matched) {
  $("#dataStatus").textContent =
    `${game.gameName} · 예정 ${upcoming.length}경기 · 해외 매칭 ${matched.length}경기`;
}

function renderLeagues(leagues) {
  const el = $("#leagueList");
  let expanded = false;
  const draw = () => {
    const list = expanded ? leagues : leagues.slice(0, 8);
    el.innerHTML = list
      .map(([lg, cnt]) => `<div class="league-row"><span>${esc(lg)}</span><span class="cnt">${cnt}</span></div>`)
      .join("");
    $("#allLeagues").textContent = expanded ? "접기 ▴" : `모든 리그 ▾ (${leagues.length})`;
  };
  $("#allLeagues").onclick = () => { expanded = !expanded; draw(); };
  draw();
}

function payoutClass(p) {
  return p >= 0.9 ? "good" : p >= 0.85 ? "warn" : "bad";
}

function cutBadge(cut) {
  if (cut == null) return "";
  const pct = (cut * 100).toFixed(1);
  return cut >= 0
    ? `<span class="c cut" title="해외 대비 삭감">▼${pct}%</span>`
    : `<span class="c edge" title="해외보다 높은 배당">▲${(-cut * 100).toFixed(1)}%</span>`;
}

function oddCell(label, betman, market, cut) {
  const mLine = market ? `<span class="m">해외 ${market.toFixed(2)}</span>` : "";
  return `<div class="cell"><span class="l">${label}</span><span class="v">${betman.toFixed(2)}</span>${mLine}${cutBadge(cut)}</div>`;
}

function renderMatches(matches) {
  const el = $("#matchList");
  if (!matches.length) { el.innerHTML = '<p class="note" style="padding:14px;">예정된 비교 가능 경기가 없습니다.</p>'; return; }
  el.innerHTML = matches.map((m) => {
    const p = payout(m);
    const mk = m.market;
    const t = (m.kickoff || "").slice(5, 16).replace("T", " ");
    const cells = [
      oddCell("승", m.win, mk?.consensus?.win, mk?.cutConsensus?.win),
      m.draw ? oddCell("무", m.draw, mk?.consensus?.draw, mk?.cutConsensus?.draw) : "",
      oddCell("패", m.lose, mk?.consensus?.lose, mk?.cutConsensus?.lose),
    ].join("");
    const cutPill = mk && mk.cutAvg != null
      ? (mk.cutAvg >= 0
        ? `<span class="cut-pill" title="승무패 삭감률 평균 (컨센서스 ${mk.books}개 북)">삭감 ${(mk.cutAvg * 100).toFixed(1)}%</span>`
        : `<span class="cut-pill edge" title="해외보다 높은 평균 배당 (컨센서스 ${mk.books}개 북)">우대 ${(-mk.cutAvg * 100).toFixed(1)}%</span>`)
      : `<span class="market-pill" title="The Odds API에서 동일 리그·팀·시간 경기를 찾지 못함">해외 미매칭</span>`;
    return `<div class="match">
      <div><div class="m-league">${esc(m.league)}</div><div class="m-time">${esc(t)}</div></div>
      <div class="m-teams" title="${esc(m.home)} vs ${esc(m.away)}">${esc(m.home)}<span class="vs">vs</span>${esc(m.away)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="m-odds">${cells}</div>
        ${cutPill}
        <span class="payout-pill ${payoutClass(p)}" title="환수율 = 1 / Σ(1/배당)">환수율 ${(p * 100).toFixed(1)}%</span>
      </div>
    </div>`;
  }).join("");
}

function renderCutRank(matched) {
  const el = $("#cutRank");
  const top = [...matched].filter((m) => m.market.cutAvg != null)
    .sort((a, b) => b.market.cutAvg - a.market.cutAvg).slice(0, 10);
  if (!top.length) { el.innerHTML = '<p class="note">매칭된 예정 경기가 없습니다.</p>'; return; }
  el.innerHTML = top.map((m, i) => {
    const c = m.market.cutAvg;
    return `<div class="rank-row" title="${esc(m.league)} · ${esc((m.kickoff || "").slice(5, 16).replace("T", " "))}">
      <span class="r">${i + 1}</span>
      <span style="flex:1;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.home)} vs ${esc(m.away)}</span>
      <span class="v" style="color:${c >= 0 ? "var(--color-status-danger)" : "var(--color-accent-blue)"}">${c >= 0 ? "▼" : "▲"}${(Math.abs(c) * 100).toFixed(1)}%</span>
    </div>`;
  }).join("");
}

function renderPredictions(upcoming) {
  const withDraw = upcoming.filter((m) => m.draw);
  const prio = ["K리그1", "K리그2", "라리가", "EFL챔", "에레디비", "MLS", "잉슈퍼컵", "MLB"];
  const picks = [...withDraw].sort((a, b) => {
    const pa = prio.indexOf(a.league), pb = prio.indexOf(b.league);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  }).slice(0, 6);

  $("#predGrid").innerHTML = picks.map((m) => {
    const nv = noVig(m);
    const pct = (x) => (x * 100).toFixed(1) + "%";
    const style = (x) => `width:${Math.max(2, x * 100).toFixed(1)}%;`;
    const t = (m.kickoff || "").slice(0, 10).replace(/-/g, ".");
    return `<div class="pred">
      <span class="tag">${esc(m.league)}</span>
      <div class="title">${t} ${esc(m.home)} vs ${esc(m.away)} 경기 분석</div>
      <div class="teams">${esc(m.home)}<span class="vs">vs</span>${esc(m.away)}</div>
      <div class="bar">
        <span style="${style(nv.home)};background:var(--blue-500)"></span>
        <span style="${style(nv.draw)};background:var(--amber-500)"></span>
        <span style="${style(nv.away)};background:var(--red-500)"></span>
      </div>
      <div class="pct"><span>홈 ${pct(nv.home)}</span><span>무 ${pct(nv.draw)}</span><span>원정 ${pct(nv.away)}</span></div>
    </div>`;
  }).join("");
}

function renderRank(payoutRank) {
  const max = payoutRank[0]?.[1] || 1;
  $("#payoutRank").innerHTML = payoutRank.slice(0, 10).map(([lg, p], i) =>
    `<div class="rank-row"><span class="r">${i + 1}</span><span style="flex:1;font-size:12px;">${esc(lg)}</span>
     <span class="bar2"><i style="width:${((p / max) * 100).toFixed(0)}%"></i></span>
     <span class="v">${(p * 100).toFixed(1)}%</span></div>`
  ).join("");
}

function renderMetrics(game, all, upcoming, matched) {
  const avgP = all.reduce((s, m) => s + payout(m), 0) / Math.max(1, all.length);
  const cuts = matched.map((m) => m.market.cutAvg).filter((v) => v != null);
  const avgC = cuts.length ? cuts.reduce((s, v) => s + v, 0) / cuts.length : null;
  const k = (label, v, cls = "") => `<div class="kv"><span>${label}</span><b class="${cls}">${v}</b></div>`;
  $("#todayMetrics").innerHTML =
    k("회차", esc(game.gameName)) +
    k("비교 가능 경기", all.length + "건") +
    k("예정 경기", upcoming.length + "건") +
    k("해외 배당 매칭", matched.length + "건") +
    k("평균 환수율", (avgP * 100).toFixed(1) + "%", payoutClass(avgP)) +
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

load().catch((e) => {
  $("#dataStatus").textContent = "데이터 로드 실패";
  $("#matchList").innerHTML = `<p class="note" style="padding:14px;">snapshots.json 로드 실패: ${esc(e.message)}<br>
  <code>python collector/collect_all.py</code> 실행 후 다시 배포하세요.</p>`;
});
